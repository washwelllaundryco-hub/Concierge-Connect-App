import { sql } from "@vercel/postgres";
const STATUS_LABELS = { in_wash: "being washed", drying: "in the dryer", folding: "being folded", out_for_delivery: "out for delivery", completed: "ready for delivery" };
export default async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).end();
  const { orderId } = req.query;
  const { status } = req.body;
  const VALID = ["in_wash","drying","folding","out_for_delivery","completed","cancelled"];
  if (!VALID.includes(status)) return res.status(400).json({ error: `Invalid status: ${status}` });
  try {
    const cur = await sql`SELECT status FROM laundry_orders WHERE id = ${orderId}`;
    if (!cur.rows.length) return res.status(404).json({ error: "Order not found" });
    await sql`UPDATE laundry_orders SET status = ${status}, updated_at = NOW() WHERE id = ${orderId}`;
    res.json({ success: true, orderId, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update status" });
  }
}
