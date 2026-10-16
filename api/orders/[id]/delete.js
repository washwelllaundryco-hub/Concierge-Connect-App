// DELETE /api/orders/[id]  — soft-cancel (sets status = 'cancelled')
import { db } from "../../_db.js";

export default async function handler(req, res) {
  if (req.method !== "DELETE") return res.status(405).end();
  const { id: orderId } = req.query;
  try {
    const { rows } = await db.query(
      `UPDATE laundry_orders SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1 RETURNING id, order_number AS "orderNumber"`,
      [orderId]
    );
    if (!rows.length) return res.status(404).json({ error: "Order not found" });
    res.json({ success: true, orderId: rows[0].id, orderNumber: rows[0].orderNumber });
  } catch (err) {
    console.error("delete order error:", err);
    res.status(500).json({ error: "Failed to cancel order" });
  }
}
