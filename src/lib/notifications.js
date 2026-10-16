// SMS Notification Service — Twilio
// Sends SMS messages to technician, concierge, and manager.
const TWILIO_CONFIG = {
  accountSid: process.env.TWILIO_ACCOUNT_SID,
  authToken:  process.env.TWILIO_AUTH_TOKEN,
  from:       process.env.TWILIO_WHATSAPP_NUMBER,  // your SMS number e.g. +15063154560
  baseUrl:    "https://api.twilio.com/2010-04-01",
};
const TEAM = {
  technician: process.env.WHATSAPP_TECHNICIAN,  // technician's phone e.g. +12125551234
  concierge:  process.env.WHATSAPP_CONCIERGE,
  manager:    process.env.WHATSAPP_MANAGER,
};

export async function sendSMS(to, body) {
  if (!to) { console.warn("sendSMS: no recipient"); return; }
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

// Keep sendWhatsApp as an alias so any other files importing it still work
export const sendWhatsApp = sendSMS;

// TRIGGER 1: Order placed → Technician
export async function notifyNewOrderPickup(order) {
  const msg = `New laundry order — ${order.orderNumber}\nGuest: ${order.guestName}\nRoom: ${order.roomNumber || "N/A"}\nHotel: ${order.hotelName || "Residential"}\nPayment: ${order.paymentNote || order.paymentMethod}\n— Washwell`;
  try { await sendSMS(TEAM.technician, msg); }
  catch (e) { console.error("SMS technician failed:", e.message); }
}

// TRIGGER 2: Payment confirmed (Stripe webhook) → Technician + Manager
export async function notifyPaymentConfirmed(order) {
  const techMsg = `Payment received — ${order.orderNumber}\nGuest: ${order.guestName}, Room ${order.roomNumber || "N/A"}\nAmount: $${order.totalAmount} (${order.paymentNote || "Stripe"})\n— Washwell`;
  const mgrMsg  = `Payment confirmed — ${order.orderNumber} | $${order.totalAmount} | ${order.guestName} | ${new Date().toLocaleTimeString()} — Washwell`;
  try { await sendSMS(TEAM.technician, techMsg); } catch (e) { console.error("SMS tech:", e.message); }
  try { await sendSMS(TEAM.manager,    mgrMsg);  } catch (e) { console.error("SMS mgr:",  e.message); }
}

// TRIGGER 3: Order completed → Manager
export async function notifyOrderCompleted(order, metrics) {
  const msg = `Order complete — ${order.orderNumber}\nGuest: ${order.guestName}\nWeight: ${order.totalWeightLbs} lbs\nWater saved: ${metrics?.water_saved_gallons ?? "N/A"} gal\n— Washwell`;
  try { await sendSMS(TEAM.manager, msg); } catch (e) { console.error("SMS mgr complete:", e.message); }
}

// TRIGGER 4: Pickup requested → Concierge
export async function notifyPickupRequested(order, burqJob) {
  const msg = `Burq driver requested — ${order.orderNumber}\nGuest: ${order.guestName}, Room ${order.roomNumber}\nETA: ${burqJob?.estimated_delivery_time || "TBD"}\n— Washwell`;
  try { await sendSMS(TEAM.concierge, msg); } catch (e) { console.error("SMS concierge:", e.message); }
}

// TRIGGER 5: Driver assigned → Concierge
export async function notifyDriverAssigned(order, driver) {
  const msg = `Driver assigned — ${order.orderNumber}\nDriver: ${driver?.name} | ${driver?.phone}\nPickup ETA: ${driver?.estimatedPickup}\n— Washwell`;
  try { await sendSMS(TEAM.concierge, msg); } catch (e) { console.error("SMS concierge driver:", e.message); }
}
