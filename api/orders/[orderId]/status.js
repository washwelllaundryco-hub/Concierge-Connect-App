import { sql } from "@vercel/postgres";
import { notifyCustomerPaymentRequest } from "../../../src/lib/notifications.js";
const TIERS = [{ maxLbs:15, name:"Essential Load", price:68 }, { maxLbs:30, name:"Standard Load", price:88 }, { maxLbs:50, name:"Premium Load", price:128 }, { maxLbs:75, name:"Executive Load", price:188 }, { maxLbs:999, name:"Bulk Service", price:245 }];
const DELIVERY_FEE = 20;
function getTier(lbs) { return TIERS.find(t => lbs <= t.maxLbs) || TIERS[TIERS.length-1]; }
export default async function handler(req, res) {
  const { orderId } = req.query;
  if (!orderId) return res.status(400).json({ error: "orderId required" });
  if (req.method === "DELETE") { await sql`UPDATE laundry_orders SET status='cancelled', updated_at=NOW() WHERE id=${orderId}`; return res.json({ success:true }); }
  if (req.method !== "PATCH") return res.status(405).end();
  const { status, weight } = req.body;
  if (!status) return res.status(400).json({ error: "status required" });
  try {
    if (status === "awaiting_payment" && weight) {
      const lbs = parseFloat(weight);
      const tier = getTier(lbs);
      const total = (tier.price + DELIVERY_FEE).toFixed(2);
      const prev = await sql`SELECT lo.order_number, COALESCE(lo.guest_first_name, u.first_name,'Guest') AS fn, COALESCE(lo.guest_phone, u.phone) AS phone FROM laundry_orders lo LEFT JOIN hotel_guests hg ON lo.guest_id=hg.id LEFT JOIN users u ON hg.user_id=u.id WHERE lo.id=${orderId}`;
      const o = prev.rows[0];
      if (!o) return res.status(404).json({ error: "Order not found" });
      let checkoutUrl = null;
      if (process.env.STRIPE_SECRET_KEY) {
        try {
          const r = await fetch("https://api.stripe.com/v1/checkout/sessions", { method:"POST", headers:{ "Authorization":"Basic "+Buffer.from(process.env.STRIPE_SECRET_KEY+":").toString("base64"), "Content-Type":"application/x-www-form-urlencoded" }, body: new URLSearchParams({ "payment_method_types[0]":"card", "mode":"payment", "client_reference_id":String(orderId), "line_items[0][price_data][currency]":"cad", "line_items[0][price_data][unit_amount]":String(Math.round(parseFloat(total)*100)), "line_items[0][price_data][product_data][name]":tier.name+" — Washwell", "line_items[0][quantity]":"1", "success_url":(process.env.VITE_APP_URL||"https://washwell.vercel.app")+"/track/"+orderId+"?payment=success", "cancel_url":(process.env.VITE_APP_URL||"https://washwell.vercel.app")+"/track/"+orderId }).toString() });
          const s = await r.json(); if (r.ok) checkoutUrl = s.url;
        } catch(e) { console.error("Stripe:", e.message); }
      }
      await sql`UPDATE laundry_orders SET status='awaiting_payment', total_weight_lbs=${lbs}, tier=${tier.name}, total_amount=${parseFloat(total)}, delivery_fee=${DELIVERY_FEE}, balance_stripe_url=${checkoutUrl}, updated_at=NOW() WHERE id=${orderId}`;
      if (o.phone && checkoutUrl) await notifyCustomerPaymentRequest(o.phone, o.fn, { orderNumber:o.order_number, weightLbs:lbs, tier:tier.name, total, deliveryFee:DELIVERY_FEE, checkoutUrl }).catch(() => {});
      return res.json({ success:true, tier:tier.name, total, checkoutUrl });
    }
    await sql`UPDATE laundry_orders SET status=${status}, updated_at=NOW() WHERE id=${orderId}`;
    res.json({ success:true, status });
  } catch(err) { console.error(err); res.status(500).json({ error:err.message }); }
}
