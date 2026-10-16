// Hotel / Concierge tier pricing (flat rate, weight-based tiers)
export const PRICING_TIERS = {
  "Essential Load": {
    tagline: "Wash & fold for loads up to 15 lbs",
    price: "68.00",
    maxLbs: 15,
    stripeUrl: "https://buy.stripe.com/6oU6oI3KJ2lu0Zw3Egc3m0m",
  },
  "Standard Load": {
    tagline: "Our most popular everyday service, 16–30 lbs",
    price: "88.00",
    maxLbs: 30,
    stripeUrl: "https://buy.stripe.com/28EfZi9534tCgYu8YAc3m0n",
    recommended: true,
  },
  "Premium Load": {
    tagline: "Delicate care & premium detergents, 31–50 lbs",
    price: "128.00",
    maxLbs: 50,
    stripeUrl: "https://buy.stripe.com/4gM28s1CB4tCdMicaMc3m0o",
  },
  "Executive Load": {
    tagline: "Priority handling with same-day return, 51–75 lbs",
    price: "188.00",
    maxLbs: 75,
    stripeUrl: "https://buy.stripe.com/dRm3cwftrbW4dMi5Moc3m0p",
  },
  "Bulk Service": {
    tagline: "Large loads handled with care, 76–100 lbs",
    price: "245.00",
    maxLbs: 100,
    stripeUrl: "https://buy.stripe.com/cNibJ280Z2lu9w2deQc3m0q",
  },
};

// Residential pricing (per-lb, minimum $49 for ≤15 lbs)
export const RESIDENTIAL_PRICING = {
  "Regular Load": {
    tagline: "Everyday clothes — wash & fold",
    ratePerLb: 2.75,
    flatRateUnder15: 49.00,
    description: "Shirts, pants, underwear, socks, casual wear",
  },
  "Mixed Bag": {
    tagline: "Mix of clothing types",
    ratePerLb: 2.85,
    flatRateUnder15: 49.00,
    description: "Combination of clothing and light linens",
  },
  "Towels & Sheets": {
    tagline: "Towels, sheets, and bedding",
    ratePerLb: 3.00,
    flatRateUnder15: 49.00,
    description: "Bath towels, bed sheets, pillowcases, duvet covers",
  },
};

// Calculate the price for a residential order given service type and weight
export function calcResidentialPrice(serviceType, weightLbs) {
  const pricing = RESIDENTIAL_PRICING[serviceType] || RESIDENTIAL_PRICING["Regular Load"];
  if (weightLbs <= 15) return pricing.flatRateUnder15;
  return parseFloat((weightLbs * pricing.ratePerLb).toFixed(2));
}

// Calculate the price for a hotel order given actual weight (finds correct tier)
export function calcHotelPrice(weightLbs) {
  const tiers = Object.entries(PRICING_TIERS);
  for (const [name, tier] of tiers) {
    if (weightLbs <= tier.maxLbs) return { tierName: name, price: parseFloat(tier.price) };
  }
  const [name, last] = tiers[tiers.length - 1];
  return { tierName: name, price: parseFloat(last.price) };
}
