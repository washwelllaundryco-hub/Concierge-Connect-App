import { useState, useEffect, useRef } from "react";
import { useAuth } from "@clerk/clerk-react";

const STATUS_FLOW = [
  "pending_pickup",
  "awaiting_payment",
  "in_wash",
  "drying",
  "folding",
  "ready",
  "out_for_delivery",
  "delivered",
];

const NEXT_STATUS = {
  pending_pickup:   "awaiting_payment",
  in_wash:          "drying",
  drying:           "folding",
  folding:          "ready",
};

const STATUS_LABEL = {
  pending_pickup:   "Awaiting Pickup",
  awaiting_payment: "Payment Pending",
  in_wash:          "In Wash",
  drying:           "Drying",
  folding:          "Folding",
  ready:            "Ready for Dispatch",
  out_for_delivery: "Out for Delivery",
  delivered:        "Delivered",
};

const STATUS_COLOR = {
  pending_pickup:   "border-gray-300 bg-gray-50",
  awaiting_payment: "border-yellow-300 bg-yellow-50",
  in_wash:          "border-blue-300 bg-blue-50",
  drying:           "border-purple-300 bg-purple-50",
  folding:          "border-indigo-300 bg-indigo-50",
  ready:            "border-green-300 bg-green-50",
  out_for_delivery: "border-teal-300 bg-teal-50",
  delivered:        "border-green-500 bg-green-100",
};

const TIERS = [
  { maxLbs: 15, name: "Essential Load",  price: 68 },
  { maxLbs: 30, name: "Standard Load",   price: 88 },
  { maxLbs: 50, name: "Premium Load",    price: 128 },
  { maxLbs: 75, name: "Executive Load",  price: 188 },
  { maxLbs: 999,name: "Bulk Service",    price: 245 },
];
// Hotel tier prices INCLUDE delivery — no extra delivery fee
const DELIVERY_FEE = 0;

function getTier(lbs) {
  return TIERS.find(t => lbs <= t.maxLbs) || TIERS[TIERS.length - 1];
}

