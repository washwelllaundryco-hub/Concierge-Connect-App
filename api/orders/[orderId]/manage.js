// /api/orders/[orderId]/manage — merged dispatch + photos endpoint
// Routes by ?action= query param:
//   dispatch → POST  { direction: "pickup"|"return" }
//   photos   → POST  { photoData, photoType, filename }
//            → GET   returns delivery info

import { sql } from "@vercel/postgres";
import { notifyPickupRequested } from "../../../src/lib/notifications.js";

const WASHWELL = {
  street_address: ["222 The Esplanade", "Unit 7"],
  city: "Toronto", state: "ON", zip_code: "M5A 4M8", country: "CA",
};
const UBER_CID = process.env.UBER_CUSTOMER_ID || "068d4564-9f41-46c9-839a-ecf385f6fa17";

let _tok = null, _exp = 0;
async function uberToken() {
  if (_tok && Date.now() < _exp - 60000) return _tok;
  const r = await fetch("https://auth.uber.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.UBER_CLIENT_ID,
      client_secret: process.env.UBER_CLIENT_SECRET,
      grant_type: "client_credentials",
      scope: "eats.deliveries",
    }).toString(),
  });
  const d = await r.json();
  if (!r.ok) throw new Error("Uber auth: " + JSON.stringify(d));
  _tok = d.access_token; _exp = Date.now() + ((d.expires_in || 3600) * 1000);
  return _tok;
}

