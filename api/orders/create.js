// POST /api/orders/create
// Creates an order from any portal. NO Stripe link is generated here.
// Payment link is generated AFTER technician weighs (see /api/orders/[id]/weigh).
//
// Body (concierge):  { firstName, lastName, roomNumber, hotelId, tier, serviceType, paymentMethod, specialInstructions, placedByUserId }
// Body (guest):      { tier, serviceType, specialInstructions, userId, email, firstName, lastName, hotelId?, roomNumber? }
import { db } from "../_db.js";
import { notifyNewOrderPickup } from "../../src/lib/notifications.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const {
    // Concierge fields
    guestId,
    placedByUserId,
    paymentMethod = "stripe",
    specialInstructions,
    // Shared fields
    firstName,
    lastName,
    roomNumber,
    hotelId,
    tier        = "Standard Load",
    serviceType = "Regular Load",   // for residential
    // Guest self-service
    userId,
    email,
  } = req.body;

  try {
    const seqResult = await db.query(`SELECT nextval('order_number_seq') AS n`);
    const orderNumber = `WW-${String(seqResult.rows[0].n).padStart(5, "0")}`;

    let resolvedGuestId  = guestId  || null;
    let resolvedHotelId  = hotelId  || null;
    let resolvedRoom     = roomNumber || null;
    let guestEmail       = email    || null;
    let guestFirstName   = firstName || "";
    let guestLastName    = lastName  || "";
    let guestHotelName   = null;
    let placedBy         = placedByUserId ? "concierge" : "guest";

    // ── If concierge placed (has placedByUserId), resolve guest from name + hotel ──
    if (placedByUserId && !resolvedGuestId && firstName && lastName && hotelId) {
      const existing = await db.query(
        `SELECT hg.id, hg.room_number, u.email, h.name AS hotel_name
         FROM hotel_guests hg
         JOIN users u ON hg.user_id = u.id
         JOIN hotels h ON hg.hotel_id = h.id
         WHERE hg.hotel_id = $1
           AND lower(u.first_name) = lower($2)
           AND lower(u.last_name)  = lower($3)
         LIMIT 1`,
        [hotelId, firstName, lastName]
      );
      if (existing.rows.length) {
        resolvedGuestId = existing.rows[0].id;
        resolvedRoom    = existing.rows[0].room_number || resolvedRoom;
        guestEmail      = existing.rows[0].email;
        guestHotelName  = existing.rows[0].hotel_name;
      }
    }

    // ── If guest self-service (has userId), resolve from users table ──
    if (userId && !resolvedGuestId) {
      const userRow = await db.query(
        `SELECT u.id, u.email, u.first_name, u.last_name,
                hg.id AS guest_id, hg.hotel_id, hg.room_number, h.name AS hotel_name
         FROM users u
         LEFT JOIN hotel_guests hg ON hg.user_id = u.id
         LEFT JOIN hotels h ON hg.hotel_id = h.id
         WHERE u.clerk_user_id = $1
         LIMIT 1`,
        [userId]
      );
      if (userRow.rows.length) {
        const u = userRow.rows[0];
        resolvedGuestId = u.guest_id;
        resolvedHotelId = u.hotel_id || resolvedHotelId;
        resolvedRoom    = u.room_number || resolvedRoom;
        guestEmail      = u.email || guestEmail;
        guestFirstName  = u.first_name || guestFirstName;
        guestLastName   = u.last_name  || guestLastName;
        guestHotelName  = u.hotel_name;
      }
    }

    // Initial status: pending_pickup for ALL orders (payment happens after weighing)
    const initialStatus = "pending_pickup";

    const orderResult = await db.query(
      `INSERT INTO laundry_orders
         (order_number, guest_id, hotel_id, placed_by, placed_by_user_id,
          payment_method, payment_verified, status,
          tier, service_type, special_instructions,
          guest_email, created_at)
       VALUES
         ($1, $2, $3, $4, $5,
          $6, false, $7,
          $8, $9, $10,
          $11, NOW())
       RETURNING id, order_number`,
      [
        orderNumber,
        resolvedGuestId,
        resolvedHotelId,
        placedBy,
        placedByUserId || null,
        paymentMethod,
        initialStatus,
        tier,
        serviceType,
        specialInstructions || null,
        guestEmail,
      ]
    );

    const order = orderResult.rows[0];

    // Notify technician of new pickup (non-blocking)
    notifyNewOrderPickup({
      orderNumber,
      guestName: `${guestFirstName} ${guestLastName}`.trim() || "Guest",
      hotelName: guestHotelName,
      roomNumber: resolvedRoom,
      paymentMethod,
    }).catch(e => console.error("notifyNewOrderPickup:", e));

    res.json({
      success:     true,
      orderId:     order.id,
      orderNumber: order.order_number,
      status:      initialStatus,
      paymentMethod,
      message:     "Order placed. Payment link will be sent after we weigh your laundry.",
    });
  } catch (err) {
    console.error("create order error:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
}
