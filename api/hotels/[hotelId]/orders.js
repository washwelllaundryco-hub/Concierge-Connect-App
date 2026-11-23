import { sql } from "@vercel/postgres";
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  const { hotelId } = req.query;
  if (!hotelId) return res.status(400).json({ error: "hotelId required" });
  try {
    await Promise.allSettled([sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS guest_first_name TEXT`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS guest_last_name TEXT`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS guest_phone TEXT`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS guest_email TEXT`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS guest_room_number TEXT`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS scheduled_pickup_at TIMESTAMPTZ`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS total_weight_lbs NUMERIC(10,2)`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2)`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2)`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS balance_stripe_url TEXT`]);
    const result = await sql`
      SELECT lo.id, lo.order_number AS "orderNumber", lo.status, lo.tier, lo.total_weight_lbs AS "totalWeightLbs", lo.total_amount AS "totalAmount", lo.delivery_fee AS "deliveryFee", lo.payment_method AS "paymentMethod", lo.payment_verified AS "paymentVerified", lo.balance_stripe_url AS "checkoutUrl", lo.scheduled_pickup_at AS "scheduledPickupAt", lo.special_instructions AS "specialInstructions", lo.created_at AS "createdAt",
             COALESCE(lo.guest_first_name, u.first_name, 'Guest') AS "guestFirstName", COALESCE(lo.guest_last_name, u.last_name, '') AS "guestLastName", COALESCE(lo.guest_phone, u.phone, '') AS "phone", COALESCE(lo.guest_email, u.email, '') AS "email", COALESCE(lo.guest_room_number, hg.room_number, '') AS "roomNumber"
      FROM laundry_orders lo LEFT JOIN hotel_guests hg ON lo.guest_id = hg.id LEFT JOIN users u ON hg.user_id = u.id
      WHERE lo.hotel_id = (SELECT id FROM hotels WHERE id::text = ${String(hotelId)} OR slug = ${String(hotelId)} LIMIT 1)
      AND lo.status NOT IN ('cancelled', 'delivered')
      ORDER BY lo.created_at DESC LIMIT 100`;
    res.json({ orders: result.rows.map(o => ({ ...o, guestName: (o.guestFirstName + " " + o.guestLastName).trim() })) });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
}
