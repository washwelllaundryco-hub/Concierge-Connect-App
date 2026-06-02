import { useState, useEffect } from "react";
import { useUser, useAuth, useClerk } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import { PRICING_TIERS } from "../constants";

const STATUS_BADGE = {
  pending:                { label: "Pending",          color: "bg-washwell-gray-light text-washwell-gray-dark" },
  paid_pending_technician:{ label: "Paid — Awaiting",  color: "bg-yellow-100 text-yellow-800" },
  in_wash:                { label: "In Wash",           color: "bg-blue-100 text-blue-800" },
  drying:                 { label: "Drying",            color: "bg-purple-100 text-purple-800" },
  folding:                { label: "Folding",           color: "bg-indigo-100 text-indigo-800" },
  out_for_delivery:       { label: "Out for Delivery",  color: "bg-washwell-green-pale text-washwell-green-dark" },
  completed:              { label: "Delivered",         color: "bg-washwell-green text-white" },
};

// Mock orders — replaced by real API once database is connected
const MOCK_ORDERS = [
  { id: "ord-20241", orderNumber: "WW-20241", guestFirstName: "Marcus", guestLastName: "Webb",   roomNumber: "412", status: "out_for_delivery", tier: "Standard Load", createdAt: "2026-05-15T09:30:00Z" },
  { id: "ord-20242", orderNumber: "WW-20242", guestFirstName: "Sarah",  guestLastName: "Chen",   roomNumber: "315", status: "in_wash",          tier: "Premium Load",  createdAt: "2026-05-15T10:15:00Z" },
  { id: "ord-20243", orderNumber: "WW-20243", guestFirstName: "James",  guestLastName: "Rivera", roomNumber: "201", status: "folding",          tier: "Essential Load",createdAt: "2026-05-15T11:00:00Z" },
];

export default function ConciergePortal() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const navigate = useNavigate();

  const hotelId   = user.publicMetadata?.hotelId   || "hotel-demo";
  const hotelName = user.publicMetadata?.hotelName  || "Your Hotel";

  const [orders, setOrders] = useState(MOCK_ORDERS);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [newOrder, setNewOrder] = useState({ firstName: "", lastName: "", roomNumber: "", tier: "Standard Load" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function fetchOrders() {
      try {
        const token = await getToken();
        const res = await fetch(`/api/hotels/${hotelId}/orders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setOrders(data.orders);
        }
      } catch {
        // fall through to mock data
      }
    }
    fetchOrders();
  }, [hotelId]);

  const activeOrders   = orders.filter((o) => o.status !== "completed");
  const deliveredToday = orders.filter((o) => o.status === "completed");

  const handleNewOrderSubmit = async () => {
    if (!newOrder.firstName || !newOrder.roomNumber) return;
    setSubmitting(true);

    try {
      const token = await getToken();
      const res = await fetch("/api/orders/request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ...newOrder, hotelId }),
      });
      const data = await res.json();

      // Open the Stripe link for the selected tier
      const tier = PRICING_TIERS[newOrder.tier];
      window.open(tier.stripeUrl, "_blank");

      setShowNewOrder(false);
      setNewOrder({ firstName: "", lastName: "", roomNumber: "", tier: "Standard Load" });
    } catch (err) {
      console.error("Create order error:", err);
    } finally {
      setSubmitting(false);
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
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-10">
          {[
            { label: "Active Orders",    value: activeOrders.length },
            { label: "Out for Delivery", value: orders.filter((o) => o.status === "out_for_delivery").length },
            { label: "Delivered Today",  value: deliveredToday.length },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white rounded-2xl border-2 border-washwell-gray-light p-5 text-center">
              <div className="text-4xl font-mono font-bold text-washwell-green mb-1">{value}</div>
              <div className="text-xs text-washwell-gray uppercase tracking-wider font-semibold">{label}</div>
            </div>
          ))}
        </div>

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
              <div className="text-5xl mb-3"></div>
              <p className="font-semibold">No active orders</p>
            </div>
          )}
          {activeOrders.map((order) => {
            const badge = STATUS_BADGE[order.status] || STATUS_BADGE.pending;
            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl border-2 border-washwell-gray-light px-6 py-5 flex items-center gap-4 hover:shadow-md transition-all"
              >
                {/* Order number */}
                <div className="hidden md:block">
                  <span className="font-mono text-sm font-bold text-washwell-green bg-washwell-green-pale px-3 py-1 rounded-full border border-washwell-green">
                    {order.orderNumber}
                  </span>
                </div>

                {/* Guest info */}
                <div className="flex-1">
                  <p className="font-display font-bold text-washwell-black">
                    {order.guestFirstName} {order.guestLastName}
                  </p>
                  <p className="text-sm text-washwell-gray-dark">
                    Room {order.roomNumber} · {order.tier}
                  </p>
                </div>

                {/* Status badge */}
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${badge.color}`}>
                  {badge.label}
                </span>

                {/* Actions */}
                <div className="flex gap-2">
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
      </main>

      {/* New Pickup Request Modal */}
      {showNewOrder && (
        <div className="fixed inset-0 bg-washwell-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border-2 border-washwell-green">
            <h3 className="text-2xl font-display font-bold text-washwell-black mb-1">New Pickup Request</h3>
            <p className="text-sm text-washwell-gray-dark mb-6">{hotelName}</p>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={newOrder.firstName}
                    onChange={(e) => setNewOrder((p) => ({ ...p, firstName: e.target.value }))}
                    placeholder="Marcus"
                    className="w-full px-4 py-3 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green focus:ring-4 focus:ring-washwell-green/10 outline-none transition-all font-medium text-washwell-black"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={newOrder.lastName}
                    onChange={(e) => setNewOrder((p) => ({ ...p, lastName: e.target.value }))}
                    placeholder="Webb"
                    className="w-full px-4 py-3 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green focus:ring-4 focus:ring-washwell-green/10 outline-none transition-all font-medium text-washwell-black"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-1">
                  Room Number
                </label>
                <input
                  type="text"
                  value={newOrder.roomNumber}
                  onChange={(e) => setNewOrder((p) => ({ ...p, roomNumber: e.target.value }))}
                  placeholder="412"
                  className="w-full px-4 py-3 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green focus:ring-4 focus:ring-washwell-green/10 outline-none transition-all font-medium text-washwell-black"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-3">
                  Service Tier
                </label>
                <div className="space-y-2">
                  {Object.entries(PRICING_TIERS).map(([name, tier]) => {
                    const isSelected = newOrder.tier === name;
                    return (
                      <button
                        key={name}
                        onClick={() => setNewOrder((p) => ({ ...p, tier: name }))}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all text-left ${
                          isSelected
                            ? "bg-washwell-green-pale border-washwell-green"
                            : "bg-washwell-cream border-washwell-gray-light hover:border-washwell-green/50"
                        }`}
                      >
                        <span>{tier.icon}</span>
                        <span className="flex-1 font-semibold text-sm text-washwell-black">{name}</span>
                        <span className={`font-mono font-bold text-sm ${isSelected ? "text-washwell-green" : "text-washwell-gray-dark"}`}>
                          ${tier.price}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowNewOrder(false)}
                className="flex-1 py-3 border-2 border-washwell-gray-light text-washwell-black font-semibold rounded-xl hover:bg-washwell-cream transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleNewOrderSubmit}
                disabled={submitting || !newOrder.firstName || !newOrder.roomNumber}
                className="flex-1 py-3 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Opening Stripe..." : "Proceed to Payment →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
