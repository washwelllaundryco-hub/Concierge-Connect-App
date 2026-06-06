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

// Maximum weight (lbs) included in each tier
export const TIER_MAX_LBS = {
  "Essential Load":  15,
  "Standard Load":   30,
  "Premium Load":    50,
  "Executive Load":  75,
  "Bulk Service":    Infinity,
};

// Return the correct tier name for a given weight
export function getCorrectTier(lbs) {
  if (lbs <= 15) return "Essential Load";
  if (lbs <= 30) return "Standard Load";
  if (lbs <= 50) return "Premium Load";
  if (lbs <= 75) return "Executive Load";
  return "Bulk Service";
}
