import { sql } from "@vercel/postgres";
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  try {
    await Promise.allSettled([sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS guest_first_name TEXT`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS guest_last_name TEXT`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS guest_phone TEXT`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS guest_room_number TEXT`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS scheduled_pickup_at TIMESTAMPTZ`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS total_weight_lbs NUMERIC(10,2)`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2)`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10,2)`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS balance_stripe_url TEXT`]);
    const result = await sql`
      SELECT lo.id, lo.order_number AS "orderNumber", lo.status, lo.tier, lo.total_weight_lbs AS "totalWeightLbs", lo.total_amount AS "totalAmount", lo.delivery_fee AS "deliveryFee", lo.balance_stripe_url AS "checkoutUrl", lo.scheduled_pickup_at AS "scheduledPickupAt", lo.special_instructions AS "specialInstructions", lo.created_at AS "createdAt", h.name AS "hotelName",
             COALESCE(lo.guest_first_name, u.first_name, 'Guest') AS "guestFirstName", COALESCE(lo.guest_last_name, u.last_name, '') AS "guestLastName", COALESCE(lo.guest_phone, u.phone, '') AS "phone", COALESCE(lo.guest_room_number, hg.room_number, '') AS "roomNumber"
      FROM laundry_orders lo LEFT JOIN hotel_guests hg ON lo.guest_id = hg.id LEFT JOIN users u ON hg.user_id = u.id LEFT JOIN hotels h ON lo.hotel_id = h.id
      WHERE lo.status IN ('pending_pickup','awaiting_payment','in_wash','drying','folding','ready','out_for_delivery')
      ORDER BY CASE lo.status WHEN 'pending_pickup' THEN 1 WHEN 'awaiting_payment' THEN 2 WHEN 'in_wash' THEN 3 WHEN 'drying' THEN 4 WHEN 'folding' THEN 5 WHEN 'ready' THEN 6 WHEN 'out_for_delivery' THEN 7 END, lo.created_at ASC`;
    res.json({ orders: result.rows.map(o => ({ ...o, guestName: (o.guestFirstName + " " + o.guestLastName).trim() })) });
  } catch (err) { console.error(err); res.status(500).json({ error: err.message }); }
}
