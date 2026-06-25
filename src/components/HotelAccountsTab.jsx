import { useState, useEffect } from "react";

const TIER_PRICES = {
  "Essential Load": 68,
  "Standard Load": 88,
  "Premium Load": 128,
  "Executive Load": 188,
  "Bulk Service": 245,
};

function getTierPrice(tier) {
  if (!tier) return 0;
  for (const [key, val] of Object.entries(TIER_PRICES)) {
    if (tier.includes(key)) return val;
  }
  return 0;
}

const STATUS_LABELS = {
  paid_pending_technician: "Pending",
  in_wash: "In Wash",
  drying: "Drying",
  folding: "Folding",
  out_for_delivery: "Out for Delivery",
  completed: "Completed",
};

const STATUS_COLORS = {
  paid_pending_technician: "bg-pink-100 text-pink-700",
  in_wash: "bg-orange-100 text-orange-700",
  drying: "bg-yellow-100 text-yellow-700",
  folding: "bg-purple-100 text-purple-700",
  out_for_delivery: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
};

export default function HotelAccountsTab() {
  const [hotels, setHotels] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/hotels/_admin/orders")
      .then(r => r.json())
      .then(d => {
        const list = d.hotels || [];
        setHotels(list);
        if (list.length) setSelectedId(list[0].id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const selected = hotels.find(h => h.id === selectedId);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const allOrders = hotels.flatMap(h => h.orders);
  const monthOrders = allOrders.filter(o => o.createdAt?.startsWith(thisMonth));
  const monthRevenue = monthOrders.reduce((s, o) => s + getTierPrice(o.tier), 0);
  const avgOrder = monthOrders.length ? Math.round(monthRevenue / monthOrders.length) : 0;

  return (
    <div className="flex flex-col" style={{ minHeight: "calc(100vh - 180px)" }}>
      {/* KPI Bar */}
      <div className="grid grid-cols-4 gap-4 px-8 py-5 bg-white border-b border-gray-200">
        {[
          { val: hotels.length, label: "Hotel Accounts" },
          { val: monthOrders.length, label: "Orders This Month", sub: `${allOrders.length} all-time` },
          { val: `$${monthRevenue.toLocaleString()}`, label: "Revenue This Month" },
          { val: `$${avgOrder}`, label: "Avg Order Value" },
        ].map((kpi, i) => (
          <div key={i} className="text-center">
            <div className="text-3xl font-display font-bold text-washwell-black">{kpi.val}</div>
            <div className="text-xs uppercase tracking-wider text-washwell-gray-dark mt-1">{kpi.label}</div>
            {kpi.sub && <div className="text-xs text-washwell-green mt-0.5">{kpi.sub}</div>}
          </div>
        ))}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Hotel List */}
        <div className="w-72 bg-white border-r border-gray-200 overflow-y-auto flex-shrink-0">
          <div className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-washwell-gray-dark border-b border-gray-100">
            Hotel Accounts
          </div>
          {loading ? (
            <div className="p-6 text-center text-gray-400 text-sm">Loading…</div>
          ) : hotels.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">No hotel accounts yet.</div>
          ) : (
            hotels.map(h => {
              const hMonth = h.orders.filter(o => o.createdAt?.startsWith(thisMonth)).length;
              const active = h.orders.filter(o => !["completed", "cancelled"].includes(o.status)).length;
              return (
                <div
                  key={h.id}
                  onClick={() => setSelectedId(h.id)}
                  className={`px-4 py-3 border-b border-gray-50 cursor-pointer hover:bg-gray-50 transition-colors ${
                    selectedId === h.id ? "bg-green-50 border-l-4 border-l-washwell-green" : "border-l-4 border-l-transparent"
                  }`}
                >
                  <div className="font-semibold text-sm text-washwell-black">{h.name}</div>
                  <div className="text-xs text-gray-400 mt-1 flex gap-2">
                    <span>{hMonth} orders this month</span>
                    {active > 0 && (
                      <span className="text-washwell-green font-semibold">· {active} active</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Detail Panel */}
        <div className="flex-1 bg-washwell-cream overflow-y-auto p-6">
          {!selected ? (
            <div className="text-center mt-20 text-gray-400">
              <p className="text-lg font-semibold">Select a hotel</p>
              <p className="text-sm mt-1">Click any hotel on the left.</p>
            </div>
          ) : (
            <HotelDetail hotel={selected} thisMonth={thisMonth} />
          )}
        </div>
      </div>
    </div>
  );
}

function HotelDetail({ hotel, thisMonth }) {
  const allRev = hotel.orders.reduce((s, o) => s + getTierPrice(o.tier), 0);
  const monthOrds = hotel.orders.filter(o => o.createdAt?.startsWith(thisMonth));
  const monthRev = monthOrds.reduce((s, o) => s + getTierPrice(o.tier), 0);
  const avgVal = hotel.orders.length ? Math.round(allRev / hotel.orders.length) : 0;
  const activeOrds = hotel.orders.filter(o => !["completed", "cancelled"].includes(o.status));

  return (
    <div>
      <h2 className="text-2xl font-display font-bold text-washwell-black mb-5">{hotel.name}</h2>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { val: hotel.orders.length, lbl: "Total Orders" },
          { val: `$${allRev.toLocaleString()}`, lbl: "All-Time Revenue" },
          { val: `$${monthRev.toLocaleString()}`, lbl: "This Month" },
          { val: `$${avgVal}`, lbl: "Avg Order" },
        ].map((s, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
            <div className="text-2xl font-display font-bold text-washwell-black">{s.val}</div>
            <div className="text-xs text-washwell-gray-dark mt-1 uppercase tracking-wider">{s.lbl}</div>
          </div>
        ))}
      </div>

      {/* Active Orders */}
      {activeOrds.length > 0 && (
        <>
          <p className="text-xs font-bold uppercase tracking-wider text-washwell-gray-dark mb-3">Active Orders</p>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {["Order", "Guest", "Room", "Service", "Status"].map(h => (
                    <th key={h} className="px-4 py-2 text-left text-xs uppercase tracking-wider text-washwell-gray-dark font-bold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeOrds.map(o => (
                  <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{o.orderNumber}</td>
                    <td className="px-4 py-2 text-sm">{o.guestName}</td>
                    <td className="px-4 py-2 text-sm font-semibold">{o.roomNumber || "—"}</td>
                    <td className="px-4 py-2 text-xs">{o.tier?.split(" —")[0] || "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${STATUS_COLORS[o.status] || "bg-gray-100 text-gray-600"}`}>
                        {STATUS_LABELS[o.status] || o.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Order History */}
      <p className="text-xs font-bold uppercase tracking-wider text-washwell-gray-dark mb-3">Full Order History</p>
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {hotel.orders.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">No orders yet.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                {["Order", "Date", "Guest", "Room", "Service", "Weight", "Status"].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs uppercase tracking-wider text-washwell-gray-dark font-bold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hotel.orders.map(o => (
                <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2 font-mono text-xs">{o.orderNumber}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-CA") : "—"}
                  </td>
                  <td className="px-4 py-2 text-sm">{o.guestName}</td>
                  <td className="px-4 py-2 text-sm font-semibold">{o.roomNumber || "—"}</td>
                  <td className="px-4 py-2 text-xs">{o.tier?.split(" —")[0] || "—"}</td>
                  <td className="px-4 py-2 text-xs">{o.totalWeightLbs ? `${o.totalWeightLbs} lbs` : "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${STATUS_COLORS[o.status] || "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABELS[o.status] || o.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
