// POST /api/orders/confirm-payment
// Called when guest completes Stripe payment and is redirected back.
// Looks up order details from DB so the technician notification is complete.
import { sql } from "@vercel/postgres";
import { notifyPaymentConfirmed } from "../../src/lib/notifications.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { orderId, paymentConfirmedAt } = req.body;
  if (!orderId) return res.status(400).json({ error: "orderId required" });

  try {
    // Look up everything we need from the DB
    const lookup = await sql`
      SELECT
        lo.order_number       AS "orderNumber",
        lo.status,
        lo.payment_method     AS "paymentMethod",
        lo.total_amount       AS "totalAmount",
        h.name                AS "hotelName",
        hg.room_number        AS "roomNumber",
        COALESCE(
          u.first_name || ' ' || u.last_name,
          ru.first_name || ' ' || ru.last_name
        )                     AS "guestName"
      FROM laundry_orders lo
      LEFT JOIN hotel_guests hg ON lo.guest_id = hg.id
      LEFT JOIN users u         ON hg.user_id = u.id
      LEFT JOIN users ru        ON lo.placed_by_user_id = ru.id
      LEFT JOIN hotels h        ON lo.hotel_id = h.id
      WHERE lo.id = ${orderId}
      LIMIT 1
    `;

    if (!lookup.rows.length) return res.status(404).json({ error: "Order not found" });

    const order = lookup.rows[0];
    const currentStatus = order.status;
    const paymentMethod = order.paymentMethod;

    // Residential (pay_after_weigh) or awaiting_payment orders go straight to in_wash
    const isResidential = paymentMethod === "pay_after_weigh" || currentStatus === "awaiting_payment";
    const newStatus = isResidential ? "in_wash" : "paid_pending_technician";

    // Idempotent — skip if already past pending_payment
    if (!["pending_payment", "awaiting_payment"].includes(currentStatus)) {
      return res.json({ success: true, status: currentStatus, skipped: true });
    }

    await sql`
      UPDATE laundry_orders
      SET status = ${newStatus},
          payment_verified = true,
          payment_confirmed_at = ${paymentConfirmedAt || new Date().toISOString()},
          updated_at = NOW()
      WHERE id = ${orderId}
    `;

    await sql`
      INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note, changed_at)
      VALUES (${orderId}, ${currentStatus}, ${newStatus}, 'guest', 'Payment confirmed by guest', NOW())
    `;

    // Notify technician with full order details now that we have them
    await notifyPaymentConfirmed({
      orderId,
      orderNumber: order.orderNumber,
      guestName:   order.guestName   || "Guest",
      roomNumber:  order.roomNumber  || null,
      hotelName:   order.hotelName   || null,
      totalAmount: order.totalAmount || "—",
    });

    res.json({ success: true, status: newStatus });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to confirm payment" });
  }
}
