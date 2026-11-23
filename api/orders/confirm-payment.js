import { sql } from "@vercel/postgres";
import { notifyPaymentConfirmed } from "../../src/lib/notifications.js";
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { orderId } = req.body;
  if (!orderId) return res.status(400).json({ error: "orderId required" });
  try {
    const prev = await sql`SELECT lo.order_number, lo.total_amount, COALESCE(lo.guest_first_name, u.first_name, 'Guest') AS guest_name, COALESCE(lo.guest_room_number, hg.room_number) AS room_number, h.name AS hotel_name FROM laundry_orders lo LEFT JOIN hotel_guests hg ON lo.guest_id = hg.id LEFT JOIN users u ON hg.user_id = u.id LEFT JOIN hotels h ON lo.hotel_id = h.id WHERE lo.id = ${orderId}`;
    const o = prev.rows[0];
    if (!o) return res.status(404).json({ error: "Order not found" });
    await sql`UPDATE laundry_orders SET status = 'in_wash', payment_verified = true, payment_confirmed_at = NOW(), updated_at = NOW() WHERE id = ${orderId}`;
    notifyPaymentConfirmed({ orderNumber: o.order_number, guestName: o.guest_name, roomNumber: o.room_number, hotelName: o.hotel_name, totalAmount: o.total_amount }).catch(() => {});
    res.json({ success: true, status: "in_wash" });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
