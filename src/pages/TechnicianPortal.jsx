import { useClerk } from "@clerk/clerk-react";
import TechnicianDashboard from "../components/TechnicianDashboard";

export default function TechnicianPortal() {
  const { signOut } = useClerk();

  return (
    <div>
      <div className="fixed top-4 right-4 z-50">
        <button
          onClick={() => signOut({ redirectUrl: "/login" })}
          className="px-4 py-2 bg-white border-2 border-washwell-gray-light rounded-xl text-sm font-semibold text-washwell-gray-dark hover:text-washwell-black transition-colors shadow-md"
        >
          Sign Out
        </button>
      </div>
      <TechnicianDashboard />
    </div>
  );
}
