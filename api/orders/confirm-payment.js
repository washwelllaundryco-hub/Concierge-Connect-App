// POST /api/orders/[orderId]/confirm-payment
// Used for cash and hotel_account payments only.
// Stripe payments are confirmed exclusively via the Stripe webhook.
import { sql } from "@vercel/postgres";
import { sendWhatsApp } from "../../../src/lib/notifications.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { orderId } = req.query;
  const { paymentMethod, paymentConfirmedAt } = req.body;

  if (paymentMethod === "stripe") {
    return res.status(400).json({ error: "Stripe payments are confirmed via webhook only" });
  }

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
      VALUES (${orderId}, 'pending', 'paid_pending_technician', 'guest',
              ${paymentMethod === "cash" ? "Cash on delivery confirmed" : "Hotel account charge confirmed"},
              NOW())
    `;

    // Fetch order details for notification
    const result = await sql`
      SELECT lo.order_number, lo.tier, lo.total_amount,
             hg.room_number,
             u.first_name || ' ' || u.last_name AS guest_name,
             h.name AS hotel_name
      FROM laundry_orders lo
      INNER JOIN hotel_guests hg ON lo.guest_id = hg.id
      INNER JOIN users u ON hg.user_id = u.id
      INNER JOIN hotels h ON lo.hotel_id = h.id
      WHERE lo.id = ${orderId}
    `;

    if (result.rows.length) {
      const o = result.rows[0];
      const isCash = paymentMethod === "cash";
      const msg = isCash
        ? `Cash on delivery — ${o.order_number}\nGuest: ${o.guest_name}, Room ${o.room_number}\nHotel: ${o.hotel_name}\nService: ${o.tier}\nAmount to collect: $${o.total_amount}\n\nPlease collect payment at pickup.`
        : `Hotel account charge — ${o.order_number}\nGuest: ${o.guest_name}, Room ${o.room_number}\nHotel: ${o.hotel_name}\nService: ${o.tier}\n\nOrder is ready to process.`;

      await sendWhatsApp(`whatsapp:${process.env.WHATSAPP_TECHNICIAN}`, msg).catch(() => {});
      await sendWhatsApp(`whatsapp:${process.env.WHATSAPP_MANAGER}`, msg).catch(() => {});
    }

    res.json({ success: true, status: "paid_pending_technician" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to confirm payment" });
  }
}