export default function TechnicianDashboard() {
  const { getToken } = useAuth();
  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [weighModal, setWeighModal] = useState(null);  // order being weighed
  const [weight, setWeight]       = useState("");
  const [sendingPayment, setSendingPayment] = useState(false);
  const [updating, setUpdating]   = useState({});
  const [photoUploading, setPhotoUploading] = useState({});
  const pollRef = useRef(null);
  const fileInputRef = useRef(null);
  const [photoOrderId, setPhotoOrderId] = useState(null);

  async function fetchOrders() {
    try {
      const token = await getToken();
      const res = await fetch("/api/orders/active", {
        headers: { Authorization: "Bearer " + token }
      });
      if (res.ok) { const d = await res.json(); setOrders(d.orders || []); }
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }

  useEffect(() => {
    fetchOrders();
    pollRef.current = setInterval(fetchOrders, 15000);
    return () => clearInterval(pollRef.current);
  }, []);

  async function patchStatus(orderId, body) {
    setUpdating(u => ({ ...u, [orderId]: true }));
    try {
      const token = await getToken();
      const res = await fetch("/api/orders/" + orderId + "/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify(body),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || "Update failed."); return; }
      await fetchOrders();
    } catch(e) { alert("Error: " + e.message); } finally {
      setUpdating(u => ({ ...u, [orderId]: false }));
    }
  }

  async function dispatchReturn(orderId, order) {
    setUpdating(u => ({ ...u, [orderId]: true }));
    try {
      const token = await getToken();
      const res = await fetch("/api/orders/" + orderId + "/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          direction: "return",
          dropoffName: order.guestName || "Guest",
          dropoffPhone: order.phone || "",
          dropoffAddress: order.dropoffAddress || (order.hotelName ? order.hotelName + ", Toronto, ON" : "Hotel"),
        }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || "Dispatch failed."); return; }
      await fetchOrders();
      alert("Uber driver dispatched! Tracking: " + (d.trackingUrl || "see Uber dashboard"));
    } catch(e) { alert("Error: " + e.message); } finally {
      setUpdating(u => ({ ...u, [orderId]: false }));
    }
  }

  async function handlePhotoUpload(e) {
    const file = e.target.files?.[0];
    if (!file || !photoOrderId) return;
    setPhotoUploading(u => ({ ...u, [photoOrderId]: true }));
    try {
      const token = await getToken();
      // Read file as base64
      const dataUrl = await new Promise((ok, fail) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.onerror = fail;
        r.readAsDataURL(file);
      });
      const res = await fetch("/api/orders/" + photoOrderId + "/photos", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ photoData: dataUrl, photoType: "tech", filename: file.name }),
      });
      const d = await res.json();
      if (!res.ok) { alert(d.error || "Photo upload failed."); return; }
      alert("✅ Photo saved!");
    } catch (e) { alert("Error: " + e.message); } finally {
      setPhotoUploading(u => ({ ...u, [photoOrderId]: false }));
      setPhotoOrderId(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function confirmWeight() {
    if (sendingPayment) return;  // prevent double-submit
    const lbs = parseFloat(weight);
    if (!lbs || lbs <= 0) return alert("Enter a valid weight.");
    setSendingPayment(true);
    try {
      await patchStatus(weighModal.id, { status: "awaiting_payment", weight: lbs });
      setWeighModal(null);
      setWeight("");
    } finally {
      setSendingPayment(false);
    }
  }

  const tier = weight ? getTier(parseFloat(weight) || 0) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm px-6 py-4">
        <h1 className="text-xl font-bold text-gray-900">Washwell Technician</h1>
        <p className="text-sm text-gray-500">Active orders · refreshes every 15s</p>
      </header>

      <main className="p-4 max-w-3xl mx-auto space-y-4">
        {loading ? (
          <p className="text-gray-400 text-sm text-center py-10">Loading…</p>
        ) : orders.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
            <p className="text-4xl mb-3">✅</p>
            <p>No active orders right now.</p>
          </div>
        ) : orders.map(o => {
          const busy = updating[o.id];
          const next = NEXT_STATUS[o.status];
          return (
            <div key={o.id} className={"rounded-xl border-2 p-4 " + (STATUS_COLOR[o.status] || "border-gray-200 bg-white")}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-gray-900">{o.guestName}</span>
                    {o.roomNumber && <span className="text-xs bg-white/60 px-2 py-0.5 rounded-full text-gray-600">Room {o.roomNumber}</span>}
                    <span className="text-xs text-gray-400">#{o.orderNumber}</span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-gray-500 mt-0.5">
                    {o.hotelName && <span>🏨 {o.hotelName}</span>}
                    {o.phone     && <span>📱 {o.phone}</span>}
                    {o.tier      && <span>📦 {o.tier}</span>}
                    {o.totalWeightLbs && <span>⚖️ {o.totalWeightLbs} lbs</span>}
                    {o.totalAmount    && <span>💳 ${parseFloat(o.totalAmount).toFixed(2)} CAD</span>}
                  </div>
                  {o.specialInstructions && (
                    <p className="text-xs text-gray-500 mt-1 italic">📝 {o.specialInstructions}</p>
                  )}
                </div>
                <span className="text-xs font-semibold bg-white/70 px-2 py-1 rounded-full text-gray-700 ml-2 shrink-0">
                  {STATUS_LABEL[o.status] || o.status}
                </span>
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                {/* Step 1: weigh to trigger payment */}
                {o.status === "pending_pickup" && (
                  <button onClick={() => { setWeighModal(o); setWeight(""); }} disabled={busy}
                    className="bg-yellow-500 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-yellow-600 disabled:opacity-50">
                    ⚖️ Enter Weight &amp; Send Payment Link
                  </button>
                )}

                {/* Step 2: payment pending — nothing to do, waiting for Stripe webhook */}
                {o.status === "awaiting_payment" && (
                  <span className="text-xs text-yellow-700 bg-yellow-100 px-3 py-2 rounded-lg">
                    ⏳ Waiting for customer payment…
                  </span>
                )}

                {/* Steps 3-5: in_wash → drying → folding */}
                {next && o.status !== "pending_pickup" && (
                  <button onClick={() => patchStatus(o.id, { status: next })} disabled={busy}
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
                    {busy ? "Updating…" : "→ " + (STATUS_LABEL[next] || next)}
                  </button>
                )}

                {/* Step 6: dispatch Uber return driver */}
                {o.status === "ready" && (
                  <button onClick={() => dispatchReturn(o.id, o)} disabled={busy}
                    className="bg-teal-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 disabled:opacity-50">
                    {busy ? "Dispatching…" : "🚗 Dispatch Return Driver"}
                  </button>
                )}

                {o.status === "out_for_delivery" && (
                  <span className="text-xs text-teal-700 bg-teal-100 px-3 py-2 rounded-lg">
                    🚗 Driver en route to guest
                  </span>
                )}

                {/* Photo upload — available for any active order past pickup */}
                {!["pending_pickup", "out_for_delivery", "delivered", "cancelled"].includes(o.status) && (
                  <button
                    onClick={() => { setPhotoOrderId(o.id); setTimeout(() => fileInputRef.current?.click(), 50); }}
                    disabled={photoUploading[o.id]}
                    className="bg-gray-100 text-gray-600 px-3 py-2 rounded-lg text-xs font-medium hover:bg-gray-200 disabled:opacity-50">
                    {photoUploading[o.id] ? "Uploading…" : "📷 Add Photo"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </main>

      {/* Hidden file input for photo upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhotoUpload}
      />

      {/* Weight modal */}
      {weighModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Enter Laundry Weight</h3>
            <p className="text-sm text-gray-500 mb-4">
              For <strong>{weighModal.guestName}</strong> — this will determine the tier and send a Stripe payment link to {weighModal.phone || "customer's phone"}.
            </p>
            <div className="mb-3">
              <label className="block text-xs font-semibold text-gray-600 mb-1">Weight (lbs)</label>
              <input type="number" min="0.1" step="0.1" value={weight} onChange={e=>setWeight(e.target.value)} autoFocus
                placeholder="e.g. 18.5" className="w-full border-2 rounded-xl px-4 py-3 text-lg font-mono focus:outline-none focus:ring-2 focus:ring-yellow-400" />
            </div>
            {tier && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3 mb-4 text-sm">
                <p className="font-semibold text-yellow-800">{tier.name}</p>
                <p className="text-yellow-700">Total: <strong>${tier.price} CAD</strong> (delivery included)</p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setWeighModal(null); setWeight(""); }}
                className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={confirmWeight} disabled={!weight || parseFloat(weight) <= 0 || sendingPayment}
                className="flex-1 bg-yellow-500 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-yellow-600 disabled:opacity-50">
                {sendingPayment ? "Sending…" : "Send Payment Link →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
