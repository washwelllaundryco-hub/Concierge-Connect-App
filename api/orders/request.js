// POST /api/orders/request — called by ConciergePortal
import { sql } from "@vercel/postgres";
import { notifyNewOrderPickup } from "../../src/lib/notifications.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { firstName, lastName, roomNumber, tier, hotelId: hotelSlug, paymentMethod, specialInstructions } = req.body;

  if (!hotelSlug || !roomNumber) {
    return res.status(400).json({ error: "hotelId and roomNumber required" });
  }

  try {
    // 1. Resolve hotel slug → UUID + name
    const hotelResult = await sql`
      SELECT id, name FROM hotels WHERE slug = ${hotelSlug} LIMIT 1
    `;
    if (!hotelResult.rows.length) {
      return res.status(404).json({ error: `Hotel not found for slug: ${hotelSlug}` });
    }
    const hotelUUID = hotelResult.rows[0].id;
    const hotelName = hotelResult.rows[0].name;

    // 2. Try to find guest by hotel + room (non-fatal if not found)
    let guestId        = null;
    let guestFirstName = firstName || "Guest";
    let guestLastName  = lastName  || "";
    let guestEmail     = null;

    try {
      const guestResult = await sql`
        SELECT hg.id, u.first_name, u.last_name, u.email
        FROM hotel_guests hg
        INNER JOIN users u ON hg.user_id = u.id
        WHERE hg.hotel_id    = ${hotelUUID}
          AND hg.room_number = ${String(roomNumber)}
        LIMIT 1
      `;
      if (guestResult.rows.length > 0) {
        const g = guestResult.rows[0];
        guestId        = g.id;
        guestFirstName = g.first_name;
        guestLastName  = g.last_name;
        guestEmail     = g.email;
      }
    } catch (guestErr) {
      console.error("Guest lookup (non-fatal):", guestErr.message);
    }

    // 3. Generate order number
    const seqResult = await sql`SELECT nextval('order_number_seq') AS n`;
    const orderNumber = `WW-${String(seqResult.rows[0].n).padStart(5, "0")}`;

    // 4. Insert order
    const orderResult = await sql`
      INSERT INTO laundry_orders
        (order_number, guest_id, hotel_id, placed_by,
         payment_method, payment_verified, status,
         tier, guest_email, special_instructions, created_at)
      VALUES
        (${orderNumber},
         ${guestId},
         ${hotelUUID},
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

    // 5. Notify technician — BLOCKING (await before res.json so Vercel
    //    doesn't kill the function before Twilio call completes).
    //    Wrapped in try/catch so a failed text never blocks the order.
    try {
      await notifyNewOrderPickup({
        orderNumber,
        guestName: `${guestFirstName} ${guestLastName}`.trim(),
        roomNumber: String(roomNumber),
        hotelName,
        paymentNote: paymentMethod === "room_charge"   ? "Room charge"   :
                     paymentMethod === "hotel_account" ? "Hotel account" :
                     paymentMethod === "cash"          ? "Cash"          :
                                                         "Stripe (pay after weigh)",
      });
      console.log("WhatsApp sent for", orderNumber);
    } catch (e) {
      console.error("notifyNewOrderPickup failed:", e.message);
    }

    res.json({ success: true, orderId: order.id, orderNumber, status: "pending_pickup" });

  } catch (err) {
    console.error("request.js fatal error:", err.message);
    res.status(500).json({ error: "Failed to create order", detail: err.message });
  }
}
