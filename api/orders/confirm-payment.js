// POST /api/orders/confirm-payment
// Hotel guests: pending_payment → paid_pending_technician
// Residential guests: awaiting_payment → in_wash (already picked up, now move to processing)
import { sql } from "@vercel/postgres";
import { notifyPaymentConfirmed } from "../../src/lib/notifications.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { orderId, orderNumber, guestName, roomNumber, hotelName, totalAmount, paymentConfirmedAt } = req.body;

  try {
    // Check current order status to determine transition
    const current = await sql`
      SELECT status, payment_method FROM laundry_orders WHERE id = ${orderId}
    `;
    if (!current.rows.length) return res.status(404).json({ error: "Order not found" });

    const { status: currentStatus, payment_method } = current.rows[0];
    const isResidential = payment_method === "pay_after_weigh" || currentStatus === "awaiting_payment";
    const newStatus = isResidential ? "in_wash" : "paid_pending_technician";

    await sql`
      UPDATE laundry_orders
      SET status              = ${newStatus},
          payment_verified    = true,
          payment_confirmed_at = ${paymentConfirmedAt || new Date().toISOString()},
          updated_at          = NOW()
      WHERE id = ${orderId}
    `;
    await sql`
      INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note, changed_at)
      VALUES (${orderId}, ${currentStatus}, ${newStatus}, 'guest', 'Payment confirmed', NOW())
    `;

    if (!isResidential) {
      await notifyPaymentConfirmed({ orderId, orderNumber, guestName, roomNumber, hotelName, totalAmount });
    }

    res.json({ success: true, status: newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to confirm payment" });
  }
}
