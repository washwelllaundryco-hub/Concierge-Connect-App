// POST /api/orders/[id]/weigh
// Called by TechnicianDashboard when weight is logged.
// 1. Calculates correct price based on actual weight (hotel tiers OR residential per-lb).
// 2. For Stripe orders: creates Stripe Checkout Session → emails customer → status: awaiting_payment
// 3. For room_charge / hotel_account / cash: records correct amount → status: paid_pending_technician
import Stripe from "stripe";
import { db } from "../../_db.js";
import { notifyPaymentLinkReady, notifyPaymentConfirmed } from "../../../src/lib/notifications.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Tier weight/price table (must match src/constants.js)
const HOTEL_TIERS = [
  { name: "Essential Load",  maxLbs: 15,  price: 68.00  },
  { name: "Standard Load",   maxLbs: 30,  price: 88.00  },
  { name: "Premium Load",    maxLbs: 50,  price: 128.00 },
  { name: "Executive Load",  maxLbs: 75,  price: 188.00 },
  { name: "Bulk Service",    maxLbs: 100, price: 245.00 },
];

const RESIDENTIAL_RATES = {
  "Regular Load":    { ratePerLb: 2.75, flatUnder15: 49.00 },
  "Mixed Bag":       { ratePerLb: 2.85, flatUnder15: 49.00 },
  "Towels & Sheets": { ratePerLb: 3.00, flatUnder15: 49.00 },
};

function calcHotelPrice(lbs) {
  return HOTEL_TIERS.find(t => lbs <= t.maxLbs) || HOTEL_TIERS[HOTEL_TIERS.length - 1];
}

