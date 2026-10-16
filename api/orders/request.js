// POST /api/orders/request
// Called by ConciergePortal when a concierge places an order.
// Looks up the guest by hotel + room number, creates the order,
// notifies the technician via WhatsApp.
import { sql } from "@vercel/postgres";
import { notifyNewOrderPickup } from "../../src/lib/notifications.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const {
    firstName, lastName, roomNumber, tier,
    hotelId, paymentMethod, specialInstructions,
  } = req.body;

  if (!hotelId || !roomNumber) {
    return res.status(400).json({ error: "hotelId and roomNumber required" });
  }

  try {
    // Look up the guest by hotel + room number (most recent match if multiple)
    const guestResult = await sql`
      SELECT hg.id, hg.room_number, hg.hotel_id,
             u.first_name, u.last_name, u.email,
             h.name AS hotel_name
      FROM hotel_guests hg
      INNER JOIN users u ON hg.user_id = u.id
      INNER JOIN hotels h ON hg.hotel_id = h.id
      WHERE hg.hotel_id = ${hotelId}
        AND LOWER(hg.room_number) = LOWER(${String(roomNumber)})
      ORDER BY hg.created_at DESC
      LIMIT 1
    `;

    // Use DB guest if found; otherwise use the name the concierge typed
    const g = guestResult.rows.length > 0
      ? guestResult.rows[0]
      : {
          id: null,
          hotel_id: hotelId,
          room_number: roomNumber,
          hotel_name: "Hotel",
          first_name: firstName || "Guest",
          last_name:  lastName  || "",
          email: null,
        };

    // Get hotel name if we didn't get it from the join
    let hotelName = g.hotel_name;
    if (!hotelName || hotelName === "Hotel") {
      const hotelRow = await sql`SELECT name FROM hotels WHERE id = ${hotelId}`;
      hotelName = hotelRow.rows[0]?.name || "Hotel";
    }

    const seqResult = await sql`SELECT nextval('order_number_seq') AS n`;
    const orderNumber = `WW-${String(seqResult.rows[0].n).padStart(5, "0")}`;

    const orderResult = await sql`
      INSERT INTO laundry_orders
        (order_number, guest_id, hotel_id, placed_by,
         payment_method, payment_verified, status,
         tier, guest_email, special_instructions, created_at)
      VALUES
        (${orderNumber},
         ${g.id || null},
         ${hotelId},
         'concierge',
         ${paymentMethod || "stripe"},
         false,
         'pending_pickup',
         ${tier || null},
         ${g.email || null},
         ${specialInstructions || null},
         NOW())
      RETURNING id, order_number
    `;
    const order = orderResult.rows[0];

    // Notify technician (non-blocking)
    notifyNewOrderPickup({
      orderNumber,
      guestName: `${g.first_name} ${g.last_name}`.trim(),
      roomNumber: g.room_number,
      hotelName,
      paymentNote: paymentMethod === "room_charge"   ? "Room charge"   :
                   paymentMethod === "hotel_account" ? "Hotel account" :
                   paymentMethod === "cash"          ? "Cash"          :
                                                       "Stripe (pay after weigh)",
    }).catch(e => console.error("notifyNewOrderPickup failed:", e.message));

    res.json({
      success: true,
      orderId: order.id,
      orderNumber,
      status: "pending_pickup",
    });
  } catch (err) {
    console.error("request order error:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
}
