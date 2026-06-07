import { useState, useEffect } from "react";
import { PRICING_TIERS } from "../constants";

const STATUS_CONFIG = {
  pending:                { label: "Order Received",    step: 1 },
  paid_pending_technician:{ label: "Order Received",    step: 1 },
  picked_up:              { label: "Picked Up",          step: 2 },
  in_wash:                { label: "In Wash",            step: 3 },
  drying:                 { label: "Drying",             step: 4 },
  folding:                { label: "Folding",            step: 5 },
  out_for_delivery:       { label: "Out for Delivery",   step: 6 },
  delivered:              { label: "Delivered",          step: 7 },
};

const TOTAL_STEPS = 7;

export default function GuestLandingPage({ user, onNavigateToCheckout, onTrackDelivery }) {
  const isDirect = user.customerType === "direct";

  const [selectedTier, setSelectedTier] = useState("Standard Load");
  const [firstName, setFirstName]       = useState(user.firstName || "");
  const [lastName, setLastName]         = useState(user.lastName  || "");

  // Hotel guests use room number; direct customers use address + unit
  const [roomNumber, setRoomNumber]     = useState(user.roomNumber || "");
  const [pickupAddress, setPickupAddress] = useState(user.pickupAddress || "");
  const [unitNumber, setUnitNumber]     = useState(user.unitNumber || "");

  const [directOrderConfirmed, setDirectOrderConfirmed] = useState(null); // { orderNumber }
  const [directSubmitting, setDirectSubmitting] = useState(false);
  const [directError, setDirectError] = useState("");
  const [activeOrder, setActiveOrder]   = useState(null);
  const [sustainability, setSustainability] = useState({
    totalOrders: 0,
    waterSavedGallons: 0,
    energySavedKwh: 0,
    co2AvoidedLbs: 0,
  });

  // Fetch real active order
  useEffect(() => {
    async function fetchOrders() {
      try {
        const res = await fetch(`/api/guest/orders?clerkUserId=${user.id}`);
        if (!res.ok) return;
        const data = await res.json();
        const active = (data.orders || []).find(
          (o) => !["completed", "cancelled"].includes(o.status)
        );
        setActiveOrder(active || null);
      } catch {
        // no active order
      }
    }
    fetchOrders();
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, [user.id]);

  // Fetch sustainability totals
  useEffect(() => {
    async function fetchSustainability() {
      try {
        const res = await fetch("/api/sustainability/sync", { method: "GET" });
        if (!res.ok) return;
        const data = await res.json();
        if (data.totals) setSustainability(data.totals);
      } catch {
        // keep defaults
      }
    }
    fetchSustainability();
  }, []);

  const canCheckout = isDirect
    ? firstName.trim() && pickupAddress.trim()
    : firstName.trim() && roomNumber.trim();

  // Direct customers skip Stripe upfront — order is logged, payment collected after weigh-in
  const handleDirectPickup = async () => {
    if (!canCheckout) return;
    setDirectSubmitting(true);
    setDirectError("");
    try {
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName:     firstName.trim(),
          lastName:      lastName.trim(),
          roomNumber:    unitNumber.trim() || null,
          pickupAddress: pickupAddress.trim(),
          unitNumber:    unitNumber.trim() || null,
          tier:          selectedTier,
          paymentMethod: "pay_after_weigh",
          hotelId:       user.hotelId,
          clerkUserId:   user.clerkUserId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to place order");
      }
      const { orderNumber } = await res.json();
      setDirectOrderConfirmed({ orderNumber });
    } catch (err) {
      setDirectError(err.message || "Something went wrong. Please try again.");
    } finally {
      setDirectSubmitting(false);
    }
  };

  const handleRequestPickup = () => {
    if (!canCheckout) return;
    if (isDirect) {
      handleDirectPickup();
      return;
    }
    const tier = PRICING_TIERS[selectedTier];
    onNavigateToCheckout({
      firstName:      firstName.trim(),
      lastName:       lastName.trim(),
      roomNumber:     roomNumber.trim() || user.roomNumber,
      pickupAddress:  null,
      unitNumber:     null,
      tier:           selectedTier,
      stripeUrl:      tier.stripeUrl,
      estimatedTotal: tier.price,
      hotelId:        user.hotelId,
      clerkUserId:    user.clerkUserId,
      customerType:   user.customerType,
    });
  };

  const currentStatus = activeOrder ? STATUS_CONFIG[activeOrder.status] : null;
  const progressPct   = currentStatus ? (currentStatus.step / TOTAL_STEPS) * 100 : 0;

  return (
    <div className="min-h-screen bg-washwell-cream font-body">

      {/* Header */}
      <section className="px-6 py-12 md:py-16">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-8">
            <img src="/logo.png" alt="Washwell Laundry Co." className="h-24 w-auto" />
          </div>

          <h1 className="text-4xl md:text-5xl font-display font-bold text-washwell-black mb-3 tracking-tight">
            {firstName ? `Welcome back, ${firstName}` : "Welcome to Washwell"}
          </h1>

          {isDirect ? (
            <p className="text-lg text-washwell-gray-dark mb-2 font-medium">
              {pickupAddress
                ? <span>{pickupAddress}{unitNumber && <span> &middot; Unit {unitNumber}</span>}</span>
                : "Home Laundry Pickup"}
            </p>
          ) : (
            <p className="text-lg text-washwell-gray-dark mb-2 font-medium">
              {user.hotelName} {roomNumber && <span>&middot; Room {roomNumber}</span>}
            </p>
          )}

          <p className="text-sm text-washwell-gray uppercase tracking-widest font-semibold mb-10">
            Washwell Laundry Co.
          </p>

          {/* Name fields */}
          <div className="w-full max-w-lg mx-auto mb-6 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-washwell-gray uppercase tracking-widest mb-1 text-left">
                First Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Jane"
                className="w-full px-4 py-3 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green outline-none font-medium text-washwell-black bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-washwell-gray uppercase tracking-widest mb-1 text-left">
                Last Name
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Smith"
                className="w-full px-4 py-3 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green outline-none font-medium text-washwell-black bg-white"
              />
            </div>

            {/* Hotel guests: room number */}
            {!isDirect && (
              <div className="col-span-2">
                <label className="block text-xs font-bold text-washwell-gray uppercase tracking-widest mb-1 text-left">
                  Room Number <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  placeholder="e.g. 412"
                  className="w-full px-4 py-3 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green outline-none font-medium text-washwell-black bg-white"
                />
              </div>
            )}

            {/* Direct customers: address + unit */}
            {isDirect && (
              <>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-washwell-gray uppercase tracking-widest mb-1 text-left">
                    Pickup Address <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={pickupAddress}
                    onChange={(e) => setPickupAddress(e.target.value)}
                    placeholder="123 Main St, New York NY 10001"
                    className="w-full px-4 py-3 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green outline-none font-medium text-washwell-black bg-white"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-washwell-gray uppercase tracking-widest mb-1 text-left">
                    Unit / Apt # <span className="text-washwell-gray font-normal normal-case">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={unitNumber}
                    onChange={(e) => setUnitNumber(e.target.value)}
                    placeholder="e.g. 4B"
                    className="w-full px-4 py-3 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green outline-none font-medium text-washwell-black bg-white"
                  />
                </div>
              </>
            )}
          </div>

          {/* Service Tier Selector */}
          <div className="w-full max-w-lg mx-auto mb-8 text-left">
            <p className="text-xs font-bold text-washwell-gray uppercase tracking-widest mb-3 text-center">
              Select Service
            </p>
            <div className="space-y-2">
              {Object.entries(PRICING_TIERS).map(([name, tier]) => {
                const isSelected = selectedTier === name;
                return (
                  <button
                    key={name}
                    onClick={() => setSelectedTier(name)}
                    className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 transition-all duration-200 text-left ${
                      isSelected
                        ? "bg-washwell-green-pale border-washwell-green shadow-md"
                        : "bg-white border-washwell-gray-light hover:border-washwell-green/50 hover:bg-washwell-green-pale/40"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-display font-bold text-sm text-washwell-black">{name}</span>
                        {tier.recommended && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-washwell-green text-white rounded-full">
                            Popular
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-washwell-gray-dark truncate">{tier.tagline}</p>
                    </div>
                    <span className={`font-display font-bold text-lg flex-shrink-0 ${isSelected ? "text-washwell-green" : "text-washwell-gray-dark"}`}>
                      ${tier.price}
                    </span>
                    <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                      isSelected ? "border-washwell-green bg-washwell-green" : "border-washwell-gray-light"
                    }`}>
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Direct customer: order confirmed inline */}
          {isDirect && directOrderConfirmed ? (
            <div className="w-full max-w-lg mx-auto mt-2 p-6 bg-washwell-green-pale border-2 border-washwell-green rounded-2xl text-center">
              <div className="w-12 h-12 bg-washwell-green rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="font-display font-bold text-washwell-black text-lg mb-1">
                Pickup Requested — {directOrderConfirmed.orderNumber}
              </p>
              <p className="text-sm text-washwell-gray-dark">
                We'll pick up your laundry and send your payment link once we've weighed it.
              </p>
            </div>
          ) : (
            <>
              {isDirect && (
                <p className="text-xs text-washwell-gray-dark mb-4 max-w-sm mx-auto">
                  Your price is based on actual weight. Payment link sent after pickup.
                </p>
              )}
              {directError && (
                <p className="text-sm text-red-500 mb-3">{directError}</p>
              )}
              <button
                onClick={handleRequestPickup}
                disabled={!canCheckout || directSubmitting}
                className="w-full md:w-auto px-16 py-5 bg-washwell-green hover:bg-washwell-green-dark text-white font-display font-bold text-xl rounded-2xl shadow-xl transition-all duration-300 tracking-wide uppercase disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {directSubmitting ? "Requesting..." : "Request Pickup"}
              </button>
              {!isDirect && (
                <p className="mt-4 text-xs text-washwell-gray uppercase tracking-widest">
                  Secured by Stripe
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* Active Order */}
      {activeOrder && currentStatus && (
        <section className="bg-white px-6 py-16 border-t-2 border-b-2 border-washwell-gray-light">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-3 mb-4 px-6 py-2 bg-washwell-green-pale border-2 border-washwell-green rounded-full">
                <div className="w-2 h-2 bg-washwell-green rounded-full animate-pulse" />
                <span className="font-display text-sm font-bold text-washwell-green uppercase tracking-wider">
                  Active Order
                </span>
              </div>
              <h2 className="text-3xl font-display font-bold text-washwell-black mb-2">
                Order {activeOrder.orderNumber}
              </h2>
            </div>

            {/* Progress bar */}
            <div className="mb-12">
              <div className="relative h-2 bg-washwell-gray-light rounded-full overflow-hidden">
                <div
                  className="absolute h-full bg-washwell-green transition-all duration-1000 ease-out rounded-full"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <div className="flex justify-between items-center mt-3">
                <span className="text-sm font-display font-bold text-washwell-green">
                  {Math.round(progressPct)}%
                </span>
                <span className="text-sm font-semibold text-washwell-gray-dark">
                  {currentStatus.step} of {TOTAL_STEPS}
                </span>
              </div>
            </div>

            {/* Steps */}
            <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
              {Object.entries(STATUS_CONFIG)
                .filter(([, c], i, arr) => arr.findIndex(([, x]) => x.step === c.step) === i)
                .sort(([, a], [, b]) => a.step - b.step)
                .map(([key, config]) => {
                const isActive    = config.step === currentStatus.step;
                const isCompleted = config.step < currentStatus.step;
                return (
                  <div key={key} className={`flex flex-col items-center gap-2 transition-all duration-300 ${isActive ? "scale-105" : ""}`}>
                    <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
                      isCompleted ? "bg-washwell-green border-washwell-green" :
                      isActive    ? "bg-washwell-green border-washwell-green" :
                      "bg-white border-washwell-gray-light"
                    }`}>
                      {isCompleted ? (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className={`text-xs font-bold ${isActive ? "text-white" : "text-washwell-gray"}`}>
                          {config.step}
                        </span>
                      )}
                    </div>
                    <span className={`text-xs font-semibold text-center leading-tight ${isActive ? "text-washwell-black" : "text-washwell-gray"}`}>
                      {config.label}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="mt-12 text-center p-6 bg-washwell-cream rounded-2xl border-2 border-washwell-green">
              <p className="text-lg font-semibold text-washwell-black">
                Your laundry is currently{" "}
                <span className="text-washwell-green font-bold">{currentStatus.label}</span>
              </p>
              {activeOrder.status === "out_for_delivery" && (
                <button
                  onClick={() => onTrackDelivery(activeOrder.id)}
                  className="mt-4 inline-flex items-center gap-2 px-8 py-3 bg-washwell-black hover:opacity-90 text-white font-display font-bold rounded-xl shadow-lg transition-all uppercase tracking-wide text-sm"
                >
                  Track Delivery
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Sustainability */}
      <section className="bg-washwell-black px-6 py-16">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-3">
              Your Environmental Impact
            </h2>
            <p className="text-washwell-gray">
              {sustainability.totalOrders} orders completed
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { metric: "H₂O", value: sustainability.waterSavedGallons, label: "Gallons Saved", sub: `≈ ${Math.round((sustainability.waterSavedGallons || 0) / 17.2)} showers` },
              { metric: "kWh", value: sustainability.energySavedKwh,    label: "Energy Saved",  sub: `≈ ${Math.round((sustainability.energySavedKwh || 0) / 0.012)} phone charges` },
              { metric: "CO₂", value: sustainability.co2AvoidedLbs,     label: "Lbs Avoided",   sub: "Making the planet greener" },
            ].map(({ metric, value, label, sub }) => (
              <div key={label} className="bg-white/5 border border-washwell-green/20 rounded-2xl p-8 hover:border-washwell-green/60 transition-all duration-300">
                <div className="text-xs font-bold text-washwell-green uppercase tracking-widest mb-3">{metric}</div>
                <div className="font-display text-5xl font-bold text-white mb-1">{value ?? 0}</div>
                <div className="text-sm text-washwell-gray uppercase tracking-wider font-semibold mb-2">{label}</div>
                <div className="text-xs text-washwell-gray/60">{sub}</div>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-washwell-green text-sm font-semibold uppercase tracking-widest">
              It's not laundry — it's a lifestyle
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
