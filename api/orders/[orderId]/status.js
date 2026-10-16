// PATCH /api/orders/[id]/status
// Manual status advances by technician (in_wash → drying → folding → completed).
// Weight logging and initial payment generation handled by /api/orders/[id]/weigh.
import { db } from "../../_db.js";

const STATUS_LABELS = {
  in_wash:          "being washed",
  drying:           "in the dryer",
  folding:          "being folded",
  out_for_delivery: "out for delivery",
  completed:        "ready for delivery",
};

export default async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).end();

  const { id: orderId } = req.query;
  const { status } = req.body;
  const technicianId = req.headers["x-technician-id"] || "tech-unknown";

  const VALID = ["in_wash", "drying", "folding", "out_for_delivery", "completed", "cancelled"];
  if (!VALID.includes(status)) {
    return res.status(400).json({ error: `Invalid status: ${status}` });
  }

  try {
    const current = await db.query(
      `SELECT status FROM laundry_orders WHERE id = $1`,
      [orderId]
    );
    if (!current.rows.length) return res.status(404).json({ error: "Order not found" });
    const fromStatus = current.rows[0].status;

    const tsField = `${status}_at`;
    await db.query(
      `UPDATE laundry_orders SET status = $1, ${tsField} = NOW(), updated_at = NOW() WHERE id = $2`,
      [status, orderId]
    );

    await db.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, changed_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [orderId, fromStatus, status, technicianId]
    );

    // Push notification to guest
    await db.query(
      `INSERT INTO notifications (user_id, order_id, type, channel, title, message, sent_at)
       SELECT guest_id, $1, 'status_update', 'push', 'Order Update', $2, NOW()
       FROM laundry_orders WHERE id = $1`,
      [orderId, `Your laundry is now ${STATUS_LABELS[status] || status}`]
    ).catch(() => {});

    res.json({ success: true, orderId, status });
  } catch (err) {
    console.error("status update error:", err);
    res.status(500).json({ error: "Failed to update status" });
  }
}
