import { useState, useEffect } from "react";
import { useUser, useAuth, useClerk } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { PRICING_TIERS } from "../constants";

const STATUS_BADGE = {
  pending:                 { label: "Pending",           color: "bg-washwell-gray-light text-washwell-gray-dark" },
  pending_payment:         { label: "Awaiting Payment",  color: "bg-orange-100 text-orange-800" },
  paid_pending_technician: { label: "Paid — Awaiting",   color: "bg-yellow-100 text-yellow-800" },
  in_wash:                 { label: "In Wash",            color: "bg-blue-100 text-blue-800" },
  drying:                  { label: "Drying",             color: "bg-purple-100 text-purple-800" },
  folding:                 { label: "Folding",            color: "bg-indigo-100 text-indigo-800" },
  out_for_delivery:        { label: "Out for Delivery",   color: "bg-washwell-green-pale text-washwell-green-dark" },
  completed:               { label: "Delivered",          color: "bg-washwell-green text-white" },
};

const STATUS_STEPS = [
  { key: "paid_pending_technician", label: "Received",   matches: ["pending", "pending_payment", "paid_pending_technician"] },
  { key: "picked_up",               label: "Picked Up",  matches: ["picked_up"] },
  { key: "in_wash",                 label: "In Wash",    matches: ["in_wash"] },
  { key: "drying",                  label: "Drying",     matches: ["drying"] },
  { key: "folding",                 label: "Folding",    matches: ["folding"] },
  { key: "out_for_delivery",        label: "Delivering", matches: ["out_for_delivery"] },
  { key: "completed",               label: "Delivered",  matches: ["completed", "delivered"] },
];

const PAYMENT_METHODS = [
  { value: "stripe",        label: "Credit Card",      desc: "Guest pays via Stripe" },
  { value: "cash",          label: "Cash on Delivery", desc: "Collect cash at delivery" },
  { value: "room_charge",   label: "Room Charge",      desc: "Charge to guest room" },
  { value: "hotel_account", label: "Hotel Account",    desc: "Charge to hotel account" },
];

function getStepIndex(status) {
  for (let i = 0; i < STATUS_STEPS.length; i++) {
    if (STATUS_STEPS[i].matches.includes(status)) return i;
  }
  return 0;
}

