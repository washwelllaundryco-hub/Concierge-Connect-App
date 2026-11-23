import { sql } from "@vercel/postgres";
const W=2.1, E=0.09, C=0.386;
export default async function handler(req, res) {
  try {
    await Promise.allSettled([sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS total_weight_lbs NUMERIC(10,2)`, sql`CREATE TABLE IF NOT EXISTS sustainability_metrics (id SERIAL PRIMARY KEY, order_id INTEGER REFERENCES laundry_orders(id), water_saved_gallons NUMERIC, energy_saved_kwh NUMERIC, co2_saved_lbs NUMERIC, calculated_at TIMESTAMPTZ DEFAULT NOW())`]);
    if (req.method==="GET") {
      const r=await sql`SELECT COALESCE(SUM(lo.total_weight_lbs),0) AS total_lbs, COALESCE(SUM(lo.total_weight_lbs*${W}),0) AS water_saved_gallons, COALESCE(SUM(lo.total_weight_lbs*${E}),0) AS energy_saved_kwh, COALESCE(SUM(lo.total_weight_lbs*${E}*${C}),0) AS co2_saved_lbs, COUNT(*) AS total_orders FROM laundry_orders WHERE status='delivered' AND total_weight_lbs IS NOT NULL`;
      return res.json(r.rows[0]);
    }
    if (req.method==="POST") {
      const orders=await sql`SELECT id,total_weight_lbs FROM laundry_orders WHERE status='delivered' AND total_weight_lbs IS NOT NULL`;
      for (const o of orders.rows) await sql`INSERT INTO sustainability_metrics (order_id,water_saved_gallons,energy_saved_kwh,co2_saved_lbs) VALUES (${o.id},${o.total_weight_lbs*W},${o.total_weight_lbs*E},${o.total_weight_lbs*E*C}) ON CONFLICT DO NOTHING`;
      return res.json({ success:true, processed:orders.rows.length });
    }
    res.status(405).end();
  } catch(err) { res.status(500).json({ error:err.message }); }
}
