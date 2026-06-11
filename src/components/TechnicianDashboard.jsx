import { useState, useEffect } from "react";
import { PRICING_TIERS, getCorrectTier, calcDirectTotal } from "../constants";
import { copyWithFeedback } from "../lib/clipboard.js";

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
                  {order.paymentVerified ? (
                    <div className="px-3 py-2 bg-washwell-green rounded-xl border-2 border-washwell-green-dark flex items-center gap-2">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      <span className="text-white text-xs font-bold uppercase tracking-wider">Paid</span>
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

                {/* Awaiting payment — show resend link button */}
                {isAwaiting && (
                  <button
                    onClick={() => setPaymentLinkResult({ url: null, resend: order.id })}
                    className="w-full mb-3 py-2 border-2 border-blue-300 text-blue-700 font-semibold rounded-xl hover:bg-blue-50 transition-colors text-sm"
                  >
                    View Payment Link
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
                    <p className="text-orange-600 text-xs mt-1">Concierge will be notified to collect payment.</p>
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
                        handleStatusUpdate(selectedOrder.id, "in_wash", w,
                          upgradeInfo ? { balanceDue: upgradeInfo.balanceDue, correctTier: upgradeInfo.correctTier } : null
                        );
                        setShowWeightModal(false);
                        setSelectedOrder(null);
                        setWeightInput("");
                      }
                    }}
                    disabled={!weightInput || parseFloat(weightInput) <= 0}
                    className={`flex-1 px-6 py-3 text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      upgradeInfo ? "bg-orange-500 hover:bg-orange-600" : "bg-washwell-green hover:bg-washwell-green-dark"
                    }`}
                  >
                    {upgradeInfo ? `Confirm + Flag $${upgradeInfo.balanceDue}` : "Confirm"}
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

            {paymentLinkResult.url && (
              <div className="flex gap-2 mb-5">
                <input
                  readOnly
                  value={paymentLinkResult.url}
                  className="flex-1 px-3 py-2 border-2 border-washwell-gray-light rounded-xl text-xs text-washwell-gray-dark bg-washwell-cream font-mono overflow-hidden"
                />
                <button
                  onClick={(e) => copyWithFeedback(e, paymentLinkResult.url)}
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
