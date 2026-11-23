import { useUser, useAuth } from "@clerk/clerk-react";
import { useState, useEffect, useRef } from "react";
import GuestLandingPage from "../components/GuestLandingPage";

const STATUS_LABEL = {
  pending_pickup:   "Awaiting Pickup",
  awaiting_payment: "Payment Pending",
  in_wash:          "In Wash",
  drying:           "Drying",
  folding:          "Folding",
  ready:            "Ready for Delivery",
  out_for_delivery: "On the Way",
  delivered:        "Delivered",
};

export default function GuestPortal() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const [orders, setOrders] = useState([]);
  const [view, setView]     = useState("new"); // new | history
  const pollRef = useRef(null);

  async function fetchOrders() {
    try {
      const token = await getToken();
      const res = await fetch("/api/guest/orders", {
        headers: { Authorization: "Bearer " + token }
      });
      if (res.ok) { const d = await res.json(); setOrders(d.orders || []); }
    } catch {}
  }

  useEffect(() => {
    if (isLoaded && user) {
      fetchOrders();
      pollRef.current = setInterval(fetchOrders, 15000);
      return () => clearInterval(pollRef.current);
    }
  }, [isLoaded, user]);

  if (!isLoaded) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">Loading…</p></div>;

  const activeOrders = orders.filter(o => !["delivered","cancelled"].includes(o.status));

  return (
    <div>
      {activeOrders.length > 0 && (
        <div className="bg-white border-b px-4 py-2 flex gap-4">
          <button onClick={()=>setView("new")} className={"text-sm font-semibold pb-1 " + (view==="new" ? "text-green-600 border-b-2 border-green-600" : "text-gray-500")}>New Order</button>
          <button onClick={()=>setView("history")} className={"text-sm font-semibold pb-1 " + (view==="history" ? "text-green-600 border-b-2 border-green-600" : "text-gray-500")}>
            Active ({activeOrders.length})
          </button>
        </div>
      )}

      {view === "new" || activeOrders.length === 0 ? (
        <GuestLandingPage />
      ) : (
        <div className="p-4 space-y-3 max-w-lg mx-auto pt-6">
          <h2 className="text-lg font-semibold text-gray-800">Your Active Orders</h2>
          {activeOrders.map(o => (
            <div key={o.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-gray-900">Order #{o.orderNumber}</span>
                <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-medium">{STATUS_LABEL[o.status]||o.status}</span>
              </div>
              <div className="text-xs text-gray-500 flex flex-wrap gap-2">
                {o.tier && <span>{o.tier}</span>}
                {o.totalWeightLbs && <span>{o.totalWeightLbs} lbs</span>}
                {o.totalAmount && <span>${parseFloat(o.totalAmount).toFixed(2)} CAD</span>}
              </div>
              {o.status === "awaiting_payment" && (
                <p className="text-xs text-yellow-700 mt-2 bg-yellow-50 rounded-lg px-2 py-1.5">📱 Payment link sent to your phone — check SMS</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
