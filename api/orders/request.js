// POST /api/orders/request — called by ConciergePortal
// Looks up guest by hotel + room, creates order, notifies technician.
import { sql } from "@vercel/postgres";
import { notifyNewOrderPickup } from "../../src/lib/notifications.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { firstName, lastName, roomNumber, tier, hotelId, paymentMethod, specialInstructions } = req.body;

  if (!hotelId || !roomNumber) {
    return res.status(400).json({ error: "hotelId and roomNumber required" });
  }

  try {
    // Look up guest by hotel + room (no ORDER BY created_at — may not exist)
    let guestId = null;
    let guestFirstName = firstName || "Guest";
    let guestLastName  = lastName  || "";
    let guestEmail     = null;
    let hotelName      = "Hotel";

    try {
      const guestResult = await sql`
        SELECT hg.id, u.first_name, u.last_name, u.email, h.name AS hotel_name
        FROM hotel_guests hg
        INNER JOIN users u ON hg.user_id = u.id
        INNER JOIN hotels h ON hg.hotel_id = h.id
        WHERE hg.hotel_id    = ${hotelId}
          AND hg.room_number = ${String(roomNumber)}
        LIMIT 1
      `;
      if (guestResult.rows.length > 0) {
        const g = guestResult.rows[0];
        guestId        = g.id;
        guestFirstName = g.first_name;
        guestLastName  = g.last_name;
        guestEmail     = g.email;
        hotelName      = g.hotel_name;
      }
    } catch (guestErr) {
      // Guest lookup failed — log it but continue without a guestId
      console.error("Guest lookup error (non-fatal):", guestErr.message);
    }

    // If we still don't have the hotel name, try fetching it separately
    if (hotelName === "Hotel") {
      try {
        const hotelResult = await sql`SELECT name FROM hotels WHERE id = ${hotelId}`;
        if (hotelResult.rows.length > 0) hotelName = hotelResult.rows[0].name;
      } catch (e) { /* ignore */ }
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
         ${guestId},
         ${hotelId},
         'concierge',
         ${paymentMethod || "stripe"},
         false,
         'pending_pickup',
         ${tier || null},
         ${guestEmail},
         ${specialInstructions || null},
         NOW())
      RETURNING id, order_number
    `;
    const order = orderResult.rows[0];

    // Notify technician (non-blocking — never fails the order creation)
    notifyNewOrderPickup({
      orderNumber,
      guestName: `${guestFirstName} ${guestLastName}`.trim(),
      roomNumber: String(roomNumber),
      hotelName,
      paymentNote: paymentMethod === "room_charge"   ? "Room charge"   :
                   paymentMethod === "hotel_account" ? "Hotel account" :
                   paymentMethod === "cash"          ? "Cash"          :
                                                       "Stripe (pay after weigh)",
    }).catch(e => console.error("notifyNewOrderPickup failed:", e.message));

    res.json({ success: true, orderId: order.id, orderNumber, status: "pending_pickup" });

  } catch (err) {
    console.error("request.js fatal error:", err.message, err.stack);
    res.status(500).json({ error: "Failed to create order", detail: err.message });
  }
}
