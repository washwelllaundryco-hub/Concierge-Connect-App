// PATCH /api/orders/[orderId]/status
// Technician advances order through the status flow
import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).end();

  const { orderId } = req.query;
  const { status, weight, balanceDue, correctTier } = req.body;

  const VALID = ["in_wash", "drying", "folding", "bagged", "out_for_delivery", "completed", "cancelled"];
  if (!VALID.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const prev = await sql`
      SELECT status FROM laundry_orders WHERE id = ${orderId}
    `;
    if (!prev.rows.length) return res.status(404).json({ error: "Order not found" });

    const fromStatus = prev.rows[0].status;

    if (weight) {
      await sql`
        UPDATE laundry_orders
        SET status = ${status}, total_weight_lbs = ${weight}, updated_at = NOW()
        WHERE id = ${orderId}
      `;
    } else {
      await sql`
        UPDATE laundry_orders
        SET status = ${status}, updated_at = NOW()
        WHERE id = ${orderId}
      `;
    }

    // Store balance due when technician flags a tier overage
    if (balanceDue && parseFloat(balanceDue) > 0 && correctTier) {
      await sql`
        UPDATE laundry_orders
        SET balance_due = ${parseFloat(balanceDue)}, correct_tier = ${correctTier}
        WHERE id = ${orderId}
      `;
    }

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
