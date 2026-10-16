// ONE-TIME: visit https://www.washwellconcierge.com/api/migrate to add new columns
// Delete this file after running once.
import { sql } from "@vercel/postgres";
export default async function handler(req, res) {
  try {
    await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS tier VARCHAR(100)`;
    await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS service_type VARCHAR(100)`;
    await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS guest_email VARCHAR(255)`;
    await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS total_weight_lbs DECIMAL(6,2)`;
    await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS total_amount DECIMAL(10,2)`;
    await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS correct_tier VARCHAR(100)`;
    await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS balance_stripe_url TEXT`;
    await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS washer_machine_number INTEGER`;
    await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS dryer_machine_number INTEGER`;
    await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS stripe_payment_id VARCHAR(255)`;
    await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMP`;
    await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS in_wash_at TIMESTAMP`;
    await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS drying_at TIMESTAMP`;
    await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS folding_at TIMESTAMP`;
    await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS out_for_delivery_at TIMESTAMP`;
    await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP`;
    await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP`;
    await sql`CREATE TABLE IF NOT EXISTS sustainability_metrics (
      id SERIAL PRIMARY KEY,
      order_id INTEGER UNIQUE REFERENCES laundry_orders(id),
      water_saved_gallons DECIMAL(10,2),
      water_saved_per_lb DECIMAL(6,3),
      energy_saved_kwh DECIMAL(10,3),
      co2_lbs_avoided DECIMAL(10,3),
      calculated_at TIMESTAMP DEFAULT NOW()
    )`;
    await sql`CREATE TABLE IF NOT EXISTS order_status_history (
      id SERIAL PRIMARY KEY,
      order_id INTEGER REFERENCES laundry_orders(id),
      from_status VARCHAR(50),
      to_status VARCHAR(50),
      changed_by VARCHAR(255),
      changed_at TIMESTAMP DEFAULT NOW()
    )`;
    res.json({ success: true, message: "Migration complete. You can now delete api/migrate.js" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
