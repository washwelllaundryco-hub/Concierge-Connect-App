import Stripe from "stripe";
import { db } from "../_db.js";
import { notifyPaymentConfirmed } from "../../src/lib/notifications.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
export const config = { api: { bodyParser: false } };

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end",  () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const sig     = req.headers["stripe-signature"];
  const rawBody = await getRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Stripe signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const orderId = session.metadata?.order_id;

      if (!orderId) {
        console.log("Stripe webhook: no order_id in metadata — skipping");
        return res.json({ received: true });
      }

      // Move order to paid_pending_technician (ready to wash)
      const { rows } = await db.query(
        `UPDATE laundry_orders
         SET status               = 'paid_pending_technician',
             payment_verified     = true,
             stripe_payment_id    = $1,
             payment_confirmed_at = NOW(),
             balance_stripe_url   = NULL,
             updated_at           = NOW()
         WHERE id = $2
         RETURNING order_number AS "orderNumber", total_amount AS "totalAmount",
                   (SELECT COALESCE(u.first_name||' '||u.last_name, ru.first_name||' '||ru.last_name, 'Guest')
                    FROM laundry_orders lo2
                    LEFT JOIN hotel_guests hg ON lo2.guest_id = hg.id
                    LEFT JOIN users u ON hg.user_id = u.id
                    LEFT JOIN users ru ON lo2.placed_by_user_id = ru.id
                    WHERE lo2.id = $2) AS "guestName",
                   (SELECT hg2.room_number FROM laundry_orders lo3
                    JOIN hotel_guests hg2 ON lo3.guest_id = hg2.id WHERE lo3.id = $2) AS "roomNumber",
                   (SELECT h.name FROM laundry_orders lo4
                    JOIN hotels h ON lo4.hotel_id = h.id WHERE lo4.id = $2) AS "hotelName"`,
        [session.id, orderId]
      );

      if (rows.length) {
        const o = rows[0];
        notifyPaymentConfirmed({
          orderNumber: o.orderNumber,
          guestName:   o.guestName,
          roomNumber:  o.roomNumber,
          hotelName:   o.hotelName,
          totalAmount: parseFloat(o.totalAmount || 0).toFixed(2),
        }).catch(e => console.error("notifyPaymentConfirmed:", e));
        console.log(`✓ Payment confirmed — Order ${o.orderNumber} ready to wash`);
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error("Stripe webhook handler error:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
}
