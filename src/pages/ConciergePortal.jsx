import { useState, useEffect, useRef } from "react";
import { useUser, useAuth, useClerk } from "@clerk/clerk-react";

const STATUS_BADGE = {
  pending_pickup:   { label: "Awaiting Pickup",  color: "bg-gray-100 text-gray-700" },
  awaiting_payment: { label: "Payment Pending",  color: "bg-yellow-100 text-yellow-800" },
  in_wash:          { label: "In Wash",          color: "bg-blue-100 text-blue-800" },
  drying:           { label: "Drying",           color: "bg-purple-100 text-purple-800" },
  folding:          { label: "Folding",          color: "bg-indigo-100 text-indigo-800" },
  ready:            { label: "Ready",            color: "bg-green-100 text-green-800" },
  out_for_delivery: { label: "Out for Delivery", color: "bg-teal-100 text-teal-800" },
  delivered:        { label: "Delivered",        color: "bg-green-600 text-white" },
  cancelled:        { label: "Cancelled",        color: "bg-red-100 text-red-700" },
};
const TIERS = [
  { name: "Essential Load", label: "Essential Load — up to 15 lbs ($68)",  price: 68  },
  { name: "Standard Load",  label: "Standard Load — up to 30 lbs ($88)",   price: 88  },
  { name: "Premium Load",   label: "Premium Load — up to 50 lbs ($128)",   price: 128 },
  { name: "Executive Load", label: "Executive Load — up to 75 lbs ($188)", price: 188 },
  { name: "Bulk Service",   label: "Bulk Service — 75+ lbs ($245)",        price: 245 },
];

