import { sql } from "@vercel/postgres";
export default async function handler(req, res) {
  if (req.method !== "DELETE") return res.status(405).end();
  const { orderId } = req.query;
  try {
    const result = await sql`
      UPDATE laundry_orders SET status = 'cancelled', updated_at = NOW()
      WHERE id = ${orderId} RETURNING id, order_number AS "orderNumber"
    `;
    if (!result.rows.length) return res.status(404).json({ error: "Order not found" });
    res.json({ success: true, orderId: result.rows[0].id, orderNumber: result.rows[0].orderNumber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to cancel order" });
  }
}
