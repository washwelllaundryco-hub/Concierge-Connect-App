// Stripe checkout.session.completed webhook
// - Marks payment_verified=true WITHOUT forcing status change (tech controls status)
// - If order is already 'ready', auto-dispatch Uber leg 2 (Washwell→hotel)
import { sql } from "@vercel/postgres";
import { notifyPaymentConfirmed } from "../../src/lib/notifications.js";
import { dispatchUber } from "../../src/lib/uber.js";
import { createHmac } from "crypto";

export const config = { api: { bodyParser: false } };

async function rawBody(req) {
  return new Promise((ok, fail) => {
    const c = [];
    req.on("data", d => c.push(d));
    req.on("end", () => ok(Buffer.concat(c)));
    req.on("error", fail);
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const sig    = req.headers["stripe-signature"] || "";
  const secret = process.env.STRIPE_WEBHOOK_SECRET || "";
  const body   = await rawBody(req);

  // Verify Stripe signature
  if (secret) {
    try {
      const p = sig.split(",").reduce((a, x) => { const [k, v] = x.split("="); a[k] = v; return a; }, {});
      const exp = createHmac("sha256", secret).update(p.t + "." + body).digest("hex");
      if (exp !== p.v1) return res.status(400).end();
    } catch { return res.status(400).end(); }
  }

  let event;
  try { event = JSON.parse(body.toString()); } catch { return res.status(400).end(); }

  if (event.type === "checkout.session.completed") {
    const s = event.data.object;
    const orderId = s.client_reference_id || s.metadata?.order_id;
    if (orderId) {
      try {
        // Ensure column exists
        await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ`;
        await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS uber_return_id TEXT`;

        // Fetch current order state + hotel address for potential Uber dispatch
        const prev = await sql`
          SELECT
            lo.id, lo.order_number, lo.status,
            lo.guest_first_name, lo.guest_last_name, lo.guest_phone,
            lo.guest_room_number, lo.total_amount, lo.uber_return_id,
            COALESCE(lo.guest_first_name, u.first_name, 'Guest') AS gn,
            COALESCE(lo.guest_room_number, hg.room_number) AS rn,
            h.name AS hn, h.address AS ha
          FROM laundry_orders lo
          LEFT JOIN hotel_guests hg ON lo.guest_id = hg.id
          LEFT JOIN users u ON hg.user_id = u.id
          LEFT JOIN hotels h ON lo.hotel_id = h.id
          WHERE lo.id = ${orderId}
        `;
        const o = prev.rows[0];
        if (!o) { console.error("stripe webhook: order not found", orderId); return res.json({ received: true }); }

        // Mark payment verified — do NOT touch status (tech owns that)
        await sql`
          UPDATE laundry_orders
          SET payment_verified = true, payment_confirmed_at = NOW(), updated_at = NOW()
          WHERE id = ${orderId}
        `;

        // Notify tech via SMS
        notifyPaymentConfirmed({
          orderNumber: o.order_number,
          guestName:   o.gn,
          roomNumber:  o.rn,
          hotelName:   o.hn,
          totalAmount: o.total_amount,
        }).catch(() => {});

        // If laundry is already ready AND Uber return not already dispatched → dispatch now
        if (o.status === "ready" && !o.uber_return_id && o.ha && process.env.UBER_CLIENT_ID) {
          try {
            const uberOrder = {
              id: o.id,
              order_number: o.order_number,
              guest_name: o.gn,
              phone: o.guest_phone,
              room: o.rn,
              hotel_name: o.hn,
              hotel_address: o.ha,
            };
            const uberRes = await dispatchUber(uberOrder, { direction: "return" });
            await sql`
              UPDATE laundry_orders
              SET uber_return_id = ${uberRes.id}, status = 'out_for_delivery', updated_at = NOW()
              WHERE id = ${orderId}
            `;
            console.log("Uber return auto-dispatched on payment:", uberRes.id);
          } catch (e) {
            console.error("Uber return dispatch failed in webhook:", e.message);
          }
        }
      } catch (e) {
        console.error("stripe webhook error:", e);
      }
    }
  }

  res.json({ received: true });
}
