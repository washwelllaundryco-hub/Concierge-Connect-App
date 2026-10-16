import { useState, useEffect } from "react";
import { useUser } from "@clerk/clerk-react";
import { PRICING_TIERS, RESIDENTIAL_PRICING } from "../constants";

const STATUS_CONFIG = {
  pending_pickup:          { label: "Order Received",     icon: "📝", step: 1 },
  awaiting_payment:        { label: "Payment Pending",    icon: "💳", step: 2 },
  paid_pending_technician: { label: "Ready to Process",   icon: "✓",  step: 3 },
  in_wash:                 { label: "In Wash",            icon: "💧", step: 4 },
  drying:                  { label: "Drying",             icon: "🌬️", step: 5 },
  folding:                 { label: "Folding",            icon: "👕", step: 6 },
  out_for_delivery:        { label: "Out for Delivery",   icon: "🚚", step: 7 },
  delivered:               { label: "Delivered",          icon: "✓",  step: 8 },
};
const TOTAL_STEPS = 8;

export default function GuestLandingPage({ user, onOrderPlaced, onTrackDelivery }) {
  const { user: clerkUser } = useUser();
  const isResidential = !user.hotelId && !clerkUser?.publicMetadata?.hotelId;

  const [selectedOption, setSelectedOption]   = useState(isResidential ? "Regular Load" : "Standard Load");
  const [specialInstructions, setSpecial]     = useState("");
  const [activeOrder, setActiveOrder]         = useState(null);
  const [placing, setPlacing]                 = useState(false);
  const [confirmation, setConfirmation]       = useState(null);
  const [sustainability, setSustainability]   = useState({ totalOrders: 0, waterSavedGallons: 0, energySavedKwh: 0, co2AvoidedLbs: 0 });

  useEffect(() => {
    // Fetch active order for this guest
    const userId = clerkUser?.id;
    if (!userId) return;
    fetch(`/api/guest/orders?userId=${userId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.activeOrder) setActiveOrder(data.activeOrder); if (data?.sustainability) setSustainability(data.sustainability); })
      .catch(() => {});
  }, [clerkUser?.id]);

  const pricingOptions = isResidential
    ? Object.entries(RESIDENTIAL_PRICING).map(([name, p]) => ({ name, tagline: p.tagline, priceLabel: `$49 flat (≤15 lbs) · $${p.ratePerLb}/lb` }))
    : Object.entries(PRICING_TIERS).map(([name, p]) => ({ name, tagline: p.tagline, priceLabel: `$${p.price} CAD`, recommended: p.recommended }));

  const handleRequestPickup = async () => {
    setPlacing(true);
    try {
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId:             clerkUser?.id,
          email:              user.email,
          firstName:          user.firstName,
          lastName:           user.lastName,
          hotelId:            user.hotelId || null,
          roomNumber:         user.roomNumber || null,
          tier:               isResidential ? null : selectedOption,
          serviceType:        isResidential ? selectedOption : null,
          paymentMethod:      "stripe",
          specialInstructions: specialInstructions || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to place order");
      setConfirmation(data);
      setActiveOrder({ id: data.orderId, orderNumber: data.orderNumber, status: "pending_pickup" });
    } catch (err) {
      alert(err.message || "Failed to place order. Please try again.");
    } finally {
      setPlacing(false);
    }
  };

  const currentStatus = activeOrder ? STATUS_CONFIG[activeOrder.status] : null;
  const progressPct   = currentStatus ? (currentStatus.step / TOTAL_STEPS) * 100 : 0;

  if (confirmation) {
    return (
      <div className="min-h-screen bg-washwell-cream font-body flex items-center justify-center p-6">
        <div className="max-w-lg w-full text-center">
          <img src="/logo.png" alt="Washwell Laundry Co." className="h-20 w-auto mx-auto mb-8" />
          <div className="bg-white rounded-3xl shadow-2xl border-2 border-washwell-green p-10">
            <div className="w-20 h-20 bg-washwell-green rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-display font-bold text-washwell-black mb-2">Order Placed!</h2>
            <p className="text-washwell-gray-dark mb-2">Order <strong>{confirmation.orderNumber}</strong></p>
            <div className="bg-washwell-cream rounded-2xl p-5 my-6 border-2 border-washwell-gray-light text-left text-sm text-washwell-gray-dark space-y-2">
              <p>✓ We'll pick up your laundry shortly.</p>
              <p>✓ After we weigh it, we'll email your payment link to <strong>{user.email}</strong>.</p>
              <p>✓ Your laundry will begin processing as soon as payment is received.</p>
            </div>
            <button onClick={() => setConfirmation(null)}
              className="w-full py-3 bg-washwell-green text-white font-bold rounded-xl hover:bg-washwell-green-dark transition-all">
              Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-washwell-cream font-body">
      <section className="px-6 py-12 md:py-16">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex justify-center mb-8">
            <img src="/logo.png" alt="Washwell Laundry Co." className="h-24 w-auto" />
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold text-washwell-black mb-3 tracking-tight">
            Welcome back, {user.firstName}
          </h1>
          {!isResidential && (
            <p className="text-lg text-washwell-gray-dark mb-2 font-medium">
              {user.hotelName} • Room {user.roomNumber}
            </p>
          )}
          <p className="text-sm text-washwell-gray uppercase tracking-widest font-semibold mb-10">
            Washwell Laundry Co.
          </p>

          {/* Active order tracker */}
          {activeOrder && currentStatus && (
            <div className="w-full max-w-lg mx-auto mb-10 bg-white rounded-3xl border-2 border-washwell-gray-light shadow-lg p-6 text-left">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-washwell-gray uppercase tracking-widest">Active Order</span>
                <span className="font-display font-bold text-washwell-green">{activeOrder.orderNumber}</span>
              </div>
              <div className="flex items-center gap-3 mb-4">
                <span className="text-3xl">{currentStatus.icon}</span>
                <span className="text-lg font-display font-bold text-washwell-black">{currentStatus.label}</span>
              </div>
              <div className="w-full bg-washwell-gray-light rounded-full h-2 mb-4">
                <div className="h-2 bg-washwell-green rounded-full transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              {activeOrder.status === "out_for_delivery" && (
                <button onClick={() => onTrackDelivery?.(activeOrder.id)}
                  className="w-full py-2 bg-washwell-black text-white text-sm font-bold rounded-xl mt-2 hover:opacity-90">
                  Track Live Delivery
                </button>
              )}
            </div>
          )}

          {/* Service selector */}
          {!activeOrder && (
            <>
              <div className="w-full max-w-lg mx-auto mb-6 text-left">
                <p className="text-xs font-bold text-washwell-gray uppercase tracking-widest mb-3 text-center">
                  {isResidential ? "Select Service Type" : "Select Service"}
                </p>
                {isResidential && (
                  <p className="text-xs text-center text-washwell-gray-dark mb-4">
                    Final price based on actual weight. $49 flat for any bag ≤15 lbs.
                  </p>
                )}
                <div className="space-y-2">
                  {pricingOptions.map(opt => {
                    const isSelected = selectedOption === opt.name;
                    return (
                      <button key={opt.name} onClick={() => setSelectedOption(opt.name)}
                        className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl border-2 transition-all text-left ${
                          isSelected ? "bg-washwell-green-pale border-washwell-green shadow-md" : "bg-white border-washwell-gray-light hover:border-washwell-green/50"
                        }`}>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-display font-bold text-sm text-washwell-black">{opt.name}</span>
                            {opt.recommended && (
                              <span className="px-2 py-0.5 bg-washwell-green text-white text-xs font-bold rounded-full">Popular</span>
                            )}
                          </div>
                          <p className="text-xs text-washwell-gray-dark mt-0.5">{opt.tagline}</p>
                        </div>
                        <span className="text-sm font-bold text-washwell-black whitespace-nowrap">{opt.priceLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="w-full max-w-lg mx-auto mb-6">
                <textarea
                  placeholder="Special instructions (optional)"
                  value={specialInstructions}
                  onChange={e => setSpecial(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 border-2 border-washwell-gray-light rounded-2xl focus:border-washwell-green outline-none text-sm text-washwell-black resize-none bg-white"
                />
              </div>

              <button onClick={handleRequestPickup} disabled={placing}
                className="w-full max-w-lg mx-auto block py-5 bg-washwell-green hover:bg-washwell-green-dark text-white text-lg font-display font-bold rounded-2xl shadow-lg transition-all disabled:opacity-60">
                {placing ? "Placing Order…" : "Request Pickup"}
              </button>
              <p className="text-xs text-washwell-gray mt-4 max-w-lg mx-auto">
                Payment link will be emailed to {user.email} after we weigh your laundry.
              </p>
            </>
          )}
        </div>
      </section>

      {/* Sustainability section */}
      {(sustainability.totalOrders > 0) && (
        <section className="px-6 py-12 bg-washwell-black">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-2xl font-display font-bold text-white mb-2">Your Impact</h2>
            <p className="text-washwell-gray text-sm mb-8">Across {sustainability.totalOrders} Washwell orders</p>
            <div className="grid grid-cols-3 gap-4">
              {[
                { value: `${sustainability.waterSavedGallons}`, unit: "gal", label: "Water Saved" },
                { value: `${sustainability.energySavedKwh}`,    unit: "kWh", label: "Energy Saved" },
                { value: `${sustainability.co2AvoidedLbs}`,     unit: "lbs", label: "CO₂ Avoided" },
              ].map(m => (
                <div key={m.label} className="bg-white/10 rounded-2xl p-5 border border-white/10">
                  <div className="text-3xl font-display font-bold text-washwell-green">{m.value}<span className="text-lg ml-1">{m.unit}</span></div>
                  <div className="text-xs text-washwell-gray mt-1 uppercase tracking-wider">{m.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
