// PATCH /api/orders/[orderId]/status
// Technician advances order through the status flow
import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).end();

  const { orderId } = req.query;
  const { status, weight } = req.body;

  const VALID = ["in_wash", "drying", "folding", "bagged", "out_for_delivery", "completed"];
  if (!VALID.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const prev = await sql`
      SELECT status FROM laundry_orders WHERE id = ${orderId}
    `;
    if (!prev.rows.length) return res.status(404).json({ error: "Order not found" });

    const fromStatus = prev.rows[0].status;

    await sql`
      UPDATE laundry_orders
      SET status = ${status},
          ${weight ? sql`total_weight_lbs = ${weight},` : sql``}
          updated_at = NOW()
      WHERE id = ${orderId}
    `;

    await sql`
      INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, changed_at)
      VALUES (${orderId}, ${fromStatus}, ${status}, 'technician', NOW())
    `;

    res.json({ success: true, orderId, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update status" });
  }
}
