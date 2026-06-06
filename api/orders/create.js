// POST /api/orders/create
// Accepts: { firstName, lastName, roomNumber, tier, paymentMethod, hotelId, specialInstructions, clerkUserId? }
// paymentMethod: stripe | cash | room_charge | hotel_account
import { sql } from "@vercel/postgres";
import { sendWhatsApp } from "../../src/lib/notifications.js";

const TIER_PRICES = {
  "Essential Load": "68.00",
  "Standard Load":  "88.00",
  "Premium Load":   "128.00",
  "Executive Load": "188.00",
  "Bulk Service":   "245.00",
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { firstName, lastName, roomNumber, tier, paymentMethod, hotelId, specialInstructions, clerkUserId } = req.body;

  if (!firstName || !roomNumber || !tier || !paymentMethod || !hotelId) {
    return res.status(400).json({ error: "firstName, roomNumber, tier, paymentMethod, hotelId required" });
  }

  try {
    // 1. Find hotel by slug
    const hotelResult = await sql`
      SELECT id, name FROM hotels WHERE slug = ${hotelId} LIMIT 1
    `;
    if (!hotelResult.rows.length) {
      return res.status(404).json({ error: `Hotel not found: ${hotelId}` });
    }
    const hotel = hotelResult.rows[0];

    // 2. Find or create user record
    let userId;
    if (clerkUserId) {
      // Authenticated Clerk guest — look up by Clerk ID
      const byClerk = await sql`SELECT id FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1`;
      if (byClerk.rows.length) {
        userId = byClerk.rows[0].id;
        await sql`UPDATE users SET first_name = ${firstName}, last_name = ${lastName || null} WHERE id = ${userId}`;
      } else {
        const newUser = await sql`
          INSERT INTO users (first_name, last_name, clerk_user_id, role, created_at)
          VALUES (${firstName}, ${lastName || null}, ${clerkUserId}, 'guest', NOW())
          RETURNING id
        `;
        userId = newUser.rows[0].id;
      }
    } else {
      // Walk-in guest (concierge-placed) — match by name + hotel + room
      const existingUser = await sql`
        SELECT u.id FROM users u
        INNER JOIN hotel_guests hg ON hg.user_id = u.id
        WHERE u.first_name = ${firstName}
          AND LOWER(COALESCE(u.last_name, '')) = LOWER(${lastName || ""})
          AND hg.hotel_id = ${hotel.id}
          AND hg.room_number = ${roomNumber}
        ORDER BY u.created_at DESC
        LIMIT 1
      `;
      if (existingUser.rows.length) {
        userId = existingUser.rows[0].id;
      } else {
        const newUser = await sql`
          INSERT INTO users (first_name, last_name, role, created_at)
          VALUES (${firstName}, ${lastName || null}, 'guest', NOW())
          RETURNING id
        `;
        userId = newUser.rows[0].id;
      }
    }

    // 3. Find or create hotel_guest record
    let guestId;
    const existingGuest = await sql`
      SELECT id FROM hotel_guests WHERE user_id = ${userId} AND hotel_id = ${hotel.id} LIMIT 1
    `;
    if (existingGuest.rows.length) {
      guestId = existingGuest.rows[0].id;
      await sql`UPDATE hotel_guests SET room_number = ${roomNumber} WHERE id = ${guestId}`;
    } else {
      const newGuest = await sql`
        INSERT INTO hotel_guests (user_id, hotel_id, room_number, created_at)
        VALUES (${userId}, ${hotel.id}, ${roomNumber}, NOW())
        RETURNING id
      `;
      guestId = newGuest.rows[0].id;
    }

    // 4. Determine status and price
    const autoApproved  = paymentMethod !== "stripe";
    const initialStatus = autoApproved ? "paid_pending_technician" : "pending_payment";
    const totalAmount   = TIER_PRICES[tier] || "88.00";

    // 5. Generate order number
    const seqResult = await sql`SELECT nextval('order_number_seq') AS n`;
    const orderNumber = `WW-${String(seqResult.rows[0].n).padStart(5, "0")}`;

    // 6. Insert order
    const placedBy = clerkUserId ? "guest" : "concierge";
    const orderResult = await sql`
      INSERT INTO laundry_orders
        (order_number, guest_id, hotel_id, placed_by, payment_method, payment_verified,
         status, tier, total_amount, special_instructions, created_at)
      VALUES
        (${orderNumber}, ${guestId}, ${hotel.id}, ${placedBy}, ${paymentMethod}, ${autoApproved},
         ${initialStatus}, ${tier}, ${totalAmount}, ${specialInstructions || null}, NOW())
      RETURNING id, order_number
    `;
    const order = orderResult.rows[0];
    const guestName = `${firstName}${lastName ? " " + lastName : ""}`;

    // 7. Notifications for non-Stripe payments (Stripe is confirmed via webhook)
    if (paymentMethod === "cash") {
      const msg = `New Cash Order — ${orderNumber}\nGuest: ${guestName}\nRoom: ${roomNumber} · ${hotel.name}\nTier: ${tier} ($${totalAmount})\nCash on delivery — collect $${totalAmount} at delivery.`;
      if (process.env.WHATSAPP_TECHNICIAN) {
        await sendWhatsApp(`whatsapp:${process.env.WHATSAPP_TECHNICIAN}`, msg);
      }
      if (process.env.WHATSAPP_MANAGER) {
        await sendWhatsApp(
          `whatsapp:${process.env.WHATSAPP_MANAGER}`,
          `New order ${orderNumber} — Cash on delivery. ${guestName}, Room ${roomNumber}, ${hotel.name}. $${totalAmount}.`
        );
      }
    } else if (paymentMethod === "room_charge") {
      await sql`
        INSERT INTO room_charges (order_id, hotel_id, guest_id, room_number, amount, description, charged_at)
        VALUES (${order.id}, ${hotel.id}, ${guestId}, ${roomNumber}, ${totalAmount},
                ${"Washwell Laundry — " + orderNumber}, NOW())
      `;
      const msg = `New Order — ${orderNumber}\nGuest: ${guestName}\nRoom: ${roomNumber} · ${hotel.name}\nTier: ${tier} ($${totalAmount})\nRoom charge applied.`;
      if (process.env.WHATSAPP_TECHNICIAN) {
        await sendWhatsApp(`whatsapp:${process.env.WHATSAPP_TECHNICIAN}`, msg);
      }
    } else if (paymentMethod === "hotel_account") {
      await sql`
        INSERT INTO hotel_account_charges (order_id, hotel_id, guest_id, room_number, amount, description, created_at)
        VALUES (${order.id}, ${hotel.id}, ${guestId}, ${roomNumber}, ${totalAmount},
                ${"Washwell Laundry — " + orderNumber}, NOW())
      `;
      const msg = `New Order — ${orderNumber}\nGuest: ${guestName}\nRoom: ${roomNumber} · ${hotel.name}\nTier: ${tier} ($${totalAmount})\nHotel account charge.`;
      if (process.env.WHATSAPP_TECHNICIAN) {
        await sendWhatsApp(`whatsapp:${process.env.WHATSAPP_TECHNICIAN}`, msg);
      }
    }
    // stripe: frontend opens Stripe link with client_reference_id, webhook auto-confirms

    res.json({ success: true, orderId: order.id, orderNumber, status: initialStatus, paymentMethod });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: "Failed to create order", detail: err.message });
  }
}
