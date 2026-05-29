// PATCH /api/orders/machine
// Called when technician assigns a washer or dryer number to an order.
// Body: { orderId, machineType: "washer" | "dryer", machineNumber: number }
import { sql } from "@vercel/postgres";
export default async function handler(req, res) {
  if (req.method !== "PATCH") return res.status(405).end();
  const { orderId, machineType, machineNumber } = req.body;
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
    res.json({ success: true, orderId, machineType, machineNumber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to assign machine" });
  }
}
