import { db } from "../../_db.js";

const STATUS_LABELS = {
  in_wash: "being washed",
  drying: "in the dryer",
  folding: "being folded",
  completed: "ready for delivery",
};

export default async function handler(req, res) {
  if (req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id: orderId } = req.query;
  const { status, weight } = req.body;
  const technicianId = req.headers["x-technician-id"] || "tech-unknown";

  try {
    const current = await db.query(
      "SELECT status FROM laundry_orders WHERE id = $1",
      [orderId]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    const fromStatus = current.rows[0].status;

    const statusTimestampField = `${status}_at`;
    if (weight) {
      await db.query(
        `UPDATE laundry_orders
         SET status = $1, ${statusTimestampField} = NOW(), total_weight_lbs = $2, updated_at = NOW()
         WHERE id = $3`,
        [status, weight, orderId]
      );
    } else {
      await db.query(
        `UPDATE laundry_orders
         SET status = $1, ${statusTimestampField} = NOW(), updated_at = NOW()
         WHERE id = $2`,
        [status, orderId]
      );
    }

    if (weight && status === "in_wash") {
      const waterSaved = (weight * 2.1).toFixed(2);
      const energySaved = (weight * 0.09).toFixed(3);
      const co2Avoided = (energySaved * 0.92).toFixed(3);

      await db.query(
        `INSERT INTO sustainability_metrics
         (order_id, water_saved_gallons, water_saved_per_lb, energy_saved_kwh, co2_lbs_avoided, calculated_at)
         VALUES ($1, $2, 2.1, $3, $4, NOW())`,
        [orderId, waterSaved, energySaved, co2Avoided]
      );
    }

    await db.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, changed_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [orderId, fromStatus, status, technicianId]
    );

    await db.query(
      `INSERT INTO notifications (user_id, order_id, type, channel, title, message, sent_at)
       SELECT guest_id, $1, 'status_update', 'push', 'Order Update', 'Your laundry is now ' || $2, NOW()
       FROM laundry_orders WHERE id = $1`,
      [orderId, STATUS_LABELS[status] || status]
    );

    res.json({ success: true, orderId, status, weight });
  } catch (error) {
    console.error("Status update error:", error);
    res.status(500).json({ error: "Failed to update order status" });
  }
}
