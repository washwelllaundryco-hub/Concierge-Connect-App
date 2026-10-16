import { sql } from "@vercel/postgres";
export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  if (req.query.all === "1" || req.query.all === "true") {
    try {
      const result = await sql`
        SELECT lo.id, lo.order_number AS "orderNumber", lo.status, lo.tier,
               lo.service_type AS "serviceType", lo.payment_method AS "paymentMethod",
               lo.total_amount AS "totalAmount", lo.total_weight_lbs AS "totalWeightLbs",
               lo.payment_verified AS "paymentVerified", lo.created_at AS "createdAt",
               h.name AS "hotelName",
               COALESCE(u.first_name||' '||u.last_name, ru.first_name||' '||ru.last_name) AS "guestName",
               hg.room_number AS "roomNumber"
        FROM laundry_orders lo
        LEFT JOIN hotel_guests hg ON lo.guest_id = hg.id
        LEFT JOIN users u         ON hg.user_id = u.id
        LEFT JOIN users ru        ON lo.placed_by_user_id = ru.id
        LEFT JOIN hotels h        ON lo.hotel_id = h.id
        WHERE lo.status != 'cancelled'
        ORDER BY lo.created_at DESC LIMIT 1000`;
      return res.json({ orders: result.rows });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to fetch history" });
    }
  }

  try {
    const result = await sql`
      SELECT
        lo.id,
        lo.order_number          AS "orderNumber",
        lo.status,
        lo.tier,
        lo.service_type          AS "serviceType",
        lo.payment_method        AS "paymentMethod",
        lo.total_weight_lbs      AS "totalWeightLbs",
        lo.total_amount          AS "totalAmount",
        lo.washer_machine_number AS "washerNumber",
        lo.dryer_machine_number  AS "dryerNumber",
        lo.payment_verified      AS "paymentVerified",
        lo.special_instructions  AS "specialInstructions",
        lo.balance_stripe_url    AS "paymentUrl",
        lo.correct_tier          AS "correctTier",
        lo.created_at            AS "createdAt",
        lo.guest_email           AS "guestEmail",
        COALESCE(u.first_name||' '||u.last_name, ru.first_name||' '||ru.last_name, 'Guest') AS "guestName",
        hg.room_number           AS "roomNumber",
        h.name                   AS "hotelName"
      FROM laundry_orders lo
      LEFT JOIN hotel_guests hg ON lo.guest_id = hg.id
      LEFT JOIN users u         ON hg.user_id = u.id
      LEFT JOIN users ru        ON lo.placed_by_user_id = ru.id
      LEFT JOIN hotels h        ON lo.hotel_id = h.id
      WHERE lo.status NOT IN ('completed','cancelled','delivered')
      ORDER BY lo.created_at ASC`;
    res.json({ orders: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch active orders" });
  }
}
