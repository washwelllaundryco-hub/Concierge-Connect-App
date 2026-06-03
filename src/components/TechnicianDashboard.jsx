import { useState } from "react";

const MOCK_ORDERS = [
  { id: "ord-20241", orderNumber: "WW-20241", guestName: "Marcus Webb",   roomNumber: "412", status: "paid_pending_technician", paymentVerified: true,  totalWeightLbs: null, washerNumber: null, dryerNumber: null },
  { id: "ord-20242", orderNumber: "WW-20242", guestName: "Sarah Chen",    roomNumber: "315", status: "in_wash",                 paymentVerified: true,  totalWeightLbs: 22.4, washerNumber: null, dryerNumber: null },
  { id: "ord-20243", orderNumber: "WW-20243", guestName: "James Rivera",  roomNumber: "201", status: "drying",                  paymentVerified: true,  totalWeightLbs: 18.1, washerNumber: 3,    dryerNumber: null },
];

const STATUS_FLOW = ["paid_pending_technician", "in_wash", "drying", "folding", "completed"];

export default function TechnicianDashboard() {
  const [orders, setOrders] = useState(MOCK_ORDERS);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showWeightModal, setShowWeightModal] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [machineInputs, setMachineInputs] = useState({});

  const handleStatusUpdate = async (orderId, newStatus, weight = null) => {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId
          ? { ...o, status: newStatus, totalWeightLbs: weight ?? o.totalWeightLbs }
          : o
      )
    );
    await fetch(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus, weight }),
    }).catch(() => {});

    if (newStatus === "completed") {
      await fetch(`/api/sustainability/sync`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      }).catch(() => {});
    }
  };

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
    await fetch(`/api/orders/machine`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, machineType, machineNumber: num }),
    }).catch(() => {});
  };

  const nextStatus = (current) => {
    const idx = STATUS_FLOW.indexOf(current);
    return STATUS_FLOW[idx + 1] ?? current;
  };

  const actionLabel = (order) => {
    if (order.status === "paid_pending_technician") return "Start Processing";
    if (order.status === "in_wash")  return "Move to Drying";
    if (order.status === "drying")   return "Move to Folding";
    if (order.status === "folding")  return "Mark as Completed";
    return null;
  };

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

        <div className="grid md:grid-cols-2 gap-6">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-3xl shadow-lg border-2 border-washwell-gray-light p-6 hover:shadow-xl transition-all"
            >
              {/* Order header */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <div className="inline-block px-4 py-1.5 bg-washwell-green-pale border-2 border-washwell-green rounded-full mb-3">
                    <span className="font-display text-sm font-bold text-washwell-green">
                      {order.orderNumber}
                    </span>
                  </div>
                  <h3 className="text-xl font-display font-bold text-washwell-black mb-1">
                    {order.guestName}
                  </h3>
                  <p className="text-sm text-washwell-gray-dark">Room {order.roomNumber}</p>
                </div>
                {order.paymentVerified && (
                  <div className="px-4 py-2 bg-washwell-green rounded-xl border-2 border-washwell-green-dark flex items-center gap-2 shadow-lg">
                    <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-white text-xs font-bold uppercase tracking-wider">Paid</span>
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="mb-4 p-4 bg-washwell-cream rounded-xl border-2 border-washwell-gray-light">
                <div className="text-xs text-washwell-gray uppercase tracking-wider font-semibold mb-1">
                  Current Status
                </div>
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

              {/* Machine number inputs */}
              {(order.status === "in_wash" || order.status === "drying" || order.status === "folding") && (
                <div className="mb-4 grid grid-cols-2 gap-3">
                  {/* Washer */}
                  <div>
                    <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-1">
                      Washer #
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="1"
                        placeholder="—"
                        defaultValue={order.washerNumber || ""}
                        onChange={(e) =>
                          setMachineInputs((p) => ({ ...p, [`${order.id}_washer`]: e.target.value }))
                        }
                        className="w-full px-3 py-2 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green outline-none font-display font-bold text-washwell-black text-center"
                      />
                      <button
                        onClick={() =>
                          handleMachineAssign(order.id, "washer", machineInputs[`${order.id}_washer`] || order.washerNumber)
                        }
                        className="px-3 py-2 bg-washwell-green text-white rounded-xl font-bold text-sm hover:bg-washwell-green-dark transition-all"
                      >
                        Set
                      </button>
                    </div>
                    {order.washerNumber && (
                      <p className="text-xs text-washwell-green font-semibold mt-1">Assigned: #{order.washerNumber}</p>
                    )}
                  </div>

                  {/* Dryer */}
                  <div>
                    <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-1">
                      Dryer #
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min="1"
                        placeholder="—"
                        defaultValue={order.dryerNumber || ""}
                        onChange={(e) =>
                          setMachineInputs((p) => ({ ...p, [`${order.id}_dryer`]: e.target.value }))
                        }
                        className="w-full px-3 py-2 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green outline-none font-display font-bold text-washwell-black text-center"
                      />
                      <button
                        onClick={() =>
                          handleMachineAssign(order.id, "dryer", machineInputs[`${order.id}_dryer`] || order.dryerNumber)
                        }
                        className="px-3 py-2 bg-washwell-green text-white rounded-xl font-bold text-sm hover:bg-washwell-green-dark transition-all"
                      >
                        Set
                      </button>
                    </div>
                    {order.dryerNumber && (
                      <p className="text-xs text-washwell-green font-semibold mt-1">Assigned: #{order.dryerNumber}</p>
                    )}
                  </div>
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
            </div>
          ))}
        </div>
      </main>

      {/* Weight Modal */}
      {showWeightModal && selectedOrder && (
        <div className="fixed inset-0 bg-washwell-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border-2 border-washwell-green">
            <h3 className="text-2xl font-display font-bold text-washwell-black mb-2">Log Weight</h3>
            <p className="text-sm text-washwell-gray-dark mb-6">Order {selectedOrder.orderNumber}</p>
            <input
              type="number"
              step="0.1"
              placeholder="0.0"
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              autoFocus
              className="w-full px-5 py-4 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green focus:ring-4 focus:ring-washwell-green/10 outline-none transition-all text-2xl font-display font-bold text-washwell-black mb-6"
            />
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
                    handleStatusUpdate(selectedOrder.id, "in_wash", w);
                    setShowWeightModal(false);
                    setSelectedOrder(null);
                    setWeightInput("");
                  }
                }}
                disabled={!weightInput || parseFloat(weightInput) <= 0}
                className="flex-1 px-6 py-3 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