function calcResidentialPrice(serviceType, lbs) {
  const r = RESIDENTIAL_RATES[serviceType] || RESIDENTIAL_RATES["Regular Load"];
  const amount = lbs <= 15 ? r.flatUnder15 : parseFloat((lbs * r.ratePerLb).toFixed(2));
  return { name: serviceType, price: amount };
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { id: orderId } = req.query;
  const { weight } = req.body;

  if (!weight || parseFloat(weight) <= 0) {
    return res.status(400).json({ error: "Weight is required and must be > 0" });
  }

  const lbs = parseFloat(weight);

  try {
    // Fetch full order details
    const { rows } = await db.query(
      `SELECT
         lo.id,
         lo.order_number   AS "orderNumber",
         lo.payment_method AS "paymentMethod",
         lo.tier,
         lo.service_type   AS "serviceType",
         lo.guest_email    AS "guestEmail",
         lo.placed_by      AS "placedBy",
         lo.hotel_id       AS "hotelId",
         lo.status,
         COALESCE(u.first_name || ' ' || u.last_name, ru.first_name || ' ' || ru.last_name, 'Guest') AS "guestName",
         COALESCE(u.first_name, ru.first_name, 'Guest') AS "firstName",
         COALESCE(u.email, lo.guest_email) AS "email",
         hg.room_number  AS "roomNumber",
         h.name          AS "hotelName"
       FROM laundry_orders lo
       LEFT JOIN hotel_guests hg ON lo.guest_id = hg.id
       LEFT JOIN users u         ON hg.user_id = u.id
       LEFT JOIN users ru        ON lo.placed_by_user_id = ru.id
       LEFT JOIN hotels h        ON lo.hotel_id = h.id
       WHERE lo.id = $1`,
      [orderId]
    );

    if (!rows.length) return res.status(404).json({ error: "Order not found" });
    const order = rows[0];

    // Determine if hotel or residential pricing
    const isResidential = !order.hotelId;
    let tierName, amount;

    if (isResidential) {
      const result = calcResidentialPrice(order.serviceType || "Regular Load", lbs);
      tierName = result.name;
      amount   = result.price;
    } else {
      const result = calcHotelPrice(lbs);
      tierName = result.name;
      amount   = result.price;
    }

    // Update order with weight, amount, correct tier
    await db.query(
      `UPDATE laundry_orders
       SET total_weight_lbs = $1,
           total_amount     = $2,
           correct_tier     = $3,
           in_wash_at       = NULL,
           updated_at       = NOW()
       WHERE id = $4`,
      [lbs, amount, tierName, orderId]
    );

    // Log status history
    await db.query(
      `INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, changed_at)
       VALUES ($1, $2, $3, 'technician', NOW())`,
      [orderId, order.status, "weighed"]
    );

    // Sustainability metrics
    const waterSaved  = (lbs * 2.1).toFixed(2);
    const energySaved = (lbs * 0.09).toFixed(3);
    const co2Avoided  = (parseFloat(energySaved) * 0.92).toFixed(3);
    await db.query(
      `INSERT INTO sustainability_metrics
         (order_id, water_saved_gallons, water_saved_per_lb, energy_saved_kwh, co2_lbs_avoided, calculated_at)
       VALUES ($1, $2, 2.1, $3, $4, NOW())
       ON CONFLICT (order_id) DO UPDATE
       SET water_saved_gallons = $2, energy_saved_kwh = $3, co2_lbs_avoided = $4, calculated_at = NOW()`,
      [orderId, waterSaved, energySaved, co2Avoided]
    );

    // ── STRIPE: generate Checkout Session → email customer ────────────────────
    if (order.paymentMethod === "stripe") {
      const customerEmail = order.email || order.guestEmail;
      let stripeUrl = null;

      if (process.env.STRIPE_SECRET_KEY) {
        try {
          const session = await stripe.checkout.sessions.create({
            mode: "payment",
            metadata: { order_id: orderId, type: "initial_payment" },
            customer_email: customerEmail || undefined,
            line_items: [{
              price_data: {
                currency: "cad",
                product_data: {
                  name: `Washwell Laundry — ${tierName}`,
                  description: `Order ${order.orderNumber} · ${lbs} lbs`,
                },
                unit_amount: Math.round(amount * 100),
              },
              quantity: 1,
            }],
            success_url: "https://www.washwellconcierge.com/?paid=1",
            cancel_url:  "https://www.washwellconcierge.com/",
          });
          stripeUrl = session.url;

          await db.query(
            `UPDATE laundry_orders
             SET status = 'awaiting_payment', balance_stripe_url = $1, updated_at = NOW()
             WHERE id = $2`,
            [stripeUrl, orderId]
          );
        } catch (stripeErr) {
          console.error("Stripe session error:", stripeErr);
          await db.query(
            `UPDATE laundry_orders SET status = 'awaiting_payment', updated_at = NOW() WHERE id = $1`,
            [orderId]
          );
        }
      } else {
        await db.query(
          `UPDATE laundry_orders SET status = 'awaiting_payment', updated_at = NOW() WHERE id = $1`,
          [orderId]
        );
      }

      // Email the customer (non-blocking)
      if (stripeUrl && customerEmail) {
        notifyPaymentLinkReady({
          to:          customerEmail,
          firstName:   order.firstName,
          orderNumber: order.orderNumber,
          tier:        tierName,
          weightLbs:   lbs,
          amount,
          stripeUrl,
        }).catch(e => console.error("notifyPaymentLinkReady:", e));
      }

      return res.json({
        success: true,
        orderId,
        status:    "awaiting_payment",
        amount,
        tierName,
        weightLbs: lbs,
        stripeUrl,
        message:   stripeUrl ? "Payment link emailed to customer" : "Status set to awaiting_payment (no email — RESEND_API_KEY or STRIPE_SECRET_KEY missing)",
      });
    }

    // ── NON-STRIPE (room_charge / hotel_account / cash) ───────────────────────
    // Update to paid_pending_technician immediately
    await db.query(
      `UPDATE laundry_orders
       SET status = 'paid_pending_technician', payment_verified = true, updated_at = NOW()
       WHERE id = $1`,
      [orderId]
    );

    // Notify technician
    notifyPaymentConfirmed({
      orderNumber: order.orderNumber,
      guestName:   order.guestName,
      roomNumber:  order.roomNumber,
      hotelName:   order.hotelName,
      totalAmount: amount.toFixed(2),
    }).catch(e => console.error("notifyPaymentConfirmed:", e));

    return res.json({
      success:   true,
      orderId,
      status:    "paid_pending_technician",
      amount,
      tierName,
      weightLbs: lbs,
    });

  } catch (err) {
    console.error("weigh error:", err);
    res.status(500).json({ error: "Failed to process weight" });
  }
}
