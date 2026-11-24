// SMS only — Twilio +15063154560 is SMS/MMS/Voice. Never use whatsapp: prefix.
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN   = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_FROM         = process.env.TWILIO_WHATSAPP_NUMBER || "+15063154560";
const TECH_PHONE      = (process.env.WHATSAPP_TECHNICIAN || "").replace(/^whatsapp:/i, "");
const CONCIERGE_PHONE = (process.env.WHATSAPP_CONCIERGE  || "").replace(/^whatsapp:/i, "");
const MANAGER_PHONE   = (process.env.WHATSAPP_MANAGER    || "").replace(/^whatsapp:/i, "");

function toE164(raw) {
  if (!raw) return null;
  let n = String(raw).replace(/^whatsapp:/i, "").trim().replace(/[\s\-().]/g, "");
  if (n.startsWith("+")) return n;                      // already E.164
  if (/^1\d{10}$/.test(n)) return "+" + n;             // 11-digit North American
  if (/^\d{10}$/.test(n)) return "+1" + n;             // 10-digit, assume Canada/US
  return "+" + n;                                       // best-effort
}

export async function sendSMS(to, body) {
  if (!TWILIO_ACCOUNT_SID) { console.error("SMS FAILED: TWILIO_ACCOUNT_SID is not set"); return null; }
  if (!TWILIO_AUTH_TOKEN)  { console.error("SMS FAILED: TWILIO_AUTH_TOKEN is not set"); return null; }
  if (!to) { console.error("SMS FAILED: no recipient phone number"); return null; }
  const cleanTo = toE164(to);
  if (!cleanTo || !cleanTo.startsWith("+")) { console.error("SMS FAILED: not E.164 format: " + to); return null; }
  console.log("SMS sending to:", cleanTo, "from:", TWILIO_FROM, "SID prefix:", TWILIO_ACCOUNT_SID.slice(0,8));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const res = await fetch("https://api.twilio.com/2010-04-01/Accounts/" + TWILIO_ACCOUNT_SID + "/Messages.json", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "Authorization": "Basic " + Buffer.from(TWILIO_ACCOUNT_SID + ":" + TWILIO_AUTH_TOKEN).toString("base64") },
    body: new URLSearchParams({ To: cleanTo, From: TWILIO_FROM, Body: body }).toString(),
    signal: controller.signal,
  });
  clearTimeout(timeout);
  const r = await res.json();
  if (!res.ok) { console.error("SMS FAILED Twilio error:", r.message, "code:", r.code); throw new Error("Twilio: " + r.message); }
  console.log("SMS sent OK, SID:", r.sid);
  return r;
}

export async function notifyNewOrder({ orderNumber, guestName, roomNumber, hotelName, scheduledPickupAt }) {
  if (!TECH_PHONE) return;
  const when = scheduledPickupAt ? "Scheduled: " + new Date(scheduledPickupAt).toLocaleString("en-CA", { timeZone: "America/Toronto", dateStyle: "short", timeStyle: "short" }) : "ASAP pickup";
  const msg = ["New Washwell order: " + orderNumber, "Guest: " + guestName, roomNumber ? "Room: " + roomNumber : null, "Hotel: " + (hotelName || "Residential"), when, "— Washwell"].filter(Boolean).join("\n");
  await sendSMS(TECH_PHONE, msg).catch(e => console.error("notifyNewOrder:", e.message));
  if (MANAGER_PHONE) await sendSMS(MANAGER_PHONE, msg).catch(() => {});
}

export async function notifyCustomerPaymentRequest(phone, firstName, { orderNumber, weightLbs, tier, total, deliveryFee, checkoutUrl }) {
  if (!phone) return;
  const msg = ["Hi " + (firstName || "there") + ", your Washwell laundry has been weighed!", "Order: " + orderNumber, "Weight: " + weightLbs + " lbs — " + tier, "Total: $" + total + " CAD (delivery included)", "Complete payment here: " + checkoutUrl, "— Washwell Laundry Co."].join("\n");
  await sendSMS(phone, msg);
}

export async function notifyPaymentConfirmed({ orderNumber, guestName, roomNumber, hotelName, totalAmount }) {
  if (!TECH_PHONE) return;
  const msg = ["Payment received: " + orderNumber, "Guest: " + guestName, roomNumber ? "Room: " + roomNumber : null, "Hotel: " + (hotelName || "Residential"), totalAmount ? "Amount: $" + totalAmount + " CAD" : null, "Start washing! — Washwell"].filter(Boolean).join("\n");
  await sendSMS(TECH_PHONE, msg).catch(e => console.error("notifyPaymentConfirmed:", e.message));
  if (MANAGER_PHONE) await sendSMS(MANAGER_PHONE, msg).catch(() => {});
}

export async function notifyPickupRequested(order, deliveryInfo) {
  if (!CONCIERGE_PHONE) return;
  const msg = ["Washwell driver dispatched: " + order.orderNumber, "Guest: " + order.guestName, order.roomNumber ? "Room: " + order.roomNumber : null, deliveryInfo?.estimated_delivery_time ? "ETA: " + new Date(deliveryInfo.estimated_delivery_time).toLocaleTimeString("en-CA", { timeStyle: "short", timeZone: "America/Toronto" }) : null, "— Washwell"].filter(Boolean).join("\n");
  await sendSMS(CONCIERGE_PHONE, msg).catch(() => {});
}

export async function notifyDriverAssigned(order, driver) {
  if (!CONCIERGE_PHONE) return;
  const v = typeof driver.vehicle === "object" ? [driver.vehicle.make, driver.vehicle.model, driver.vehicle.color].filter(Boolean).join(" ") : (driver.vehicle || "");
  const msg = ["Driver assigned: " + order.orderNumber, "Driver: " + (driver.name || "En route"), driver.phone ? "Phone: " + driver.phone : null, v ? "Vehicle: " + v : null, "— Washwell"].filter(Boolean).join("\n");
  await sendSMS(CONCIERGE_PHONE, msg).catch(() => {});
}

export async function notifyOrderCompleted(order, metrics) {
  if (!MANAGER_PHONE) return;
  const msg = ["Order complete: " + order.orderNumber, "Guest: " + order.guestName, order.totalWeightLbs ? "Weight: " + order.totalWeightLbs + " lbs" : null, metrics?.water_saved_gallons ? "Water saved: " + metrics.water_saved_gallons + " gal" : null, "— Washwell"].filter(Boolean).join("\n");
  await sendSMS(MANAGER_PHONE, msg).catch(() => {});
}
