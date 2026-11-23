import { useState } from "react";
import { useUser, useAuth, useClerk } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";

const TIERS = [
  { name: "Essential Load", maxLbs: 15, price: 68, description: "Up to 15 lbs" },
  { name: "Standard Load",  maxLbs: 30, price: 88, description: "Up to 30 lbs" },
  { name: "Premium Load",   maxLbs: 50, price: 128, description: "Up to 50 lbs" },
  { name: "Executive Load", maxLbs: 75, price: 188, description: "Up to 75 lbs" },
  { name: "Bulk Service",   maxLbs: 999,price: 245, description: "75+ lbs" },
];
const DELIVERY_FEE = 20;

export default function GuestLandingPage() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const [step, setStep]       = useState("select"); // select | confirm | submitting
  const [selectedTier, setSelectedTier] = useState(null);
  const [phone, setPhone]     = useState(user?.publicMetadata?.phone || user?.phoneNumbers?.[0]?.phoneNumber || "");
  const [roomNumber, setRoomNumber] = useState(user?.publicMetadata?.roomNumber || "");
  const [instructions, setInstructions] = useState("");
  const [error, setError]     = useState("");

  if (!isLoaded) return <div className="min-h-screen flex items-center justify-center"><p className="text-gray-400">Loading…</p></div>;

  const hotelId   = user?.publicMetadata?.hotelId   || "";
  const hotelName = user?.publicMetadata?.hotelName || "";
  const firstName = user?.firstName || user?.publicMetadata?.firstName || "Guest";
  const lastName  = user?.lastName  || user?.publicMetadata?.lastName  || "";

  async function handleRequestPickup() {
    if (!selectedTier) return setError("Please select a service tier.");
    if (!phone.trim())  return setError("Phone number is required for your payment link.");
    setStep("submitting");
    setError("");
    try {
      const token = await getToken();
      const res = await fetch("/api/orders/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
        body: JSON.stringify({
          firstName,
          lastName,
          phone: phone.trim(),
          email: user?.primaryEmailAddress?.emailAddress || "",
          roomNumber: roomNumber.trim(),
          hotelId,
          hotelName,
          tier: selectedTier.name,
          specialInstructions: instructions.trim(),
          placedBy: "guest",
          guestId: user?.id,
        }),
      });
      const d = await res.json();
      if (!res.ok) { setError(d.error || "Failed to place order. Please try again."); setStep("confirm"); return; }
      navigate("/checkout?orderId=" + d.orderId + "&orderNumber=" + encodeURIComponent(d.orderNumber));
    } catch(e) { setError("Error: " + e.message); setStep("confirm"); }
  }

  if (step === "select") return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-50 p-4">
      <div className="max-w-lg mx-auto pt-8">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🧺</div>
          <h1 className="text-3xl font-bold text-gray-900">Washwell Concierge</h1>
          {hotelName && <p className="text-gray-500 mt-1">{hotelName}</p>}
          <p className="text-gray-500 text-sm mt-1">Hello, {firstName}!</p>
        </div>

        <h2 className="text-lg font-semibold text-gray-800 mb-3">Choose your service</h2>
        <div className="space-y-3 mb-6">
          {TIERS.map(t => (
            <button key={t.name} onClick={() => { setSelectedTier(t); setStep("confirm"); }}
              className="w-full text-left bg-white rounded-2xl border-2 border-transparent hover:border-green-400 p-4 shadow-sm transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900">{t.name}</p>
                  <p className="text-sm text-gray-500">{t.description}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-green-700">${t.price}</p>
                  <p className="text-xs text-gray-400">+${DELIVERY_FEE} delivery</p>
                </div>
              </div>
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400 text-center">Final tier confirmed by technician after weighing. Payment via SMS link.</p>
        <button onClick={() => signOut()} className="mt-6 block mx-auto text-sm text-gray-400 hover:text-gray-600">Sign out</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-50 p-4 flex items-center justify-center">
      <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-6">
        <button onClick={() => setStep("select")} className="text-sm text-gray-400 hover:text-gray-600 mb-4">← Back</button>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Confirm Pickup Request</h2>
        <div className="bg-green-50 rounded-xl p-3 mb-4">
          <p className="font-semibold text-green-800">{selectedTier?.name}</p>
          <p className="text-sm text-green-700">${selectedTier?.price} + ${DELIVERY_FEE} delivery = <strong>${(selectedTier?.price||0)+DELIVERY_FEE} CAD est.</strong></p>
          <p className="text-xs text-green-600 mt-1">Final amount confirmed after weighing</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Phone Number <span className="text-red-500">*</span></label>
            <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+1 416 555 0100"
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
            <p className="text-xs text-gray-400 mt-0.5">Your Stripe payment link will be sent here</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Room Number</label>
            <input type="text" value={roomNumber} onChange={e=>setRoomNumber(e.target.value)} placeholder="412"
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Special Instructions</label>
            <input type="text" value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="Cold wash, no scent, hang dry…"
              className="w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400" />
          </div>
        </div>
        {error && <p className="text-sm text-red-600 mt-3 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <button onClick={handleRequestPickup} disabled={step==="submitting" || !phone.trim()}
          className="mt-5 w-full bg-green-600 text-white py-3 rounded-2xl font-semibold hover:bg-green-700 disabled:opacity-50 text-sm">
          {step === "submitting" ? "Placing order…" : "Request Pickup →"}
        </button>
      </div>
    </div>
  );
}
