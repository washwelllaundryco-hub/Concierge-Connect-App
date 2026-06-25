// GET /api/hotels/[hotelId]/orders
// Returns all active + recent orders for a hotel (used by ConciergePortal)
import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { hotelId } = req.query;
  if (!hotelId) return res.status(400).json({ error: "hotelId required" });

  try {
    // Admin: return all hotels with full order history
    if (hotelId === "_admin") {
      const rows = await sql`
        SELECT
          h.id          AS hotel_id,
          h.name        AS hotel_name,
          h.slug,
          lo.id         AS order_id,
          lo.order_number AS "orderNumber",
          lo.status,
          lo.tier,
          lo.payment_method  AS "paymentMethod",
          lo.total_amount    AS "totalAmount",
          lo.balance_due     AS "balanceDue",
          lo.total_weight_lbs AS "totalWeightLbs",
          lo.created_at      AS "createdAt",
          hg.room_number     AS "roomNumber",
          u.first_name       AS "guestFirstName",
          u.last_name        AS "guestLastName"
        FROM hotels h
        LEFT JOIN laundry_orders lo
          ON lo.hotel_id = h.id AND lo.status != 'cancelled'
        LEFT JOIN hotel_guests hg ON lo.guest_id = hg.id
        LEFT JOIN users u ON hg.user_id = u.id
        ORDER BY h.name, lo.created_at DESC
      `;
      const hotelsMap = {};
      rows.rows.forEach(row => {
        if (!hotelsMap[row.hotel_id]) {
          hotelsMap[row.hotel_id] = { id: row.hotel_id, name: row.hotel_name, slug: row.slug, orders: [] };
        }
        if (row.order_id) {
          hotelsMap[row.hotel_id].orders.push({
            id: row.order_id,
            orderNumber: row.orderNumber,
            status: row.status,
            tier: row.tier,
            paymentMethod: row.paymentMethod,
            totalAmount: row.totalAmount,
            balanceDue: row.balanceDue,
            totalWeightLbs: row.totalWeightLbs,
            createdAt: row.createdAt,
            roomNumber: row.roomNumber,
            guestName: `${row.guestFirstName || ""} ${row.guestLastName || ""}`.trim() || "Guest",
          });
        }
      });
      return res.json({ hotels: Object.values(hotelsMap) });
    }

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
        lo.balance_due   AS "balanceDue",
        lo.correct_tier  AS "correctTier",
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
      AND lo.status != 'cancelled'
      ORDER BY lo.created_at DESC
      LIMIT 100
    `;
    res.json({ orders: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
}
