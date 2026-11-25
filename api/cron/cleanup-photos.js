// Cron: runs weekly — deletes Vercel Blob files older than 30 days
// Triggered by vercel.json cron schedule: "0 3 * * 1" (Monday 3am UTC)
import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  // Vercel cron passes Authorization header with CRON_SECRET
  if (req.headers.authorization !== "Bearer " + process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    // Find expired photos
    const expired = await sql`
      SELECT id, blob_url FROM order_photos
      WHERE expires_at < NOW()
      ORDER BY expires_at ASC
      LIMIT 200
    `;

    if (expired.rows.length === 0) {
      return res.json({ success: true, deleted: 0, message: "No expired photos" });
    }

    const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
    let deleted = 0, failed = 0;

    for (const photo of expired.rows) {
      try {
        // Delete from Vercel Blob
        const delRes = await fetch(photo.blob_url, {
          method: "DELETE",
          headers: { Authorization: "Bearer " + blobToken },
        });
        if (delRes.ok || delRes.status === 404) {
          // Remove DB record
          await sql`DELETE FROM order_photos WHERE id = ${photo.id}`;
          deleted++;
        } else {
          console.error("Blob delete failed:", photo.blob_url, delRes.status);
          failed++;
        }
      } catch (e) {
        console.error("Error deleting photo", photo.id, e.message);
        failed++;
      }
    }

    console.log(`Photo cleanup: deleted=${deleted} failed=${failed}`);
    res.json({ success: true, deleted, failed });
  } catch (err) {
    console.error("cleanup-photos cron error:", err);
    res.status(500).json({ error: err.message });
  }
}
