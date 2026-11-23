// Uber Direct API helper
// OAuth2 client_credentials → delivery creation

const UBER_AUTH_URL = "https://auth.uber.com/oauth/v2/token";
const UBER_API_BASE = "https://api.uber.com/v1/customers";
const CUSTOMER_ID   = process.env.UBER_CUSTOMER_ID || "068d4564-9f41-46c9-839a-ecf385f6fa17";

const WASHWELL_PICKUP = {
  name: "Washwell Laundry Co.",
  address: {
    street_address: ["222 The Esplanade, Unit 7"],
    city: "Toronto",
    state: "ON",
    zip_code: "M5A 4M8",
    country: "CA",
  },
};

let _tokenCache = { token: null, expiresAt: 0 };

export async function getUberToken() {
  if (_tokenCache.token && Date.now() < _tokenCache.expiresAt - 30000) {
    return _tokenCache.token;
  }
  const clientId     = process.env.UBER_CLIENT_ID;
  const clientSecret = process.env.UBER_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("UBER_CLIENT_ID / UBER_CLIENT_SECRET not set");

  const res = await fetch(UBER_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "eats.deliveries",
    }),
  });
  if (!res.ok) throw new Error("Uber auth failed: " + res.status);
  const { access_token, expires_in } = await res.json();
  _tokenCache = { token: access_token, expiresAt: Date.now() + expires_in * 1000 };
  return access_token;
}

export async function createDelivery({ dropoff }) {
  const token = await getUberToken();
  const body = {
    pickup: WASHWELL_PICKUP,
    dropoff,
    manifest: { reference: "washwell-laundry" },
  };
  const res = await fetch(`${UBER_API_BASE}/${CUSTOMER_ID}/deliveries`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error("Uber delivery error: " + res.status + " " + err);
  }
  return res.json();
}

export async function getDelivery(deliveryId) {
  const token = await getUberToken();
  const res = await fetch(`${UBER_API_BASE}/${CUSTOMER_ID}/deliveries/${deliveryId}`, {
    headers: { Authorization: "Bearer " + token },
  });
  if (!res.ok) throw new Error("Uber getDelivery error: " + res.status);
  return res.json();
}
