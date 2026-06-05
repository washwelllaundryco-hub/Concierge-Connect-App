// POST /api/orders/confirm-payment
// Called when guest clicks "I have completed my payment"
// Updates order status to paid_pending_technician and notifies technician via WhatsApp
import { sql } from "@vercel/postgres";
import { notifyPaymentConfirmed } from "../../src/lib/notifications.js";
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { orderId, orderNumber, guestName, roomNumber, hotelName, totalAmount, paymentConfirmedAt } = req.body;
  try {
    await sql`
      UPDATE laundry_orders
      SET status = 'paid_pending_technician',
          payment_verified = true,
          payment_confirmed_at = ${paymentConfirmedAt},
          updated_at = NOW()
      WHERE id = ${orderId}
    `;
    await sql`
      INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note, changed_at)
      VALUES (${orderId}, 'pending', 'paid_pending_technician', 'guest', 'Payment confirmed by guest', NOW())
    `;
    await notifyPaymentConfirmed({ orderId, orderNumber, guestName, roomNumber, hotelName, totalAmount });
    res.json({ success: true, status: "paid_pending_technician" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to confirm payment" });
  }
}
