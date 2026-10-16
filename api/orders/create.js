// POST /api/orders/create
// Concierge places an order on behalf of a guest.
// ALL orders → status: pending_pickup, notify technician via WhatsApp.
// Stripe payment link is sent after weighing (via /api/orders/[orderId]/weigh).
import { sql } from "@vercel/postgres";
import { notifyNewOrderPickup } from "../../src/lib/notifications.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { guestId, userId, placedByUserId, paymentMethod, tier, serviceType, email, specialInstructions } = req.body;

  try {
    let g;
    if (guestId) {
      // Concierge flow — look up from hotel_guests
      const guest = await sql`
        SELECT hg.id, hg.room_number, hg.hotel_id,
               u.first_name, u.last_name, u.email, u.phone,
               h.name as hotel_name
        FROM hotel_guests hg
        INNER JOIN users u ON hg.user_id = u.id
        INNER JOIN hotels h ON hg.hotel_id = h.id
        WHERE hg.id = ${guestId}
      `;
      if (!guest.rows.length) return res.status(404).json({ error: "Guest not found" });
      g = guest.rows[0];
    } else if (userId) {
      // Self-service guest flow
      const user = await sql`
        SELECT id, first_name, last_name, email, phone FROM users WHERE clerk_id = ${userId}
      `;
      if (!user.rows.length) return res.status(404).json({ error: "User not found" });
      const u = user.rows[0];
      g = {
        id: null,
        room_number: null,
        hotel_id: null,
        hotel_name: "Residential",
        first_name: u.first_name,
        last_name: u.last_name,
        email: email || u.email,
        phone: u.phone,
      };
    } else {
      return res.status(400).json({ error: "guestId or userId required" });
    }

    const seqResult = await sql`SELECT nextval('order_number_seq') AS n`;
    const orderNumber = `WW-${String(seqResult.rows[0].n).padStart(5, "0")}`;

    const orderResult = await sql`
      INSERT INTO laundry_orders
        (order_number, guest_id, hotel_id, placed_by, placed_by_user_id,
         payment_method, payment_verified, status,
         tier, service_type, guest_email,
         special_instructions, created_at)
      VALUES
        (${orderNumber},
         ${g.id || null},
         ${g.hotel_id || null},
         ${guestId ? "concierge" : "self"},
         ${placedByUserId || userId || null},
         ${paymentMethod || "stripe"},
         false,
         'pending_pickup',
         ${tier || null},
         ${serviceType || null},
         ${g.email || email || null},
         ${specialInstructions || null},
         NOW())
      RETURNING id, order_number
    `;
    const order = orderResult.rows[0];

    // Notify technician (non-blocking)
    notifyNewOrderPickup({
      orderNumber,
      guestName: `${g.first_name} ${g.last_name}`,
      roomNumber: g.room_number,
      hotelName: g.hotel_name,
      paymentMethod: paymentMethod || "stripe",
      paymentNote: paymentMethod === "room_charge" ? "Room charge" :
                   paymentMethod === "hotel_account" ? "Hotel account" :
                   paymentMethod === "cash" ? "Cash" : "Stripe (pay after weigh)",
    }).catch(e => console.error("notifyNewOrderPickup failed:", e.message));

    res.json({ success: true, orderId: order.id, orderNumber, status: "pending_pickup", paymentMethod });
  } catch (err) {
    console.error("create order error:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
}
