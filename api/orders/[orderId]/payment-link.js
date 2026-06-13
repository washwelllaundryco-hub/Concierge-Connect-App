// POST /api/orders/[orderId]/payment-link
// Generates a Stripe Checkout Session for a residential (pay_after_weigh) order.
// Body: { weight: number, laundryType: "regular" | "mixed" }
// Returns: { url, breakdown, email }
import Stripe from "stripe";
import { sql } from "@vercel/postgres";
import { createClerkClient } from "@clerk/backend";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const clerk  = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

const RATE          = { regular: 2.75, mixed: 3.00 };
const DELIVERY      = 15.00;
const TAX_RATE      = 0.13;
const FLAT_MAX_LBS  = 15;
const FLAT_PRICE    = 49.00;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { orderId } = req.query;
  const { weight, laundryType = "regular" } = req.body;

  if (!weight || parseFloat(weight) <= 0) {
    return res.status(400).json({ error: "Valid weight is required" });
  }

  try {
    // 1. Fetch order
    const orderResult = await sql`
      SELECT lo.id, lo.order_number, lo.payment_method, lo.status,
             lo.placed_by_user_id, lo.balance_stripe_url,
             u.first_name, u.last_name
      FROM laundry_orders lo
      INNER JOIN hotel_guests hg ON lo.guest_id = hg.id
      INNER JOIN users u ON hg.user_id = u.id
      WHERE lo.id = ${orderId}
      LIMIT 1
    `;
    if (!orderResult.rows.length) return res.status(404).json({ error: "Order not found" });
    const order = orderResult.rows[0];

    if (order.payment_method !== "pay_after_weigh") {
      return res.status(400).json({ error: "Not a pay-after-weigh order" });
    }

    // Return cached URL if already generated
    if (order.balance_stripe_url) {
      return res.json({ url: order.balance_stripe_url, cached: true });
    }

    // 2. Calculate price
    const lbs      = parseFloat(weight);
    const rate     = RATE[laundryType] || RATE.regular;
    const laundry  = lbs <= FLAT_MAX_LBS ? FLAT_PRICE : parseFloat((lbs * rate).toFixed(2));
    const subtotal = laundry + DELIVERY;
    const tax      = parseFloat((subtotal * TAX_RATE).toFixed(2));
    const total    = parseFloat((subtotal + tax).toFixed(2));

    const breakdown = { laundry, delivery: DELIVERY, tax, total, lbs, laundryType, rate };

    // 3. Create Stripe Checkout Session
    const laundryLabel = laundryType === "mixed"
      ? `Washwell Laundry — ${lbs} lbs (Towels/Sheets)`
      : `Washwell Laundry — ${lbs} lbs (Regular)`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "cad",
            product_data: { name: laundryLabel },
            unit_amount: Math.round(laundry * 100),
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: "cad",
            product_data: { name: "Delivery Fee" },
            unit_amount: Math.round(DELIVERY * 100),
          },
          quantity: 1,
        },
        {
          price_data: {
            currency: "cad",
            product_data: { name: "Tax (13%)" },
            unit_amount: Math.round(tax * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `https://www.washwellconcierge.com/guest?direct_paid=${orderId}`,
      cancel_url:  `https://www.washwellconcierge.com/guest`,
      client_reference_id: orderId,
      metadata: { type: "residential_payment", orderId },
    });

    // 4. Update order: log weight, cache URL, move to awaiting_payment
    await sql`
      UPDATE laundry_orders
      SET total_weight_lbs  = ${lbs},
          status             = 'awaiting_payment',
          balance_stripe_url = ${session.url},
          updated_at         = NOW()
      WHERE id = ${orderId}
    `;
    await sql`
      INSERT INTO order_status_history (order_id, from_status, to_status, changed_by, note, changed_at)
      VALUES (${orderId}, ${order.status}, 'awaiting_payment', 'technician', 'Payment link generated', NOW())
    `;

    // 5. Send email via Resend (optional — skipped if no API key)
    let emailSent = false;
    let customerEmail = null;

    if (process.env.RESEND_API_KEY && order.placed_by_user_id) {
      try {
        const clerkUser = await clerk.users.getUser(order.placed_by_user_id);
        customerEmail = clerkUser.emailAddresses?.[0]?.emailAddress;

        if (customerEmail) {
          await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              from: "Washwell Laundry <orders@washwellconcierge.com>",
              to: [customerEmail],
              subject: `Your Washwell payment link — Order ${order.order_number}`,
              html: `
                <div style="font-family:Montserrat,sans-serif;max-width:520px;margin:0 auto;color:#0d0d0c">
                  <div style="background:#0d0d0c;padding:32px;text-align:center">
                    <h1 style="color:#00c419;font-size:24px;margin:0">Washwell Laundry Co.</h1>
                  </div>
                  <div style="padding:32px">
                    <p>Hi ${order.first_name},</p>
                    <p>Your laundry has been picked up and weighed. Here's your order summary:</p>
                    <table style="width:100%;border-collapse:collapse;margin:24px 0">
                      <tr><td style="padding:8px 0;color:#6b6b69">Order</td><td style="text-align:right;font-weight:600">${order.order_number}</td></tr>
                      <tr><td style="padding:8px 0;color:#6b6b69">Weight</td><td style="text-align:right;font-weight:600">${lbs} lbs</td></tr>
                      <tr><td style="padding:8px 0;color:#6b6b69">Laundry (${lbs} lbs × $${rate})</td><td style="text-align:right;font-weight:600">$${laundry.toFixed(2)}</td></tr>
                      <tr><td style="padding:8px 0;color:#6b6b69">Delivery</td><td style="text-align:right;font-weight:600">$${DELIVERY.toFixed(2)}</td></tr>
                      <tr><td style="padding:8px 0;color:#6b6b69">Tax (13%)</td><td style="text-align:right;font-weight:600">$${tax.toFixed(2)}</td></tr>
                      <tr style="border-top:2px solid #d6d6d4">
                        <td style="padding:12px 0;font-weight:700;font-size:18px">Total</td>
                        <td style="text-align:right;font-weight:700;font-size:18px;color:#00c419">$${total.toFixed(2)}</td>
                      </tr>
                    </table>
                    <a href="${session.url}" style="display:block;background:#00c419;color:#fff;text-align:center;padding:16px;border-radius:12px;font-weight:700;font-size:16px;text-decoration:none;margin:24px 0">
                      Pay $${total.toFixed(2)} Now
                    </a>
                    <p style="color:#6b6b69;font-size:13px">Your laundry will be processed and delivered once payment is confirmed.</p>
                  </div>
                </div>
              `,
            }),
          });
          emailSent = true;
        }
      } catch (emailErr) {
        console.error("Email send error:", emailErr);
        // Non-fatal — continue without email
      }
    }

    res.json({ url: session.url, breakdown, emailSent, customerEmail });
  } catch (err) {
    console.error("Payment link error:", err);
    res.status(500).json({ error: "Failed to generate payment link" });
  }
}
