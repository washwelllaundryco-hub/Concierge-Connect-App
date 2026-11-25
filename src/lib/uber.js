// Uber Direct API — both legs: pickup (hotel→Washwell) and return (Washwell→hotel)
const UBER_API_BASE = "https://api.uber.com/v1/customers";
const CUSTOMER_ID   = process.env.UBER_CUSTOMER_ID || "068d4564-9f41-46c9-839a-ecf385f6fa17";

const WASHWELL = {
  name: "Washwell Laundry Co.",
  address: { street_address: ["222 The Esplanade, Unit 7"], city: "Toronto", state: "ON", zip_code: "M5A 4M8", country: "CA" },
  phone_number: "+14165550100",
};

let _tok = null, _exp = 0;
export async function getUberToken() {
  if (_tok && Date.now() < _exp - 30000) return _tok;
  const clientId = process.env.UBER_CLIENT_ID;
  const clientSecret = process.env.UBER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("UBER_CLIENT_ID / UBER_CLIENT_SECRET not set");
  const r = await fetch("https://auth.uber.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: "client_credentials", scope: "eats.deliveries" }),
  });
  if (!r.ok) throw new Error("Uber auth failed: " + r.status);
  const { access_token, expires_in } = await r.json();
  _tok = access_token; _exp = Date.now() + expires_in * 1000;
  return _tok;
}

// order: { id, order_number, guest_name, phone, room, hotel_name, hotel_address (JSONB or string) }
// direction: "pickup" = hotel→Washwell, "return" = Washwell→hotel
// scheduledAt: ISO string for scheduled pickups (Uber holds the driver until then)
export async function dispatchUber(order, { direction = "return", scheduledAt = null } = {}) {
  if (!process.env.UBER_CLIENT_ID) throw new Error("Uber not configured");
  const token = await getUberToken();

  // Parse hotel address — stored as JSONB object or plain string
  let hotelAddr;
  if (order.hotel_address && typeof order.hotel_address === "object") {
    hotelAddr = order.hotel_address;
  } else if (typeof order.hotel_address === "string") {
    // Plain string fallback — wrap in Uber format
    hotelAddr = { street_address: [order.hotel_address], city: "Toronto", state: "ON", zip_code: "", country: "CA" };
  } else {
    throw new Error("Hotel address not configured for this order. Add address to hotel record.");
  }

  const hotelContact = {
    name: order.hotel_name || "Hotel",
    address: hotelAddr,
    phone_number: order.phone || "+14165550100",
    notes: order.room ? "Room " + order.room : ("Order " + order.order_number),
  };

  const pickup  = direction === "pickup"  ? hotelContact : WASHWELL;
  const dropoff = direction === "pickup"  ? { ...WASHWELL, notes: "Order " + order.order_number } : { ...hotelContact };

  const body = {
    pickup,
    dropoff: { ...dropoff, requires_dropoff_photo: true },
    manifest: {
      description: "Laundry – " + order.order_number,
      total_value: 0,
      items: [{ name: "Laundry order", quantity: 1, size: "medium", price: 0 }],
    },
    external_delivery_id: "ww-" + order.id + "-" + direction + "-" + Date.now(),
    external_store_id: String(order.id),
  };

  if (scheduledAt) {
    // Tell Uber driver not to arrive before this time
    body.pickup_ready_dt = new Date(scheduledAt).toISOString();
  }

  const r = await fetch(UBER_API_BASE + "/" + CUSTOMER_ID + "/deliveries", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const err = await r.text();
    throw new Error("Uber " + direction + " failed: " + r.status + " " + err);
  }
  return r.json();
}

export async function getDelivery(deliveryId) {
  const token = await getUberToken();
  const r = await fetch(UBER_API_BASE + "/" + CUSTOMER_ID + "/deliveries/" + deliveryId, {
    headers: { Authorization: "Bearer " + token },
  });
  if (!r.ok) throw new Error("Uber getDelivery: " + r.status);
  return r.json();
}
