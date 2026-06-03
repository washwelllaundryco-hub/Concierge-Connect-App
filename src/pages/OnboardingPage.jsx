import { useState } from "react";
import { useUser, useAuth } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";

export default function OnboardingPage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const navigate = useNavigate();

  const [role, setRole] = useState("guest");
  const [hotelName, setHotelName] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async () => {
    if (role === "concierge" && !hotelName.trim()) {
      setError("Please enter your hotel name.");
      return;
    }
    if (role === "guest" && !roomNumber.trim()) {
      setError("Please enter your room number.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const token = await getToken();
      const res = await fetch("/api/users/onboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          role,
          hotelName: hotelName.trim(),
          hotelId: hotelName.trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
          roomNumber: roomNumber.trim(),
        }),
      });

      if (!res.ok) throw new Error("Failed to save. Please try again.");

      await user.reload();

      if (role === "concierge") navigate("/concierge");
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
            {[
              { value: "guest",      label: "Hotel Guest",       desc: "I'm a guest and want laundry service" },
              { value: "concierge",  label: "Hotel Concierge",   desc: "I manage laundry requests for hotel guests" },
              { value: "technician", label: "Washwell Technician", desc: "I process and handle laundry orders" },
            ].map(({ value, label, desc }) => (
              <button
                key={value}
                onClick={() => setRole(value)}
                className={`w-full flex items-center gap-4 px-4 py-4 rounded-xl border-2 transition-all text-left ${
                  role === value
                    ? "bg-washwell-green-pale border-washwell-green"
                    : "bg-washwell-cream border-washwell-gray-light hover:border-washwell-green/50"
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                  role === value ? "border-washwell-green bg-washwell-green" : "border-washwell-gray"
                }`} />
                <div>
                  <p className="font-semibold text-sm text-washwell-black">{label}</p>
                  <p className="text-xs text-washwell-gray-dark">{desc}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Hotel name — concierge only */}
        {role === "concierge" && (
          <div className="mb-6">
            <label className="block text-xs font-bold text-washwell-gray-dark uppercase tracking-wider mb-2">
              Hotel Name
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

        {/* Room number — guest only */}
        {role === "guest" && (
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

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full py-4 bg-washwell-green hover:bg-washwell-green-dark text-white font-bold rounded-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide"
        >
          {submitting ? "Setting up..." : "Continue"}
        </button>
      </div>
    </div>
  );
}
