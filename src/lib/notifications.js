// Washwell Notification Service — Twilio WhatsApp + Resend Email
const TWILIO_CONFIG = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken:  process.env.TWILIO_AUTH_TOKEN,
  from:       `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
  baseUrl:    "https://api.twilio.com/2010-04-01",
};
const TEAM = {
  technician: `whatsapp:${process.env.WHATSAPP_TECHNICIAN}`,
  concierge:  `whatsapp:${process.env.WHATSAPP_CONCIERGE}`,
  manager:    `whatsapp:${process.env.WHATSAPP_MANAGER}`,
};

// ── WhatsApp ──────────────────────────────────────────────────────────────────
export async function sendWhatsApp(to, body) {
  if (!to || !process.env.TWILIO_ACCOUNT_SID) return;
  const url = `${TWILIO_CONFIG.baseUrl}/Accounts/${TWILIO_CONFIG.accountSid}/Messages.json`;
  const params = new URLSearchParams({ To: to, From: TWILIO_CONFIG.from, Body: body });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${Buffer.from(`${TWILIO_CONFIG.accountSid}:${TWILIO_CONFIG.authToken}`).toString("base64")}`,
    },
    body: params.toString(),
  });
  const result = await res.json();
  if (!res.ok) throw new Error(`Twilio error: ${result.message}`);
  return result;
}

// ── Email via Resend ──────────────────────────────────────────────────────────
// Add RESEND_API_KEY to your Vercel environment variables.
export async function sendEmail({ to, subject, html, text }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn("[email] RESEND_API_KEY not set — skipping email to", to);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Washwell Laundry Co. <noreply@washwellconcierge.com>",
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[email] Resend error:", err);
    // non-blocking — don't throw
  }
  return res.json().catch(() => null);
}

async function composeWithAI(prompt) {
  if (!process.env.ANTHROPIC_API_KEY) return prompt;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data?.content?.[0]?.text?.trim() || prompt;
}

// ── Notification triggers ─────────────────────────────────────────────────────

// New order placed — notify technician for pickup
export async function notifyNewOrderPickup(order) {
  const msg = `New laundry order ready for pickup.\nOrder ${order.orderNumber} — ${order.guestName}${order.hotelName ? ` at ${order.hotelName}` : ""}${order.roomNumber ? `, Room ${order.roomNumber}` : ""}.\nPayment: ${order.paymentMethod}. Weigh on receipt and the payment link will auto-generate. — Washwell`;
  try { await sendWhatsApp(TEAM.technician, msg); } catch (e) { console.error("WhatsApp technician:", e); }
}

// After technician weighs — email customer with Stripe payment link
export async function notifyPaymentLinkReady({ to, firstName, orderNumber, tier, weightLbs, amount, stripeUrl }) {
  const subject = `Your Washwell laundry is ready for payment — Order ${orderNumber}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px;background:#f8f7f4;">
      <img src="https://www.washwellconcierge.com/logo.png" alt="Washwell Laundry Co." style="height:60px;margin-bottom:24px;"/>
      <h2 style="color:#0d0d0c;margin-bottom:8px;">Hi ${firstName},</h2>
      <p style="color:#555;font-size:16px;">Your laundry has been received and weighed. Here are the details:</p>
      <div style="background:white;border-radius:12px;padding:24px;margin:24px 0;border:2px solid #e5e5e3;">
        <table style="width:100%;font-size:15px;color:#0d0d0c;">
          <tr><td style="padding:6px 0;color:#888;">Order</td><td style="font-weight:bold;text-align:right;">${orderNumber}</td></tr>
          <tr><td style="padding:6px 0;color:#888;">Service</td><td style="font-weight:bold;text-align:right;">${tier}</td></tr>
          <tr><td style="padding:6px 0;color:#888;">Actual weight</td><td style="font-weight:bold;text-align:right;">${weightLbs} lbs</td></tr>
          <tr style="border-top:2px solid #e5e5e3;">
            <td style="padding:12px 0 6px;font-size:18px;font-weight:bold;">Total</td>
            <td style="padding:12px 0 6px;font-size:22px;font-weight:bold;text-align:right;color:#00c419;">$${parseFloat(amount).toFixed(2)} CAD</td>
          </tr>
        </table>
      </div>
      <p style="color:#555;font-size:15px;">Click below to complete your payment securely. Your laundry will begin processing as soon as payment is received.</p>
      <a href="${stripeUrl}" style="display:inline-block;background:#00c419;color:white;font-weight:bold;font-size:16px;padding:16px 40px;border-radius:12px;text-decoration:none;margin:16px 0;">Pay Now — $${parseFloat(amount).toFixed(2)} CAD</a>
      <p style="color:#888;font-size:13px;margin-top:32px;">Questions? Reply to this email or contact your hotel concierge.<br/>— Washwell Laundry Co.</p>
    </div>`;
  const text = `Hi ${firstName},\n\nYour laundry (Order ${orderNumber}) has been weighed at ${weightLbs} lbs.\nTotal: $${parseFloat(amount).toFixed(2)} CAD\nService: ${tier}\n\nPay here: ${stripeUrl}\n\nYour laundry will be processed as soon as payment is received.\n— Washwell Laundry Co.`;
  try { await sendEmail({ to, subject, html, text }); } catch (e) { console.error("Email payment link:", e); }
}

