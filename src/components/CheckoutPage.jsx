import { useState } from "react";

export default function CheckoutPage({ orderDetails, onPaymentComplete, onCancel }) {
  const [paymentMethod, setPaymentMethod] = useState("stripe");
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleConfirm = async () => {
    setIsProcessing(true);
    try {
      if (paymentMethod === "stripe") {
        window.open(orderDetails.stripeUrl, "_blank");
        // After opening Stripe, wait for user to confirm they paid
        return;
      }

      // Cash or hotel — confirm immediately
      await fetch(`/api/orders/${orderDetails.orderId}/confirm-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: orderDetails.orderId,
          status: "paid_pending_technician",
          paymentMethod,
          paymentConfirmedAt: new Date().toISOString(),
        }),
      });
      setPaymentCompleted(true);
      setTimeout(() => onPaymentComplete(), 2000);
    } catch (error) {
      console.error("Payment confirmation error:", error);
      alert("Failed to confirm payment. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStripeConfirm = async () => {
    setIsProcessing(true);
    try {
      await fetch(`/api/orders/${orderDetails.orderId}/confirm-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: orderDetails.orderId,
          status: "paid_pending_technician",
          paymentMethod: "stripe",
          paymentConfirmedAt: new Date().toISOString(),
        }),
      });
      setPaymentCompleted(true);
      setTimeout(() => onPaymentComplete(), 2000);
    } catch (error) {
      console.error("Payment confirmation error:", error);
      alert("Failed to confirm payment. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const PAYMENT_OPTIONS = [
    {
      value: "stripe",
      label: "Pay by Card",
      desc: "Secure online payment via Stripe",
      icon: "💳",
    },
    {
      value: "cash",
      label: "Pay with Cash",
      desc: "Pay driver or front desk upon pickup",
      icon: "💵",
    },
    {
      value: "hotel_account",
      label: "Charge to Hotel",
      desc: "Billed to your hotel account",
      icon: "🏨",
    },
  ];

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
          <p className="text-washwell-gray-dark text-center mb-8">
            Order #{orderDetails.orderNumber}
          </p>

          {/* Order Summary */}
          <div className="bg-washwell-cream rounded-2xl p-6 mb-8 border-2 border-washwell-gray-light">
            <h3 className="text-sm font-bold text-washwell-gray-dark uppercase tracking-wider mb-4">
              Order Summary
            </h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-washwell-black">Guest:</span>
                <span className="font-semibold text-washwell-black">{orderDetails.guestName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-washwell-black">Room:</span>
                <span className="font-semibold text-washwell-black">{orderDetails.roomNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-washwell-black">Service:</span>
                <span className="font-semibold text-washwell-black">{orderDetails.tier}</span>
              </div>
              <div className="border-t-2 border-washwell-gray-light pt-3 mt-3 flex justify-between">
                <span className="text-lg font-bold text-washwell-black">Total:</span>
                <span className="text-2xl font-display font-bold text-washwell-green">
                  ${orderDetails.estimatedTotal}
                </span>
              </div>
            </div>
          </div>

          {!paymentCompleted ? (
            <div className="space-y-6">
              {/* Payment Method Selector */}
              <div>
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

              {/* Stripe flow — two step */}
              {paymentMethod === "stripe" && (
                <div className="space-y-3">
                  <button
                    onClick={handleConfirm}
                    className="w-full py-5 bg-gradient-to-r from-[#635BFF] to-[#7B73FF] hover:from-[#5348E8] hover:to-[#6B63EE] text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-3 text-lg"
                  >
                    <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
                    </svg>
                    Open Stripe Payment
                  </button>
                  <button
                    onClick={handleStripeConfirm}
                    disabled={isProcessing}
                    className="w-full py-4 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl transition-all disabled:opacity-50"
                  >
                    {isProcessing ? "Processing..." : "✓ I've completed my payment"}
                  </button>
                  <p className="text-xs text-washwell-gray text-center">
                    🔒 Secured by Stripe
                  </p>
                </div>
              )}

              {/* Cash flow */}
              {paymentMethod === "cash" && (
                <div className="space-y-3">
                  <div className="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-4 text-sm text-yellow-800">
                    💵 Please have <span className="font-bold">${orderDetails.estimatedTotal}</span> ready to pay the driver or front desk at pickup.
                  </div>
                  <button
                    onClick={handleConfirm}
                    disabled={isProcessing}
                    className="w-full py-5 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 text-lg"
                  >
                    {isProcessing ? "Processing..." : "Confirm Cash Payment →"}
                  </button>
                </div>
              )}

              {/* Hotel account flow */}
              {paymentMethod === "hotel_account" && (
                <div className="space-y-3">
                  <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 text-sm text-blue-800">
                    🏨 This order will be billed directly to your hotel. Please confirm with the front desk if needed.
                  </div>
                  <button
                    onClick={handleConfirm}
                    disabled={isProcessing}
                    className="w-full py-5 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 text-lg"
                  >
                    {isProcessing ? "Processing..." : "Confirm Hotel Charge →"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-24 h-24 bg-washwell-green rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg animate-bounce">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-display font-bold text-washwell-green mb-2">
                Order Confirmed!
              </h3>
              <p className="text-washwell-gray-dark">Redirecting to your order status...</p>
            </div>
          )}

          {!paymentCompleted && (
            <button
              onClick={onCancel}
              className="w-full mt-6 py-3 text-washwell-gray-dark hover:text-washwell-black font-semibold transition-colors"
            >
              Cancel Order
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
