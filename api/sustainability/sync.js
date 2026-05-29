import { db } from "../_db.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { orderId } = req.body;

  try {
    const orderResult = await db.query(
      "SELECT guest_id FROM laundry_orders WHERE id = $1",
      [orderId]
    );
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    const { guest_id: guestId } = orderResult.rows[0];

    const { rows } = await db.query(
      `SELECT
         COUNT(DISTINCT lo.id)                        AS total_orders,
         COALESCE(SUM(sm.water_saved_gallons), 0)     AS water_saved_gallons,
         COALESCE(SUM(sm.energy_saved_kwh),    0)     AS energy_saved_kwh,
         COALESCE(SUM(sm.co2_lbs_avoided),     0)     AS co2_avoided_lbs
       FROM laundry_orders lo
       LEFT JOIN sustainability_metrics sm ON lo.id = sm.order_id
       WHERE lo.guest_id = $1 AND lo.status = 'completed'`,
      [guestId]
    );

    const updatedData = {
      totalOrders:       parseInt(rows[0].total_orders),
      waterSavedGallons: parseFloat(rows[0].water_saved_gallons).toFixed(1),
      energySavedKwh:    parseFloat(rows[0].energy_saved_kwh).toFixed(1),
      co2AvoidedLbs:     parseFloat(rows[0].co2_avoided_lbs).toFixed(1),
    };

    await db.query(
      `UPDATE hotel_guests
       SET total_sustainability_orders = $1,
           total_water_saved           = $2,
           total_energy_saved          = $3,
           total_co2_avoided           = $4,
           updated_at                  = NOW()
       WHERE id = $5`,
      [updatedData.totalOrders, updatedData.waterSavedGallons, updatedData.energySavedKwh, updatedData.co2AvoidedLbs, guestId]
    );

    res.json({ success: true, sustainability: updatedData });
  } catch (error) {
    console.error("Sustainability sync error:", error);
    res.status(500).json({ error: "Failed to sync sustainability metrics" });
  }
}
