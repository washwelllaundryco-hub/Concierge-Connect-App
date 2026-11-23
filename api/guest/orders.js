import { sql } from "@vercel/postgres";
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();
  let clerkUserId = null;
  try { clerkUserId = JSON.parse(Buffer.from((req.headers.authorization||"").replace("Bearer ","").split(".")[1]||"e30=","base64").toString()).sub; } catch {}
  if (!clerkUserId) return res.status(401).json({ error: "Authentication required" });
  try {
    await Promise.allSettled([sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS guest_room_number TEXT`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS total_amount NUMERIC(10,2)`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS balance_stripe_url TEXT`, sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS scheduled_pickup_at TIMESTAMPTZ`]);
    const r = await sql`SELECT lo.id, lo.order_number AS "orderNumber", lo.status, lo.tier, lo.total_amount AS "totalAmount", lo.balance_stripe_url AS "checkoutUrl", lo.scheduled_pickup_at AS "scheduledPickupAt", lo.created_at AS "createdAt", h.name AS "hotelName", COALESCE(lo.guest_room_number, hg.room_number,'') AS "roomNumber" FROM laundry_orders lo LEFT JOIN hotel_guests hg ON lo.guest_id=hg.id LEFT JOIN users u ON hg.user_id=u.id LEFT JOIN hotels h ON lo.hotel_id=h.id WHERE u.clerk_user_id=${clerkUserId} ORDER BY lo.created_at DESC LIMIT 20`;
    res.json({ orders: r.rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