export default async function handler(req, res) {
  const { orderId } = req.query;
  const action = req.query.action || "dispatch";
  if (!orderId) return res.status(400).json({ error: "orderId required" });

  // ── Dispatch (Uber delivery) ───────────────────────────────────────────────
  if (action === "dispatch") {
    try {
      await sql`CREATE TABLE IF NOT EXISTS uber_deliveries (
        id SERIAL PRIMARY KEY, order_id INTEGER REFERENCES laundry_orders(id),
        uber_delivery_id TEXT, status TEXT, tracking_url TEXT,
        courier_name TEXT, courier_phone TEXT, estimated_delivery_time TIMESTAMPTZ,
        raw_data JSONB, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
      )`;

      if (req.method === "GET") {
        const r = await sql`SELECT * FROM uber_deliveries WHERE order_id = ${orderId} ORDER BY created_at DESC LIMIT 1`;
        return res.json({ delivery: r.rows[0] || null });
      }
      if (req.method !== "POST") return res.status(405).end();

      const { direction } = req.body;
      const oRes = await sql`
        SELECT lo.id, lo.order_number,
               COALESCE(lo.guest_first_name, u.first_name, 'Guest') AS fn,
               COALESCE(lo.guest_last_name,  u.last_name, '')        AS ln,
               COALESCE(lo.guest_phone, u.phone, '')                 AS phone,
               COALESCE(lo.guest_room_number, hg.room_number, '')    AS room,
               h.name AS hname, h.address AS haddr
        FROM laundry_orders lo
        LEFT JOIN hotel_guests hg ON lo.guest_id = hg.id
        LEFT JOIN users u ON hg.user_id = u.id
        LEFT JOIN hotels h ON lo.hotel_id = h.id
        WHERE lo.id = ${orderId}
      `;
      const o = oRes.rows[0];
      if (!o) return res.status(404).json({ error: "Order not found" });

      if (!process.env.UBER_CLIENT_ID) {
        await sql`UPDATE laundry_orders SET status = 'out_for_delivery', updated_at = NOW() WHERE id = ${orderId}`;
        return res.json({ success: true, note: "Uber not configured — status set to out_for_delivery" });
      }

      const tok = await uberToken();
      const pu  = direction === "return"
        ? { name: "Washwell Laundry", address: WASHWELL, phone_number: "+14165550100", notes: "Order " + o.order_number }
        : { name: o.hname || "Hotel", address: o.haddr || WASHWELL, phone_number: (o.phone || "").replace(/^whatsapp:/i, ""), notes: "Room " + o.room };
      const dro = direction === "return"
        ? { name: o.fn + " " + o.ln, address: o.haddr || WASHWELL, phone_number: (o.phone || "").replace(/^whatsapp:/i, ""), notes: "Room " + o.room, requires_dropoff_photo: true }
        : { name: "Washwell Laundry", address: WASHWELL, phone_number: "+14165550100", notes: "Pickup " + o.order_number, requires_dropoff_photo: true };

      const dr = await fetch("https://api.uber.com/v1/customers/" + UBER_CID + "/deliveries", {
        method: "POST",
        headers: { Authorization: "Bearer " + tok, "Content-Type": "application/json" },
        body: JSON.stringify({
          pickup: pu, dropoff: dro,
          manifest: { description: "Laundry " + o.order_number, total_value: 0, items: [{ name: "Laundry", quantity: 1, size: "medium", price: 0 }] },
          external_store_id: String(o.id),
          external_delivery_id: "ww-" + o.id + "-" + Date.now(),
        }),
      });
      const d = await dr.json();
      if (!dr.ok) throw new Error("Uber: " + (d.message || JSON.stringify(d)));

      await sql`INSERT INTO uber_deliveries (order_id, uber_delivery_id, status, tracking_url, estimated_delivery_time, raw_data)
                VALUES (${orderId}, ${d.id}, ${d.status}, ${d.tracking_url || null}, ${d.dropoff?.estimated_delivery_time || null}, ${JSON.stringify(d)})`;
      if (direction === "return") {
        await sql`UPDATE laundry_orders SET status = 'out_for_delivery', updated_at = NOW() WHERE id = ${orderId}`;
      }
      notifyPickupRequested({ orderNumber: o.order_number, guestName: o.fn + " " + o.ln, roomNumber: o.room }, d.dropoff).catch(() => {});
      return res.json({ success: true, deliveryId: d.id, trackingUrl: d.tracking_url });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Photos ─────────────────────────────────────────────────────────────────
  if (action === "photos") {
    if (req.method !== "POST") return res.status(405).end();
    const { photoData, photoType, filename } = req.body;
    if (!photoData) return res.status(400).json({ error: "photoData required" });

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not set" });

    try {
      await sql`CREATE TABLE IF NOT EXISTS order_photos (
        id         SERIAL PRIMARY KEY,
        order_id   INTEGER REFERENCES laundry_orders(id),
        photo_type TEXT NOT NULL,
        blob_url   TEXT NOT NULL,
        filename   TEXT,
        uploaded_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at  TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
      )`;

      // Strip data URL prefix if present
      const base64 = photoData.includes(",") ? photoData.split(",")[1] : photoData;
      const buffer = Buffer.from(base64, "base64");
      const ext    = (filename || "photo.jpg").split(".").pop().toLowerCase() || "jpg";
      const fname  = "orders/" + orderId + "/" + (photoType || "tech") + "-" + Date.now() + "." + ext;

      const uploadRes = await fetch("https://blob.vercel-storage.com/" + fname, {
        method: "PUT",
        headers: { Authorization: "Bearer " + blobToken, "Content-Type": "image/" + ext },
        body: buffer,
      });
      if (!uploadRes.ok) {
        const t = await uploadRes.text();
        return res.status(500).json({ error: "Blob upload failed: " + t });
      }
      const { url } = await uploadRes.json();

      const inserted = await sql`
        INSERT INTO order_photos (order_id, photo_type, blob_url, filename)
        VALUES (${orderId}, ${photoType || "tech"}, ${url}, ${fname})
        RETURNING id, blob_url, uploaded_at, expires_at
      `;
      return res.json({ success: true, photo: inserted.rows[0] });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  res.status(400).json({ error: "Unknown action. Use ?action=dispatch or ?action=photos" });
}
