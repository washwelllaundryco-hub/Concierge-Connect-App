// GET /api/orders/active
// Returns all orders currently being processed (used by TechnicianDashboard)
import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  try {
    // Auto-cancel pending_payment orders older than 30 minutes (abandoned checkouts)
    await sql`
      UPDATE laundry_orders
      SET status = 'cancelled', updated_at = NOW()
      WHERE status = 'pending_payment'
        AND payment_method != 'pay_after_weigh'
        AND created_at < NOW() - INTERVAL '30 minutes'
    `;

    const result = await sql`
      SELECT
        lo.id,
        lo.order_number           AS "orderNumber",
        lo.status,
        lo.tier,
        lo.payment_method         AS "paymentMethod",
        lo.total_weight_lbs       AS "totalWeightLbs",
        lo.washer_machine_number  AS "washerNumber",
        lo.dryer_machine_number   AS "dryerNumber",
        lo.payment_verified       AS "paymentVerified",
        lo.balance_stripe_url     AS "balanceStripeUrl",
        lo.special_instructions   AS "specialInstructions",
        lo.created_at             AS "createdAt",
        u.first_name || COALESCE(' ' || u.last_name, '') AS "guestName",
        hg.room_number            AS "roomNumber",
        hg.pickup_address         AS "pickupAddress",
        h.name                    AS "hotelName"
      FROM laundry_orders lo
      LEFT JOIN hotel_guests hg ON lo.guest_id = hg.id
      LEFT JOIN users u ON hg.user_id = u.id
      LEFT JOIN hotels h ON lo.hotel_id = h.id
      WHERE lo.status NOT IN ('completed', 'cancelled')
      ORDER BY lo.created_at ASC
    `;
    res.json({ orders: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch active orders" });
  }
}
