// GET /api/orders/active
// Returns all orders currently being processed (used by TechnicianDashboard)
import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    const result = await sql`
      SELECT
        lo.id,
        lo.order_number       AS "orderNumber",
        lo.status,
        lo.tier,
        lo.total_weight_lbs   AS "totalWeightLbs",
        lo.washer_machine_number AS "washerNumber",
        lo.dryer_machine_number  AS "dryerNumber",
        lo.payment_verified   AS "paymentVerified",
        lo.special_instructions AS "specialInstructions",
        lo.created_at         AS "createdAt",
        u.first_name || ' ' || u.last_name AS "guestName",
        hg.room_number        AS "roomNumber",
        h.name                AS "hotelName"
      FROM laundry_orders lo
      INNER JOIN hotel_guests hg ON lo.guest_id = hg.id
      INNER JOIN users u ON hg.user_id = u.id
      INNER JOIN hotels h ON lo.hotel_id = h.id
      WHERE lo.status NOT IN ('completed', 'cancelled')
      ORDER BY lo.created_at ASC
    `;
    res.json({ orders: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch active orders" });
  }
}
