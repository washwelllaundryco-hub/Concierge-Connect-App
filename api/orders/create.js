// POST /api/orders/create
// Concierge places an order on behalf of a guest.
// Routes to correct payment flow based on paymentMethod:
//   stripe        → status: pending_payment, send guest a WhatsApp payment link
//   room_charge   → status: paid_pending_technician, log room charge, notify tech
//   hotel_account → status: paid_pending_technician, log hotel charge, notify tech
import { sql } from "@vercel/postgres";
import { notifyPaymentConfirmed, sendWhatsApp } from "../../src/lib/notifications.js";
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { guestId, paymentMethod, specialInstructions, placedByUserId } = req.body;
  try {
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
    const g = guest.rows[0];
    const autoApproved = paymentMethod !== "stripe";
    const initialStatus = autoApproved ? "paid_pending_technician" : "pending_payment";
    const seqResult = await sql`SELECT nextval('order_number_seq') AS n`;
    const orderNumber = `WW-${String(seqResult.rows[0].n).padStart(5, "0")}`;
    const orderResult = await sql`
      INSERT INTO laundry_orders
        (order_number, guest_id, hotel_id, placed_by, placed_by_user_id,
         payment_method, payment_verified, status, special_instructions, created_at)
      VALUES
        (${orderNumber}, ${guestId}, ${g.hotel_id}, 'concierge', ${placedByUserId},
         ${paymentMethod}, ${autoApproved}, ${initialStatus}, ${specialInstructions || null}, NOW())
      RETURNING id, order_number
    `;
    const order = orderResult.rows[0];
    if (paymentMethod === "stripe") {
      // Send guest a WhatsApp payment link
      await sendWhatsApp(
        `whatsapp:${g.phone}`,
        `Hi ${g.first_name}, your laundry pickup has been arranged by the concierge at ${g.hotel_name}.\n\nOrder ${orderNumber} — please complete your payment:\n${process.env.VITE_STRIPE_PAYMENT_LINK}?client_reference_id=${order.id}\n\n— Washwell Laundry Co.`
      );
    } else if (paymentMethod === "room_charge") {
      await sql`
        INSERT INTO room_charges (order_id, hotel_id, guest_id, room_number, amount, description, charged_by, charged_at)
        VALUES (${order.id}, ${g.hotel_id}, ${guestId}, ${g.room_number}, 45.00,
                ${"Washwell Laundry — " + orderNumber}, ${placedByUserId}, NOW())
      `;
      await notifyPaymentConfirmed({ orderId: order.id, orderNumber, guestName: `${g.first_name} ${g.last_name}`, roomNumber: g.room_number, hotelName: g.hotel_name, totalAmount: "45.00", paymentNote: "Room charge" });
    } else if (paymentMethod === "hotel_account") {
      await sql`
        INSERT INTO hotel_account_charges (order_id, hotel_id, guest_id, room_number, amount, description, created_by, created_at)
        VALUES (${order.id}, ${g.hotel_id}, ${guestId}, ${g.room_number}, 45.00,
                ${"Washwell Laundry — " + orderNumber}, ${placedByUserId}, NOW())
      `;
      await notifyPaymentConfirmed({ orderId: order.id, orderNumber, guestName: `${g.first_name} ${g.last_name}`, roomNumber: g.room_number, hotelName: g.hotel_name, totalAmount: "45.00", paymentNote: `Hotel account — ${g.hotel_name}` });
    }
    res.json({ success: true, orderId: order.id, orderNumber, status: initialStatus, paymentMethod });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create order" });
  }
}
