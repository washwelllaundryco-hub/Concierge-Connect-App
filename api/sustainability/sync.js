// POST /api/sustainability/sync
// Called when technician marks order as completed.
// Recalculates cumulative sustainability totals and broadcasts to guest via WebSocket.
import { sql } from "@vercel/postgres";
import { notifyOrderCompleted } from "../../src/lib/notifications.js";
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { orderId } = req.body;
  try {
    const orderResult = await sql`
      SELECT lo.guest_id, lo.order_number, lo.total_weight_lbs,
             u.first_name, u.last_name
      FROM laundry_orders lo
      INNER JOIN hotel_guests hg ON lo.guest_id = hg.id
      INNER JOIN users u ON hg.user_id = u.id
      WHERE lo.id = ${orderId}
    `;
    const order = orderResult.rows[0];
    if (!order) return res.status(404).json({ error: "Order not found" });
    const totals = await sql`
      SELECT
        COUNT(DISTINCT lo.id)             AS total_orders,
        COALESCE(SUM(sm.water_saved_gallons), 0) AS water_saved,
        COALESCE(SUM(sm.energy_saved_kwh), 0)    AS energy_saved,
        COALESCE(SUM(sm.co2_lbs_avoided), 0)     AS co2_avoided
      FROM laundry_orders lo
      LEFT JOIN sustainability_metrics sm ON lo.id = sm.order_id
      WHERE lo.guest_id = ${order.guest_id} AND lo.status = 'completed'
    `;
    const t = totals.rows[0];
    const updated = {
      totalOrders:       parseInt(t.total_orders),
      waterSavedGallons: parseFloat(t.water_saved).toFixed(1),
      energySavedKwh:    parseFloat(t.energy_saved).toFixed(1),
      co2AvoidedLbs:     parseFloat(t.co2_avoided).toFixed(1),
    };
    await sql`
      UPDATE hotel_guests SET
        total_sustainability_orders = ${updated.totalOrders},
        total_water_saved   = ${updated.waterSavedGallons},
        total_energy_saved  = ${updated.energySavedKwh},
        total_co2_avoided   = ${updated.co2AvoidedLbs},
        updated_at = NOW()
      WHERE id = ${order.guest_id}
    `;
    const w = parseFloat(order.total_weight_lbs) || 10;
    await notifyOrderCompleted(
      { orderNumber: order.order_number, guestName: `${order.first_name} ${order.last_name}`, totalWeightLbs: w },
      { water_saved_gallons: (w * 2.1).toFixed(1), energy_saved_kwh: (w * 0.09).toFixed(2) }
    );
    res.json({ success: true, sustainability: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Sustainability sync failed" });
  }
}