export default function ConciergePortal() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const hotelId   = user?.publicMetadata?.hotelId   || "";
  const hotelName = user?.publicMetadata?.hotelName || "Hotel";
  const [orders, setOrders]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [showNew, setShowNew]   = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sustain, setSustain]   = useState(null);
  const [form, setForm]         = useState({ firstName:"", lastName:"", phone:"", email:"", roomNumber:"", tier:"Standard Load", specialInstructions:"", scheduledPickupAt:"" });
  const pollRef = useRef(null);

  async function fetchOrders() {
    try {
      const token = await getToken();
      const res = await fetch("/api/hotels/" + hotelId + "/orders", {
        headers: { Authorization: "Bearer " + token }
      });
      if (res.ok) { const d = await res.json(); setOrders(d.orders || []); }
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }

  async function fetchSustain() {
    try { const r = await fetch("/api/sustainability/sync"); if (r.ok) setSustain(await r.json()); } catch {}
  }

  useEffect(() => {
    if (!hotelId) return;
    fetchOrders(); fetchSustain();
    pollRef.current = setInterval(() => { fetchOrders(); fetchSustain(); }, 15000);
    return () => clearInterval(pollRef.current);
  }, [hotelId]);

  async function handleSubmit() {
    if (!form.firstName.trim()) return alert("First name is required.");
    if (!form.phone.trim())     return alert("Phone is required — payment link is sent here after weighing.");
    if (!form.roomNumber.trim()) return alert("Room number is required.");
    setSubmitting(true);
    try {
      const token = await getToken();
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({ ...form, hotelId, hotelName, placedBy: "concierge" }),
      });
      const text = await res.text();
      let d = {};
      try { d = JSON.parse(text); } catch { d = { error: text || "Server error" }; }
      if (!res.ok) { alert(d.error || "Failed to place order."); return; }
      setShowNew(false);
      setForm({ firstName:"", lastName:"", phone:"", email:"", roomNumber:"", tier:"Standard Load", specialInstructions:"", scheduledPickupAt:"" });
      fetchOrders();
      alert("Order " + d.orderNumber + " placed! Technician has been notified by SMS.");
    } catch(e) { alert("Error: " + e.message); } finally { setSubmitting(false); }
  }

  function inp(label, key, type="text", placeholder="", required=false) {
    return (
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
        <input type={type} value={form[key]} onChange={e=>setForm(p=>({...p,[key]:e.target.value}))} placeholder={placeholder}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-washwell-black px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Washwell" className="h-10 w-10 rounded-xl bg-white p-1" />
          <div>
            <p className="text-white font-bold text-sm leading-tight font-display">Washwell Concierge</p>
            <p className="text-washwell-gray text-xs leading-tight">{hotelName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={()=>setShowNew(true)} className="bg-washwell-green text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-washwell-green-dark font-display">+ New Order</button>
          <button onClick={()=>signOut()} className="text-xs text-washwell-gray hover:text-white transition-colors">Sign out</button>
        </div>
      </header>

      {sustain && parseFloat(sustain.total_lbs || 0) > 0 && (
        <div className="bg-green-50 border-b border-green-100 px-6 py-3 flex flex-wrap gap-6 text-sm">
          <span>💧 <strong>{parseFloat(sustain.water_saved_gallons||0).toFixed(0)}</strong> gal water saved</span>
          <span>⚡ <strong>{parseFloat(sustain.energy_saved_kwh||0).toFixed(1)}</strong> kWh saved</span>
          <span>🌿 <strong>{parseFloat(sustain.co2_saved_lbs||0).toFixed(1)}</strong> lbs CO₂ offset</span>
          <span>📦 <strong>{sustain.total_orders||0}</strong> orders completed</span>
        </div>
      )}

      <main className="p-6 max-w-5xl mx-auto">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Active Orders</h2>
        {loading ? <p className="text-gray-400 text-sm">Loading…</p> : orders.length===0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400">
            <p className="text-sm text-gray-400">No active orders. Click "+ New Order" to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map(o => {
              const b = STATUS_BADGE[o.status] || { label: o.status, color: "bg-gray-100 text-gray-600" };
              return (
                <div key={o.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{o.guestName}</span>
                      {o.roomNumber && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">Room {o.roomNumber}</span>}
                      <span className="text-xs text-gray-400">#{o.orderNumber}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap mt-0.5">
                      {o.tier && <span>{o.tier}</span>}
                      {o.phone && <span>📱 {o.phone}</span>}
                      {o.totalWeightLbs && <span>{o.totalWeightLbs} lbs</span>}
                      {o.totalAmount && <span>${parseFloat(o.totalAmount).toFixed(2)} CAD</span>}
                      <span>{new Date(o.createdAt).toLocaleDateString()}</span>
                    </div>
                    {o.status === "awaiting_payment" && (
                      <p className="text-xs text-yellow-700 mt-1">📱 Payment link sent to customer's phone</p>
                    )}
                    {o.status === "out_for_delivery" && (
                      <p className="text-xs text-teal-700 mt-1">🚗 Uber driver dispatched for delivery</p>
                    )}
                  </div>
                  <span className={"text-xs font-semibold px-3 py-1 rounded-full " + b.color}>{b.label}</span>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {showNew && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={e=>{if(e.target===e.currentTarget)setShowNew(false)}}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 overflow-y-auto max-h-[90vh]">
            <h3 className="text-lg font-bold text-gray-900 mb-4">New Laundry Order</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                {inp("First Name","firstName","text","Jane",true)}
                {inp("Last Name","lastName","text","Smith")}
              </div>
              {inp("Phone Number","phone","tel","+1 416 555 0100",true)}
              <p className="text-xs text-gray-400 -mt-1">Required — Stripe payment link is sent to this number after weighing</p>
              {inp("Email","email","email","jane@example.com")}
              {inp("Room Number","roomNumber","text","412",true)}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Service Tier</label>
                <select value={form.tier} onChange={e=>setForm(p=>({...p,tier:e.target.value}))} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400">
                  {TIERS.map(t=><option key={t.name} value={t.name}>{t.label}</option>)}
                </select>
                <p className="text-xs text-gray-400 mt-1">Technician will confirm exact tier after weighing the laundry</p>
              </div>
              {inp("Special Instructions","specialInstructions","text","No scent, cold wash, hang dry...")}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Pickup Time</label>
                <div className="flex gap-2 mb-2">
                  <button type="button"
                    onClick={() => setForm(p => ({ ...p, scheduledPickupAt: "" }))}
                    className={"flex-1 py-2 rounded-lg text-sm font-medium border transition-all " + (!form.scheduledPickupAt ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300")}>
                    ASAP
                  </button>
                  <button type="button"
                    onClick={() => { const d = new Date(); d.setHours(d.getHours()+2,0,0,0); setForm(p => ({ ...p, scheduledPickupAt: d.toISOString().slice(0,16) })); }}
                    className={"flex-1 py-2 rounded-lg text-sm font-medium border transition-all " + (form.scheduledPickupAt ? "bg-green-600 text-white border-green-600" : "bg-white text-gray-600 border-gray-200 hover:border-gray-300")}>
                    Schedule
                  </button>
                </div>
                {form.scheduledPickupAt && (
                  <input type="datetime-local" value={form.scheduledPickupAt}
                    onChange={e => setForm(p => ({ ...p, scheduledPickupAt: e.target.value }))}
                    min={new Date().toISOString().slice(0,16)}
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={()=>setShowNew(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50">Cancel</button>
              <button onClick={handleSubmit} disabled={submitting || !form.firstName || !form.phone || !form.roomNumber}
                className="flex-1 bg-green-600 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-green-700 disabled:opacity-50">
                {submitting ? "Placing…" : "Request Pickup →"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
