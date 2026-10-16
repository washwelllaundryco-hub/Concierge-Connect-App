import { useState, useEffect } from "react";
import HotelAccountsTab from "./HotelAccountsTab";
import OrderAnalyticsTab from "./OrderAnalyticsTab";

const STATUS_FLOW = ["paid_pending_technician", "in_wash", "drying", "folding", "out_for_delivery", "completed"];

export default function TechnicianDashboard() {
  const [orders, setOrders]               = useState([]);
  const [activeTab, setActiveTab]         = useState("orders");
  const [selectedOrder, setSelected]      = useState(null);
  const [showWeightModal, setWeightModal] = useState(false);
  const [weightInput, setWeightInput]     = useState("");
  const [machineInputs, setMachineInputs] = useState({});
  const [weighing, setWeighing]           = useState(false);
  const [confirmCancelId, setCancelId]    = useState(null);

  async function fetchOrders() {
    try {
      const res = await fetch("/api/orders/active");
      if (res.ok) {
        const data = await res.json();
        setOrders(data.orders ?? []);
      }
    } catch {}
  }

  useEffect(() => {
    fetchOrders();
    const iv = setInterval(fetchOrders, 15000);
    return () => clearInterval(iv);
  }, []);

  const nextStatus = cur => {
    const idx = STATUS_FLOW.indexOf(cur);
    return STATUS_FLOW[idx + 1] ?? cur;
  };

  const actionLabel = order => {
    if (order.status === "pending_pickup")         return "Log Weight";
    if (order.status === "awaiting_payment")       return null;        // waiting for customer
    if (order.status === "paid_pending_technician") return "Start Washing";
    if (order.status === "in_wash")                return "Move to Drying";
    if (order.status === "drying")                 return "Move to Folding";
    if (order.status === "folding")                return "Out for Delivery";
    if (order.status === "out_for_delivery")       return "Mark as Delivered";
    return null;
  };

  const handleStatusUpdate = async (orderId, newStatus) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
    await fetch(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    }).catch(() => {});
    if (newStatus === "completed") {
      fetch("/api/sustainability/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      }).catch(() => {});
    }
    fetchOrders();
  };

  const handleWeighSubmit = async () => {
    const w = parseFloat(weightInput);
    if (!w || w <= 0 || !selectedOrder) return;
    setWeighing(true);
    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}/weigh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weight: w }),
      });
      const data = await res.json();
      setWeightModal(false);
      setSelected(null);
      setWeightInput("");
      fetchOrders();
      if (data.status === "awaiting_payment") {
        alert(`Weight logged: ${w} lbs\nTotal: $${parseFloat(data.amount).toFixed(2)} CAD\nPayment link emailed to customer.`);
      } else {
        alert(`Weight logged: ${w} lbs\nTotal: $${parseFloat(data.amount).toFixed(2)} CAD\nOrder ready to process.`);
      }
    } catch (err) {
      alert("Failed to log weight. Please try again.");
    } finally {
      setWeighing(false);
    }
  };

  const handleMachineAssign = async (orderId, machineType, machineNumber) => {
    const num = parseInt(machineNumber);
    if (!num || num <= 0) return;
    setOrders(prev => prev.map(o =>
      o.id === orderId ? { ...o, [machineType === "washer" ? "washerNumber" : "dryerNumber"]: num } : o
    ));
    await fetch("/api/orders/machine", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, machineType, machineNumber: num }),
    }).catch(() => {});
  };

  const handleDelete = async (orderId) => {
    await fetch(`/api/orders/${orderId}`, { method: "DELETE" }).catch(() => {});
    setCancelId(null);
    fetchOrders();
  };

  const statusBadge = status => {
    const map = {
      pending_pickup:          { label: "Awaiting Pickup",     bg: "bg-gray-100",    text: "text-gray-700",   border: "border-gray-300"   },
      awaiting_payment:        { label: "Awaiting Payment",    bg: "bg-amber-50",    text: "text-amber-700",  border: "border-amber-300"   },
      paid_pending_technician: { label: "Ready to Process",    bg: "bg-green-50",    text: "text-green-700",  border: "border-green-300"   },
      in_wash:                 { label: "In Wash",             bg: "bg-blue-50",     text: "text-blue-700",   border: "border-blue-300"    },
      drying:                  { label: "Drying",              bg: "bg-sky-50",      text: "text-sky-700",    border: "border-sky-300"     },
      folding:                 { label: "Folding",             bg: "bg-purple-50",   text: "text-purple-700", border: "border-purple-300"  },
      out_for_delivery:        { label: "Out for Delivery",    bg: "bg-washwell-green-pale", text: "text-washwell-green", border: "border-washwell-green" },
    };
    return map[status] || { label: status, bg: "bg-gray-100", text: "text-gray-700", border: "border-gray-300" };
  };

  const tabs = [
    { key: "orders",    label: "Active Orders",  count: orders.length },
    { key: "accounts",  label: "Hotel Accounts", count: null },
    { key: "analytics", label: "Analytics",      count: null },
  ];

  return (
    <div className="min-h-screen bg-washwell-cream font-body">
      <header className="bg-washwell-black border-b-4 border-washwell-green px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Washwell Laundry Co." className="h-12 w-auto" />
            <div>
              <h1 className="text-2xl font-display font-bold text-white">Technician Dashboard</h1>
              <p className="text-xs text-washwell-gray uppercase tracking-widest font-semibold">Washwell Laundry Co.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-washwell-green rounded-full animate-pulse" />
            <span className="text-sm text-washwell-gray-dark font-semibold">Live</span>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-4 flex gap-1">
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2.5 rounded-t-xl text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === tab.key ? "bg-washwell-cream text-washwell-black" : "text-washwell-gray hover:text-white hover:bg-white/10"
              }`}>
              {tab.label}
              {tab.count !== null && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${activeTab === tab.key ? "bg-washwell-green text-white" : "bg-white/20 text-washwell-gray"}`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      {activeTab === "accounts"  && <HotelAccountsTab />}
      {activeTab === "analytics" && <OrderAnalyticsTab />}

      {activeTab === "orders" && (
        <main className="max-w-6xl mx-auto px-6 py-10">
          {orders.length === 0 ? (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">✓</div>
              <h2 className="text-2xl font-display font-bold text-washwell-black mb-2">All Clear</h2>
              <p className="text-washwell-gray-dark">No active orders right now.</p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-display font-bold text-washwell-black mb-8">Active Orders ({orders.length})</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {orders.map(order => {
                  const badge   = statusBadge(order.status);
                  const label   = actionLabel(order);

                  return (
                    <div key={order.id} className="bg-white rounded-3xl shadow-lg border-2 border-washwell-gray-light p-6 hover:shadow-xl transition-all">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <div className="inline-block px-4 py-1.5 bg-washwell-green-pale border-2 border-washwell-green rounded-full mb-3">
                            <span className="font-display text-sm font-bold text-washwell-green">{order.orderNumber}</span>
                          </div>
                          <h3 className="text-xl font-display font-bold text-washwell-black mb-0.5">{order.guestName}</h3>
                          <p className="text-sm text-washwell-gray-dark">
                            {order.hotelName
                              ? `${order.hotelName}${order.roomNumber ? ` · Room ${order.roomNumber}` : ""}`
                              : order.roomNumber ? `Room ${order.roomNumber}` : "Residential"}
                          </p>
                        </div>
                        {/* Payment method badge */}
                        <div className={`px-3 py-1.5 rounded-xl border-2 text-xs font-bold uppercase tracking-wider ${
                          order.paymentMethod === "stripe"        ? "bg-washwell-green-pale border-washwell-green text-washwell-green" :
                          order.paymentMethod === "room_charge"   ? "bg-blue-50 border-blue-200 text-blue-700" :
                          order.paymentMethod === "hotel_account" ? "bg-blue-50 border-blue-200 text-blue-700" :
                          "bg-gray-100 border-gray-300 text-gray-700"
                        }`}>
                          {order.paymentMethod === "stripe" ? "Stripe" :
                           order.paymentMethod === "room_charge" ? "Room Charge" :
                           order.paymentMethod === "hotel_account" ? "Hotel Acct" : "Cash"}
                        </div>
                      </div>

                      {/* Status */}
                      <div className={`mb-4 px-4 py-3 rounded-xl border-2 ${badge.bg} ${badge.border}`}>
                        <div className={`text-sm font-bold ${badge.text}`}>{badge.label}</div>
                      </div>

                      {/* Service / Tier */}
                      <div className="mb-3 text-sm text-washwell-gray-dark">
                        <span className="font-semibold">Service:</span> {order.correctTier || order.tier || order.serviceType || "—"}
                      </div>

                      {/* Weight + Amount */}
                      {order.totalWeightLbs && (
                        <div className="mb-4 flex gap-4">
                          <div className="flex-1 bg-washwell-cream rounded-xl p-3 border-2 border-washwell-gray-light text-center">
                            <div className="text-xl font-display font-bold text-washwell-green">{order.totalWeightLbs} lbs</div>
                            <div className="text-xs text-washwell-gray uppercase tracking-wider mt-0.5">Actual Weight</div>
                          </div>
                          {order.totalAmount && (
                            <div className="flex-1 bg-washwell-cream rounded-xl p-3 border-2 border-washwell-gray-light text-center">
                              <div className="text-xl font-display font-bold text-washwell-black">${parseFloat(order.totalAmount).toFixed(2)}</div>
                              <div className="text-xs text-washwell-gray uppercase tracking-wider mt-0.5">Total CAD</div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Awaiting payment info */}
                      {order.status === "awaiting_payment" && (
                        <div className="mb-4 p-3 bg-amber-50 border-2 border-amber-200 rounded-xl text-sm text-amber-800">
                          Payment link emailed to customer.{order.guestEmail ? ` (${order.guestEmail})` : ""} Laundry will begin once paid.
                        </div>
                      )}

                      {/* Machine inputs */}
                      {["in_wash", "drying", "folding"].includes(order.status) && (
                        <div className="mb-4 grid grid-cols-2 gap-3">
                          {["washer", "dryer"].map(type => {
                            const key    = `${order.id}_${type}`;
                            const stored = type === "washer" ? order.washerNumber : order.dryerNumber;
                            return (
                              <div key={type}>
                                <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-1">{type} #</label>
                                <div className="flex gap-2">
                                  <input type="number" min="1" placeholder="—" defaultValue={stored || ""}
                                    onChange={e => setMachineInputs(p => ({ ...p, [key]: e.target.value }))}
                                    className="w-full px-3 py-2 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green outline-none font-display font-bold text-washwell-black text-center" />
                                  <button onClick={() => handleMachineAssign(order.id, type, machineInputs[key] || stored)}
                                    className="px-3 py-2 bg-washwell-green text-white rounded-xl font-bold text-sm hover:bg-washwell-green-dark">Set</button>
                                </div>
                                {stored && <p className="text-xs text-washwell-green font-semibold mt-1">#{stored}</p>}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Special instructions */}
                      {order.specialInstructions && (
                        <div className="mb-4 p-3 bg-yellow-50 border-2 border-yellow-200 rounded-xl text-sm text-yellow-800">
                          <span className="font-bold">Note: </span>{order.specialInstructions}
                        </div>
                      )}

                      {/* Action button */}
                      {label && (
                        <button
                          onClick={() => {
                            if (order.status === "pending_pickup") {
                              setSelected(order); setWeightModal(true);
                            } else {
                              handleStatusUpdate(order.id, nextStatus(order.status));
                            }
                          }}
                          className="w-full py-3 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl transition-all shadow-sm mb-3">
                          {label}
                        </button>
                      )}

                      {/* Cancel order */}
                      {!["completed","delivered","cancelled"].includes(order.status) && (
                        confirmCancelId === order.id ? (
                          <div className="flex gap-2">
                            <button onClick={() => handleDelete(order.id)}
                              className="flex-1 py-2 bg-red-500 text-white text-sm font-bold rounded-xl hover:bg-red-600">Confirm Cancel</button>
                            <button onClick={() => setCancelId(null)}
                              className="flex-1 py-2 border-2 border-washwell-gray-light text-washwell-black text-sm font-semibold rounded-xl hover:bg-washwell-cream">Keep</button>
                          </div>
                        ) : (
                          <button onClick={() => setCancelId(order.id)}
                            className="w-full py-2 border-2 border-washwell-gray-light text-washwell-gray-dark text-sm font-semibold rounded-xl hover:bg-washwell-cream transition-colors">
                            Cancel Order
                          </button>
                        )
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </main>
      )}

      {/* Weight Modal */}
      {showWeightModal && selectedOrder && (
        <div className="fixed inset-0 bg-washwell-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border-2 border-washwell-green">
            <h3 className="text-2xl font-display font-bold text-washwell-black mb-1">Log Weight</h3>
            <p className="text-sm text-washwell-gray-dark mb-2">Order {selectedOrder.orderNumber}</p>
            <p className="text-xs text-washwell-gray mb-6">The correct price will be calculated automatically and a payment link emailed to the customer.</p>
            <input type="number" step="0.1" placeholder="0.0 lbs" value={weightInput}
              onChange={e => setWeightInput(e.target.value)} autoFocus
              className="w-full px-5 py-4 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green outline-none text-2xl font-display font-bold text-washwell-black mb-6" />
            <div className="flex gap-3">
              <button onClick={() => { setWeightModal(false); setSelected(null); setWeightInput(""); }}
                className="flex-1 px-6 py-3 border-2 border-washwell-gray-light text-washwell-black font-semibold rounded-xl hover:bg-washwell-cream">Cancel</button>
              <button onClick={handleWeighSubmit}
                disabled={!weightInput || parseFloat(weightInput) <= 0 || weighing}
                className="flex-1 px-6 py-3 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl shadow-lg disabled:opacity-50">
                {weighing ? "Processing…" : "Confirm & Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
