import { useState, useEffect, useMemo } from "react";

const STATUS_LABELS = {
  paid_pending_technician: "Pending",
  awaiting_payment: "Awaiting Payment",
  in_wash: "In Wash",
  drying: "Drying",
  folding: "Folding",
  out_for_delivery: "Out for Delivery",
  completed: "Completed",
};
const SRC_COLORS = {
  "Hotel Concierge": "bg-purple-100 text-purple-700 border-purple-200",
  "Hotel Guest App": "bg-blue-100 text-blue-700 border-blue-200",
  "Residential":     "bg-orange-100 text-orange-700 border-orange-200",
};
const STATUS_COLORS = {
  completed: "bg-green-100 text-green-700",
  out_for_delivery: "bg-blue-100 text-blue-700",
  folding: "bg-indigo-100 text-indigo-700",
  drying: "bg-yellow-100 text-yellow-700",
  in_wash: "bg-orange-100 text-orange-700",
  paid_pending_technician: "bg-pink-100 text-pink-700",
  awaiting_payment: "bg-red-100 text-red-700",
};
function getSource(o) {
  if (o.placedBy === "concierge") return "Hotel Concierge";
  if (o.hotelName)               return "Hotel Guest App";
  return "Residential";
}
function fmt(n) { return "$" + (n||0).toLocaleString("en-CA",{minimumFractionDigits:2,maximumFractionDigits:2}); }
const SOURCES = ["Hotel Concierge","Hotel Guest App","Residential"];

