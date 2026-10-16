import { useUser } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";
import GuestLandingPage from "../components/GuestLandingPage";

export default function GuestPortal() {
  const { user } = useUser();
  const navigate  = useNavigate();

  const guestUser = {
    id:         user.id,
    firstName:  user.firstName,
    lastName:   user.lastName,
    email:      user.primaryEmailAddress?.emailAddress,
    roomNumber: user.publicMetadata?.roomNumber || null,
    hotelName:  user.publicMetadata?.hotelName  || null,
    hotelId:    user.publicMetadata?.hotelId    || null,
  };

  return (
    <GuestLandingPage
      user={guestUser}
      onTrackDelivery={(orderId) => navigate(`/track/${orderId}`)}
    />
  );
}
