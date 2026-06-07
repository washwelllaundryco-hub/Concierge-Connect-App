import { useState } from "react";
import { useUser, useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";

const ROLES = [
  {
    value: "guest_hotel",
    label: "Hotel Guest",
    desc:  "I'm staying at a hotel or short-term rental",
  },
  {
    value: "guest_direct",
    label: "Residential",
    desc:  "Home, apartment, office — I'll provide my address",
  },
  {
    value: "concierge",
    label: "Concierge / Property Manager",
    desc:  "I manage laundry requests for guests or residents",
  },
  {
    value: "technician",
    label: "Washwell Technician",
    desc:  "I process and handle laundry orders",
  },
];

export default function OnboardingPage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState("guest_hotel");
  // Hotel guest fields
  const [roomNumber, setRoomNumber] = useState("");
  // Direct customer fields
  const [pickupAddress, setPickupAddress] = useState("");
  const [unitNumber, setUnitNumber] = useState("");
  // Concierge fields
  const [hotelName, setHotelName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    setError("");

    // Validate
    if (role === "guest_hotel" && !roomNumber.trim()) {
      setError("Please enter your room number.");
      return;
    }
    if (role === "guest_direct" && !pickupAddress.trim()) {
      setError("Please enter your pickup address.");
      return;
    }
    if (role === "concierge" && !hotelName.trim()) {
      setError("Please enter your hotel or property name.");
      return;
    }

    setSubmitting(true);
    try {
      const token = await getToken();
      const body = {
        role:         role === "guest_hotel" || role === "guest_direct" ? "guest" : role,
        customerType: role === "guest_direct" ? "direct" : "hotel",
        roomNumber:   role === "guest_hotel" ? roomNumber.trim() : undefined,
        pickupAddress: role === "guest_direct" ? pickupAddress.trim() : undefined,
        unitNumber:   role === "guest_direct" ? unitNumber.trim() : undefined,
        hotelName:    role === "concierge" ? hotelName.trim() : undefined,
        hotelId:      role === "concierge"
          ? hotelName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")
          : undefined,
      };

      const res = await fetch("/api/users/onboard", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Failed to save. Please try again.");
      await user.reload();

      if (role === "concierge")  navigate("/concierge");
      else if (role === "technician") navigate("/technician");
      else navigate("/guest");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-washwell-cream font-body flex flex-col items-center justify-center p-6">
      <div className="flex justify-center mb-10">
        <img src="/logo.png" alt="Washwell Laundry Co." className="h-20 w-auto" />
      </div>

      <div className="bg-white rounded-3xl shadow-2xl border-2 border-washwell-gray-light p-10 w-full max-w-md">
        <h1 className="text-2xl font-display font-bold text-washwell-black mb-1">
          Welcome to Washwell
        </h1>
        <p className="text-sm text-washwell-gray-dark mb-8">
          Let's get your account set up.
        </p>

        {/* Role selector */}
        <div className="mb-6">
          <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-3">
            I am a
          </label>
          <div className="space-y-2">
            {ROLES.map(({ value, label, desc }) => (
              <button
                key={value}
                onClick={() => setRole(value)}
                className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl border-2 transition-all text-left ${
                  role === value
                    ? "bg-washwell-green-pale border-washwell-green"
                    : "bg-washwell-cream border-washwell-gray-light hover:border-washwell-green/50"
                }`}
              >
                <div className="flex-1">
                  <p className="font-semibold text-sm text-washwell-black">{label}</p>
                  <p className="text-xs text-washwell-gray-dark">{desc}</p>
                </div>
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                  role === value ? "border-washwell-green bg-washwell-green" : "border-washwell-gray"
                }`} />
              </button>
            ))}
          </div>
        </div>

        {/* Hotel guest — room number */}
        {role === "guest_hotel" && (
          <div className="mb-6">
            <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-2">
              Room Number
            </label>
            <input
              type="text"
              value={roomNumber}
              onChange={(e) => setRoomNumber(e.target.value)}
              placeholder="e.g. 412"
              className="w-full px-4 py-3 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green focus:ring-4 focus:ring-washwell-green/10 outline-none transition-all font-medium text-washwell-black"
            />
          </div>
        )}

        {/* Individual customer — address + unit */}
        {role === "guest_direct" && (
          <div className="mb-6 space-y-4">
            <div>
              <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-2">
                Pickup Address <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={pickupAddress}
                onChange={(e) => setPickupAddress(e.target.value)}
                placeholder="123 Main St, New York NY 10001"
                className="w-full px-4 py-3 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green focus:ring-4 focus:ring-washwell-green/10 outline-none transition-all font-medium text-washwell-black"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-2">
                Unit / Apt # <span className="text-washwell-gray font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                placeholder="e.g. 4B"
                className="w-full px-4 py-3 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green focus:ring-4 focus:ring-washwell-green/10 outline-none transition-all font-medium text-washwell-black"
              />
            </div>
          </div>
        )}

        {/* Concierge — hotel name */}
        {role === "concierge" && (
          <div className="mb-6">
            <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-2">
              Hotel / Property Name
            </label>
            <input
              type="text"
              value={hotelName}
              onChange={(e) => setHotelName(e.target.value)}
              placeholder="e.g. The Grand Hotel"
              className="w-full px-4 py-3 border-2 border-washwell-gray-light rounded-xl focus:border-washwell-green focus:ring-4 focus:ring-washwell-green/10 outline-none transition-all font-medium text-washwell-black"
            />
          </div>
        )}

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-4 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide"
        >
          {submitting ? "Setting up..." : "Continue →"}
        </button>
      </div>
    </div>
  );
}
