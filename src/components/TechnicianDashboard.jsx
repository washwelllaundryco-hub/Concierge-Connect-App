import { useState, useEffect } from "react";
import HotelAccountsTab from "./HotelAccountsTab";
import OrderAnalyticsTab from "./OrderAnalyticsTab";

const STATUS_FLOW = ["paid_pending_technician","in_wash","drying","folding","out_for_delivery","completed"];

export default function TechnicianDashboard() {
  const [orders,      setOrders]      = useState([]);
  const [activeTab,   setActiveTab]   = useState("orders");
  const [selectedOrder,setSelected]  = useState(null);
  const [showWeight,  setShowWeight]  = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [machineInputs,setMachineInputs] = useState({});

  useEffect(() => {
    async function fetch_orders() {
      try {
        const res = await fetch("/api/orders/active");
        if (res.ok) { const d = await res.json(); setOrders(d.orders ?? []); }
      } catch {}
    }
    fetch_orders();
    const iv = setInterval(fetch_orders, 15000);
    return () => clearInterval(iv);
  }, []);

  const nextStatus = cur => { const i=STATUS_FLOW.indexOf(cur); return STATUS_FLOW[i+1]??cur; };

  const actionLabel = o => {
    if (o.status==="paid_pending_technician") return "Start Processing";
    if (o.status==="in_wash")          return "Move to Drying";
    if (o.status==="drying")           return "Move to Folding";
    if (o.status==="folding")          return "Out for Delivery";
    if (o.status==="out_for_delivery") return "Mark as Delivered";
    return null;
  };

  const handleStatusUpdate = async (orderId, newStatus, weight=null) => {
    setOrders(prev=>prev.map(o=>o.id===orderId?{...o,status:newStatus,totalWeightLbs:weight??o.totalWeightLbs}:o));
    await fetch(`/api/orders/${orderId}/status`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status:newStatus,weight})}).catch(()=>{});
    if (newStatus==="completed") fetch("/api/sustainability/sync",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderId})}).catch(()=>{});
  };

  const handleMachineAssign = async (orderId, type, num) => {
    const n=parseInt(num); if(!n||n<=0) return;
    setOrders(prev=>prev.map(o=>o.id===orderId?{...o,[type==="washer"?"washerNumber":"dryerNumber"]:n}:o));
    await fetch("/api/orders/machine",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderId,machineType:type,machineNumber:n})}).catch(()=>{});
  };

  return (
    <div className="min-h-screen bg-washwell-cream font-body">
      <header className="bg-washwell-black border-b-4 border-washwell-green px-6 py-5">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <img src="/logo.png" alt="Washwell" className="h-12 w-auto"/>
            <div>
              <h1 className="text-2xl font-display font-bold text-white">Technician Dashboard</h1>
              <p className="text-xs text-washwell-gray uppercase tracking-widest font-semibold">Washwell Laundry Co.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-washwell-green rounded-full animate-pulse"/>
            <span className="text-sm text-washwell-gray-dark font-semibold">Live</span>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-4 flex gap-1">
          {[
            {key:"orders",   label:"Active Orders",  count:orders.length},
            {key:"accounts", label:"Hotel Accounts", count:null},
            {key:"analytics",label:"Analytics",      count:null},
          ].map(tab=>(
            <button key={tab.key} onClick={()=>setActiveTab(tab.key)}
              className={`px-5 py-2.5 rounded-t-xl text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab===tab.key?"bg-washwell-cream text-washwell-black":"text-washwell-gray hover:text-white hover:bg-white/10"
              }`}>
              {tab.label}
              {tab.count!==null&&(
                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                  activeTab===tab.key?"bg-washwell-green text-white":"bg-white/20 text-washwell-gray"
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </header>

      {activeTab==="accounts"  && <HotelAccountsTab/>}
      {activeTab==="analytics" && <OrderAnalyticsTab/>}

      {activeTab==="orders" && (
        <main className="max-w-6xl mx-auto px-6 py-10">
          {orders.length===0 ? (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">✓</div>
              <h2 className="text-2xl font-display font-bold text-washwell-black mb-2">All Clear</h2>
              <p className="text-washwell-gray-dark">No active orders right now.</p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-display font-bold text-washwell-black mb-8">Active Orders ({orders.length})</h2>
              <div className="grid md:grid-cols-2 gap-6">
                {orders.map(order=>{
                  const isAwaiting=order.status==="awaiting_payment";
                  const isPaid=order.paymentVerified&&order.paymentMethod==="stripe";
                  return (
                    <div key={order.id} className="bg-white rounded-3xl shadow-lg border-2 border-washwell-gray-light p-6 hover:shadow-xl transition-all">
                      <div className="flex items-start justify-between mb-6">
                        <div>
                          <div className="inline-block px-4 py-1.5 bg-washwell-green-pale border-2 border-washwell-green rounded-full mb-3">
                            <span className="font-display text-sm font-bold text-washwell-green">{order.orderNumber}</span>
                          </div>
                          <h3 className="text-xl font-display font-bold text-washwell-black mb-1">{order.guestName}</h3>
                          <p className="text-sm text-washwell-gray-dark">{order.hotelName && <span className="font-semibold">{order.hotelName}</span>}{order.hotelName && order.roomNumber && " · "}{order.roomNumber ? `Room ${order.roomNumber}` : !order.hotelName ? "Residential" : ""}</p>
                        </div>
                        {isPaid?(
                          <div className="px-3 py-2 bg-washwell-green rounded-xl border-2 border-washwell-green-dark flex items-center gap-2">
                            <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                            <span className="text-white text-xs font-bold uppercase tracking-wider">Paid</span>
                          </div>
                        ):order.paymentMethod==="cash"?(
                          <div className="px-3 py-2 bg-gray-100 rounded-xl border-2 border-gray-300">
                            <span className="text-gray-700 text-xs font-bold uppercase tracking-wider">Cash COD</span>
                          </div>
                        ):order.paymentMethod==="room_charge"?(
                          <div className="px-3 py-2 bg-blue-50 rounded-xl border-2 border-blue-200">
                            <span className="text-blue-700 text-xs font-bold uppercase tracking-wider">Room Charge</span>
                          </div>
                        ):order.paymentMethod==="hotel_account"?(
                          <div className="px-3 py-2 bg-blue-50 rounded-xl border-2 border-blue-200">
                            <span className="text-blue-700 text-xs font-bold uppercase tracking-wider">Hotel Account</span>
                          </div>
                        ):isAwaiting?(
                          <div className="px-3 py-2 bg-amber-50 rounded-xl border-2 border-amber-300">
                            <span className="text-amber-700 text-xs font-bold uppercase tracking-wider">Awaiting Payment</span>
                          </div>
                        ):null}
                      </div>

                      <div className="mb-4 p-4 bg-washwell-cream rounded-xl border-2 border-washwell-gray-light">
                        <div className="text-xs text-washwell-gray uppercase tracking-wider font-semibold mb-1">Current Status</div>
                        <div className="text-lg font-display font-bold text-washwell-black capitalize">{order.status.replace(/_/g," ")}</div>
                      </div>

                      {order.totalWeightLbs&&(
                        <div className="mb-4 text-center">
                          <div className="text-3xl font-display font-bold text-washwell-green">{order.totalWeightLbs} lbs</div>
                        </div>
                      )}

                      {order.balanceDue&&parseFloat(order.balanceDue)>0&&(
                        <div className="mb-4 p-3 bg-amber-50 border-2 border-amber-200 rounded-xl">
                          <div className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-1">Balance Due — Tier Upgrade</div>
                          <div className="text-sm text-amber-800">Actual tier: <strong>{order.correctTier}</strong> · Balance: <strong>${parseFloat(order.balanceDue).toFixed(2)}</strong></div>
                          {order.balanceStripeUrl&&(
                            <a href={order.balanceStripeUrl} target="_blank" rel="noreferrer"
                              className="mt-2 inline-block px-3 py-1.5 bg-amber-500 text-white text-xs font-bold rounded-lg hover:bg-amber-600">
                              Send Payment Link ↗
                            </a>
                          )}
                        </div>
                      )}

                      {["in_wash","drying","folding"].includes(order.status)&&(
                        <div className="mb-4 grid grid-cols-2 gap-3">
                          {["washer","dryer"].map(type=>{
                            const key=`${order.id}_${type}`;
                            const stored=type==="washer"?order.washerNumber:order.dryerNumber;
                            return (
                              <div key={type}>
                                <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-1">{type} #</label>
                                <div className="flex gap-2">
                                  <input type="number" min="1" placeholder="—" defaultValue={stored||""}
                                    onChange={e=>setMachineInputs(p=>({...p,[key]:e.target.value}))}
                                    className="w-full px-3 py-2 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green outline-none font-display font-bold text-washwell-black text-center"/>
                                  <button onClick={()=>handleMachineAssign(order.id,type,machineInputs[key]||stored)}
                                    className="px-3 py-2 bg-washwell-green text-white rounded-xl font-bold text-sm hover:bg-washwell-green-dark transition-all">Set</button>
                                </div>
                                {stored&&<p className="text-xs text-washwell-green font-semibold mt-1">Assigned: #{stored}</p>}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {order.specialInstructions&&(
                        <div className="mb-4 p-3 bg-yellow-50 border-2 border-yellow-200 rounded-xl text-sm text-yellow-800">
                          <span className="font-bold">Note: </span>{order.specialInstructions}
                        </div>
                      )}

                      {actionLabel(order)&&!isAwaiting&&(
                        <button
                          onClick={()=>{
                            if(order.status==="paid_pending_technician"){setSelected(order);setShowWeight(true);}
                            else handleStatusUpdate(order.id,nextStatus(order.status));
                          }}
                          className="w-full py-3 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl transition-all">
                          {actionLabel(order)}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </main>
      )}

      {showWeight&&selectedOrder&&(
        <div className="fixed inset-0 bg-washwell-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-8 border-2 border-washwell-green">
            <h3 className="text-2xl font-display font-bold text-washwell-black mb-2">Log Weight</h3>
            <p className="text-sm text-washwell-gray-dark mb-6">Order {selectedOrder.orderNumber}</p>
            <input type="number" step="0.1" placeholder="0.0" value={weightInput}
              onChange={e=>setWeightInput(e.target.value)} autoFocus
              className="w-full px-5 py-4 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green outline-none text-2xl font-display font-bold text-washwell-black mb-6"/>
            <div className="flex gap-3">
              <button onClick={()=>{setShowWeight(false);setSelected(null);setWeightInput("");}}
                className="flex-1 px-6 py-3 border-2 border-washwell-gray-light text-washwell-black font-semibold rounded-xl hover:bg-washwell-cream transition-colors">Cancel</button>
              <button
                onClick={()=>{const w=parseFloat(weightInput);if(w>0){handleStatusUpdate(selectedOrder.id,"in_wash",w);setShowWeight(false);setSelected(null);setWeightInput("");}}}
                disabled={!weightInput||parseFloat(weightInput)<=0}
                className="flex-1 px-6 py-3 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
