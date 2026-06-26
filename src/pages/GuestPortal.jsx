import { useState, useEffect } from "react";
import { useUser, useClerk } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import GuestLandingPage from "../components/GuestLandingPage";
import CheckoutPage from "../components/CheckoutPage";

export default function GuestPortal() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const [view, setView] = useState("home");
  const [orderDetails, setOrderDetails] = useState(null);

  // When Stripe redirects back after residential payment, call confirm-payment as fallback
  // (Stripe webhook also fires independently — whichever runs first wins; both are idempotent)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paidId = params.get("direct_paid");
    if (paidId) {
      fetch("/api/orders/confirm-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: paidId,
          guestName: `${user?.firstName || ""} ${user?.lastName || ""}`.trim(),
          paymentConfirmedAt: new Date().toISOString(),
        }),
      }).catch(() => {});
      // Remove param from URL without reload so it doesn't re-fire on refresh
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const guestUser = {
    id:            user.id,
    firstName:     user.firstName || "",
    lastName:      user.lastName  || "",
    email:         user.primaryEmailAddress?.emailAddress,
    roomNumber:    user.publicMetadata?.roomNumber    || "",
    hotelName:     user.publicMetadata?.hotelName     || "Washwell Laundry",
    hotelId:       user.publicMetadata?.hotelId       || "the-hotel",
    clerkUserId:   user.id,
    customerType:  user.publicMetadata?.customerType  || "hotel",
    pickupAddress: user.publicMetadata?.pickupAddress || "",
    unitNumber:    user.publicMetadata?.unitNumber    || "",
  };

  const signOutBtn = (
    <div className="fixed top-4 right-4 z-50">
      <button
        onClick={() => signOut({ redirectUrl: "/login" })}
        className="px-4 py-2 bg-white border-2 border-washwell-gray-light rounded-xl text-sm font-semibold text-washwell-gray-dark hover:text-washwell-black transition-colors shadow-md"
      >
        Sign Out
      </button>
    </div>
  );

  if (view === "checkout" && orderDetails) {
    return (
      <>
        {signOutBtn}
        <CheckoutPage
          orderDetails={orderDetails}
          onPaymentComplete={() => setView("home")}
          onCancel={() => { setOrderDetails(null); setView("home"); }}
        />
      </>
    );
  }

  return (
    <>
      {signOutBtn}
      <GuestLandingPage
        user={guestUser}
        onNavigateToCheckout={(details) => { setOrderDetails(details); setView("checkout"); }}
        onTrackDelivery={(orderId) => navigate(`/track/${orderId}`)}
      />
    </>
  );
}
