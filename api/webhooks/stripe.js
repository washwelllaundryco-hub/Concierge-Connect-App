import Stripe from "stripe";
import { db } from "../_db.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const sig = req.headers["stripe-signature"];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const orderId = session.metadata?.order_id;

      if (orderId) {
        await db.query(
          `UPDATE laundry_orders
           SET status = 'paid_pending_technician',
               payment_verified    = true,
               stripe_payment_id   = $1,
               payment_confirmed_at = NOW()
           WHERE id = $2`,
          [session.id, orderId]
        );
        console.log(`✓ Payment auto-verified for order ${orderId}`);
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook handler error:", error);
    res.status(500).json({ error: "Webhook processing failed" });
  }
}
