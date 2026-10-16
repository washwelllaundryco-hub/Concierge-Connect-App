// WhatsApp Notification Service — Twilio
// Sends WhatsApp messages to technician, concierge, and manager.
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

export async function sendWhatsApp(to, body) {
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

// TRIGGER 1: Order placed (any payment method) → Technician
export async function notifyNewOrderPickup(order) {
  const msg = `New order ready for pickup — ${order.orderNumber}\nGuest: ${order.guestName}\nRoom: ${order.roomNumber || "N/A"}\nHotel: ${order.hotelName || "Residential"}\nPayment: ${order.paymentNote || order.paymentMethod}\n— Washwell`;
  try {
    await sendWhatsApp(TEAM.technician, msg);
  } catch (e) {
    console.error("WhatsApp technician notify failed:", e.message);
  }
}

// TRIGGER 2: Payment confirmed (Stripe webhook) → Technician + Manager
export async function notifyPaymentConfirmed(order) {
  const techMsg = `Payment received — ready to process\nOrder: ${order.orderNumber}\nGuest: ${order.guestName}\nRoom: ${order.roomNumber || "N/A"}\nHotel: ${order.hotelName || "Residential"}\nAmount: $${order.totalAmount}\nPayment: ${order.paymentNote || "Stripe"}\n— Washwell`;
  const mgrMsg = `Payment confirmed — ${order.orderNumber} | $${order.totalAmount} | ${order.guestName}, Room ${order.roomNumber || "N/A"} | ${new Date().toLocaleTimeString()} — Washwell`;
  try { await sendWhatsApp(TEAM.technician, techMsg); } catch (e) { console.error("WhatsApp tech:", e.message); }
  try { await sendWhatsApp(TEAM.manager, mgrMsg); } catch (e) { console.error("WhatsApp mgr:", e.message); }
}

// TRIGGER 3: Order completed → Manager
export async function notifyOrderCompleted(order, metrics) {
  const msg = `Order complete — ${order.orderNumber}\nGuest: ${order.guestName}\nWeight: ${order.totalWeightLbs} lbs\nWater saved: ${metrics?.water_saved_gallons ?? "N/A"} gal\nEnergy saved: ${metrics?.energy_saved_kwh ?? "N/A"} kWh\n— Washwell`;
  try { await sendWhatsApp(TEAM.manager, msg); } catch (e) { console.error("WhatsApp mgr complete:", e.message); }
}

// TRIGGER 4: Concierge pickup requested → Concierge
export async function notifyPickupRequested(order, burqJob) {
  const msg = `Burq driver requested\nOrder: ${order.orderNumber}\nGuest: ${order.guestName}, Room ${order.roomNumber}\nJob ID: ${burqJob?.burq_job_id || "N/A"}\nETA: ${burqJob?.estimated_delivery_time || "TBD"}\n— Washwell`;
  try { await sendWhatsApp(TEAM.concierge, msg); } catch (e) { console.error("WhatsApp concierge:", e.message); }
}

// TRIGGER 5: Driver assigned → Concierge
export async function notifyDriverAssigned(order, driver) {
  const msg = `Driver assigned — ${order.orderNumber}\nDriver: ${driver?.name}\nPhone: ${driver?.phone}\nVehicle: ${driver?.vehicle}\nPickup ETA: ${driver?.estimatedPickup}\n— Washwell`;
  try { await sendWhatsApp(TEAM.concierge, msg); } catch (e) { console.error("WhatsApp concierge driver:", e.message); }
}
