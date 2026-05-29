import { useState, useEffect } from "react";
import { PRICING_TIERS } from "../constants";

const STATUS_CONFIG = {
  pending: { label: "Order Received", icon: "📝", step: 1 },
  picked_up: { label: "Picked Up", icon: "🚗", step: 2 },
  in_wash: { label: "In Wash", icon: "💧", step: 3 },
  drying: { label: "Drying", icon: "🌬️", step: 4 },
  folding: { label: "Folding", icon: "👕", step: 5 },
  out_for_delivery: { label: "Out for Delivery", icon: "🚚", step: 6 },
  delivered: { label: "Delivered", icon: "✓", step: 7 },
};

const TOTAL_STEPS = 7;

export default function GuestLandingPage({ user, onNavigateToCheckout, onTrackDelivery }) {
  const [selectedTier, setSelectedTier] = useState("Standard Load");
  const [activeOrder, setActiveOrder] = useState(null);
  const [sustainability, setSustainability] = useState({
    totalOrders: 7,
    waterSavedGallons: 147,
    energySavedKwh: 6.3,
    co2AvoidedLbs: 5.8,
  });

  useEffect(() => {
    setTimeout(() => {
      setActiveOrder({
        id: "ord-20241",
        orderNumber: "WW-20241",
        status: "out_for_delivery",
        estimatedDelivery: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });
    }, 500);
  }, []);

  useEffect(() => {
    let ws;
    try {
      ws = new WebSocket(
        import.meta.env.VITE_WEBSOCKET_URL
          ? `${import.meta.env.VITE_WEBSOCKET_URL}/sustainability`
          : "ws://localhost:3001/sustainability"
      );
      ws.onmessage = (event) => {
        const update = JSON.parse(event.data);
        if (update.type === "sustainability_update") setSustainability(update.data);
      };
    } catch {
      // WebSocket unavailable in dev/static preview — fall through to mock data
    }
    return () => ws?.close();
  }, []);

  const handleRequestPickup = () => {
    const tier = PRICING_TIERS[selectedTier];
    onNavigateToCheckout({
      orderId: `ord-${Date.now()}`,
      orderNumber: `WW-${Date.now()}`,
      guestName: `${user.firstName} ${user.lastName}`,
      roomNumber: user.roomNumber,
      tier: selectedTier,
      stripeUrl: tier.stripeUrl,
      estimatedTotal: tier.price,
    });
  };

  const currentStatus = activeOrder ? STATUS_CONFIG[activeOrder.status] : null;
  const progressPct = currentStatus ? (currentStatus.step / TOTAL_STEPS) * 100 : 0;

  const etaMinutes = activeOrder
    ? Math.max(0, Math.floor((new Date(activeOrder.estimatedDelivery) - Date.now()) / 60000))
    : 0;
  const etaHours = Math.floor(etaMinutes / 60);
  const etaMins = etaMinutes % 60;

  return (
    <div className="min-h-screen bg-washwell-cream font-body">
      {/* Header / Pickup CTA */}
      <section className="px-6 py-12 md:py-16">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-8">
            <img src="/logo.png" alt="Washwell Laundry Co." className="h-24 w-auto" />
          </div>

          <h1 className="text-4xl md:text-5xl font-display font-bold text-washwell-black mb-3 tracking-tight">
            Welcome back, {user.firstName}
          </h1>
          <p className="text-lg text-washwell-gray-dark mb-2 font-medium">
            {user.hotelName} • Room {user.roomNumber}
          </p>
          <p className="text-sm text-washwell-gray uppercase tracking-widest font-semibold mb-10">
            Washwell Laundry Co.
          </p>

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
                    <span className="text-2xl flex-shrink-0">{tier.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-display font-bold text-sm ${isSelected ? "text-washwell-black" : "text-washwell-black"}`}>
                          {name}
                        </span>
                        {tier.recommended && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-washwell-green text-white rounded-full">
                            Popular
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-washwell-gray-dark truncate">{tier.tagline}</p>
                    </div>
                    <span className={`font-mono font-bold text-lg flex-shrink-0 ${isSelected ? "text-washwell-green" : "text-washwell-gray-dark"}`}>
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

          <button
            onClick={handleRequestPickup}
            className="group relative w-full md:w-auto px-16 py-6 bg-washwell-green hover:bg-washwell-green-dark text-white font-display font-bold text-2xl rounded-2xl shadow-2xl transition-all duration-300 hover:scale-105"
          >
            <span className="relative z-10 flex items-center justify-center gap-4">
              <span className="text-3xl">🧺</span>
              Request Pickup
            </span>
            <div className="absolute inset-0 rounded-2xl bg-washwell-green opacity-0 group-hover:opacity-20 blur-xl transition-opacity duration-300" />
          </button>

          <p className="mt-6 text-sm text-washwell-gray-dark">
            Payment processed securely via Stripe
          </p>
        </div>
      </section>

      {/* Active Order + Progress */}
      {activeOrder && currentStatus && (
        <section className="bg-white px-6 py-16 border-t-2 border-b-2 border-washwell-gray-light">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-12">
              <div className="inline-flex items-center gap-3 mb-4 px-6 py-2 bg-washwell-green-pale border-2 border-washwell-green rounded-full">
                <div className="w-2 h-2 bg-washwell-green rounded-full animate-pulse" />
                <span className="font-mono text-sm font-bold text-washwell-green uppercase tracking-wider">
                  Active Order
                </span>
              </div>
              <h2 className="text-3xl font-display font-bold text-washwell-black mb-2">
                Order {activeOrder.orderNumber}
              </h2>
              <p className="text-washwell-gray-dark">
                Estimated delivery:{" "}
                <span className="font-semibold">
                  {etaHours}h {etaMins}m
                </span>
              </p>
            </div>

            {/* Progress bar */}
            <div className="mb-12">
              <div className="relative h-3 bg-washwell-gray-light rounded-full overflow-hidden">
                <div
                  className="absolute h-full bg-gradient-to-r from-washwell-green to-washwell-green-light transition-all duration-1000 ease-out rounded-full"
                  style={{ width: `${progressPct}%` }}
                >
                  <div className="absolute inset-0 bg-white/20 animate-pulse" />
                </div>
              </div>
              <div className="flex justify-between items-center mt-3">
                <span className="text-sm font-mono font-bold text-washwell-green">
                  {Math.round(progressPct)}%
                </span>
                <span className="text-sm font-semibold text-washwell-gray-dark">
                  {currentStatus.step} of {TOTAL_STEPS} steps
                </span>
              </div>
            </div>

            {/* Step icons */}
            <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
              {Object.entries(STATUS_CONFIG).map(([key, config]) => {
                const isActive = config.step === currentStatus.step;
                const isCompleted = config.step < currentStatus.step;
                return (
                  <div
                    key={key}
                    className={`relative flex flex-col items-center transition-all duration-300 ${isActive ? "scale-110" : ""}`}
                  >
                    <div
                      className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl mb-2 transition-all duration-300 ${
                        isCompleted || isActive
                          ? "bg-washwell-green shadow-lg border-2 border-washwell-green"
                          : "bg-white border-2 border-washwell-gray-light"
                      }`}
                    >
                      {isCompleted ? "✓" : config.icon}
                    </div>
                    <span
                      className={`text-xs font-semibold text-center leading-tight ${
                        isActive ? "text-washwell-black" : "text-washwell-gray"
                      }`}
                    >
                      {config.label}
                    </span>
                    {isActive && (
                      <div className="absolute -bottom-2 w-2 h-2 bg-washwell-green rounded-full animate-pulse" />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-12 text-center p-6 bg-washwell-cream rounded-2xl border-2 border-washwell-green">
              <p className="text-lg font-semibold text-washwell-black">
                <span className="text-2xl mr-2">{currentStatus.icon}</span>
                Your laundry is currently{" "}
                <span className="text-washwell-green">{currentStatus.label.toLowerCase()}</span>
              </p>
              {activeOrder.status === "out_for_delivery" && (
                <button
                  onClick={() => onTrackDelivery(activeOrder.id)}
                  className="mt-4 inline-flex items-center gap-2 px-8 py-3 bg-washwell-black hover:opacity-90 text-white font-display font-bold rounded-xl shadow-lg transition-all"
                >
                  <span>🚚</span> Track My Delivery
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Sustainability */}
      <section className="bg-washwell-black px-6 py-16 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-washwell-green/10 via-transparent to-washwell-green/5 pointer-events-none" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-washwell-green/20 rounded-full blur-3xl pointer-events-none animate-pulse" />

        <div className="max-w-4xl mx-auto relative z-10">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 mb-4">
              <div className="w-3 h-3 bg-washwell-green rounded-full animate-pulse" />
              <span className="text-washwell-gray text-sm font-bold uppercase tracking-widest">
                Live Updates
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-display font-bold text-white mb-3">
              Your Environmental Impact
            </h2>
            <p className="text-washwell-gray text-lg">
              {sustainability.totalOrders} orders completed
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {[
              { emoji: "💧", value: sustainability.waterSavedGallons, label: "Gallons Saved", sub: `≈ ${Math.round(sustainability.waterSavedGallons / 17.2)} showers` },
              { emoji: "⚡", value: sustainability.energySavedKwh, label: "kWh Saved", sub: `≈ ${Math.round(sustainability.energySavedKwh / 0.012)} phone charges` },
              { emoji: "🌱", value: sustainability.co2AvoidedLbs, label: "Lbs CO₂ Avoided", sub: "Making the planet greener" },
            ].map(({ emoji, value, label, sub }) => (
              <div
                key={label}
                className="group bg-white/5 backdrop-blur-sm border-2 border-washwell-green/30 rounded-2xl p-8 hover:border-washwell-green hover:bg-white/10 transition-all duration-300 hover:scale-105"
              >
                <div className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-300">
                  {emoji}
                </div>
                <div className="font-mono text-5xl font-bold text-washwell-green mb-2">{value}</div>
                <div className="text-sm text-washwell-gray uppercase tracking-wider font-semibold mb-3">
                  {label}
                </div>
                <div className="text-xs text-washwell-gray-light">{sub}</div>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-washwell-green text-lg font-display font-semibold italic">
              It's not laundry, it's a lifestyle
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
