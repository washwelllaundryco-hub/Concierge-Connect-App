import { useState } from "react";

const PAYMENT_OPTIONS = [
  { value: "stripe",        label: "Pay by Card",       desc: "Secure online payment via Stripe",       icon: "💳" },
  { value: "cash",          label: "Pay with Cash",     desc: "Pay driver or front desk at pickup",     icon: "💵" },
  { value: "hotel_account", label: "Charge to Account", desc: "Billed to your hotel or house account",  icon: "🏨" },
];

export default function CheckoutPage({ orderDetails, onPaymentComplete, onCancel }) {
  const [paymentMethod, setPaymentMethod]         = useState("stripe");
  const [paymentCompleted, setPaymentCompleted]   = useState(false);
  const [isProcessing, setIsProcessing]           = useState(false);
  const [error, setError]                         = useState("");
  const [stripeLink, setStripeLink]               = useState(null); // { url, orderNumber }

  const isDirect = orderDetails.customerType === "direct";

  const handleConfirm = async () => {
    setIsProcessing(true);
    setError("");
    try {
      // 1. Create the order in the DB
      const createRes = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName:     orderDetails.firstName,
          lastName:      orderDetails.lastName,
          roomNumber:    orderDetails.roomNumber,
          pickupAddress: orderDetails.pickupAddress,
          unitNumber:    orderDetails.unitNumber,
          tier:          orderDetails.tier,
          paymentMethod,
          hotelId:       orderDetails.hotelId,
          clerkUserId:   orderDetails.clerkUserId,
        }),
      });

      if (!createRes.ok) {
        const errData = await createRes.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to place order");
      }

      const { orderId, orderNumber } = await createRes.json();

      // 2. Handle payment
      if (paymentMethod === "stripe") {
        const url = `${orderDetails.stripeUrl}?client_reference_id=${orderId}`;
        setStripeLink({ url, orderNumber });
      } else {
        // Cash / hotel_account — order is already confirmed on the server
        setPaymentCompleted(true);
        setTimeout(() => onPaymentComplete(), 2500);
      }
    } catch (err) {
      console.error("Checkout error:", err);
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const guestName = [orderDetails.firstName, orderDetails.lastName].filter(Boolean).join(" ");

  // ── Stripe link shown ──────────────────────────────────────────────────────
  if (stripeLink) {
    return (
      <div className="min-h-screen bg-washwell-cream font-body flex items-center justify-center p-6">
        <div className="max-w-2xl w-full">
          <div className="flex justify-center mb-8">
            <img src="/logo.png" alt="Washwell Laundry Co." className="h-24 w-auto" />
          </div>
          <div className="bg-white rounded-3xl shadow-2xl border-2 border-washwell-gray-light p-10 text-center">
            <h2 className="text-2xl font-display font-bold text-washwell-black mb-2">
              Order {stripeLink.orderNumber} Created
            </h2>
            <p className="text-washwell-gray-dark mb-8">
              Complete your payment via Stripe to confirm your pickup.
            </p>
            <a
              href={stripeLink.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-3 w-full justify-center py-5 bg-gradient-to-r from-[#635BFF] to-[#7B73FF] hover:from-[#5348E8] hover:to-[#6B63EE] text-white font-bold rounded-xl shadow-lg transition-all text-lg mb-4"
            >
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
              </svg>
              Open Stripe Payment
            </a>
            <button
              onClick={onCancel}
              className="w-full py-3 text-washwell-gray-dark hover:text-washwell-black font-semibold transition-colors"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Success state ──────────────────────────────────────────────────────────
  if (paymentCompleted) {
    return (
      <div className="min-h-screen bg-washwell-cream font-body flex items-center justify-center p-6">
        <div className="max-w-2xl w-full text-center">
          <div className="flex justify-center mb-8">
            <img src="/logo.png" alt="Washwell Laundry Co." className="h-24 w-auto" />
          </div>
          <div className="w-24 h-24 bg-washwell-green rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg animate-bounce">
            <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-2xl font-display font-bold text-washwell-green mb-2">Order Confirmed!</h3>
          <p className="text-washwell-gray-dark">We'll be in touch shortly about your pickup.</p>
        </div>
      </div>
    );
  }

  // ── Main checkout form ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-washwell-cream font-body flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="flex justify-center mb-8">
          <img src="/logo.png" alt="Washwell Laundry Co." className="h-24 w-auto" />
        </div>

        <div className="bg-white rounded-3xl shadow-2xl border-2 border-washwell-gray-light p-10">
          <h1 className="text-3xl font-display font-bold text-washwell-black mb-2 text-center">
            Secure Checkout
          </h1>

          {/* Order Summary */}
          <div className="bg-washwell-cream rounded-2xl p-6 mb-8 border-2 border-washwell-gray-light mt-6">
            <h3 className="text-sm font-bold text-washwell-gray-dark uppercase tracking-wider mb-4">
              Order Summary
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-washwell-black">Name:</span>
                <span className="font-semibold text-washwell-black">{guestName}</span>
              </div>
              {isDirect ? (
                <>
                  <div className="flex justify-between">
                    <span className="text-washwell-black">Address:</span>
                    <span className="font-semibold text-washwell-black text-right max-w-[55%]">
                      {orderDetails.pickupAddress}
                    </span>
                  </div>
                  {orderDetails.unitNumber && (
                    <div className="flex justify-between">
                      <span className="text-washwell-black">Unit:</span>
                      <span className="font-semibold text-washwell-black">{orderDetails.unitNumber}</span>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex justify-between">
                  <span className="text-washwell-black">Room:</span>
                  <span className="font-semibold text-washwell-black">{orderDetails.roomNumber}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-washwell-black">Service:</span>
                <span className="font-semibold text-washwell-black">{orderDetails.tier}</span>
              </div>
              <div className="border-t-2 border-washwell-gray-light pt-3 mt-3 flex justify-between">
                <span className="text-lg font-bold text-washwell-black">Total:</span>
                <span className="text-2xl font-mono font-bold text-washwell-green">
                  ${orderDetails.estimatedTotal}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="mb-6">
            <p className="text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-3">
              Payment Method
            </p>
            <div className="space-y-2">
              {PAYMENT_OPTIONS.map(({ value, label, desc, icon }) => (
                <button
                  key={value}
                  onClick={() => setPaymentMethod(value)}
                  className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl border-2 transition-all text-left ${
                    paymentMethod === value
                      ? "bg-washwell-green-pale border-washwell-green"
                      : "bg-washwell-cream border-washwell-gray-light hover:border-washwell-green/50"
                  }`}
                >
                  <span className="text-2xl">{icon}</span>
                  <div className="flex-1">
                    <p className="font-semibold text-washwell-black">{label}</p>
                    <p className="text-xs text-washwell-gray-dark">{desc}</p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                    paymentMethod === value ? "border-washwell-green bg-washwell-green" : "border-washwell-gray-light"
                  }`}>
                    {paymentMethod === value && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {paymentMethod === "cash" && (
            <div className="mb-4 bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
              💵 Please have <span className="font-bold">${orderDetails.estimatedTotal}</span> ready to pay at pickup.
            </div>
          )}

          {paymentMethod === "hotel_account" && (
            <div className="mb-4 bg-blue-50 border-2 border-blue-200 rounded-xl p-4 text-sm text-blue-800">
              🏨 This order will be billed directly to your account.
            </div>
          )}

          {error && (
            <div className="mb-4 bg-red-50 border-2 border-red-200 rounded-xl p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={handleConfirm}
            disabled={isProcessing}
            className="w-full py-5 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
          >
            {isProcessing
              ? "Placing order..."
              : paymentMethod === "stripe"
              ? "Continue to Payment →"
              : "Confirm Order →"}
          </button>

          <button
            onClick={onCancel}
            className="w-full mt-4 py-3 text-washwell-gray-dark hover:text-washwell-black font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
