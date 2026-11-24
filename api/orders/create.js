// POST /api/orders/create — all 3 portals. No upfront payment. SMS tech on creation.
import { sql } from "@vercel/postgres";
import { notifyNewOrder } from "../../src/lib/notifications.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { firstName, lastName, phone: rawPhone, email, roomNumber, hotelId, hotelName, tier, scheduledPickupAt, specialInstructions, guestId } = req.body;
  if (!firstName) return res.status(400).json({ error: "firstName is required" });
  if (!rawPhone)  return res.status(400).json({ error: "phone is required (payment link sent here after weighing)" });
  // Normalize phone to E.164 so SMS never fails on missing +
  const phone = (() => { let n = String(rawPhone).replace(/^whatsapp:/i,"").trim().replace(/[\s\-().]/g,""); if (n.startsWith("+")) return n; if (/^1\d{10}$/.test(n)) return "+"+n; if (/^\d{10}$/.test(n)) return "+1"+n; return "+"+n; })();

  const clerkUserId = (() => { try { const t = (req.headers.authorization || "").replace("Bearer ", ""); return t ? JSON.parse(Buffer.from(t.split(".")[1] || "e30=", "base64").toString()).sub : null; } catch { return null; } })();

  try {
    await Promise.allSettled([
      sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS guest_first_name     TEXT`,
      sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS guest_last_name      TEXT`,
      sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS guest_phone          TEXT`,
      sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS guest_email          TEXT`,
      sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS guest_room_number    TEXT`,
      sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS scheduled_pickup_at  TIMESTAMPTZ`,
      sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS delivery_fee         NUMERIC(10,2)`,
      sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS total_weight_lbs     NUMERIC(10,2)`,
      sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS total_amount         NUMERIC(10,2)`,
      sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS balance_stripe_url   TEXT`,
      sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS payment_confirmed_at TIMESTAMPTZ`,
      sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS placed_by            TEXT`,
    ]);

    let resolvedHotelId = null;
    if (hotelId) {
      const h = await sql`SELECT id FROM hotels WHERE id::text = ${String(hotelId)} OR slug = ${String(hotelId)} LIMIT 1`;
      resolvedHotelId = h.rows[0]?.id || null;
    }

    let resolvedGuestId = guestId || null;
    if (!resolvedGuestId && clerkUserId && resolvedHotelId) {
      const g = await sql`SELECT hg.id FROM hotel_guests hg INNER JOIN users u ON hg.user_id = u.id WHERE u.clerk_user_id = ${clerkUserId} AND hg.hotel_id = ${resolvedHotelId} LIMIT 1`;
      resolvedGuestId = g.rows[0]?.id || null;
    }

    const orderNumber = "WW-" + Date.now().toString().slice(-6);
    const placedBy    = clerkUserId ? "guest" : "concierge";

    const order = await sql`
      INSERT INTO laundry_orders (order_number, guest_id, hotel_id, status, tier, payment_method, payment_verified, placed_by, special_instructions, guest_first_name, guest_last_name, guest_phone, guest_email, guest_room_number, scheduled_pickup_at, created_at, updated_at)
      VALUES (${orderNumber}, ${resolvedGuestId}, ${resolvedHotelId}, 'pending_pickup', ${tier || "Standard Load"}, 'stripe', false, ${placedBy}, ${specialInstructions || null}, ${firstName}, ${lastName || null}, ${phone}, ${email || null}, ${roomNumber || null}, ${scheduledPickupAt || null}, NOW(), NOW())
      RETURNING id
    `;

    // Await SMS — 8s abort timeout in sendSMS keeps this under Vercel's 10s limit
    await notifyNewOrder({ orderNumber, guestName: (firstName + " " + (lastName || "")).trim(), roomNumber: roomNumber || null, hotelName: hotelName || "Residential", scheduledPickupAt: scheduledPickupAt || null }).catch(e => console.error("SMS tech failed:", e.message));

    res.json({ success: true, orderId: order.rows[0].id, orderNumber, status: "pending_pickup" });
  } catch (err) {
    console.error("create order error:", err);
    res.status(500).json({ error: "Failed to create order", detail: err.message });
  }
}
