import { useState } from "react";
import CheckoutPage from "./components/CheckoutPage";
import GuestLandingPage from "./components/GuestLandingPage";
import TechnicianDashboard from "./components/TechnicianDashboard";

const MOCK_USER = {
  id: "guest-123",
  firstName: "Marcus",
  lastName: "Webb",
  email: "marcus.webb@email.com",
  roomNumber: "412",
  hotelName: "The Grand Hotel",
};

export default function App() {
  const [currentView, setCurrentView] = useState("guest"); // guest | checkout | technician
  const [orderDetails, setOrderDetails] = useState(null);

  const handleNavigateToCheckout = (details) => {
    setOrderDetails(details);
    setCurrentView("checkout");
  };

  const handlePaymentComplete = () => {
    setCurrentView("guest");
    alert("Order confirmed! You'll receive updates as your laundry is processed.");
  };

  const handleCancelCheckout = () => {
    setOrderDetails(null);
    setCurrentView("guest");
  };

  return (
    <div className="min-h-screen">
      {/* View Switcher for Demo */}
      <div className="fixed top-4 right-4 z-50 bg-white rounded-xl shadow-lg border-2 border-washwell-gray-light p-3 flex gap-2">
        <button
          onClick={() => setCurrentView("guest")}
          className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
            currentView === "guest"
              ? "bg-washwell-green text-white"
              : "bg-washwell-cream text-washwell-gray-dark hover:bg-washwell-gray-light"
          }`}
        >
          Guest
        </button>
        <button
          onClick={() => setCurrentView("technician")}
          className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
            currentView === "technician"
              ? "bg-washwell-green text-white"
              : "bg-washwell-cream text-washwell-gray-dark hover:bg-washwell-gray-light"
          }`}
        >
          Technician
        </button>
      </div>

      {currentView === "guest" && (
        <GuestLandingPage user={MOCK_USER} onNavigateToCheckout={handleNavigateToCheckout} />
      )}

      {currentView === "checkout" && orderDetails && (
        <CheckoutPage
          orderDetails={orderDetails}
          onPaymentComplete={handlePaymentComplete}
          onCancel={handleCancelCheckout}
        />
      )}

      {currentView === "technician" && <TechnicianDashboard />}
    </div>
  );
}
