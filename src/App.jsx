import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import LoginPage from "./pages/LoginPage";
import GuestPortal from "./pages/GuestPortal";
import ConciergePortal from "./pages/ConciergePortal";
import TechnicianPortal from "./pages/TechnicianPortal";
import TrackingPage from "./pages/TrackingPage";
import OnboardingPage from "./pages/OnboardingPage";
import ProtectedRoute from "./components/ProtectedRoute";

function RoleRedirect() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-washwell-cream flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-washwell-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const role = user.publicMetadata?.role;

  // New user — send to onboarding
  if (!role) return <Navigate to="/onboarding" replace />;

  if (role === "concierge")  return <Navigate to="/concierge"  replace />;
  if (role === "technician") return <Navigate to="/technician" replace />;
  return <Navigate to="/guest" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/track/:orderId" element={<TrackingPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />

        <Route
          path="/guest"
          element={
            <ProtectedRoute role="guest">
              <GuestPortal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/concierge"
          element={
            <ProtectedRoute role="concierge">
              <ConciergePortal />
            </ProtectedRoute>
          }
        />
        <Route
          path="/technician"
          element={
            <ProtectedRoute role="technician">
              <TechnicianPortal />
            </ProtectedRoute>
          }
        />

        <Route path="/" element={<RoleRedirect />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
