import { db } from "../_db.js";
import { requireAuth } from "../auth/_clerk.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const user = await requireAuth(req, res);
  if (!user) return;

  const { firstName, lastName, roomNumber, tier, hotelId } = req.body;

  if (!firstName || !roomNumber || !tier || !hotelId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // Find or create guest record
    const existing = await db.query(
      `SELECT id FROM hotel_guests WHERE hotel_id = $1 AND room_number = $2 LIMIT 1`,
      [hotelId, roomNumber]
    );

    let guestId;
    if (existing.rows.length > 0) {
      guestId = existing.rows[0].id;
    } else {
      const { rows } = await db.query(
        `INSERT INTO hotel_guests (hotel_id, first_name, last_name, room_number, created_at)
         VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
        [hotelId, firstName, lastName, roomNumber]
      );
      guestId = rows[0].id;
    }

    // Create the order
    const orderNumber = `WW-${Date.now()}`;
    const { rows } = await db.query(
      `INSERT INTO laundry_orders (guest_id, hotel_id, order_number, status, tier, created_by, created_at)
       VALUES ($1, $2, $3, 'pending', $4, $5, NOW())
       RETURNING id, order_number`,
      [guestId, hotelId, orderNumber, tier, user.id]
    );

    res.json({
      success:     true,
      orderId:     rows[0].id,
      orderNumber: rows[0].order_number,
    });
  } catch (error) {
    console.error("Create order error:", error);
    res.status(500).json({ error: "Failed to create order" });
  }
}
