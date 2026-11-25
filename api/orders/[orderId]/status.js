// PATCH /api/orders/:orderId/status
// - awaiting_payment + weight → create Stripe checkout, SMS customer
// - ready → check if payment_verified → dispatch Uber leg 2 immediately
import { sql } from "@vercel/postgres";
import { notifyCustomerPaymentRequest } from "../../../src/lib/notifications.js";
import { dispatchUber } from "../../../src/lib/uber.js";

const TIERS = [
  { maxLbs: 15,  name: "Essential Load", price: 68  },
  { maxLbs: 30,  name: "Standard Load",  price: 88  },
  { maxLbs: 50,  name: "Premium Load",   price: 128 },
  { maxLbs: 75,  name: "Executive Load", price: 188 },
  { maxLbs: 999, name: "Bulk Service",   price: 245 },
];
// Hotel tier prices INCLUDE delivery — no extra delivery fee
const DELIVERY_FEE = 0;
function getTier(lbs) { return TIERS.find(t => lbs <= t.maxLbs) || TIERS[TIERS.length - 1]; }

export default async function handler(req, res) {
  const { orderId } = req.query;
  if (!orderId) return res.status(400).json({ error: "orderId required" });

  if (req.method === "DELETE") {
    await sql`UPDATE laundry_orders SET status='cancelled', updated_at=NOW() WHERE id=${orderId}`;
    return res.json({ success: true });
  }
  if (req.method !== "PATCH") return res.status(405).end();

  const { status, weight } = req.body;
  if (!status) return res.status(400).json({ error: "status required" });

  try {
    // === WEIGH → send payment link ===
    if (status === "awaiting_payment" && weight) {
      const lbs   = parseFloat(weight);
      const tier  = getTier(lbs);
      const total = tier.price.toFixed(2);

      const prev = await sql`
        SELECT lo.order_number, lo.payment_method, lo.account_type, lo.company_name,
               lo.guest_phone, lo.custom_rate_standard, lo.custom_rate_heavy, lo.tier,
               COALESCE(lo.guest_first_name, u.first_name, 'Guest') AS fn,
               COALESCE(lo.guest_phone, u.phone) AS phone
        FROM laundry_orders lo
        LEFT JOIN hotel_guests hg ON lo.guest_id = hg.id
        LEFT JOIN users u ON hg.user_id = u.id
        WHERE lo.id = ${orderId}
      `;
      const o = prev.rows[0];
      if (!o) return res.status(404).json({ error: "Order not found" });

      // For business per-lb tiers, recalculate using custom rates if available
      // tier name: "Standard Items" uses standard rate, "Heavy Duty" uses heavy rate
      let effectiveTier = tier;
      if (o.account_type === "business") {
        const stdRate = parseFloat(o.custom_rate_standard) || 2.90;
        const hvyRate = parseFloat(o.custom_rate_heavy)    || 3.25;
        // Business pricing is strictly per-lb (no flat base)
        const rate = (o.tier || "").toLowerCase().includes("heavy") ? hvyRate : stdRate;
        const amount = (lbs * rate).toFixed(2);
        effectiveTier = { name: o.tier || "Standard Items", price: parseFloat(amount) };
      }

      // Invoice-method businesses: skip Stripe, just record amount owed
      if (o.payment_method === "invoice") {
        const finalTier  = typeof effectiveTier === "object" ? effectiveTier : getTier(lbs);
        const totalAmt   = finalTier.price.toFixed(2);
        await sql`
          UPDATE laundry_orders
          SET status = 'in_wash',
              total_weight_lbs = ${lbs},
              tier = ${finalTier.name},
              total_amount = ${parseFloat(totalAmt)},
              delivery_fee = ${DELIVERY_FEE},
              payment_verified = false,
              updated_at = NOW()
          WHERE id = ${orderId}
        `;
        // No customer SMS — this is a business invoice account
        return res.json({ success: true, tier: finalTier.name, total: totalAmt, paymentMethod: "invoice", message: "Invoice account — amount recorded, no payment link sent" });
      }

      // Stripe-pay flow (residential or stripe-method business)
      const resolvedTier = typeof effectiveTier === "object" ? effectiveTier : getTier(lbs);
      const total = resolvedTier.price.toFixed(2);

      let checkoutUrl = null;
      if (process.env.STRIPE_SECRET_KEY) {
        try {
          const r = await fetch("https://api.stripe.com/v1/checkout/sessions", {
            method: "POST",
            headers: {
              "Authorization": "Basic " + Buffer.from(process.env.STRIPE_SECRET_KEY + ":").toString("base64"),
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              "payment_method_types[0]": "card",
              "mode": "payment",
              "client_reference_id": String(orderId),
              "line_items[0][price_data][currency]": "cad",
              "line_items[0][price_data][unit_amount]": String(Math.round(parseFloat(total) * 100)),
              "line_items[0][price_data][product_data][name]": resolvedTier.name + " — Washwell",
              "line_items[0][quantity]": "1",
              "success_url": (process.env.VITE_APP_URL || "https://washwell.vercel.app") + "/track/" + orderId + "?payment=success",
              "cancel_url":  (process.env.VITE_APP_URL || "https://washwell.vercel.app") + "/track/" + orderId,
            }).toString(),
          });
          const s = await r.json();
          if (r.ok) checkoutUrl = s.url;
        } catch (e) { console.error("Stripe:", e.message); }
      }

      await sql`
        UPDATE laundry_orders
        SET status = 'awaiting_payment',
            total_weight_lbs = ${lbs},
            tier = ${resolvedTier.name},
            total_amount = ${parseFloat(total)},
            delivery_fee = ${DELIVERY_FEE},
            balance_stripe_url = ${checkoutUrl},
            updated_at = NOW()
        WHERE id = ${orderId}
      `;

      // Await SMS — 8s abort timeout in sendSMS keeps this under Vercel's 10s limit
      if (o.phone && checkoutUrl) {
        await notifyCustomerPaymentRequest(o.phone, o.fn, {
          orderNumber: o.order_number,
          weightLbs: lbs,
          tier: resolvedTier.name,
          total,
          deliveryFee: DELIVERY_FEE,
          checkoutUrl,
        }).catch(e => console.error("payment SMS failed:", e.message));
      }

      return res.json({ success: true, tier: resolvedTier.name, total, checkoutUrl });
    }

    // === MARK READY → dispatch Uber return if payment already in ===
    if (status === "ready") {
      await sql`UPDATE laundry_orders SET status='ready', updated_at=NOW() WHERE id=${orderId}`;

      // Check if payment verified and hotel has an address
      const check = await sql`
        SELECT lo.id, lo.order_number, lo.payment_verified, lo.uber_return_id,
               lo.guest_first_name, lo.guest_last_name, lo.guest_phone, lo.guest_room_number,
               h.name AS hn, h.address AS ha
        FROM laundry_orders lo
        LEFT JOIN hotels h ON lo.hotel_id = h.id
        WHERE lo.id = ${orderId}
      `;
      const o = check.rows[0];

      if (o?.payment_verified && !o.uber_return_id && o.ha && process.env.UBER_CLIENT_ID) {
        try {
          const uberOrder = {
            id: o.id,
            order_number: o.order_number,
            guest_name: ((o.guest_first_name || "") + " " + (o.guest_last_name || "")).trim(),
            phone: o.guest_phone,
            room: o.guest_room_number,
            hotel_name: o.hn,
            hotel_address: o.ha,
          };
          const uberRes = await dispatchUber(uberOrder, { direction: "return" });
          await sql`
            UPDATE laundry_orders
            SET uber_return_id = ${uberRes.id}, status = 'out_for_delivery', updated_at = NOW()
            WHERE id = ${orderId}
          `;
          console.log("Uber return dispatched on ready:", uberRes.id);
          return res.json({ success: true, status: "out_for_delivery", uberDispatched: true });
        } catch (e) {
          console.error("Uber return dispatch failed:", e.message);
          // Non-fatal — order stays 'ready', tech can dispatch manually
        }
      }

      return res.json({ success: true, status: "ready" });
    }

    // === All other status updates ===
    await sql`UPDATE laundry_orders SET status=${status}, updated_at=NOW() WHERE id=${orderId}`;
    res.json({ success: true, status });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
