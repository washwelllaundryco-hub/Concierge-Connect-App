// POST /api/orders/create — all 3 portals. No upfront payment. SMS tech on creation. Auto-dispatch Uber leg 1.
import { sql } from "@vercel/postgres";
import { notifyNewOrder } from "../../src/lib/notifications.js";
import { dispatchUber } from "../../src/lib/uber.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const {
    firstName, lastName, phone: rawPhone, email,
    roomNumber, hotelId, hotelName,
    tier, scheduledPickupAt, specialInstructions,
    guestId, placedBy: placedByOverride,
    // Business fields
    accountType, companyName,
  } = req.body;

  if (!firstName) return res.status(400).json({ error: "firstName is required" });
  if (!rawPhone)  return res.status(400).json({ error: "phone is required (payment link sent here after weighing)" });

  // Normalize phone to E.164 so SMS never fails on missing +
  const phone = (() => {
    let n = String(rawPhone).replace(/^whatsapp:/i, "").trim().replace(/[\s\-().]/g, "");
    if (n.startsWith("+")) return n;
    if (/^1\d{10}$/.test(n)) return "+" + n;
    if (/^\d{10}$/.test(n)) return "+1" + n;
    return "+" + n;
  })();

  const clerkUserId = (() => {
    try {
      const t = (req.headers.authorization || "").replace("Bearer ", "");
      return t ? JSON.parse(Buffer.from(t.split(".")[1] || "e30=", "base64").toString()).sub : null;
    } catch { return null; }
  })();

  try {
    // Ensure all columns exist (idempotent)
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
      sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS uber_pickup_id       TEXT`,
      sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS uber_return_id       TEXT`,
      sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS account_type         TEXT`,
      sql`ALTER TABLE laundry_orders ADD COLUMN IF NOT EXISTS company_name         TEXT`,
    ]);

    // Resolve hotel (lookup by id or slug)
    let resolvedHotelId = null;
    let hotelAddress = null;
    if (hotelId) {
      const h = await sql`SELECT id, address FROM hotels WHERE id::text = ${String(hotelId)} OR slug = ${String(hotelId)} LIMIT 1`;
      resolvedHotelId = h.rows[0]?.id || null;
      hotelAddress = h.rows[0]?.address || null;
    }

    let resolvedGuestId = guestId || null;
    if (!resolvedGuestId && clerkUserId && resolvedHotelId) {
      const g = await sql`SELECT hg.id FROM hotel_guests hg INNER JOIN users u ON hg.user_id = u.id WHERE u.clerk_user_id = ${clerkUserId} AND hg.hotel_id = ${resolvedHotelId} LIMIT 1`;
      resolvedGuestId = g.rows[0]?.id || null;
    }

    const orderNumber = "WW-" + Date.now().toString().slice(-6);
    const finalPlacedBy = placedByOverride || (clerkUserId ? "guest" : "concierge");
    const finalAccountType = accountType || "residential";

    const order = await sql`
      INSERT INTO laundry_orders (
        order_number, guest_id, hotel_id, status, tier, payment_method, payment_verified,
        placed_by, special_instructions,
        guest_first_name, guest_last_name, guest_phone, guest_email, guest_room_number,
        scheduled_pickup_at, account_type, company_name,
        created_at, updated_at
      ) VALUES (
        ${orderNumber}, ${resolvedGuestId}, ${resolvedHotelId},
        'pending_pickup', ${tier || "Standard Load"}, 'stripe', false,
        ${finalPlacedBy}, ${specialInstructions || null},
        ${firstName}, ${lastName || null}, ${phone}, ${email || null}, ${roomNumber || null},
        ${scheduledPickupAt || null}, ${finalAccountType}, ${companyName || null},
        NOW(), NOW()
      )
      RETURNING id
    `;
    const orderId = order.rows[0].id;

    // SMS tech — await with 8s abort in sendSMS
    await notifyNewOrder({
      orderNumber,
      guestName: (firstName + " " + (lastName || "")).trim(),
      roomNumber: roomNumber || null,
      hotelName: hotelName || (finalAccountType === "business" ? companyName || "Business" : "Residential"),
      scheduledPickupAt: scheduledPickupAt || null,
    }).catch(e => console.error("SMS tech failed:", e.message));

    // Uber leg 1: hotel→Washwell. Fire and await — if it fails, order is still created.
    if (hotelAddress && process.env.UBER_CLIENT_ID) {
      const uberOrder = {
        id: orderId,
        order_number: orderNumber,
        guest_name: (firstName + " " + (lastName || "")).trim(),
        phone,
        room: roomNumber || null,
        hotel_name: hotelName || null,
        hotel_address: hotelAddress,
      };
      try {
        const uberRes = await dispatchUber(uberOrder, {
          direction: "pickup",
          scheduledAt: scheduledPickupAt || null,
        });
        // Save Uber pickup delivery ID
        await sql`UPDATE laundry_orders SET uber_pickup_id = ${uberRes.id} WHERE id = ${orderId}`;
        console.log("Uber pickup dispatched:", uberRes.id, "for order", orderNumber);
      } catch (e) {
        // Non-fatal — log and continue. Tech can dispatch manually.
        console.error("Uber pickup dispatch failed:", e.message);
      }
    } else if (!hotelAddress) {
      console.warn("No hotel address on file — skipping Uber pickup dispatch for order", orderNumber);
    }

    res.json({ success: true, orderId, orderNumber, status: "pending_pickup" });
  } catch (err) {
    console.error("create order error:", err);
    res.status(500).json({ error: "Failed to create order", detail: err.message });
  }
}
