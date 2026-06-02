import { useUser } from "@clerk/clerk-react";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children, role }) {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-washwell-cream flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-washwell-green border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  const userRole = user.publicMetadata?.role || "guest";
  if (role && userRole !== role) return <Navigate to="/" replace />;

  return children;
}
