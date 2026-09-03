import { useState, useEffect, useMemo } from "react";

const TIER_PRICE = { "Essential Load": 68, "Standard Load": 88, "Premium Load": 128, "Executive Load": 188, "Bulk Service": 245 };
const STATUS_COLORS = {
  completed: "bg-green-100 text-green-700",
  out_for_delivery: "bg-blue-100 text-blue-700",
  folding: "bg-indigo-100 text-indigo-700",
  drying: "bg-yellow-100 text-yellow-700",
  in_wash: "bg-orange-100 text-orange-700",
  paid_pending_technician: "bg-pink-100 text-pink-700",
  awaiting_payment: "bg-red-100 text-red-700",
};

export default function HotelAccountsTab() {
  const [hotels, setHotels]          = useState([]);
  const [loading, setLoading]        = useState(true);
  const [selectedHotel, setSelected] = useState(null);

  useEffect(() => {
    fetch("/api/hotels/_admin/orders")
      .then(r => r.json())
      .then(d => {
        setHotels(d.hotels || []);
        if (d.hotels?.length) setSelected(d.hotels[0]);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const thisMonth = new Date().toISOString().slice(0, 7);
  function fmt(n) { return "$" + (n || 0).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  const kpis = useMemo(() => {
    const all = hotels.flatMap(h => h.orders || []);
    const mo  = all.filter(o => o.createdAt?.startsWith(thisMonth));
    const rev = mo.reduce((s, o) => s + parseFloat(o.totalAmount || TIER_PRICE[o.tier] || 0), 0);
    return { hotelCount: hotels.length, monthOrders: mo.length, monthRev: rev, avgVal: mo.length ? rev / mo.length : 0 };
  }, [hotels]);

  const hotelStats = useMemo(() => hotels.map(h => ({
    ...h,
    monthCount: (h.orders || []).filter(o => o.createdAt?.startsWith(thisMonth)).length,
    activeCount: (h.orders || []).filter(o => !["completed","cancelled"].includes(o.status)).length,
  })), [hotels]);

  const detail = useMemo(() => {
    if (!selectedHotel) return null;
    const orders  = selectedHotel.orders || [];
    const mo      = orders.filter(o => o.createdAt?.startsWith(thisMonth));
    const active  = orders.filter(o => !["completed","cancelled"].includes(o.status));
    const monthRev = mo.reduce((s, o) => s + parseFloat(o.totalAmount || TIER_PRICE[o.tier] || 0), 0);
    return { orders, monthOrders: mo, activeOrders: active, monthRev };
  }, [selectedHotel]);

  if (loading) return <div className="p-12 text-center text-gray-400">Loading hotel accounts…</div>;

  return (
    <div className="bg-washwell-cream min-h-full">
      <div className="grid grid-cols-4 gap-px bg-gray-200 border-b border-gray-200">
        {[
          { label: "Hotels",             val: kpis.hotelCount },
          { label: "Orders This Month",  val: kpis.monthOrders },
          { label: "Revenue This Month", val: fmt(kpis.monthRev) },
          { label: "Avg Order Value",    val: fmt(kpis.avgVal) },
        ].map((k, i) => (
          <div key={i} className="bg-white px-6 py-5 text-center">
            <div className="text-3xl font-display font-bold text-washwell-black">{k.val}</div>
            <div className="text-xs uppercase tracking-wider text-washwell-gray-dark mt-1">{k.label}</div>
          </div>
        ))}
      </div>

      <div className="flex" style={{ minHeight: "calc(100vh - 200px)" }}>
        <div className="w-72 bg-white border-r border-gray-200 flex-shrink-0 overflow-y-auto">
          {hotelStats.length === 0 ? (
            <div className="p-6 text-sm text-gray-400">No hotels found.</div>
          ) : hotelStats.map(h => (
            <button key={h.hotelId} onClick={() => setSelected(h)}
              className={`w-full text-left px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                selectedHotel?.hotelId === h.hotelId ? "bg-green-50 border-l-4 border-l-washwell-green" : ""
              }`}>
              <div className="font-semibold text-sm text-washwell-black">{h.hotelName}</div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-gray-500">{h.monthCount} this month</span>
                {h.activeCount > 0 && (
                  <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs font-bold rounded-full">{h.activeCount} active</span>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {!detail ? <div className="text-gray-400 text-sm">Select a hotel.</div> : (
            <>
              <h2 className="text-xl font-display font-bold text-washwell-black mb-4">{selectedHotel?.hotelName}</h2>
              <div className="grid grid-cols-4 gap-4 mb-6">
                {[
                  { label: "Total Orders",  val: detail.orders.length },
                  { label: "This Month",    val: detail.monthOrders.length },
                  { label: "Month Revenue", val: fmt(detail.monthRev) },
                  { label: "Active Now",    val: detail.activeOrders.length },
                ].map((s, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
                    <div className="text-2xl font-display font-bold text-washwell-black">{s.val}</div>
                    <div className="text-xs uppercase tracking-wider text-washwell-gray-dark mt-1">{s.label}</div>
                  </div>
                ))}
              </div>

              {detail.activeOrders.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-washwell-gray-dark mb-3">Active Orders</h3>
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <table className="w-full">
                      <thead><tr className="bg-gray-50 border-b border-gray-200">
                        {["Order #","Room","Guest","Tier","Status"].map(col => (
                          <th key={col} className="px-4 py-3 text-left text-xs uppercase tracking-wider text-washwell-gray-dark font-bold">{col}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {detail.activeOrders.map(o => (
                          <tr key={o.orderId} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-4 py-3 font-mono text-xs font-bold">{o.orderNumber}</td>
                            <td className="px-4 py-3 text-sm">{o.roomNumber || "—"}</td>
                            <td className="px-4 py-3 text-sm">{`${o.guestFirstName||""} ${o.guestLastName||""}`.trim()||"—"}</td>
                            <td className="px-4 py-3 text-xs">{o.tier?.replace(/ —.*/,"") || "—"}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded text-xs font-semibold ${STATUS_COLORS[o.status]||"bg-gray-100 text-gray-600"}`}>
                                {o.status?.replace(/_/g," ")}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <h3 className="text-sm font-bold uppercase tracking-wider text-washwell-gray-dark mb-3">All Orders</h3>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {detail.orders.length === 0 ? (
                  <div className="p-6 text-sm text-gray-400">No orders yet.</div>
                ) : (
                  <table className="w-full">
                    <thead><tr className="bg-gray-50 border-b border-gray-200">
                      {["Order #","Date","Room","Guest","Tier","Amount","Payment","Status"].map(col => (
                        <th key={col} className="px-4 py-3 text-left text-xs uppercase tracking-wider text-washwell-gray-dark font-bold">{col}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {detail.orders.map(o => (
                        <tr key={o.orderId} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs font-bold">{o.orderNumber}</td>
                          <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                            {o.createdAt ? new Date(o.createdAt).toLocaleDateString("en-CA") : "—"}
                          </td>
                          <td className="px-4 py-3 text-sm">{o.roomNumber||"—"}</td>
                          <td className="px-4 py-3 text-sm">{`${o.guestFirstName||""} ${o.guestLastName||""}`.trim()||"—"}</td>
                          <td className="px-4 py-3 text-xs">{o.tier?.replace(/ —.*/,"") || "—"}</td>
                          <td className="px-4 py-3 text-sm font-bold">{o.totalAmount ? fmt(parseFloat(o.totalAmount)) : "—"}</td>
                          <td className="px-4 py-3 text-xs capitalize">{o.paymentMethod?.replace(/_/g," ")||"—"}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${STATUS_COLORS[o.status]||"bg-gray-100 text-gray-600"}`}>
                              {o.status?.replace(/_/g," ")}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
