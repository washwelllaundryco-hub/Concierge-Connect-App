import { sql } from "@vercel/postgres";
import { notifyDriverAssigned, notifyOrderCompleted } from "../../src/lib/notifications.js";
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  try {
    const ev=req.body, did=ev.delivery_id||ev.id;
    if (!did) return res.json({ received:true });
    const row=await sql`SELECT * FROM uber_deliveries WHERE uber_delivery_id=${did} LIMIT 1`;
    const del=row.rows[0]; if (!del) return res.json({ received:true });
    if (ev.kind==="delivery.status.changed"||ev.type==="delivery.status.changed") {
      const st=ev.status||ev.data?.status;
      await sql`UPDATE uber_deliveries SET status=${st},updated_at=NOW() WHERE uber_delivery_id=${did}`;
      if (st==="delivered") {
        const oR=await sql`SELECT lo.id,lo.order_number,lo.total_weight_lbs,COALESCE(lo.guest_first_name,u.first_name,'Guest') AS fn,COALESCE(lo.guest_last_name,u.last_name,'') AS ln FROM laundry_orders lo LEFT JOIN hotel_guests hg ON lo.guest_id=hg.id LEFT JOIN users u ON hg.user_id=u.id WHERE lo.id=${del.order_id}`;
        const o=oR.rows[0]; if(o) { await sql`UPDATE laundry_orders SET status='delivered',updated_at=NOW() WHERE id=${o.id}`; notifyOrderCompleted({orderNumber:o.order_number,guestName:o.fn+" "+o.ln,totalWeightLbs:o.total_weight_lbs},null).catch(()=>{}); }
      }
    }
    if (ev.kind==="delivery.courier.updated"||ev.type==="delivery.courier.updated") {
      const c=ev.courier||ev.data?.courier||{};
      await sql`UPDATE uber_deliveries SET courier_name=${c.name||null},courier_phone=${c.phone_number||null},updated_at=NOW() WHERE uber_delivery_id=${did}`;
      if (del.order_id&&c.name) { const oR=await sql`SELECT lo.order_number,COALESCE(lo.guest_first_name,u.first_name,'') AS fn,COALESCE(lo.guest_room_number,hg.room_number,'') AS rn FROM laundry_orders lo LEFT JOIN hotel_guests hg ON lo.guest_id=hg.id LEFT JOIN users u ON hg.user_id=u.id WHERE lo.id=${del.order_id}`; const o=oR.rows[0]; if(o) notifyDriverAssigned({orderNumber:o.order_number,guestName:o.fn,roomNumber:o.rn},c).catch(()=>{}); }
    }
    res.json({ received:true });
  } catch(err) { console.error(err); res.status(500).json({ error:err.message }); }
}
