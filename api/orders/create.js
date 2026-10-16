// POST /api/orders/create
// Concierge places order for hotel guest (sends guestId).
// Guest self-service sends userId instead.
// All orders start as pending_pickup — payment link generated AFTER weighing.
import { sql } from "@vercel/postgres";
import { notifyNewOrderPickup } from "../../src/lib/notifications.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const {
    guestId,
    userId,
    placedByUserId,
    paymentMethod = "stripe",
    specialInstructions,
    tier        = "Standard Load",
    serviceType = "Regular Load",
    email,
  } = req.body;

  try {
    const seqResult = await sql`SELECT nextval('order_number_seq') AS n`;
    const orderNumber = `WW-${String(seqResult.rows[0].n).padStart(5, "0")}`;

    let resolvedGuestId = guestId || null;
    let guestEmail      = email   || null;
    let guestFirstName  = "";
    let guestLastName   = "";
    let hotelName       = null;
    let roomNumber      = null;
    let hotelId         = null;

    if (resolvedGuestId) {
      // Concierge flow — lookup by guestId
      const g = await sql`
        SELECT hg.id, hg.hotel_id, hg.room_number,
               u.first_name, u.last_name, u.email,
               h.name AS hotel_name
        FROM hotel_guests hg
        JOIN users u ON hg.user_id = u.id
        JOIN hotels h ON hg.hotel_id = h.id
        WHERE hg.id = ${resolvedGuestId}
      `;
      if (g.rows.length) {
        const row = g.rows[0];
        hotelId        = row.hotel_id;
        roomNumber     = row.room_number;
        guestEmail     = row.email || guestEmail;
        guestFirstName = row.first_name;
        guestLastName  = row.last_name;
        hotelName      = row.hotel_name;
      }
    } else if (userId) {
      // Guest self-service — lookup by Clerk userId
      const u = await sql`
        SELECT u.id, u.email, u.first_name, u.last_name,
               hg.id AS guest_id, hg.hotel_id, hg.room_number, h.name AS hotel_name
        FROM users u
        LEFT JOIN hotel_guests hg ON hg.user_id = u.id
        LEFT JOIN hotels h ON hg.hotel_id = h.id
        WHERE u.clerk_user_id = ${userId}
        LIMIT 1
      `;
      if (u.rows.length) {
        const row = u.rows[0];
        resolvedGuestId = row.guest_id;
        hotelId         = row.hotel_id;
        roomNumber      = row.room_number;
        guestEmail      = row.email || guestEmail;
        guestFirstName  = row.first_name;
        guestLastName   = row.last_name;
        hotelName       = row.hotel_name;
      }
    }

    const orderResult = await sql`
      INSERT INTO laundry_orders
        (order_number, guest_id, hotel_id, placed_by, placed_by_user_id,
         payment_method, payment_verified, status,
         tier, service_type, special_instructions, guest_email, created_at)
      VALUES
        (${orderNumber}, ${resolvedGuestId}, ${hotelId},
         ${placedByUserId ? 'concierge' : 'guest'}, ${placedByUserId || null},
         ${paymentMethod}, false, 'pending_pickup',
         ${tier}, ${serviceType}, ${specialInstructions || null}, ${guestEmail}, NOW())
      RETURNING id, order_number
    `;
    const order = orderResult.rows[0];

    // Notify technician of new pickup (non-blocking)
    notifyNewOrderPickup({
      orderNumber,
      guestName: `${guestFirstName} ${guestLastName}`.trim() || "Guest",
      hotelName,
      roomNumber,
      paymentMethod,
    }).catch(e => console.error("notifyNewOrderPickup:", e));

    res.json({
      success:     true,
      orderId:     order.id,
      orderNumber: order.order_number,
      status:      "pending_pickup",
      paymentMethod,
      message:     "Order placed. Payment link will be sent after we weigh your laundry.",
    });
  } catch (err) {
    console.error("create order error:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
}
