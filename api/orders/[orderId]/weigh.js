// POST /api/orders/[orderId]/weigh
// Technician logs weight → calculates correct price → generates Stripe link or charges room/hotel.
import { sql } from "@vercel/postgres";
import Stripe from "stripe";
import { notifyPaymentLinkReady, notifyPaymentConfirmed } from "../../../src/lib/notifications.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const HOTEL_TIERS = [
  { name: "Essential Load",  maxLbs: 15,  price: 68.00  },
  { name: "Standard Load",   maxLbs: 30,  price: 88.00  },
  { name: "Premium Load",    maxLbs: 50,  price: 128.00 },
  { name: "Executive Load",  maxLbs: 75,  price: 188.00 },
  { name: "Bulk Service",    maxLbs: 100, price: 245.00 },
];
const RESIDENTIAL = {
  "Regular Load":    { ratePerLb: 2.75 },
  "Mixed Bag":       { ratePerLb: 2.85 },
  "Towels & Sheets": { ratePerLb: 3.00 },
};

function calcHotelPrice(lbs) {
  return HOTEL_TIERS.find(t => lbs <= t.maxLbs) || HOTEL_TIERS[HOTEL_TIERS.length - 1];
}
function calcResidentialPrice(serviceType, lbs) {
  const r = RESIDENTIAL[serviceType] || RESIDENTIAL["Regular Load"];
  return { name: serviceType, price: lbs <= 15 ? 49.00 : parseFloat((lbs * r.ratePerLb).toFixed(2)) };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { orderId } = req.query;
  const { weight } = req.body;
  if (!weight || parseFloat(weight) <= 0) return res.status(400).json({ error: "Weight required" });
  const lbs = parseFloat(weight);

  try {
    const orderResult = await sql`
      SELECT lo.id, lo.order_number AS "orderNumber",
             lo.payment_method AS "paymentMethod",
             lo.tier, lo.service_type AS "serviceType",
             lo.guest_email AS "guestEmail", lo.hotel_id AS "hotelId",
             lo.guest_id AS "guestId", lo.status,
             lo.placed_by_user_id AS "placedByUserId",
             COALESCE(u.first_name, ru.first_name, 'Guest') AS "firstName",
             COALESCE(u.first_name||' '||u.last_name, ru.first_name||' '||ru.last_name, 'Guest') AS "guestName",
             COALESCE(u.email, lo.guest_email) AS "email",
             hg.room_number AS "roomNumber", h.name AS "hotelName"
      FROM laundry_orders lo
      LEFT JOIN hotel_guests hg ON lo.guest_id = hg.id
      LEFT JOIN users u         ON hg.user_id = u.id
      LEFT JOIN users ru        ON lo.placed_by_user_id = ru.id
      LEFT JOIN hotels h        ON lo.hotel_id = h.id
      WHERE lo.id = ${orderId}
    `;
    if (!orderResult.rows.length) return res.status(404).json({ error: "Order not found" });
    const order = orderResult.rows[0];

    const isResidential = !order.hotelId;
    let tierName, amount;
    if (isResidential) {
      const r = calcResidentialPrice(order.serviceType || "Regular Load", lbs);
      tierName = r.name; amount = r.price;
    } else {
      const r = calcHotelPrice(lbs);
      tierName = r.name; amount = r.price;
    }

    // Save weight, amount, correct tier
    await sql`
      UPDATE laundry_orders
      SET total_weight_lbs = ${lbs}, total_amount = ${amount}, correct_tier = ${tierName}, updated_at = NOW()
      WHERE id = ${orderId}
    `;

    // Sustainability metrics
    const waterSaved  = parseFloat((lbs * 2.1).toFixed(2));
    const energySaved = parseFloat((lbs * 0.09).toFixed(3));
    const co2Avoided  = parseFloat((energySaved * 0.92).toFixed(3));
    await sql`
      INSERT INTO sustainability_metrics (order_id, water_saved_gallons, water_saved_per_lb, energy_saved_kwh, co2_lbs_avoided, calculated_at)
      VALUES (${orderId}, ${waterSaved}, 2.1, ${energySaved}, ${co2Avoided}, NOW())
      ON CONFLICT (order_id) DO UPDATE
      SET water_saved_gallons = ${waterSaved}, energy_saved_kwh = ${energySaved}, co2_lbs_avoided = ${co2Avoided}, calculated_at = NOW()
    `;

    if (order.paymentMethod === "stripe") {
      let stripeUrl = null;
      const customerEmail = order.email || order.guestEmail;

      if (process.env.STRIPE_SECRET_KEY) {
        try {
          const session = await stripe.checkout.sessions.create({
            mode: "payment",
            metadata: { order_id: String(orderId), type: "initial_payment" },
            customer_email: customerEmail || undefined,
            line_items: [{ price_data: {
              currency: "cad",
              product_data: { name: `Washwell Laundry — ${tierName}`, description: `Order ${order.orderNumber} · ${lbs} lbs` },
              unit_amount: Math.round(amount * 100),
            }, quantity: 1 }],
            success_url: "https://www.washwellconcierge.com/?paid=1",
            cancel_url:  "https://www.washwellconcierge.com/",
          });
          stripeUrl = session.url;
        } catch (e) { console.error("Stripe session error:", e); }
      }

      await sql`
        UPDATE laundry_orders
        SET status = 'awaiting_payment', balance_stripe_url = ${stripeUrl}, updated_at = NOW()
        WHERE id = ${orderId}
      `;

      if (stripeUrl && customerEmail) {
        notifyPaymentLinkReady({ to: customerEmail, firstName: order.firstName, orderNumber: order.orderNumber, tier: tierName, weightLbs: lbs, amount, stripeUrl })
          .catch(e => console.error("email error:", e));
      }

      return res.json({ success: true, status: "awaiting_payment", amount, tierName, weightLbs: lbs, stripeUrl });
    }

    // Room charge / hotel account / cash — record amount and move to processing
    if (order.paymentMethod === "room_charge" && order.guestId && order.hotelId) {
      await sql`
        INSERT INTO room_charges (order_id, hotel_id, guest_id, room_number, amount, description, charged_by, charged_at)
        VALUES (${orderId}, ${order.hotelId}, ${order.guestId}, ${order.roomNumber}, ${amount},
                ${'Washwell Laundry — ' + order.orderNumber}, ${order.placedByUserId || 'technician'}, NOW())
        ON CONFLICT (order_id) DO UPDATE SET amount = ${amount}
      `;
    } else if (order.paymentMethod === "hotel_account" && order.hotelId) {
      await sql`
        INSERT INTO hotel_account_charges (order_id, hotel_id, guest_id, room_number, amount, description, created_by, created_at)
        VALUES (${orderId}, ${order.hotelId}, ${order.guestId}, ${order.roomNumber}, ${amount},
                ${'Washwell Laundry — ' + order.orderNumber}, ${order.placedByUserId || 'technician'}, NOW())
        ON CONFLICT (order_id) DO UPDATE SET amount = ${amount}
      `;
    }

    await sql`
      UPDATE laundry_orders SET status = 'paid_pending_technician', payment_verified = true, updated_at = NOW() WHERE id = ${orderId}
    `;

    notifyPaymentConfirmed({ orderNumber: order.orderNumber, guestName: order.guestName, roomNumber: order.roomNumber, hotelName: order.hotelName, totalAmount: amount.toFixed(2) })
      .catch(e => console.error("notify error:", e));

    return res.json({ success: true, status: "paid_pending_technician", amount, tierName, weightLbs: lbs });
  } catch (err) {
    console.error("weigh error:", err);
    res.status(500).json({ error: "Failed to process weight" });
  }
}