export default function ConciergePortal() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const navigate = useNavigate();

  const hotelId   = user.publicMetadata?.hotelId   || "hotel-demo";
  const hotelName = user.publicMetadata?.hotelName  || "Your Hotel";

  const [orders, setOrders] = useState([]);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newOrder, setNewOrder] = useState({
    firstName: "", lastName: "", roomNumber: "",
    tier: "Standard Load", paymentMethod: "stripe",
  });
  const [submitting, setSubmitting]   = useState(false);
  const [successMsg, setSuccessMsg]   = useState("");
  const [stripeLink, setStripeLink]   = useState(null);
  const [upgradeModal, setUpgradeModal] = useState(null); // { orderId, orderNumber, balanceDue, correctTier, url, loadingLink, cleared }
  const [sustainability, setSustainability] = useState({
    totalOrders: 0, waterSavedGallons: 0, energySavedKwh: 0, co2AvoidedLbs: 0,
  });

  useEffect(() => {
    async function fetchOrders() {
      try {
        const token = await getToken();
        const res = await fetch(`/api/hotels/${hotelId}/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setOrders(data.orders || []);
        }
      } catch {
        // leave as empty
      }
    }
    fetchOrders();
    const interval = setInterval(fetchOrders, 30000);
    return () => clearInterval(interval);
  }, [hotelId]);

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

  const activeOrders   = orders.filter((o) => o.status !== "completed");
  const deliveredToday = orders.filter((o) => o.status === "completed");

  const handleNewOrderSubmit = async () => {
    if (!newOrder.firstName || !newOrder.roomNumber) return;
    setSubmitting(true);
    const tier     = PRICING_TIERS[newOrder.tier];
    const isStripe = newOrder.paymentMethod === "stripe";
    try {
      const token = await getToken();
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          firstName:     newOrder.firstName,
          lastName:      newOrder.lastName,
          roomNumber:    newOrder.roomNumber,
          tier:          newOrder.tier,
          paymentMethod: newOrder.paymentMethod,
          hotelId,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (isStripe) {
          setStripeLink({
            url: `${tier.stripeUrl}?client_reference_id=${data.orderId}`,
            orderNumber: data.orderNumber,
          });
        } else {
          const label = PAYMENT_METHODS.find((m) => m.value === newOrder.paymentMethod)?.label;
          setSuccessMsg(`Order placed — ${label}. Technician has been notified.`);
          setTimeout(() => setSuccessMsg(""), 6000);
        }
      } else {
        console.error("Create order failed:", await res.text());
      }
    } catch (err) {
      console.error("Create order error:", err);
    } finally {
      setSubmitting(false);
    }
    setShowNewOrder(false);
    setNewOrder({ firstName: "", lastName: "", roomNumber: "", tier: "Standard Load", paymentMethod: "stripe" });
  };

  const handleGetUpgradeLink = async (order) => {
    setUpgradeModal({
      orderId:     order.id,
      orderNumber: order.orderNumber,
      balanceDue:  order.balanceDue,
      correctTier: order.correctTier,
      url:         null,
      loadingLink: true,
      cleared:     false,
    });
    try {
      const token = await getToken();
      const res = await fetch(`/api/orders/${order.id}/upgrade-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      setUpgradeModal((prev) => ({ ...prev, url: data.url, loadingLink: false }));
    } catch {
      setUpgradeModal((prev) => ({ ...prev, loadingLink: false }));
    }
  };

  const handleMarkCollected = async (orderId) => {
    try {
      const token = await getToken();
      await fetch(`/api/orders/${orderId}/upgrade-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action: "mark_collected" }),
      });
      // Update local state
      setOrders((prev) =>
        prev.map((o) => o.id === orderId ? { ...o, balanceDue: 0, correctTier: null } : o)
      );
      setUpgradeModal((prev) => ({ ...prev, cleared: true }));
    } catch {
      // ignore
    }
  };

  return (
    <div className="min-h-screen bg-washwell-cream font-body">

      {/* Header */}
      <header className="bg-washwell-black border-b-4 border-washwell-green px-6 py-5">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Washwell" className="h-12 w-auto" />
            <div>
              <h1 className="text-xl font-display font-bold text-white">{hotelName}</h1>
              <p className="text-xs text-washwell-gray uppercase tracking-widest font-semibold">
                Concierge Portal
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-washwell-gray text-sm font-semibold hidden md:block">
              {user.firstName} {user.lastName}
            </span>
            <button
              onClick={() => signOut({ redirectUrl: "/login" })}
              className="px-4 py-2 border-2 border-washwell-gray rounded-xl text-sm font-semibold text-washwell-gray hover:text-white hover:border-white transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-10">

        {/* Success banner */}
        {successMsg && (
          <div className="mb-6 px-5 py-4 bg-washwell-green text-white font-bold rounded-xl shadow-md">
            ✓ {successMsg}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[
            { label: "Active Orders",    value: activeOrders.length },
            { label: "Out for Delivery", value: orders.filter((o) => o.status === "out_for_delivery").length },
            { label: "Delivered Today",  value: deliveredToday.length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-2xl border-2 border-washwell-gray-light p-5 text-center">
              <div className="text-4xl font-display font-bold text-washwell-green mb-1">{value}</div>
              <div className="text-xs text-washwell-gray uppercase tracking-wider font-semibold">{label}</div>
            </div>
          ))}
        </div>

        {/* Order Tracker */}
        {activeOrders.length > 0 && (
          <div className="mb-10">
            <h2 className="text-2xl font-display font-bold text-washwell-black mb-6">
              Live Order Tracker
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              {activeOrders.map((order) => {
                const currentStep = getStepIndex(order.status);
                const pct  = Math.round((currentStep / (STATUS_STEPS.length - 1)) * 100);
                const badge = STATUS_BADGE[order.status] || STATUS_BADGE.pending;
                const hasBalance = parseFloat(order.balanceDue || 0) > 0;
                return (
                  <div key={order.id} className={`bg-white rounded-2xl border-2 p-5 ${hasBalance ? "border-orange-300" : "border-washwell-gray-light"}`}>
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <span className="font-display text-sm font-bold text-washwell-green bg-washwell-green-pale px-3 py-1 rounded-full border border-washwell-green">
                          {order.orderNumber}
                        </span>
                        <p className="font-display font-bold text-washwell-black mt-2">
                          {order.guestFirstName} {order.guestLastName}
                        </p>
                        <p className="text-sm text-washwell-gray-dark">Room {order.roomNumber} · {order.tier}</p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${badge.color}`}>
                          {badge.label}
                        </span>
                        {hasBalance && (
                          <button
                            onClick={() => handleGetUpgradeLink(order)}
                            className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-all"
                          >
                            Balance Due: ${parseFloat(order.balanceDue).toFixed(2)}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mb-3">
                      <div className="relative h-1.5 bg-washwell-gray-light rounded-full overflow-hidden">
                        <div
                          className="absolute h-full bg-washwell-green transition-all duration-700 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    {/* Step dots */}
                    <div className="flex items-center justify-between">
                      {STATUS_STEPS.map((step, i) => {
                        const isActive    = i === currentStep;
                        const isCompleted = i < currentStep;
                        return (
                          <div key={step.key} className="flex flex-col items-center gap-1">
                            <div className={`w-3 h-3 rounded-full border-2 transition-all ${
                              isCompleted ? "bg-washwell-green border-washwell-green" :
                              isActive    ? "bg-washwell-green border-washwell-green ring-2 ring-washwell-green/30" :
                              "bg-white border-washwell-gray-light"
                            }`} />
                            <span className={`text-[9px] font-semibold text-center leading-tight ${
                              isActive ? "text-washwell-black" : "text-washwell-gray"
                            }`}>
                              {step.label}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {order.status === "out_for_delivery" && (
                      <button
                        onClick={() => navigate(`/track/${order.id}`)}
                        className="w-full mt-4 py-2 bg-washwell-black hover:opacity-90 text-white text-sm font-bold rounded-xl transition-all"
                      >
                        Track Delivery →
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-display font-bold text-washwell-black">
            Active Orders ({activeOrders.length})
          </h2>
          <button
            onClick={() => setShowNewOrder(true)}
            className="flex items-center gap-2 px-6 py-3 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl shadow-lg transition-all"
          >
            New Pickup Request
          </button>
        </div>

        {/* Order List */}
        <div className="space-y-3">
          {activeOrders.length === 0 && (
            <div className="text-center py-16 text-washwell-gray">
              <p className="font-semibold">No active orders</p>
              <p className="text-sm mt-1">Orders placed from this portal will appear here.</p>
            </div>
          )}
          {activeOrders.map((order) => {
            const badge      = STATUS_BADGE[order.status] || STATUS_BADGE.pending;
            const hasBalance = parseFloat(order.balanceDue || 0) > 0;
            return (
              <div
                key={order.id}
                className={`bg-white rounded-2xl border-2 px-6 py-5 flex items-center gap-4 hover:shadow-md transition-all ${
                  hasBalance ? "border-orange-300" : "border-washwell-gray-light"
                }`}
              >
                <div className="hidden md:block">
                  <span className="font-display text-sm font-bold text-washwell-green bg-washwell-green-pale px-3 py-1 rounded-full border border-washwell-green">
                    {order.orderNumber}
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-display font-bold text-washwell-black">
                    {order.guestFirstName} {order.guestLastName}
                  </p>
                  <p className="text-sm text-washwell-gray-dark">
                    Room {order.roomNumber} · {order.tier}
                    {hasBalance && (
                      <span className="ml-2 text-orange-600 font-semibold">
                        → {order.correctTier}
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap justify-end">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${badge.color}`}>
                    {badge.label}
                  </span>
                  {hasBalance && (
                    <button
                      onClick={() => handleGetUpgradeLink(order)}
                      className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-all"
                    >
                      Balance Due ${parseFloat(order.balanceDue).toFixed(2)}
                    </button>
                  )}
                  {order.status === "out_for_delivery" && (
                    <button
                      onClick={() => navigate(`/track/${order.id}`)}
                      className="px-4 py-2 bg-washwell-black hover:opacity-90 text-white text-sm font-bold rounded-xl transition-all"
                    >
                      Track
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Delivered Today */}
        {deliveredToday.length > 0 && (
          <div className="mt-10">
            <h2 className="text-2xl font-display font-bold text-washwell-black mb-6">
              Delivered Today ({deliveredToday.length})
            </h2>
            <div className="space-y-3">
              {deliveredToday.map((order) => (
                <div
                  key={order.id}
                  className="bg-white rounded-2xl border-2 border-washwell-gray-light px-6 py-5 flex items-center gap-4 opacity-75"
                >
                  <div className="hidden md:block">
                    <span className="font-display text-sm font-bold text-washwell-green bg-washwell-green-pale px-3 py-1 rounded-full border border-washwell-green">
                      {order.orderNumber}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="font-display font-bold text-washwell-black">
                      {order.guestFirstName} {order.guestLastName}
                    </p>
                    <p className="text-sm text-washwell-gray-dark">
                      Room {order.roomNumber} · {order.tier}
                    </p>
                  </div>
                  <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-washwell-green text-white">
                    Delivered ✓
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Environmental Impact */}
      <section className="bg-washwell-black px-6 py-16 mt-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-display font-bold text-white mb-2">
              {hotelName} Environmental Impact
            </h2>
            <p className="text-washwell-gray">
              {sustainability.totalOrders} orders completed
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { metric: "H₂O", value: sustainability.waterSavedGallons, label: "Gallons Saved",    sub: `≈ ${Math.round((sustainability.waterSavedGallons || 0) / 17.2)} showers` },
              { metric: "kWh", value: sustainability.energySavedKwh,    label: "Energy Saved",     sub: `≈ ${Math.round((sustainability.energySavedKwh    || 0) / 0.012)} phone charges` },
              { metric: "CO₂", value: sustainability.co2AvoidedLbs,     label: "Lbs CO₂ Avoided",  sub: "Making the planet greener" },
            ].map(({ metric, value, label, sub }) => (
              <div key={label} className="bg-white/5 border border-washwell-green/20 rounded-2xl p-8 hover:border-washwell-green/60 transition-all">
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

      {/* Upgrade / Balance Due Modal */}
      {upgradeModal && (
        <div className="fixed inset-0 bg-washwell-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border-2 border-orange-300">
            {upgradeModal.cleared ? (
              <>
                <div className="text-center mb-6">
                  <div className="w-14 h-14 bg-washwell-green rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-display font-bold text-washwell-black">Balance Cleared</h3>
                  <p className="text-sm text-washwell-gray-dark mt-1">Order {upgradeModal.orderNumber} balance has been marked as collected.</p>
                </div>
                <button
                  onClick={() => setUpgradeModal(null)}
                  className="w-full py-3 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl transition-all"
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-orange-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-display font-bold text-washwell-black">Balance Due</h3>
                </div>
                <p className="text-sm text-washwell-gray-dark mb-1">
                  Order <strong>{upgradeModal.orderNumber}</strong> exceeded its paid tier.
                </p>
                <p className="text-sm text-washwell-gray-dark mb-5">
                  Upgraded to <strong className="text-washwell-black">{upgradeModal.correctTier}</strong>.
                  Guest owes <strong className="text-orange-600">${parseFloat(upgradeModal.balanceDue).toFixed(2)}</strong>.
                </p>

                {upgradeModal.loadingLink ? (
                  <div className="py-6 text-center text-washwell-gray text-sm">Generating Stripe link…</div>
                ) : upgradeModal.url ? (
                  <>
                    <div className="bg-washwell-cream rounded-xl px-4 py-3 mb-4 break-all text-xs font-medium text-washwell-black border-2 border-washwell-gray-light">
                      {upgradeModal.url}
                    </div>
                    <div className="flex gap-3 mb-4">
                      <button
                        onClick={() => { navigator.clipboard.writeText(upgradeModal.url); }}
                        className="flex-1 py-3 border-2 border-orange-400 text-orange-600 font-bold rounded-xl hover:bg-orange-50 transition-colors text-sm"
                      >
                        Copy Link
                      </button>
                      <a
                        href={upgradeModal.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow-lg transition-all text-center text-sm"
                      >
                        Open →
                      </a>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-red-500 mb-4">Failed to generate link. Try again.</p>
                )}

                <div className="border-t border-washwell-gray-light pt-4 flex gap-3">
                  <button
                    onClick={() => setUpgradeModal(null)}
                    className="flex-1 py-2.5 border-2 border-washwell-gray-light text-washwell-black font-semibold rounded-xl hover:bg-washwell-cream transition-colors text-sm"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => handleMarkCollected(upgradeModal.orderId)}
                    className="flex-1 py-2.5 border-2 border-washwell-green text-washwell-green font-bold rounded-xl hover:bg-washwell-green-pale transition-colors text-sm"
                  >
                    Mark Collected ✓
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Stripe Payment Link Modal */}
      {stripeLink && (
        <div className="fixed inset-0 bg-washwell-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border-2 border-washwell-green">
            <h3 className="text-2xl font-display font-bold text-washwell-black mb-1">Order Created</h3>
            <p className="text-sm text-washwell-gray-dark mb-6">
              Share this payment link with the guest for order <strong>{stripeLink.orderNumber}</strong>.
            </p>
            <div className="bg-washwell-cream rounded-xl px-4 py-3 mb-4 break-all text-sm font-medium text-washwell-black border-2 border-washwell-gray-light">
              {stripeLink.url}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => { navigator.clipboard.writeText(stripeLink.url); }}
                className="flex-1 py-3 border-2 border-washwell-green text-washwell-green font-bold rounded-xl hover:bg-washwell-green-pale transition-colors"
              >
                Copy Link
              </button>
              <a
                href={stripeLink.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setStripeLink(null)}
                className="flex-1 py-3 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl shadow-lg transition-all text-center"
              >
                Open →
              </a>
            </div>
            <button
              onClick={() => setStripeLink(null)}
              className="w-full mt-3 py-2 text-sm text-washwell-gray hover:text-washwell-black transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* New Pickup Request Modal */}
      {showNewOrder && (
        <div className="fixed inset-0 bg-washwell-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border-2 border-washwell-green overflow-y-auto max-h-[90vh]">
            <h3 className="text-2xl font-display font-bold text-washwell-black mb-1">New Pickup Request</h3>
            <p className="text-sm text-washwell-gray-dark mb-6">{hotelName}</p>
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-1">First Name</label>
                  <input type="text" value={newOrder.firstName}
                    onChange={(e) => setNewOrder((p) => ({ ...p, firstName: e.target.value }))}
                    placeholder="e.g. Marcus"
                    className="w-full px-4 py-3 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green focus:ring-4 focus:ring-washwell-green/10 outline-none transition-all font-medium text-washwell-black"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-1">Last Name</label>
                  <input type="text" value={newOrder.lastName}
                    onChange={(e) => setNewOrder((p) => ({ ...p, lastName: e.target.value }))}
                    placeholder="e.g. Webb"
                    className="w-full px-4 py-3 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green focus:ring-4 focus:ring-washwell-green/10 outline-none transition-all font-medium text-washwell-black"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-1">Room Number</label>
                <input type="text" value={newOrder.roomNumber}
                  onChange={(e) => setNewOrder((p) => ({ ...p, roomNumber: e.target.value }))}
                  placeholder="e.g. 412"
                  className="w-full px-4 py-3 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green focus:ring-4 focus:ring-washwell-green/10 outline-none transition-all font-medium text-washwell-black"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-3">Service Tier</label>
                <div className="space-y-2">
                  {Object.entries(PRICING_TIERS).map(([name, tier]) => {
                    const isSelected = newOrder.tier === name;
                    return (
                      <button key={name} onClick={() => setNewOrder((p) => ({ ...p, tier: name }))}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                          isSelected ? "bg-washwell-green-pale border-washwell-green" : "bg-washwell-cream border-washwell-gray-light hover:border-washwell-green/50"
                        }`}
                      >
                        <span className="flex-1 font-semibold text-sm text-washwell-black">{name}</span>
                        <span className={`font-display font-bold text-sm ${isSelected ? "text-washwell-green" : "text-washwell-gray-dark"}`}>${tier.price}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-3">Payment Method</label>
                <div className="grid grid-cols-2 gap-2">
                  {PAYMENT_METHODS.map((pm) => {
                    const isSelected = newOrder.paymentMethod === pm.value;
                    return (
                      <button key={pm.value} onClick={() => setNewOrder((p) => ({ ...p, paymentMethod: pm.value }))}
                        className={`flex flex-col items-start px-4 py-3 rounded-xl border-2 transition-all text-left ${
                          isSelected ? "bg-washwell-green-pale border-washwell-green" : "bg-washwell-cream border-washwell-gray-light hover:border-washwell-green/50"
                        }`}
                      >
                        <span className={`font-bold text-sm ${isSelected ? "text-washwell-green" : "text-washwell-black"}`}>{pm.label}</span>
                        <span className="text-xs text-washwell-gray-dark mt-0.5">{pm.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowNewOrder(false)}
                className="flex-1 py-3 border-2 border-washwell-gray-light text-washwell-black font-semibold rounded-xl hover:bg-washwell-cream transition-colors"
              >
                Cancel
              </button>
              <button onClick={handleNewOrderSubmit}
                disabled={submitting || !newOrder.firstName || !newOrder.roomNumber}
                className="flex-1 py-3 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Placing Order..." : newOrder.paymentMethod === "stripe" ? "Open Payment Link →" : "Place Order →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
