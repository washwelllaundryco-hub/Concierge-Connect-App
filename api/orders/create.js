// POST /api/orders/create
// Two modes:
//   Concierge: { guestId, paymentMethod, placedByUserId }
//   Guest self-service: { clerkUserId, hotelId, firstName, lastName, roomNumber, tier, paymentMethod }
import { sql } from "@vercel/postgres";
import { notifyPaymentConfirmed, sendWhatsApp } from "../../src/lib/notifications.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const {
    // Concierge fields
    guestId, placedByUserId, specialInstructions,
    // Guest self-service fields
    clerkUserId, hotelId, firstName, lastName, roomNumber, tier,
    // Shared
    paymentMethod,
  } = req.body;

  try {
    let g; // { id, room_number, hotel_id, first_name, last_name, email, phone, hotel_name }
    let resolvedGuestId;
    let placedBy;

    // ── Concierge flow ───────────────────────────────────────────────────────
    if (guestId) {
      const guest = await sql`
        SELECT hg.id, hg.room_number, hg.hotel_id,
               u.first_name, u.last_name, u.email, u.phone,
               h.name AS hotel_name
        FROM hotel_guests hg
        INNER JOIN users u ON hg.user_id = u.id
        INNER JOIN hotels h ON hg.hotel_id = h.id
        WHERE hg.id = ${guestId}
      `;
      if (!guest.rows.length) return res.status(404).json({ error: "Guest not found" });
      g = guest.rows[0];
      resolvedGuestId = guestId;
      placedBy = "concierge";

    // ── Guest self-service flow ───────────────────────────────────────────────
    } else if (clerkUserId && hotelId) {
      // Look up the hotel by slug
      const hotel = await sql`
        SELECT id, name FROM hotels WHERE slug = ${hotelId} LIMIT 1
      `;
      if (!hotel.rows.length) return res.status(404).json({ error: "Hotel not found" });
      const hotelRow = hotel.rows[0];

      // Look up or create the user record
      let userRow;
      const existingUser = await sql`
        SELECT id, first_name, last_name, email, phone
        FROM users WHERE clerk_user_id = ${clerkUserId} LIMIT 1
      `;
      if (existingUser.rows.length) {
        userRow = existingUser.rows[0];
      } else {
        // Create a minimal user record
        const created = await sql`
          INSERT INTO users (clerk_user_id, first_name, last_name, created_at)
          VALUES (${clerkUserId}, ${firstName || "Guest"}, ${lastName || ""}, NOW())
          RETURNING id, first_name, last_name, email, phone
        `;
        userRow = created.rows[0];
      }

      // Look up or create the hotel_guests record
      let hgRow;
      const existingHg = await sql`
        SELECT id, room_number FROM hotel_guests
        WHERE user_id = ${userRow.id} AND hotel_id = ${hotelRow.id} LIMIT 1
      `;
      if (existingHg.rows.length) {
        hgRow = existingHg.rows[0];
        // Update room number if provided
        if (roomNumber && roomNumber !== hgRow.room_number) {
          await sql`UPDATE hotel_guests SET room_number = ${roomNumber} WHERE id = ${hgRow.id}`;
          hgRow.room_number = roomNumber;
        }
      } else {
        const created = await sql`
          INSERT INTO hotel_guests (user_id, hotel_id, room_number, created_at)
          VALUES (${userRow.id}, ${hotelRow.id}, ${roomNumber || null}, NOW())
          RETURNING id, room_number
        `;
        hgRow = created.rows[0];
      }

      g = {
        id:         hgRow.id,
        room_number: roomNumber || hgRow.room_number,
        hotel_id:   hotelRow.id,
        hotel_name: hotelRow.name,
        first_name: firstName || userRow.first_name,
        last_name:  lastName  || userRow.last_name,
        email:      userRow.email,
        phone:      userRow.phone,
      };
      resolvedGuestId = hgRow.id;
      placedBy = "guest";

    } else {
      return res.status(400).json({ error: "guestId or clerkUserId+hotelId required" });
    }

    // ── Create the order ─────────────────────────────────────────────────────
    const autoApproved = paymentMethod !== "stripe" && paymentMethod !== "pay_after_weigh";
    const initialStatus = autoApproved ? "paid_pending_technician" : "pending_payment";

    const seqResult = await sql`SELECT nextval('order_number_seq') AS n`;
    const orderNumber = `WW-${String(seqResult.rows[0].n).padStart(5, "0")}`;

    const orderResult = await sql`
      INSERT INTO laundry_orders
        (order_number, guest_id, hotel_id, tier, placed_by, placed_by_user_id,
         payment_method, payment_verified, status, special_instructions, created_at)
      VALUES
        (${orderNumber}, ${resolvedGuestId}, ${g.hotel_id}, ${tier || null},
         ${placedBy}, ${placedByUserId || null},
         ${paymentMethod}, ${autoApproved && paymentMethod !== "stripe"},
         ${initialStatus}, ${specialInstructions || null}, NOW())
      RETURNING id, order_number
    `;
    const order = orderResult.rows[0];
    const guestName = `${g.first_name} ${g.last_name}`.trim();

    // ── Notifications ─────────────────────────────────────────────────────────
    if (paymentMethod === "stripe") {
      if (g.phone) {
        await sendWhatsApp(
          `whatsapp:${g.phone}`,
          `Hi ${g.first_name}, your laundry pickup has been arranged at ${g.hotel_name}.\n\nOrder ${orderNumber} — please complete your payment:\n${process.env.VITE_STRIPE_PAYMENT_LINK}?client_reference_id=${order.id}\n\n— Washwell Laundry Co.`
        ).catch(() => {});
      }
    } else if (paymentMethod === "room_charge") {
      await sql`
        INSERT INTO room_charges (order_id, hotel_id, guest_id, room_number, amount, description, charged_by, charged_at)
        VALUES (${order.id}, ${g.hotel_id}, ${resolvedGuestId}, ${g.room_number}, 45.00,
                ${"Washwell Laundry — " + orderNumber}, ${placedByUserId || resolvedGuestId}, NOW())
      `;
      await notifyPaymentConfirmed({ orderId: order.id, orderNumber, guestName, roomNumber: g.room_number, hotelName: g.hotel_name, totalAmount: "45.00", paymentNote: "Room charge" });
    } else if (paymentMethod === "hotel_account") {
      await sql`
        INSERT INTO hotel_account_charges (order_id, hotel_id, guest_id, room_number, amount, description, created_by, created_at)
        VALUES (${order.id}, ${g.hotel_id}, ${resolvedGuestId}, ${g.room_number}, 45.00,
                ${"Washwell Laundry — " + orderNumber}, ${placedByUserId || resolvedGuestId}, NOW())
      `;
      await notifyPaymentConfirmed({ orderId: order.id, orderNumber, guestName, roomNumber: g.room_number, hotelName: g.hotel_name, totalAmount: "45.00", paymentNote: `Hotel account — ${g.hotel_name}` });
    } else if (paymentMethod === "cash") {
      await notifyPaymentConfirmed({ orderId: order.id, orderNumber, guestName, roomNumber: g.room_number, hotelName: g.hotel_name, totalAmount: "—", paymentNote: "Cash on delivery" });
    }

    res.json({ success: true, orderId: order.id, orderNumber, status: initialStatus, paymentMethod });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create order" });
  }
}