// Payment confirmed (Stripe webhook) — notify technician to start
export async function notifyPaymentConfirmed(order) {
  const msg = await composeWithAI(
    `Write a concise WhatsApp notification under 80 words for a technician at Washwell Laundry Co. No emojis. A payment has been received and the order is ready to wash. Details: ${JSON.stringify({ orderNumber: order.orderNumber, guest: order.guestName, room: order.roomNumber || "N/A", hotel: order.hotelName || "Residential / Direct", amount: order.totalAmount })}. Include order number, guest, location, amount. Sign off "— Washwell".`
  ).catch(() => `Payment received — Order ${order.orderNumber} is ready to process. ${order.guestName}${order.roomNumber ? ` Room ${order.roomNumber}` : ""}. $${order.totalAmount} — Washwell`);
  try { await sendWhatsApp(TEAM.technician, msg); } catch (e) { console.error("WhatsApp:", e); }
  try { await sendWhatsApp(TEAM.manager, `Payment received — Order ${order.orderNumber} | $${order.totalAmount} | ${order.guestName} — Washwell`); } catch (e) { console.error("WhatsApp:", e); }
}

// Burq driver assigned
export async function notifyPickupRequested(order, burqJob) {
  const msg = await composeWithAI(
    `Write a short WhatsApp confirmation under 70 words for a concierge at Washwell Laundry Co. No emojis. A Burq driver has been requested. Details: ${JSON.stringify({ order: order.orderNumber, guest: order.guestName, room: order.roomNumber, jobId: burqJob.burq_job_id, eta: burqJob.estimated_delivery_time })}. Sign off "— Washwell".`
  ).catch(() => `Driver requested for Order ${order.orderNumber}. Job ${burqJob.burq_job_id} — Washwell`);
  try { await sendWhatsApp(TEAM.concierge, msg); } catch (e) { console.error("WhatsApp:", e); }
}

export async function notifyDriverAssigned(order, driver) {
  const msg = await composeWithAI(
    `Write a short WhatsApp message under 70 words for a concierge at Washwell Laundry Co. No emojis. A driver has been assigned. Details: ${JSON.stringify({ order: order.orderNumber, driver: driver.name, phone: driver.phone, vehicle: driver.vehicle, eta: driver.estimatedPickup })}. Sign off "— Washwell".`
  ).catch(() => `Driver ${driver.name} assigned for Order ${order.orderNumber} — Washwell`);
  try { await sendWhatsApp(TEAM.concierge, msg); } catch (e) { console.error("WhatsApp:", e); }
}

export async function notifyOrderCompleted(order, metrics) {
  const msg = await composeWithAI(
    `Write a short WhatsApp order summary under 80 words for the Washwell Laundry Co. manager. No emojis. Order complete. Details: ${JSON.stringify({ order: order.orderNumber, guest: order.guestName, weight: order.totalWeightLbs, waterSaved: metrics.water_saved_gallons, energySaved: metrics.energy_saved_kwh })}. Include sustainability numbers. Sign off "— Washwell".`
  ).catch(() => `Order ${order.orderNumber} complete. ${order.totalWeightLbs} lbs. Water: ${metrics.water_saved_gallons}gal, Energy: ${metrics.energy_saved_kwh}kWh — Washwell`);
  try { await sendWhatsApp(TEAM.manager, msg); } catch (e) { console.error("WhatsApp:", e); }
}
