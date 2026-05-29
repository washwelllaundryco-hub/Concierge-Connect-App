import { db } from "../../_db.js";
import { requireAuth } from "../../auth/_clerk.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { hotelId } = req.query;
  const userRole   = user.publicMetadata?.role;
  const userHotel  = user.publicMetadata?.hotelId;

  // Technicians can see all hotels; concierges only their own
  if (userRole !== "technician" && userHotel !== hotelId) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const { rows } = await db.query(
      `SELECT
         lo.id,
         lo.order_number      AS "orderNumber",
         lo.status,
         lo.tier,
         lo.created_at        AS "createdAt",
         lo.estimated_delivery_time,
         hg.first_name        AS "guestFirstName",
         hg.last_name         AS "guestLastName",
         hg.room_number       AS "roomNumber"
       FROM laundry_orders lo
       JOIN hotel_guests hg ON lo.guest_id = hg.id
       WHERE hg.hotel_id = $1
       ORDER BY lo.created_at DESC`,
      [hotelId]
    );

    res.json({ orders: rows });
  } catch (error) {
    console.error("Get hotel orders error:", error);
    res.status(500).json({ error: "Failed to fetch orders" });
  }
}