export default function OrderAnalyticsTab() {
  const [orders,    setOrders]   = useState([]);
  const [loading,   setLoading]  = useState(true);
  const [srcFilter, setSrc]      = useState("All");
  const [statFilter,setStat]     = useState("All");
  const [search,    setSearch]   = useState("");
  const [dateFrom,  setFrom]     = useState("");
  const [dateTo,    setTo]       = useState("");
  const [sortCol,   setSort]     = useState("createdAt");
  const [sortAsc,   setAsc]      = useState(false);

  useEffect(() => {
    fetch("/api/orders/active?all=true")
      .then(r => r.json())
      .then(d => { setOrders(d.orders||[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const thisMonth = new Date().toISOString().slice(0,7);
  const lastMonth = (() => { const d=new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7); })();

  const monthOrders = orders.filter(o => o.createdAt?.startsWith(thisMonth));
  const lastOrders  = orders.filter(o => o.createdAt?.startsWith(lastMonth));
  const totalRev    = orders.reduce((s,o)=>s+parseFloat(o.totalAmount||0),0);
  const monthRev    = monthOrders.reduce((s,o)=>s+parseFloat(o.totalAmount||0),0);
  const lastRev     = lastOrders.reduce((s,o)=>s+parseFloat(o.totalAmount||0),0);
  const completed   = orders.filter(o=>o.status==="completed");
  const avgVal      = completed.length ? totalRev/completed.length : 0;
  const monthDiff   = lastRev ? Math.round(((monthRev-lastRev)/lastRev)*100) : null;

  const bySource = useMemo(()=>{
    const m={"Hotel Concierge":{count:0,rev:0},"Hotel Guest App":{count:0,rev:0},"Residential":{count:0,rev:0}};
    orders.forEach(o=>{const s=getSource(o);m[s].count++;m[s].rev+=parseFloat(o.totalAmount||0);});
    return m;
  },[orders]);
  const maxCount = Math.max(...Object.values(bySource).map(v=>v.count),1);

  const filtered = useMemo(()=>{
    let list=orders;
    if(srcFilter!=="All")  list=list.filter(o=>getSource(o)===srcFilter);
    if(statFilter!=="All") list=list.filter(o=>o.status===statFilter);
    if(dateFrom)           list=list.filter(o=>o.createdAt>=dateFrom);
    if(dateTo)             list=list.filter(o=>o.createdAt<=dateTo+"T23:59:59");
    if(search){const q=search.toLowerCase();list=list.filter(o=>o.orderNumber?.toLowerCase().includes(q)||o.guestName?.toLowerCase().includes(q)||o.hotelName?.toLowerCase().includes(q));}
    return [...list].sort((a,b)=>{
      let av=sortCol==="totalAmount"?parseFloat(a[sortCol]||0):(a[sortCol]??"");
      let bv=sortCol==="totalAmount"?parseFloat(b[sortCol]||0):(b[sortCol]??"");
      if(av<bv) return sortAsc?-1:1;
      if(av>bv) return sortAsc?1:-1;
      return 0;
    });
  },[orders,srcFilter,statFilter,dateFrom,dateTo,search,sortCol,sortAsc]);

  const filteredRev=filtered.reduce((s,o)=>s+parseFloat(o.totalAmount||0),0);
  function thClick(col){if(sortCol===col)setAsc(a=>!a);else{setSort(col);setAsc(false);}}

  return (
    <div className="bg-washwell-cream min-h-full">
      <div className="grid grid-cols-4 gap-px bg-gray-200 border-b border-gray-200">
        {[
          {label:"All-Time Revenue",  val:fmt(totalRev),    sub:`${orders.length} total orders`},
          {label:"This Month Revenue",val:fmt(monthRev),    sub:monthDiff!==null?`${monthDiff>=0?"+":""}${monthDiff}% vs last month`:"—",pos:monthDiff>0},
          {label:"Completed Orders",  val:completed.length, sub:`${monthOrders.length} this month`},
          {label:"Avg Order Value",   val:fmt(avgVal),      sub:"completed only"},
        ].map((k,i)=>(
          <div key={i} className="bg-white px-6 py-5 text-center">
            <div className="text-3xl font-display font-bold text-washwell-black">{k.val}</div>
            <div className="text-xs uppercase tracking-wider text-washwell-gray-dark mt-1">{k.label}</div>
            {k.sub&&<div className={`text-xs mt-0.5 font-semibold ${k.pos?"text-washwell-green":"text-washwell-gray-dark"}`}>{k.sub}</div>}
          </div>
        ))}
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-3 gap-4 mb-6">
          {SOURCES.map(src=>(
            <div key={src} onClick={()=>setSrc(srcFilter===src?"All":src)}
              className={`bg-white rounded-xl border-2 p-4 cursor-pointer transition-all ${srcFilter===src?"border-washwell-green bg-green-50":"border-gray-200 hover:border-gray-300"}`}>
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-bold text-washwell-black">{src}</span>
                <span className="text-xs font-bold text-washwell-green">{bySource[src].count} orders</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1.5 mb-3">
                <div className="bg-washwell-green h-1.5 rounded-full" style={{width:`${Math.round(bySource[src].count/maxCount*100)}%`}}/>
              </div>
              <div className="text-xl font-display font-bold text-washwell-black">{fmt(bySource[src].rev)}</div>
              <div className="text-xs text-washwell-gray-dark">total revenue</div>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 mb-4 flex flex-wrap gap-2 items-center">
          <input type="text" placeholder="Search order #, guest, hotel…" value={search} onChange={e=>setSearch(e.target.value)}
            className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:border-washwell-green flex-1 min-w-48"/>
          <select value={srcFilter} onChange={e=>setSrc(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none">
            <option value="All">All Sources</option>
            {SOURCES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <select value={statFilter} onChange={e=>setStat(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none">
            <option value="All">All Statuses</option>
            {Object.entries(STATUS_LABELS).map(([k,v])=><option key={k} value={k}>{v}</option>)}
          </select>
          <input type="date" value={dateFrom} onChange={e=>setFrom(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none"/>
          <span className="text-gray-400 text-sm">→</span>
          <input type="date" value={dateTo} onChange={e=>setTo(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none"/>
          {(srcFilter!=="All"||statFilter!=="All"||search||dateFrom||dateTo)&&(
            <button onClick={()=>{setSrc("All");setStat("All");setSearch("");setFrom("");setTo("");}}
              className="px-3 py-1.5 text-xs text-red-500 hover:text-red-700 font-bold">✕ Clear</button>
          )}
          <span className="ml-auto text-xs text-washwell-gray-dark font-semibold whitespace-nowrap">
            {filtered.length} orders · {fmt(filteredRev)}
          </span>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400 text-sm">Loading order history…</div>
          ) : filtered.length===0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">No orders match your filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    {[["orderNumber","Order #"],["createdAt","Date"],[null,"Source"],["guestName","Guest"],["hotelName","Hotel"],["tier","Service"],["totalAmount","Amount"],["status","Status"]].map(([col,label])=>(
                      <th key={label} onClick={col?()=>thClick(col):undefined}
                        className={`px-4 py-3 text-left text-xs uppercase tracking-wider text-washwell-gray-dark font-bold ${col?"cursor-pointer hover:text-washwell-black select-none":""}`}>
                        {label}{col&&sortCol===col?(sortAsc?" ↑":" ↓"):""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(o=>{
                    const src=getSource(o);
                    return (
                      <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-4 py-3 font-mono text-xs font-bold">{o.orderNumber||"—"}</td>
                        <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">
                          {o.createdAt?new Date(o.createdAt).toLocaleDateString("en-CA"):"—"}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-lg text-xs font-semibold border ${SRC_COLORS[src]}`}>{src}</span>
                        </td>
                        <td className="px-4 py-3 text-sm">{o.guestName||"—"}</td>
                        <td className="px-4 py-3 text-xs text-gray-500">{o.hotelName||"—"}</td>
                        <td className="px-4 py-3 text-xs">{o.tier?.replace(/ —.*/,"")||"—"}</td>
                        <td className="px-4 py-3 text-sm font-bold">{o.totalAmount?fmt(parseFloat(o.totalAmount)):"—"}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-lg text-xs font-semibold ${STATUS_COLORS[o.status]||"bg-gray-100 text-gray-600"}`}>
                            {STATUS_LABELS[o.status]||o.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
