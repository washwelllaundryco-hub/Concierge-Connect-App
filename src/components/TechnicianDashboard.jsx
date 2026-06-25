import { useState, useEffect, useRef } from "react";
import { PRICING_TIERS, getCorrectTier, calcDirectTotal } from "../constants";
import { copyWithFeedback } from "../lib/clipboard.js";
import HotelAccountsTab from "./HotelAccountsTab";

const STATUS_FLOW = ["paid_pending_technician", "in_wash", "drying", "folding", "out_for_delivery", "completed"];

export default function TechnicianDashboard() {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    async function fetchOrders() {
      try {
        const res = await fetch("/api/orders/active");
        if (res.ok) {
          const data = await res.json();
          setOrders(data.orders ?? []);
        }
      } catch {
        // network error — keep current state
      }
    }
    fetchOrders();
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, []);

  const [selectedOrder, setSelectedOrder]       = useState(null);
  const [showWeightModal, setShowWeightModal]    = useState(false);
  const [weightInput, setWeightInput]            = useState("");
  const [laundryType, setLaundryType]            = useState("regular"); // residential only
  const [machineInputs, setMachineInputs]        = useState({});
  const [confirmCancelId, setConfirmCancelId]    = useState(null);
  const [paymentLinkResult, setPaymentLinkResult] = useState(null); // { url, breakdown, emailSent, customerEmail }
  const [activeTab, setActiveTab]            = useState("orders");
  const paymentLinkInputRef = useRef(null);
  const linkInputRefs = useRef({});
  const [generatingLink, setGeneratingLink]      = useState(false);

  // Hotel tier upgrade info
  const upgradeInfo = (() => {
    if (!selectedOrder || !weightInput) return null;
    if (selectedOrder.paymentMethod === "pay_after_weigh") return null;
    const w = parseFloat(weightInput);
    if (!w || w <= 0) return null;
    const paidTier  = selectedOrder.tier || "Essential Load";
    const correct   = getCorrectTier(w);
    const paidPrice = parseFloat(PRICING_TIERS[paidTier]?.price || 0);
    const newPrice  = parseFloat(PRICING_TIERS[correct]?.price  || 0);
    if (newPrice <= paidPrice) return null;
    return { paidTier, correctTier: correct, balanceDue: (newPrice - paidPrice).toFixed(2) };
  })();

  // Residential price preview
  const directPreview = (() => {
    if (!selectedOrder || selectedOrder.paymentMethod !== "pay_after_weigh") return null;
    const w = parseFloat(weightInput);
    if (!w || w <= 0) return null;
    return calcDirectTotal(w, laundryType);
  })();

  const handleStatusUpdate = async (orderId, newStatus, weight = null, upgrade = null) => {
    if (newStatus === "cancelled") {
      setOrders((prev) => prev.filter((o) => o.id !== orderId));
    } else {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === orderId
            ? { ...o, status: newStatus, totalWeightLbs: weight ?? o.totalWeightLbs }
            : o
        )
      );
    }
    await fetch(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: newStatus,
        weight,
        balanceDue:  upgrade?.balanceDue  ?? null,
        correctTier: upgrade?.correctTier ?? null,
      }),
    }).catch(() => {});
    if (newStatus === "completed") {
      await fetch("/api/sustainability/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      }).catch(() => {});
    }
  };

  const handleGeneratePaymentLink = async () => {
    const w = parseFloat(weightInput);
    if (!w || w <= 0 || !selectedOrder) return;
    setGeneratingLink(true);
    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight: w, laundryType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setPaymentLinkResult(data);
      // Update local order status to awaiting_payment
      setOrders((prev) =>
        prev.map((o) =>
          o.id === selectedOrder.id
            ? { ...o, status: "awaiting_payment", totalWeightLbs: w }
            : o
        )
      );
      setShowWeightModal(false);
      setWeightInput("");
      setLaundryType("regular");
    } catch (err) {
      alert("Error generating payment link: " + err.message);
    } finally {
      setGeneratingLink(false);
    }
  };

  // Hotel tier upgrade: log weight + balance in DB, then generate Stripe upgrade link.
  const handleConfirmWithUpgrade = async () => {
    const w = parseFloat(weightInput);
    if (!w || w <= 0 || !selectedOrder || !upgradeInfo) return;
    setGeneratingLink(true);
    try {
      // 1. Write weight + balance_due + correct_tier to DB, move to in_wash
      await handleStatusUpdate(
        selectedOrder.id, "in_wash", w,
        { balanceDue: upgradeInfo.balanceDue, correctTier: upgradeInfo.correctTier }
      );
      // 2. Generate the Stripe balance link (reads balance_due from DB)
      const res = await fetch(`/api/orders/${selectedOrder.id}/upgrade-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setPaymentLinkResult({ url: data.url, breakdown: null });
      setOrders((prev) =>
        prev.map((o) =>
          o.id === selectedOrder.id ? { ...o, balanceStripeUrl: data.url } : o
        )
      );
      setShowWeightModal(false);
      setSelectedOrder(null);
      setWeightInput("");
    } catch (err) {
      alert("Error generating upgrade link: " + err.message);
    } finally {
      setGeneratingLink(false);
    }
  };

  // Re-show the payment link for an order that's already awaiting payment.
  // The link was already generated + cached server-side (balance_stripe_url),
  // so we just need to fetch it back -- pass the order's recorded weight so
  // the payment-link endpoint's validation passes; since balance_stripe_url
  // already exists it returns the cached URL without recreating the Stripe session.
  const handleViewPaymentLink = async (order) => {
    try {
      const res = await fetch(`/api/orders/${order.id}/payment-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight: order.totalWeightLbs || 1, laundryType: "regular" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setOrders((prev) =>
        prev.map((o) => (o.id === order.id ? { ...o, balanceStripeUrl: data.url } : o))
      );
    } catch (err) {
      alert("Error retrieving payment link: " + err.message);
    }
  };

  // Machine assignment now uses the merged /status endpoint
  const handleMachineAssign = async (orderId, machineType, machineNumber) => {
    const num = parseInt(machineNumber);
    if (!num || num <= 0) return;
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, [machineType === "washer" ? "washerNumber" : "dryerNumber"]: num }
          : o
      )
    );
    await fetch(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ machineType, machineNumber: num }),
    }).catch(() => {});
  };

  const nextStatus = (current) => {
    const idx = STATUS_FLOW.indexOf(current);
    return STATUS_FLOW[idx + 1] ?? current;
  };

  const actionLabel = (order) => {
    if (order.status === "paid_pending_technician") return "Start Processing";
    if (order.status === "in_wash")          return "Move to Drying";
    if (order.status === "drying")           return "Move to Folding";
    if (order.status === "folding")          return "Out for Delivery";
    if (order.status === "out_for_delivery") return "Mark as Delivered";
    return null;
  };

  const cancelOrder = confirmCancelId ? orders.find((o) => o.id === confirmCancelId) : null;

  return (
    <div className="min-h-screen bg-washwell-cream font-body">
      <header className="bg-washwell-black border-b-4 border-washwell-green px-6 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Washwell Laundry Co." className="h-12 w-auto" />
            <div>
              <h1 className="text-2xl font-display font-bold text-white">Technician Dashboard</h1>
              <p className="text-xs text-washwell-gray uppercase tracking-widest font-semibold">
                Washwell Laundry Co.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-washwell-green rounded-full animate-pulse" />
            <span className="text-sm text-washwell-gray-dark font-semibold">Live</span>
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-washwell-black border-b-2 border-washwell-green/20">
        <div className="max-w-6xl mx-auto px-6 flex gap-1 pt-2">
          {[
            { key: "orders", label: "Active Orders" },
            { key: "accounts", label: "Hotel Accounts" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 text-sm font-bold rounded-t-lg transition-all ${
                activeTab === tab.key
                  ? "bg-washwell-cream text-washwell-black"
                  : "text-white/50 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "accounts" && <HotelAccountsTab />}

      {activeTab === "orders" && (
      <main className="max-w-6xl mx-auto px-6 py-12">
        <h2 className="text-2xl font-display font-bold text-washwell-black mb-8">
          Active Orders ({orders.length})
        </h2>

        {orders.length === 0 && (
          <div className="text-center py-20 text-washwell-gray">
            <p className="text-lg font-semibold">No active orders</p>
            <p className="text-sm mt-1">New orders will appear here automatically.</p>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {orders.map((order) => {
            const isDirect = !!order.pickupAddress;
            const isAwaiting = order.status === "awaiting_payment";
            return (
              <div
                key={order.id}
                className={`bg-white rounded-3xl shadow-lg border-2 p-6 hover:shadow-xl transition-all ${
                  isAwaiting ? "border-blue-300" : "border-washwell-gray-light"
                }`}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <div className="inline-flex items-center gap-2 mb-3">
                      <span className="px-4 py-1.5 bg-washwell-green-pale border-2 border-washwell-green rounded-full font-display text-sm font-bold text-washwell-green">
                        {order.orderNumber}
                      </span>
                      {isDirect && (
                        <span className="px-2 py-1 bg-blue-100 border border-blue-300 rounded-full text-xs font-bold text-blue-700 uppercase tracking-wide">
                          Residential
                        </span>
                      )}
                    </div>
                    <h3 className="text-xl font-display font-bold text-washwell-black mb-1">
                      {order.guestName}
                    </h3>
                    {isDirect ? (
                      <div>
                        <p className="text-sm text-washwell-gray-dark">{order.pickupAddress}</p>
                        {order.roomNumber && (
                          <p className="text-xs text-washwell-gray">Unit {order.roomNumber}</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-washwell-gray-dark">Room {order.roomNumber}</p>
                    )}
                  </div>
                  {order.paymentVerified && order.paymentMethod === "stripe" ? (
                    <div className="px-3 py-2 bg-washwell-green rounded-xl border-2 border-washwell-green-dark flex items-center gap-2">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-white text-xs font-bold uppercase tracking-wider">Paid</span>
                    </div>
                  ) : order.paymentMethod === "cash" ? (
                    <div className="px-3 py-2 bg-gray-100 rounded-xl border-2 border-gray-300">
                      <span className="text-gray-700 text-xs font-bold uppercase tracking-wider">Cash COD</span>
                    </div>
                  ) : order.paymentMethod === "room_charge" ? (
                    <div className="px-3 py-2 bg-blue-50 rounded-xl border-2 border-blue-200">
                      <span className="text-blue-700 text-xs font-bold uppercase tracking-wider">Room Charge</span>
                    </div>
                  ) : order.paymentMethod === "hotel_account" ? (
                    <div className="px-3 py-2 bg-blue-50 rounded-xl border-2 border-blue-200">
                      <span className="text-blue-700 text-xs font-bold uppercase tracking-wider">Hotel Account</span>
                    </div>
                  ) : isAwaiting ? (
                    <div className="px-3 py-2 bg-blue-50 rounded-xl border-2 border-blue-200">
                      <span className="text-blue-700 text-xs font-bold uppercase tracking-wider">Awaiting Payment</span>
                    </div>
                  ) : isDirect ? (
                    <div className="px-3 py-2 bg-yellow-50 rounded-xl border-2 border-yellow-200">
                      <span className="text-yellow-700 text-xs font-bold uppercase tracking-wider">Weigh First</span>
                    </div>
                  ) : null}
                </div>

                {/* Status */}
                <div className="mb-4 p-4 bg-washwell-cream rounded-xl border-2 border-washwell-gray-light">
                  <div className="text-xs text-washwell-gray uppercase tracking-wider font-semibold mb-1">Status</div>
                  <div className="text-lg font-display font-bold text-washwell-black capitalize">
                    {order.status.replace(/_/g, " ")}
                  </div>
                </div>

                {/* Weight */}
                {order.totalWeightLbs && (
                  <div className="mb-4 text-center">
                    <div className="text-3xl font-display font-bold text-washwell-green">
                      {order.totalWeightLbs} lbs
                    </div>
                  </div>
                )}

                {/* Tier upgrade balance — visible while order proceeds through wash cycle */}
                {!isAwaiting && order.balanceStripeUrl && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-orange-700 mb-1">
                      Balance due — share with guest before delivery
                    </p>
                    <div className="flex gap-2">
                      <input
                        ref={(el) => (linkInputRefs.current[order.id] = el)}
                        readOnly
                        value={order.balanceStripeUrl}
                        onClick={(e) => e.target.select()}
                        onFocus={(e) => e.target.select()}
                        className="flex-1 px-3 py-2 border-2 border-orange-200 rounded-xl text-xs text-washwell-gray-dark bg-orange-50 font-mono overflow-hidden"
                      />
                      <button
                        onClick={(e) => copyWithFeedback(e, order.balanceStripeUrl, linkInputRefs.current[order.id])}
                        className="px-4 py-2 bg-washwell-black text-white font-bold text-sm rounded-xl hover:opacity-90 transition-all"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}

                {/* Awaiting payment — link is always visible here so it can be copied/referenced any time */}
                {isAwaiting && order.balanceStripeUrl && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold text-blue-700 mb-1">
                      Payment link (awaiting customer payment)
                    </p>
                    <div className="flex gap-2">
                      <input
                        ref={(el) => (linkInputRefs.current[order.id] = el)}
                        readOnly
                        value={order.balanceStripeUrl}
                        onClick={(e) => e.target.select()}
                        onFocus={(e) => e.target.select()}
                        className="flex-1 px-3 py-2 border-2 border-blue-200 rounded-xl text-xs text-washwell-gray-dark bg-blue-50 font-mono overflow-hidden"
                      />
                      <button
                        onClick={(e) => copyWithFeedback(e, order.balanceStripeUrl, linkInputRefs.current[order.id])}
                        className="px-4 py-2 bg-washwell-black text-white font-bold text-sm rounded-xl hover:opacity-90 transition-all"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}
                {isAwaiting && !order.balanceStripeUrl && (
                  <button
                    onClick={() => handleViewPaymentLink(order)}
                    className="w-full mb-3 py-2 border-2 border-blue-300 text-blue-700 font-semibold rounded-xl hover:bg-blue-50 transition-colors text-sm"
                  >
                    Get Payment Link
                  </button>
                )}

                {/* Machine inputs */}
                {(order.status === "in_wash" || order.status === "drying" || order.status === "folding") && (
                  <div className="mb-4 grid grid-cols-2 gap-3">
                    {["washer", "dryer"].map((type) => {
                      const key = `${order.id}_${type}`;
                      const saved = type === "washer" ? order.washerNumber : order.dryerNumber;
                      return (
                        <div key={type}>
                          <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-1">
                            {type === "washer" ? "Washer" : "Dryer"} #
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="number" min="1" placeholder="—"
                              defaultValue={saved || ""}
                              onChange={(e) => setMachineInputs((p) => ({ ...p, [key]: e.target.value }))}
                              className="w-full px-3 py-2 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green outline-none font-display font-bold text-washwell-black text-center"
                            />
                            <button
                              onClick={() => handleMachineAssign(order.id, type, machineInputs[key] || saved)}
                              className="px-3 py-2 bg-washwell-green text-white rounded-xl font-bold text-sm hover:bg-washwell-green-dark transition-all"
                            >
                              Set
                            </button>
                          </div>
                          {saved && <p className="text-xs text-washwell-green font-semibold mt-1">Assigned: #{saved}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Action button */}
                {actionLabel(order) && (
                  <button
                    onClick={() => {
                      if (order.status === "paid_pending_technician") {
                        setSelectedOrder(order);
                        setShowWeightModal(true);
                      } else {
                        handleStatusUpdate(order.id, nextStatus(order.status));
                      }
                    }}
                    className="w-full py-3 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl transition-all"
                  >
                    {actionLabel(order)}
                  </button>
                )}

                {/* Cancel */}
                <div className="mt-3 text-center">
                  <button
                    onClick={() => setConfirmCancelId(order.id)}
                    className="text-xs text-red-400 hover:text-red-600 font-semibold underline underline-offset-2 transition-colors"
                  >
                    Cancel Order
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
      )}

      {/* Weight Modal */}
      {showWeightModal && selectedOrder && (
        <div className="fixed inset-0 bg-washwell-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border-2 border-washwell-green">
            <h3 className="text-2xl font-display font-bold text-washwell-black mb-1">Log Weight</h3>
            <p className="text-sm text-washwell-gray-dark mb-5">Order {selectedOrder.orderNumber}</p>

            {selectedOrder.paymentMethod === "pay_after_weigh" ? (
              <>
                {/* Residential: laundry type selector */}
                <div className="mb-5">
                  <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-3">
                    Laundry Type
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { value: "regular", label: "Regular",      sub: "$2.75 / lb" },
                      { value: "mixed",   label: "Towels/Sheets", sub: "$3.00 / lb" },
                    ].map(({ value, label, sub }) => (
                      <button
                        key={value}
                        onClick={() => setLaundryType(value)}
                        className={`px-4 py-3 rounded-xl border-2 text-left transition-all ${
                          laundryType === value
                            ? "bg-washwell-green-pale border-washwell-green"
                            : "bg-washwell-cream border-washwell-gray-light hover:border-washwell-green/50"
                        }`}
                      >
                        <p className="font-bold text-sm text-washwell-black">{label}</p>
                        <p className={`text-xs font-semibold ${laundryType === value ? "text-washwell-green" : "text-washwell-gray-dark"}`}>
                          {sub}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                <input
                  type="number" step="0.1" min="0.1" placeholder="0.0"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  autoFocus
                  className="w-full px-5 py-4 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green focus:ring-4 focus:ring-washwell-green/10 outline-none transition-all text-2xl font-display font-bold text-washwell-black mb-4"
                />

                {/* Live price breakdown */}
                {directPreview && (
                  <div className="mb-5 p-4 bg-washwell-cream rounded-xl border-2 border-washwell-gray-light text-sm space-y-2">
                    <div className="flex justify-between text-washwell-gray-dark">
                      <span>Laundry ({parseFloat(weightInput)} lbs × ${directPreview.rate})</span>
                      <span className="font-semibold text-washwell-black">${directPreview.laundry.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-washwell-gray-dark">
                      <span>Delivery</span>
                      <span className="font-semibold text-washwell-black">${directPreview.delivery.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-washwell-gray-dark">
                      <span>Tax (13%)</span>
                      <span className="font-semibold text-washwell-black">${directPreview.tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t-2 border-washwell-gray-light pt-2">
                      <span className="font-bold text-washwell-black">Total</span>
                      <span className="font-display font-bold text-washwell-green text-lg">${directPreview.total.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowWeightModal(false); setSelectedOrder(null); setWeightInput(""); setLaundryType("regular"); }}
                    className="flex-1 px-6 py-3 border-2 border-washwell-gray-light text-washwell-black font-semibold rounded-xl hover:bg-washwell-cream transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleGeneratePaymentLink}
                    disabled={!weightInput || parseFloat(weightInput) <= 0 || generatingLink}
                    className="flex-1 px-6 py-3 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {generatingLink ? "Generating Link..." : "Confirm Weight"}
                  </button>
                </div>
              </>
            ) : (
              <>
                {/* Hotel customer weight modal */}
                <p className="text-xs text-washwell-gray mb-5">
                  Paid tier: <span className="font-bold text-washwell-black">{selectedOrder.tier}</span>
                  {" · max "}
                  <span className="font-bold text-washwell-black">
                    {selectedOrder.tier === "Bulk Service" ? "100" :
                     selectedOrder.tier === "Executive Load" ? "75" :
                     selectedOrder.tier === "Premium Load" ? "50" :
                     selectedOrder.tier === "Standard Load" ? "30" : "15"} lbs
                  </span>
                </p>

                <input
                  type="number" step="0.1" min="0.1" placeholder="0.0"
                  value={weightInput}
                  onChange={(e) => setWeightInput(e.target.value)}
                  autoFocus
                  className="w-full px-5 py-4 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green focus:ring-4 focus:ring-washwell-green/10 outline-none transition-all text-2xl font-display font-bold text-washwell-black mb-4"
                />

                {upgradeInfo && (
                  <div className="mb-5 px-4 py-4 bg-orange-50 border-2 border-orange-300 rounded-xl">
                    <p className="font-bold text-orange-800 text-sm">Tier Upgrade Required</p>
                    <p className="text-orange-700 text-xs mt-1">
                      Exceeds <strong>{upgradeInfo.paidTier}</strong> · Correct tier: <strong>{upgradeInfo.correctTier}</strong>
                    </p>
                    <p className="text-orange-800 font-bold text-sm mt-2">Balance due: ${upgradeInfo.balanceDue}</p>
                    <p className="text-orange-600 text-xs mt-1">A Stripe payment link will be generated — share with guest before delivery.</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => { setShowWeightModal(false); setSelectedOrder(null); setWeightInput(""); }}
                    className="flex-1 px-6 py-3 border-2 border-washwell-gray-light text-washwell-black font-semibold rounded-xl hover:bg-washwell-cream transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      const w = parseFloat(weightInput);
                      if (w > 0) {
                        if (upgradeInfo) {
                          handleConfirmWithUpgrade();
                        } else {
                          handleStatusUpdate(selectedOrder.id, "in_wash", w, null);
                          setShowWeightModal(false);
                          setSelectedOrder(null);
                          setWeightInput("");
                        }
                      }
                    }}
                    disabled={!weightInput || parseFloat(weightInput) <= 0 || generatingLink}
                    className={`flex-1 px-6 py-3 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      upgradeInfo ? "bg-orange-500 hover:bg-orange-600" : "bg-washwell-green hover:bg-washwell-green-dark"
                    }`}
                  >
                    {upgradeInfo
                      ? (generatingLink ? "Generating Link…" : `Confirm + Generate Link ($${upgradeInfo.balanceDue})`)
                      : "Confirm"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Payment Link Result Modal */}
      {paymentLinkResult && (
        <div className="fixed inset-0 bg-washwell-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border-2 border-washwell-green">
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-washwell-green rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-display font-bold text-washwell-black mb-1">Payment Link Ready</h3>
              {paymentLinkResult.emailSent && paymentLinkResult.customerEmail && (
                <p className="text-sm text-washwell-green font-semibold">
                  Emailed to {paymentLinkResult.customerEmail}
                </p>
              )}
              {!paymentLinkResult.emailSent && (
                <p className="text-sm text-washwell-gray-dark">Share this link with the customer</p>
              )}
            </div>

            {paymentLinkResult.breakdown && (
              <div className="mb-5 p-4 bg-washwell-cream rounded-xl border-2 border-washwell-gray-light text-sm space-y-2">
                <div className="flex justify-between text-washwell-gray-dark">
                  <span>Laundry ({paymentLinkResult.breakdown.lbs} lbs)</span>
                  <span className="font-semibold">${paymentLinkResult.breakdown.laundry.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-washwell-gray-dark">
                  <span>Delivery</span>
                  <span className="font-semibold">${paymentLinkResult.breakdown.delivery.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-washwell-gray-dark">
                  <span>Tax (13%)</span>
                  <span className="font-semibold">${paymentLinkResult.breakdown.tax.toFixed(2)}</span>
                </div>
                <div className="flex justify-between border-t-2 border-washwell-gray-light pt-2">
                  <span className="font-bold text-washwell-black">Total</span>
                  <span className="font-display font-bold text-washwell-green text-lg">
                    ${paymentLinkResult.breakdown.total.toFixed(2)}
                  </span>
                </div>
              </div>
            )}

            {paymentLinkResult.loading && (
              <div className="mb-5 text-center text-sm text-washwell-gray-dark">
                Loading payment link…
              </div>
            )}

            {paymentLinkResult.url && (
              <div className="flex gap-2 mb-5">
                <input
                  ref={paymentLinkInputRef}
                  readOnly
                  value={paymentLinkResult.url}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 px-3 py-2 border-2 border-washwell-gray-light rounded-xl text-xs text-washwell-gray-dark bg-washwell-cream font-mono overflow-hidden"
                />
                <button
                  onClick={(e) => copyWithFeedback(e, paymentLinkResult.url, paymentLinkInputRef.current)}
                  className="px-4 py-2 bg-washwell-black text-white font-bold text-sm rounded-xl hover:opacity-90 transition-all"
                >
                  Copy
                </button>
              </div>
            )}


            <button
              onClick={() => setPaymentLinkResult(null)}
              className="w-full py-3 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {confirmCancelId && cancelOrder && (
        <div className="fixed inset-0 bg-washwell-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border-2 border-red-200">
            <h3 className="text-xl font-display font-bold text-washwell-black mb-3">Cancel Order?</h3>
            <p className="text-washwell-gray-dark mb-2">
              Cancel order <span className="font-bold text-washwell-black">{cancelOrder.orderNumber}</span> for{" "}
              <span className="font-bold text-washwell-black">{cancelOrder.guestName}</span>?
            </p>
            <p className="text-sm text-red-500 font-semibold mb-8">This cannot be undone.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmCancelId(null)}
                className="flex-1 px-6 py-3 border-2 border-washwell-gray-light text-washwell-black font-semibold rounded-xl hover:bg-washwell-cream transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={() => { handleStatusUpdate(confirmCancelId, "cancelled"); setConfirmCancelId(null); }}
                className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl shadow-lg transition-all"
              >
                Cancel Order
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
