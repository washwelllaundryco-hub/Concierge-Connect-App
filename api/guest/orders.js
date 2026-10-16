import { sql } from "@vercel/postgres";
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: "userId required" });
  try {
    const orderResult = await sql`
      SELECT lo.id, lo.order_number AS "orderNumber", lo.status, lo.total_amount AS "totalAmount"
      FROM laundry_orders lo
      JOIN hotel_guests hg ON lo.guest_id = hg.id
      JOIN users u ON hg.user_id = u.id
      WHERE u.clerk_user_id = ${userId}
        AND lo.status NOT IN ('completed','cancelled','delivered')
      ORDER BY lo.created_at DESC LIMIT 1
    `;
    const sustainResult = await sql`
      SELECT COUNT(DISTINCT lo.id) AS "totalOrders",
             COALESCE(SUM(sm.water_saved_gallons),0) AS "waterSavedGallons",
             COALESCE(SUM(sm.energy_saved_kwh),0)    AS "energySavedKwh",
             COALESCE(SUM(sm.co2_lbs_avoided),0)     AS "co2AvoidedLbs"
      FROM laundry_orders lo
      JOIN hotel_guests hg ON lo.guest_id = hg.id
      JOIN users u ON hg.user_id = u.id
      LEFT JOIN sustainability_metrics sm ON lo.id = sm.order_id
      WHERE u.clerk_user_id = ${userId} AND lo.status = 'completed'
    `;
    const s = sustainResult.rows[0];
    res.json({
      activeOrder:    orderResult.rows[0] || null,
      sustainability: { totalOrders: parseInt(s.totalOrders), waterSavedGallons: parseFloat(s.waterSavedGallons).toFixed(1), energySavedKwh: parseFloat(s.energySavedKwh).toFixed(1), co2AvoidedLbs: parseFloat(s.co2AvoidedLbs).toFixed(1) },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch guest orders" });
  }
}
