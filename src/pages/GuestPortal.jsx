import { useState } from "react";
import { useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import GuestLandingPage from "../components/GuestLandingPage";
import CheckoutPage from "../components/CheckoutPage";

export default function GuestPortal() {
  const { user } = useUser();
  const navigate = useNavigate();
  const [view, setView] = useState("home");
  const [orderDetails, setOrderDetails] = useState(null);

  const guestUser = {
    id:          user.id,
    firstName:   user.firstName,
    lastName:    user.lastName,
    email:       user.primaryEmailAddress?.emailAddress,
    roomNumber:  user.publicMetadata?.roomNumber  || "–",
    hotelName:   user.publicMetadata?.hotelName   || "Your Hotel",
  };

  if (view === "checkout" && orderDetails) {
    return (
      <CheckoutPage
        orderDetails={orderDetails}
        onPaymentComplete={() => setView("home")}
        onCancel={() => { setOrderDetails(null); setView("home"); }}
      />
    );
  }

  return (
    <GuestLandingPage
      user={guestUser}
      onNavigateToCheckout={(details) => { setOrderDetails(details); setView("checkout"); }}
      onTrackDelivery={(orderId) => navigate(`/track/${orderId}`)}
    />
  );
}
