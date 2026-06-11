// GET /api/guest/orders?clerkUserId=xxx
// Returns the guest's current and recent orders
import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).end();

  const { clerkUserId } = req.query;
  if (!clerkUserId) return res.status(400).json({ error: "clerkUserId required" });

  try {
    const result = await sql`
      SELECT
        lo.id,
        lo.order_number  AS "orderNumber",
        lo.status,
        lo.tier,
        lo.total_amount  AS "totalAmount",
        lo.payment_verified AS "paymentVerified",
        lo.balance_stripe_url AS "paymentLinkUrl",
        lo.created_at    AS "createdAt",
        lo.updated_at    AS "updatedAt"
      FROM laundry_orders lo
      INNER JOIN hotel_guests hg ON lo.guest_id = hg.id
      INNER JOIN users u ON hg.user_id = u.id
      WHERE u.clerk_user_id = ${clerkUserId}
      ORDER BY lo.created_at DESC
      LIMIT 20
    `;
    res.json({ orders: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch guest orders" });
  }
}
