// WhatsApp Notification Service — Twilio + Claude AI
// Sends WhatsApp messages to technician, concierge, and manager
// triggered by payment confirmation, pickup request, driver assignment,
// and order completion.
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
// NOTE: despite the name (kept for compatibility with all call sites),
// this sends a plain SMS via Twilio rather than a WhatsApp message.
// The Twilio WhatsApp Sandbox requires recipients to re-"join" every 72
// hours and enforces a 24-hour session window for free-form messages,
// which made staff notifications silently fail. SMS has neither
// restriction. Set TWILIO_SMS_NUMBER to an SMS-capable Twilio number.
export async function sendWhatsApp(to, body) {
  const url = `${TWILIO_CONFIG.baseUrl}/Accounts/${TWILIO_CONFIG.accountSid}/Messages.json`;
  const toNumber = to.replace(/^whatsapp:/, "");
  const fromNumber = (process.env.TWILIO_SMS_NUMBER || TWILIO_CONFIG.from).replace(/^whatsapp:/, "");
  const params = new URLSearchParams({ To: toNumber, From: fromNumber, Body: body });
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
async function composeWithAI(prompt, fallback) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    const data = await res.json();
    if (!data.content || !data.content[0]) {
      console.error("composeWithAI: unexpected Anthropic response", JSON.stringify(data));
      return fallback;
    }
    return data.content[0].text.trim();
  } catch (err) {
    console.error("composeWithAI failed, using fallback:", err.message);
    return fallback;
  }
}
// TRIGGER 0: New order created and ready for the technician to process
// (e.g. pay-after-weigh residential orders, room/hotel-account charges — no
// separate payment-confirmation step is needed before processing begins)
export async function notifyNewOrderReady(order) {
  const msg = await composeWithAI(
    `You write concise WhatsApp notifications for Washwell Laundry Co., a premium hotel laundry service. No emojis. Write a message under 80 words for a technician: a new order is ready to process. Order: ${JSON.stringify({ number: order.orderNumber, guest: order.guestName, location: order.location, tier: order.tier, paymentMethod: order.paymentNote })}. Include the order number, guest name, location, tier, and payment method. Sign off "— Washwell".`,
    `New order ready — ${order.orderNumber}\nGuest: ${order.guestName} | ${order.location}\nService: ${order.tier} | ${order.paymentNote}\n— Washwell`
  );
  await sendWhatsApp(TEAM.technician, msg);
}

// TRIGGER 1: Guest or concierge confirms payment
// → Technician + Manager receive WhatsApp
export async function notifyPaymentConfirmed(order) {
  const msg = await composeWithAI(
    `You write concise WhatsApp notifications for Washwell Laundry Co., a premium hotel laundry service. No emojis. Write a message under 80 words for a technician: a new paid order is ready to process. Order: ${JSON.stringify({ number: order.orderNumber, guest: order.guestName, room: order.roomNumber, hotel: order.hotelName || "Residential / Direct", amount: order.totalAmount, method: order.paymentNote || "Stripe" })}. Include order number, guest name, room, payment method. Sign off "— Washwell".`,
    `Payment confirmed — ${order.orderNumber}\nGuest: ${order.guestName}, Room ${order.roomNumber}\n$${order.totalAmount} via ${order.paymentNote || "Stripe"}\n— Washwell`
  );
  await sendWhatsApp(TEAM.technician, msg);
  await sendWhatsApp(TEAM.manager, `Payment received — Order ${order.orderNumber} | $${order.totalAmount} | ${order.guestName}, Room ${order.roomNumber} | ${new Date().toLocaleTimeString()} — Washwell`);
}
// TRIGGER 2: Concierge requests Burq pickup
// → Concierge receives confirmation WhatsApp
export async function notifyPickupRequested(order, burqJob) {
  const msg = await composeWithAI(
    `Write a short WhatsApp confirmation under 70 words for a concierge at Washwell Laundry Co. No emojis. A Burq driver has been requested. Details: ${JSON.stringify({ order: order.orderNumber, guest: order.guestName, room: order.roomNumber, jobId: burqJob.burq_job_id, eta: burqJob.estimated_delivery_time })}. Sign off "— Washwell".`,
    `Driver requested — ${order.orderNumber}\nGuest: ${order.guestName}, Room ${order.roomNumber}\nETA: ${burqJob.estimated_delivery_time}\n— Washwell`
  );
  await sendWhatsApp(TEAM.concierge, msg);
}
// TRIGGER 3: Burq driver accepts the job
// → Concierge receives driver details
export async function notifyDriverAssigned(order, driver) {
  const msg = await composeWithAI(
    `Write a short WhatsApp message under 70 words for a concierge at Washwell Laundry Co. No emojis. A driver has been assigned. Details: ${JSON.stringify({ order: order.orderNumber, driver: driver.name, phone: driver.phone, vehicle: driver.vehicle, eta: driver.estimatedPickup })}. Sign off "— Washwell".`,
    `Driver assigned — ${order.orderNumber}\nDriver: ${driver.name} | ${driver.phone}\nETA: ${driver.estimatedPickup}\n— Washwell`
  );
  await sendWhatsApp(TEAM.concierge, msg);
}
// TRIGGER 4: Technician marks order completed
// → Manager receives sustainability summary + WhatsApp
export async function notifyOrderCompleted(order, metrics) {
  const msg = await composeWithAI(
    `Write a short WhatsApp order summary under 80 words for the Washwell Laundry Co. manager. No emojis. Order complete. Details: ${JSON.stringify({ order: order.orderNumber, guest: order.guestName, weight: order.totalWeightLbs, waterSaved: metrics.water_saved_gallons, energySaved: metrics.energy_saved_kwh })}. Include sustainability numbers. Sign off "— Washwell".`,
    `Order complete — ${order.orderNumber}\nGuest: ${order.guestName} | ${order.totalWeightLbs}lbs\nWater saved: ${metrics.water_saved_gallons}gal | Energy: ${metrics.energy_saved_kwh}kWh\n— Washwell`
  );
  await sendWhatsApp(TEAM.manager, msg);
}
