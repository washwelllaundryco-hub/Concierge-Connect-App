// GET /api/hotels/[hotelId]/orders
// Returns all active + recent orders for a hotel (used by ConciergePortal)
import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { hotelId } = req.query;
  if (!hotelId) return res.status(400).json({ error: "hotelId required" });

  try {
    const result = await sql`
      SELECT
        lo.id,
        lo.order_number  AS "orderNumber",
        lo.status,
        lo.tier,
        lo.total_amount  AS "totalAmount",
        lo.payment_method AS "paymentMethod",
        lo.payment_verified AS "paymentVerified",
        lo.special_instructions AS "specialInstructions",
        lo.washer_machine_number AS "washerNumber",
        lo.dryer_machine_number  AS "dryerNumber",
        lo.created_at    AS "createdAt",
        u.first_name     AS "guestFirstName",
        u.last_name      AS "guestLastName",
        hg.room_number   AS "roomNumber"
      FROM laundry_orders lo
      INNER JOIN hotel_guests hg ON lo.guest_id = hg.id
      INNER JOIN users u ON hg.user_id = u.id
      WHERE lo.hotel_id = (
        SELECT id FROM hotels WHERE slug = ${hotelId} LIMIT 1
      )
      AND lo.status != 'completed'
      ORDER BY lo.created_at DESC
      LIMIT 100
    `;
    res.json({ orders: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
}
