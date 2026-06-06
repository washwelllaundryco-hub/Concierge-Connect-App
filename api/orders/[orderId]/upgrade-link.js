// POST /api/orders/[orderId]/upgrade-link
// Creates (or retrieves) a Stripe Checkout Session for the balance due on a tier-upgraded order.
// Pass { action: 'mark_collected' } to clear the balance without a Stripe payment.
import Stripe from "stripe";
import { sql } from "@vercel/postgres";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { orderId } = req.query;
  const { action } = req.body ?? {};

  try {
    const result = await sql`
      SELECT
        lo.id,
        lo.order_number  AS "orderNumber",
        lo.balance_due   AS "balanceDue",
        lo.correct_tier  AS "correctTier",
        lo.balance_stripe_url AS "balanceStripeUrl",
        u.first_name || COALESCE(' ' || u.last_name, '') AS "guestName"
      FROM laundry_orders lo
      INNER JOIN hotel_guests hg ON lo.guest_id = hg.id
      INNER JOIN users u ON hg.user_id = u.id
      WHERE lo.id = ${orderId}
    `;

    if (!result.rows.length) return res.status(404).json({ error: "Order not found" });
    const order = result.rows[0];

    // Mark collected (cash or room charge) — zero out balance without Stripe
    if (action === "mark_collected") {
      await sql`
        UPDATE laundry_orders
        SET balance_due = 0, balance_stripe_url = NULL, updated_at = NOW()
        WHERE id = ${orderId}
      `;
      return res.json({ success: true, cleared: true });
    }

    const balance = parseFloat(order.balanceDue || 0);
    if (balance <= 0) return res.status(400).json({ error: "No balance due on this order" });

    // Return cached URL if already generated
    if (order.balanceStripeUrl) {
      return res.json({ url: order.balanceStripeUrl });
    }

    // Create a Stripe Checkout Session for the exact balance amount
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `Washwell Laundry — Tier Upgrade to ${order.correctTier}`,
              description: `Balance due for order ${order.orderNumber} (${order.guestName})`,
            },
            unit_amount: Math.round(balance * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `https://www.washwellconcierge.com?balance_paid=${orderId}`,
      cancel_url:  `https://www.washwellconcierge.com`,
      client_reference_id: orderId,
      metadata: { type: "balance_upgrade", orderId },
    });

    // Cache the URL so we don't create duplicate sessions
    await sql`
      UPDATE laundry_orders
      SET balance_stripe_url = ${session.url}, updated_at = NOW()
      WHERE id = ${orderId}
    `;

    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to generate upgrade link" });
  }
}
