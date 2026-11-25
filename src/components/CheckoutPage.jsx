// Shown after guest places order — no payment here, payment link sent via SMS
import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";

const STATUS_LABEL = {
  pending_pickup:   "Order received — technician will pick up your laundry soon.",
  awaiting_payment: "Laundry weighed! Check your phone for a payment link.",
  in_wash:          "Payment confirmed — your laundry is being washed.",
  drying:           "In the dryer.",
  folding:          "Being folded and packaged.",
  ready:            "Ready! Driver will deliver shortly.",
  out_for_delivery: "On the way back to you!",
  delivered:        "Delivered. Thanks for using Washwell!",
};

export default function CheckoutPage() {
  const [params] = useSearchParams();
  const orderId     = params.get("orderId");
  const orderNumber = params.get("orderNumber");
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(!!orderId);

  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/guest/orders", {
          headers: { "x-order-id": orderId }
        });
        if (res.ok && !cancelled) {
          const d = await res.json();
          const o = (d.orders||[]).find(x=>x.id===orderId);
          if (o) setOrder(o);
        }
      } catch {}
      setLoading(false);
    }
    poll();
    const t = setInterval(poll, 15000);
    return () => { cancelled=true; clearInterval(t); };
  }, [orderId]);

  return (
    <div className="min-h-screen bg-washwell-cream flex items-center justify-center p-4 font-body">
      <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-8 text-center border border-washwell-gray-light">
        <img src="/logo.png" alt="Washwell Laundry Co." className="h-16 w-16 mx-auto mb-4 rounded-2xl" />
        <h1 className="text-2xl font-bold text-washwell-black mb-1 font-display">Order Placed!</h1>
        {orderNumber && <p className="text-sm text-washwell-gray mb-4">Order #{orderNumber}</p>}
        
        {loading ? (
          <p className="text-washwell-gray text-sm">Loading status…</p>
        ) : order ? (
          <div className="bg-washwell-green-pale border border-washwell-green rounded-2xl p-4 mb-6">
            <p className="text-washwell-green-dark font-semibold text-sm">
              {STATUS_LABEL[order.status] || order.status}
            </p>
            {order.status === "awaiting_payment" && order.totalAmount && (
              <p className="text-washwell-green text-xs mt-1">
                Total: ${parseFloat(order.totalAmount).toFixed(2)} CAD · delivery included
              </p>
            )}
          </div>
        ) : (
          <div className="bg-washwell-green-pale border border-washwell-green rounded-2xl p-4 mb-6">
            <p className="text-washwell-green-dark font-semibold text-sm">
              Your order has been received! Our technician has been notified and will arrange pickup shortly.
            </p>
          </div>
        )}

        <div className="space-y-2 text-sm text-washwell-gray-dark text-left mb-6">
          <div className="flex items-start gap-2"><span className="text-washwell-green font-bold mt-0.5">✓</span><span>Technician notified — pickup within the scheduled window</span></div>
          <div className="flex items-start gap-2"><span className="text-washwell-green font-bold mt-0.5">✓</span><span>After weighing, a payment link will be sent to your phone via SMS</span></div>
          <div className="flex items-start gap-2"><span className="text-washwell-green font-bold mt-0.5">✓</span><span>Clean laundry delivered back to you once ready</span></div>
        </div>

        <p className="text-xs text-washwell-gray">This page refreshes automatically. No action needed until you receive the payment SMS.</p>

        <Link to="/" className="mt-6 inline-block text-sm text-washwell-green hover:text-washwell-green-dark font-semibold">← Back to home</Link>
      </div>
    </div>
  );
}
