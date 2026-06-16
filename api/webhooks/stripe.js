// POST /api/webhooks/stripe
// Verifies Stripe signature and marks order as payment_verified when checkout completes.
import Stripe from "stripe";
import { sql } from "@vercel/postgres";
import { sendWhatsApp } from "../../src/lib/notifications.js";

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
  if (req.method !== "POST") return res.status(405).end();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers["stripe-signature"];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe signature verification failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const orderId = session.client_reference_id;

    if (!orderId) return res.status(200).json({ received: true });

    try {
      const paymentType = session.metadata?.type; // "residential_payment" | "balance_upgrade"

      if (paymentType === "balance_upgrade") {
        // Guest paid the tier-upgrade balance — clear it, keep order in current wash status
        await sql`
          UPDATE laundry_orders
          SET balance_due = 0,
              balance_stripe_url = NULL,
              updated_at = NOW()
          WHERE id = ${orderId}
        `;
        const balResult = await sql`
          SELECT lo.order_number, lo.correct_tier,
                 u.first_name || COALESCE(' ' || u.last_name, '') AS guest_name
          FROM laundry_orders lo
          LEFT JOIN hotel_guests hg ON lo.guest_id = hg.id
          LEFT JOIN users u ON hg.user_id = u.id
          WHERE lo.id = ${orderId}
        `;
        if (balResult.rows.length) {
          const o = balResult.rows[0];
          const msg = `Balance paid — ${o.order_number}\nGuest: ${o.guest_name}\nUpgrade: ${o.correct_tier || "confirmed"}\n\nProceed with delivery.`;
          await sendWhatsApp(`whatsapp:${process.env.WHATSAPP_TECHNICIAN}`, msg).catch(() => {});
          await sendWhatsApp(`whatsapp:${process.env.WHATSAPP_MANAGER}`, msg).catch(() => {});
        }
      } else {
        // Initial payment (residential or concierge Stripe) — mark ready for technician
        await sql`
          UPDATE laundry_orders
          SET status = 'paid_pending_technician',
              payment_verified = true,
              payment_confirmed_at = NOW(),
              updated_at = NOW()
          WHERE id = ${orderId}
        `;
        await sql`
          INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note, changed_at)
          VALUES (${orderId}, 'pending', 'paid_pending_technician', 'stripe_webhook', 'Payment confirmed by Stripe', NOW())
        `;
        const result = await sql`
          SELECT lo.order_number, lo.tier, hg.room_number,
                 u.first_name || COALESCE(' ' || u.last_name, '') AS guest_name,
                 h.name AS hotel_name
          FROM laundry_orders lo
          LEFT JOIN hotel_guests hg ON lo.guest_id = hg.id
          LEFT JOIN users u ON hg.user_id = u.id
          LEFT JOIN hotels h ON lo.hotel_id = h.id
          WHERE lo.id = ${orderId}
        `;
        if (result.rows.length) {
          const o = result.rows[0];
          const locationLine = o.hotel_name
            ? `Hotel: ${o.hotel_name}, Room ${o.room_number}`
            : `Residential pickup/delivery`;
          const serviceLine = o.tier ? `Service: ${o.tier}` : `Service: Residential`;
          const msg = `Stripe payment confirmed — ${o.order_number}\nGuest: ${o.guest_name}\n${locationLine}\n${serviceLine}\n\nOrder is ready to process.`;
          await sendWhatsApp(`whatsapp:${process.env.WHATSAPP_TECHNICIAN}`, msg).catch(() => {});
          await sendWhatsApp(`whatsapp:${process.env.WHATSAPP_MANAGER}`, msg).catch(() => {});
        }
      }
    } catch (err) {
      console.error("Webhook DB error:", err);
      return res.status(500).json({ error: "DB update failed" });
    }
  }

  res.status(200).json({ received: true });
}
