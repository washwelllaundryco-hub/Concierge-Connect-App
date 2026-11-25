// POST /api/orders/:orderId/photos — upload a photo for an order
// Stores to Vercel Blob, saves URL in order_photos table
// photoType: "tech" (wash damage/condition) | "uber_dropoff" (delivery proof)
import { sql } from "@vercel/postgres";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { orderId } = req.query;
  if (!orderId) return res.status(400).json({ error: "orderId required" });

  const { photoData, photoType, filename } = req.body;
  // photoData: base64 data URL (data:image/jpeg;base64,...)
  // photoType: "tech" | "uber_dropoff"
  if (!photoData) return res.status(400).json({ error: "photoData required" });
  if (!photoType) return res.status(400).json({ error: "photoType required (tech|uber_dropoff)" });

  try {
    // Ensure table exists
    await sql`
      CREATE TABLE IF NOT EXISTS order_photos (
        id           SERIAL PRIMARY KEY,
        order_id     INTEGER NOT NULL,
        photo_type   TEXT NOT NULL,
        blob_url     TEXT NOT NULL,
        filename     TEXT,
        uploaded_at  TIMESTAMPTZ DEFAULT NOW(),
        expires_at   TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
      )
    `;

    // Strip data URL prefix to get raw base64
    const base64 = photoData.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    const ext    = photoData.startsWith("data:image/png") ? "png" : "jpg";
    const fname  = filename || (photoType + "-" + orderId + "-" + Date.now() + "." + ext);

    // Upload to Vercel Blob
    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    if (!blobToken) return res.status(500).json({ error: "BLOB_READ_WRITE_TOKEN not set" });

    const uploadRes = await fetch("https://blob.vercel-storage.com/" + fname, {
      method: "PUT",
      headers: {
        "Authorization": "Bearer " + blobToken,
        "Content-Type": "image/" + ext,
        "x-content-type": "image/" + ext,
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error("Blob upload failed: " + uploadRes.status + " " + err);
    }

    const { url } = await uploadRes.json();

    // Save to DB
    const row = await sql`
      INSERT INTO order_photos (order_id, photo_type, blob_url, filename)
      VALUES (${orderId}, ${photoType}, ${url}, ${fname})
      RETURNING id, blob_url, uploaded_at, expires_at
    `;

    res.json({ success: true, photo: row.rows[0] });
  } catch (err) {
    console.error("photo upload error:", err);
    res.status(500).json({ error: err.message });
  }
}
