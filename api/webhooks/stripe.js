import { sql } from "@vercel/postgres";
import { notifyPaymentConfirmed } from "../../src/lib/notifications.js";
import { createHmac } from "crypto";
export const config = { api: { bodyParser: false } };
async function rawBody(req) { return new Promise((ok,fail) => { const c=[]; req.on("data",d=>c.push(d)); req.on("end",()=>ok(Buffer.concat(c))); req.on("error",fail); }); }
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const sig=req.headers["stripe-signature"]||"", secret=process.env.STRIPE_WEBHOOK_SECRET||"";
  const body = await rawBody(req);
  if (secret) { try { const p=sig.split(",").reduce((a,x)=>{ const [k,v]=x.split("="); a[k]=v; return a; },{}); const exp=createHmac("sha256",secret).update(p.t+"."+body).digest("hex"); if (exp!==p.v1) return res.status(400).end(); } catch { return res.status(400).end(); } }
  let event; try { event=JSON.parse(body.toString()); } catch { return res.status(400).end(); }
  if (event.type==="checkout.session.completed") {
    const s=event.data.object, orderId=s.client_reference_id||s.metadata?.order_id;
    if (orderId) {
      try {
        await sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ`;
        const prev=await sql`SELECT lo.order_number,lo.total_amount,COALESCE(lo.guest_first_name,u.first_name,'Guest') AS gn,COALESCE(lo.guest_room_number,hg.room_number) AS rn,h.name AS hn FROM laundry_orders lo LEFT JOIN hotel_guests hg ON lo.guest_id=hg.id LEFT JOIN users u ON hg.user_id=u.id LEFT JOIN hotels h ON lo.hotel_id=h.id WHERE lo.id=${orderId}`;
        await sql`UPDATE laundry_orders SET status='in_wash',payment_verified=true,payment_confirmed_at=NOW(),updated_at=NOW() WHERE id=${orderId}`;
        const o=prev.rows[0]; if(o) notifyPaymentConfirmed({orderNumber:o.order_number,guestName:o.gn,roomNumber:o.rn,hotelName:o.hn,totalAmount:o.total_amount}).catch(()=>{});
      } catch(e) { console.error("stripe webhook:",e); }
    }
  }
  res.json({ received: true });
}
