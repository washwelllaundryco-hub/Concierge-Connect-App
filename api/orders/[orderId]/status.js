// PATCH /api/orders/[orderId]/status
// Handles two actions in one endpoint (keeps us at ≤12 serverless functions):
//   1. Status update: body has { status, weight?, balanceDue?, correctTier? }
//   2. Machine assignment: body has { machineType: "washer"|"dryer", machineNumber: number }
import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).end();

  const { orderId } = req.query;
  const { status, weight, balanceDue, correctTier, machineType, machineNumber } = req.body;

  // ── Machine assignment mode ────────────────────────────────────────────────
  if (machineType) {
    if (!["washer", "dryer"].includes(machineType)) {
      return res.status(400).json({ error: "machineType must be washer or dryer" });
    }
    try {
      const column = machineType === "washer" ? "washer_machine_number" : "dryer_machine_number";
      await sql.query(
        `UPDATE laundry_orders SET ${column} = $1, updated_at = NOW() WHERE id = $2`,
        [machineNumber, orderId]
      );
      await sql`
        INSERT INTO audit_logs (order_id, action, entity_type, payload_after, created_at)
        VALUES (${orderId}, ${machineType + "_assigned"}, 'laundry_order',
                ${JSON.stringify({ machineType, machineNumber })}, NOW())
      `;
      return res.json({ success: true, orderId, machineType, machineNumber });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to assign machine" });
    }
  }

  // ── Status update mode ────────────────────────────────────────────────────
  const VALID = [
    "in_wash", "drying", "folding", "bagged",
    "out_for_delivery", "completed", "cancelled", "awaiting_payment",
  ];
  if (!VALID.includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }

  try {
    const prev = await sql`SELECT status FROM laundry_orders WHERE id = ${orderId}`;
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

    // Hotel tier overage — store balance due
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
