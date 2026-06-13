export const PRICING_TIERS = {
  "Essential Load": {
    tagline: "Wash & fold for loads less than 15 lbs",
    price: "68.00",
    stripeUrl: "https://buy.stripe.com/6oU6oI3KJ2lu0Zw3Egc3m0m",
  },
  "Standard Load": {
    tagline: "Our most popular everyday service, 16 – 30 lbs",
    price: "88.00",
    stripeUrl: "https://buy.stripe.com/28EfZi9534tCgYu8YAc3m0n",
    recommended: true,
  },
  "Premium Load": {
    tagline: "Delicate care & premium detergents, 31 – 50 lbs",
    price: "128.00",
    stripeUrl: "https://buy.stripe.com/4gM28s1CB4tCdMicaMc3m0o",
  },
  "Executive Load": {
    tagline: "Priority handling with same-day return, 51 – 75 lbs",
    price: "188.00",
    stripeUrl: "https://buy.stripe.com/dRm3cwftrbW4dMi5Moc3m0p",
  },
  "Bulk Service": {
    tagline: "Large loads handled with care, 76 – 100 lbs",
    price: "245.00",
    stripeUrl: "https://buy.stripe.com/cNibJ280Z2lu9w2deQc3m0q",
  },
};

export const TIER_MAX_LBS = {
  "Essential Load": 15,
  "Standard Load":  30,
  "Premium Load":   50,
  "Executive Load": 75,
  "Bulk Service":   Infinity,
};

export function getCorrectTier(lbs) {
  if (lbs <= 15) return "Essential Load";
  if (lbs <= 30) return "Standard Load";
  if (lbs <= 50) return "Premium Load";
  if (lbs <= 75) return "Executive Load";
  return "Bulk Service";
}

// ── Residential (direct) pricing ─────────────────────────────────────────────
export const DIRECT_PRICING = {
  rateRegular:  2.75,   // per lb — regular clothes
  rateMixed:    3.00,   // per lb — towels/sheets/mixed
  deliveryFee:  15.00,
  taxRate:      0.13,   // 13%
};

export const FLAT_RATE_MAX_LBS = 15;
export const FLAT_RATE_PRICE = 49.00;

export function calcDirectTotal(lbs, laundryType) {
  const rate      = laundryType === "mixed" ? DIRECT_PRICING.rateMixed : DIRECT_PRICING.rateRegular;
  const flatRate  = lbs <= FLAT_RATE_MAX_LBS;
  const laundry   = flatRate ? FLAT_RATE_PRICE : parseFloat((lbs * rate).toFixed(2));
  const delivery  = DIRECT_PRICING.deliveryFee;
  const subtotal  = laundry + delivery;
  const tax       = parseFloat((subtotal * DIRECT_PRICING.taxRate).toFixed(2));
  const total     = parseFloat((subtotal + tax).toFixed(2));
  return { laundry, delivery, tax, total, rate, flatRate };
}
