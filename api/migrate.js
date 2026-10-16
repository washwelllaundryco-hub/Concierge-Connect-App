// ONE-TIME: visit https://www.washwellconcierge.com/api/migrate
// Delete this file after running once.
import { sql } from "@vercel/postgres";
export default async function handler(req, res) {
  const results = [];
  const run = async (label, query) => {
    try { await query(); results.push({ ok: label }); }
    catch (e) { results.push({ skip: label, reason: e.message }); }
  };

  await run("tier",                  () => sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS tier VARCHAR(100)`);
  await run("service_type",          () => sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS service_type VARCHAR(100)`);
  await run("guest_email",           () => sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS guest_email VARCHAR(255)`);
  await run("total_weight_lbs",      () => sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS total_weight_lbs DECIMAL(6,2)`);
  await run("total_amount",          () => sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2)`);
  await run("correct_tier",          () => sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS correct_tier VARCHAR(100)`);
  await run("balance_stripe_url",    () => sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS balance_stripe_url TEXT`);
  await run("washer_machine_number", () => sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS washer_machine_number INTEGER`);
  await run("dryer_machine_number",  () => sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS dryer_machine_number INTEGER`);
  await run("stripe_payment_id",     () => sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS stripe_payment_id VARCHAR(255)`);
  await run("payment_confirmed_at",  () => sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMP`);
  await run("in_wash_at",            () => sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS in_wash_at TIMESTAMP`);
  await run("drying_at",             () => sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS drying_at TIMESTAMP`);
  await run("folding_at",            () => sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS folding_at TIMESTAMP`);
  await run("out_for_delivery_at",   () => sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS out_for_delivery_at TIMESTAMP`);
  await run("completed_at",          () => sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`);
  await run("cancelled_at",          () => sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP`);

  // No foreign keys — avoids constraint issues
  await run("sustainability_metrics table", () => sql`
    CREATE TABLE IF NOT EXISTS sustainability_metrics (
      id SERIAL PRIMARY KEY,
      order_id INTEGER UNIQUE,
      water_saved_gallons DECIMAL(10,2),
      water_saved_per_lb DECIMAL(6,3),
      energy_saved_kwh DECIMAL(10,3),
      co2_lbs_avoided DECIMAL(10,3),
      calculated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  await run("order_status_history table", () => sql`
    CREATE TABLE IF NOT EXISTS order_status_history (
      id SERIAL PRIMARY KEY,
      order_id INTEGER,
      from_status VARCHAR(50),
      to_status VARCHAR(50),
      changed_by VARCHAR(255),
      changed_at TIMESTAMP DEFAULT NOW()
    )
  `);

  res.json({ done: true, results });
}
