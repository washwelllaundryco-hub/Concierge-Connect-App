import { db } from "../../_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id: orderId } = req.query;
  const { status, paymentConfirmedAt } = req.body;

  try {
    await db.query(
      `UPDATE laundry_orders
       SET status = $1, payment_confirmed_at = $2, payment_verified = true, updated_at = NOW()
       WHERE id = $3`,
      [status, paymentConfirmedAt, orderId]
    );

    await db.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note, changed_at)
       VALUES ($1, 'pending', $2, 'system', 'Payment confirmed by guest', NOW())`,
      [orderId, status]
    );

    await db.query(
      `INSERT INTO notifications (user_id, order_id, type, channel, title, message, sent_at)
       SELECT t.user_id, $1, 'new_order', 'in_app', 'New Paid Order',
              'Order ' || lo.order_number || ' is ready for processing', NOW()
       FROM laundry_orders lo
       CROSS JOIN textile_technicians t
       WHERE lo.id = $1
       LIMIT 1`,
      [orderId]
    );

    await db.query(
      `INSERT INTO audit_logs (actor_id, order_id, action, entity_type, payload_after, created_at)
       VALUES ('guest', $1, 'payment_confirmed', 'laundry_order', $2, NOW())`,
      [orderId, JSON.stringify({ status, paymentConfirmedAt })]
    );

    res.json({ success: true, orderId, status, message: "Payment confirmed successfully" });
  } catch (error) {
    console.error("Payment confirmation error:", error);
    res.status(500).json({ error: "Failed to confirm payment" });
  }
}
