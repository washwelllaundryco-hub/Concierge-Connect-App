// POST /api/webhooks/burq
// Receives all Burq delivery events and updates order status + notifies team via WhatsApp.
import crypto from "crypto";
import { sql } from "@vercel/postgres";
import { notifyDriverAssigned } from "../../src/lib/notifications.js";
function verify(payload, sig) {
  const expected = crypto.createHmac("sha256", process.env.BURQ_WEBHOOK_SECRET)
    .update(JSON.stringify(payload)).digest("hex");
  try { return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)); }
  catch { return false; }
}
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const sig = req.headers["x-burq-signature"];
  if (!sig || !verify(req.body, sig)) return res.status(401).json({ error: "Invalid signature" });
  const { event_type, data } = req.body;
  try {
    const delivery = await sql`SELECT order_id FROM burq_deliveries WHERE burq_job_id = ${data.delivery_id}`;
    const orderId = delivery.rows[0]?.order_id;
    if (event_type === "delivery.driver_assigned") {
      await sql`UPDATE burq_deliveries SET burq_status='assigned', driver_name=${data.driver.name}, driver_phone=${data.driver.phone}, driver_vehicle=${JSON.stringify(data.driver.vehicle)} WHERE burq_job_id=${data.delivery_id}`;
      if (orderId) {
        await sql`UPDATE laundry_orders SET status='out_for_delivery', out_for_delivery_at=NOW() WHERE id=${orderId}`;
        const order = await sql`SELECT order_number, guest_id FROM laundry_orders WHERE id=${orderId}`;
        await notifyDriverAssigned({ orderNumber: order.rows[0].order_number }, data.driver);
      }
    }
    if (event_type === "delivery.location_update") {
      await sql`UPDATE burq_deliveries SET driver_current_lat=${data.driver_location.lat}, driver_current_lng=${data.driver_location.lng}, driver_bearing=${data.driver_location.bearing}, driver_location_updated_at=NOW() WHERE burq_job_id=${data.delivery_id}`;
    }
    if (event_type === "delivery.delivery_completed") {
      await sql`UPDATE burq_deliveries SET burq_status='completed', completed_at=${data.delivered_at} WHERE burq_job_id=${data.delivery_id}`;
      if (orderId) await sql`UPDATE laundry_orders SET status='delivered', delivered_at=${data.delivered_at} WHERE id=${orderId}`;
    }
    res.json({ received: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
}
