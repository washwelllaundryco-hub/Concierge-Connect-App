// POST /api/orders/create
// Handles both concierge-placed orders (guestId) and guest self-service (clerkUserId).
// paymentMethod: "stripe" | "cash" | "hotel_account" | "pay_after_weigh"
//   - "pay_after_weigh" is for direct (non-hotel) customers: order confirmed immediately,
//     payment link generated after the technician enters the weight.
import { sql } from "@vercel/postgres";
import { notifyNewOrderReady } from "../../src/lib/notifications.js";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const {
    guestId,
    placedByUserId,
    specialInstructions,
    clerkUserId,
    firstName,
    lastName,
    roomNumber,
    pickupAddress,
    unitNumber,
    tier,
    paymentMethod,
    hotelId,
  } = req.body;

  try {
    let resolvedGuestId = guestId;
    let resolvedUserId = null;
    let guestData = null;

    const isValidUUID = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s || "");

    // Resolve placedByUserId (concierge) — the concierge portal may pass a raw
    // Clerk user ID (e.g. "user_abc123") instead of the internal users.id UUID.
    let resolvedPlacedByUserId = null;
    if (placedByUserId) {
      if (isValidUUID(placedByUserId)) {
        resolvedPlacedByUserId = placedByUserId;
      } else {
        const placerResult = await sql`
          INSERT INTO users (clerk_user_id)
          VALUES (${placedByUserId})
          ON CONFLICT (clerk_user_id) DO UPDATE SET clerk_user_id = EXCLUDED.clerk_user_id
          RETURNING id
        `;
        resolvedPlacedByUserId = placerResult.rows[0].id;
      }
    }

    if (!resolvedGuestId && clerkUserId) {
      const effectiveHotelId = isValidUUID(hotelId) ? hotelId : "a0daca51-acb7-4cbb-ac3d-6036b89f8f20";

      const userResult = await sql`
        INSERT INTO users (clerk_user_id, first_name, last_name)
        VALUES (${clerkUserId}, ${firstName || ""}, ${lastName || ""})
        ON CONFLICT (clerk_user_id)
        DO UPDATE SET
          first_name = EXCLUDED.first_name,
          last_name  = EXCLUDED.last_name
        RETURNING id
      `;
      const userId = userResult.rows[0].id;
      resolvedUserId = userId;

      const hotelResult = await sql`SELECT id, name FROM hotels WHERE id = ${effectiveHotelId} LIMIT 1`;
      const hotel = hotelResult.rows[0] || { id: effectiveHotelId, name: "Washwell Laundry" };

      const effectiveRoom = pickupAddress ? (unitNumber || null) : (roomNumber || null);
      const existingGuest = await sql`
        SELECT id FROM hotel_guests WHERE user_id = ${userId} AND hotel_id = ${hotel.id} LIMIT 1
      `;

      if (existingGuest.rows.length) {
        resolvedGuestId = existingGuest.rows[0].id;
        await sql`
          UPDATE hotel_guests
          SET room_number    = ${effectiveRoom},
              pickup_address = ${pickupAddress || null}
          WHERE id = ${resolvedGuestId}
        `;
      } else {
        const newGuest = await sql`
          INSERT INTO hotel_guests (user_id, hotel_id, room_number, pickup_address)
          VALUES (${userId}, ${hotel.id}, ${effectiveRoom}, ${pickupAddress || null})
          RETURNING id
        `;
        resolvedGuestId = newGuest.rows[0].id;
      }

      guestData = {
        hotel_id:   hotel.id,
        hotel_name: hotel.name,
        room_number: effectiveRoom,
        pickup_address: pickupAddress || null,
        first_name: firstName || "",
        last_name: lastName || "",
      };
    }

    // Concierge path: no Clerk account for the hotel guest — create user+guest
    // from firstName/lastName/roomNumber/hotelId sent by the concierge portal.
    if (!resolvedGuestId && firstName && roomNumber && hotelId) {
      const effectiveHotelId = isValidUUID(hotelId) ? hotelId : "a0daca51-acb7-4cbb-ac3d-6036b89f8f20";
      const hotelResult = await sql`SELECT id, name FROM hotels WHERE id = ${effectiveHotelId} LIMIT 1`;
      const hotel = hotelResult.rows[0] || { id: effectiveHotelId, name: "The Hotel" };

      const userResult = await sql`
        INSERT INTO users (first_name, last_name)
        VALUES (${firstName || ""}, ${lastName || ""})
        RETURNING id
      `;
      const userId = userResult.rows[0].id;

      const guestResult = await sql`
        INSERT INTO hotel_guests (user_id, hotel_id, room_number)
        VALUES (${userId}, ${hotel.id}, ${roomNumber || null})
        RETURNING id
      `;
      resolvedGuestId = guestResult.rows[0].id;

      guestData = {
        hotel_id:   hotel.id,
        hotel_name: hotel.name,
        room_number: roomNumber || null,
        pickup_address: null,
        first_name: firstName || "",
        last_name:  lastName  || "",
      };
    }

    if (!resolvedGuestId) {
      return res.status(400).json({ error: "guestId or clerkUserId is required" });
    }

    if (!guestData) {
      const guest = await sql`
        SELECT hg.id, hg.room_number, hg.hotel_id,
               u.first_name, u.last_name,
               h.name AS hotel_name
        FROM hotel_guests hg
        INNER JOIN users u ON hg.user_id = u.id
        INNER JOIN hotels h ON hg.hotel_id = h.id
        WHERE hg.id = ${resolvedGuestId}
      `;
      if (!guest.rows.length) return res.status(404).json({ error: "Guest not found" });
      const g = guest.rows[0];
      guestData = {
        hotel_id:   g.hotel_id,
        hotel_name: g.hotel_name,
        room_number: g.room_number,
        first_name: g.first_name,
        last_name: g.last_name,
      };
    }

    const effectiveTier  = tier || "Standard Load";
    // Concierge-placed orders are always auto-approved (hotel handles billing separately)
    const autoApproved   = resolvedPlacedByUserId ? true : paymentMethod !== "stripe";
    const initialStatus  = autoApproved ? "paid_pending_technician" : "pending_payment";

    const seqResult = await sql`SELECT nextval('order_number_seq') AS n`;
    const orderNumber = `WW-${String(seqResult.rows[0].n).padStart(5, "0")}`;

    const orderResult = await sql`
      INSERT INTO laundry_orders
        (order_number, guest_id, hotel_id, placed_by, placed_by_user_id,
         tier, payment_method, payment_verified, status, special_instructions, created_at)
      VALUES
        (${orderNumber}, ${resolvedGuestId}, ${guestData.hotel_id},
         ${placedByUserId ? "concierge" : "guest"}, ${resolvedPlacedByUserId || resolvedUserId || null},
         ${effectiveTier}, ${paymentMethod || "stripe"}, ${autoApproved && paymentMethod !== "stripe"}, ${initialStatus},
         ${specialInstructions || null}, NOW())
      RETURNING id, order_number
    `;
    const order = orderResult.rows[0];

    // Notify technician for orders ready to process immediately, OR any
    // concierge-placed order (concierge handles payment, technician still needs to know)
    if (initialStatus === "paid_pending_technician" || resolvedPlacedByUserId) {
      try {
        const guestName = `${guestData.first_name || ""} ${guestData.last_name || ""}`.trim() || "Guest";
        const location = guestData.pickup_address
          ? `Pickup: ${guestData.pickup_address}`
          : guestData.room_number
            ? `Room ${guestData.room_number}, ${guestData.hotel_name}`
            : guestData.hotel_name;

        await notifyNewOrderReady({
          orderNumber,
          guestName,
          location,
          tier: effectiveTier,
          paymentNote: paymentMethod || "stripe",
        });
      } catch (notifyErr) {
        console.error("WhatsApp notification failed:", notifyErr);
      }
    }

    res.json({
      success: true,
      orderId: order.id,
      orderNumber,
      status: initialStatus,
      paymentMethod,
    });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
}
