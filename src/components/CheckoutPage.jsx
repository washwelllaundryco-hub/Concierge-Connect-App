import { useState } from "react";

export default function CheckoutPage({ orderDetails, onPaymentComplete, onCancel }) {
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleStripePayment = () => {
    window.open(orderDetails.stripeUrl, "_blank");
  };

  const handlePaymentConfirmation = async () => {
    setIsProcessing(true);
    try {
      await fetch(`/api/orders/${orderDetails.orderId}/confirm-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: orderDetails.orderId,
          status: "paid_pending_technician",
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

  return (
    <div className="min-h-screen bg-washwell-cream font-body flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="w-20 h-20 rounded-full bg-washwell-black border-4 border-washwell-green flex items-center justify-center shadow-lg">
            <span className="text-4xl font-display font-extrabold text-washwell-green">W</span>
          </div>
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
                <span className="text-2xl font-mono font-bold text-washwell-green">
                  ${orderDetails.estimatedTotal}
                </span>
              </div>
            </div>
          </div>

          {!paymentCompleted ? (
            <div className="space-y-6">
              {/* Step 1 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-washwell-green text-white flex items-center justify-center font-bold">
                    1
                  </div>
                  <h3 className="font-display font-bold text-washwell-black">Complete Payment</h3>
                </div>
                <button
                  onClick={handleStripePayment}
                  className="w-full py-5 bg-gradient-to-r from-[#635BFF] to-[#7B73FF] hover:from-[#5348E8] hover:to-[#6B63EE] text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-3 text-lg"
                >
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
                  </svg>
                  <span>Secure Payment via Stripe</span>
                </button>
                <p className="text-xs text-washwell-gray text-center mt-2">
                  🔒 Your payment is secured by Stripe's industry-leading encryption
                </p>
              </div>

              {/* Step 2 */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-full bg-washwell-gray-light text-washwell-gray flex items-center justify-center font-bold">
                    2
                  </div>
                  <h3 className="font-display font-bold text-washwell-gray">Confirm Completion</h3>
                </div>
                <button
                  onClick={handlePaymentConfirmation}
                  disabled={isProcessing}
                  className="w-full py-5 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                >
                  {isProcessing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Processing...
                    </span>
                  ) : (
                    "✓ I have completed my payment"
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="w-24 h-24 bg-washwell-green rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg animate-bounce">
                <svg className="w-12 h-12 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-2xl font-display font-bold text-washwell-green mb-2">
                Payment Confirmed!
              </h3>
              <p className="text-washwell-gray-dark">Redirecting to your order confirmation...</p>
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
