import { useState } from "react";
import { useUser, useAuth, useClerk } from "@clerk/clerk-react";
import { useNavigate } from "react-router-dom";

const TYPES = [
  { name: "Clothing",             rate: 2.75, description: "Everyday garments & apparel" },
  { name: "Mixed Bag",            rate: 2.85, description: "Towels, sheets & mixed items" },
  { name: "Bedding",              rate: 3.00, description: "Duvets, comforters & pillowcases" },
  { name: "Mats & Washable Rugs", rate: 3.25, description: "Bath mats, area & washable rugs" },
];
const BASE_PRICE = 49;
const BASE_LBS   = 15;

export default function GuestLandingPage() {
  const { user, isLoaded } = useUser();
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const navigate = useNavigate();
  const [step, setStep]           = useState("select");
  const [selectedTier, setSelectedTier] = useState(null);
  const [phone, setPhone]         = useState(user?.publicMetadata?.phone || user?.phoneNumbers?.[0]?.phoneNumber || "");
  const [roomNumber, setRoomNumber] = useState(user?.publicMetadata?.roomNumber || "");
  const [instructions, setInstructions] = useState("");
  const [error, setError]         = useState("");

  if (!isLoaded) return (
    <div className="min-h-screen bg-washwell-cream flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-washwell-green border-t-transparent rounded-full animate-spin" />
    </div>
  );

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
          firstName, lastName,
          phone: phone.trim(),
          email: user?.primaryEmailAddress?.emailAddress || "",
          roomNumber: roomNumber.trim(),
          hotelId, hotelName,
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
    <div className="min-h-screen bg-washwell-cream font-body">
      <div className="max-w-lg mx-auto px-4 pt-10 pb-20">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-washwell-green rounded-2xl mb-4">
            <span className="text-white font-bold text-xl font-display">W</span>
          </div>
          <h1 className="text-3xl font-display font-bold text-washwell-black">Washwell Concierge</h1>
          {hotelName && <p className="text-washwell-gray-dark mt-1 text-sm font-medium">{hotelName}</p>}
          <p className="text-washwell-gray mt-1 text-sm">Hello, {firstName}! Choose your laundry service below.</p>
        </div>

        <h2 className="text-sm font-semibold text-washwell-gray-dark uppercase tracking-wider mb-1">Select Item Type</h2>
        <p className="text-xs text-washwell-gray mb-3">${BASE_PRICE} CAD for the first {BASE_LBS} lbs · per-lb rate applies after</p>

        <div className="space-y-3 mb-6">
          {TYPES.map(t => (
            <button key={t.name} onClick={() => { setSelectedTier(t); setStep("confirm"); }}
              className="w-full text-left bg-white rounded-2xl border-2 border-washwell-gray-light hover:border-washwell-green active:scale-[0.99] p-4 shadow-sm transition-all group">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-washwell-black text-base group-hover:text-washwell-green-dark transition-colors font-display">{t.name}</p>
                  <p className="text-xs text-washwell-gray mt-0.5">{t.description}</p>
                </div>
                <div className="text-right ml-4 shrink-0">
                  <p className="text-lg font-bold text-washwell-green font-display">${t.rate.toFixed(2)}<span className="text-xs font-normal text-washwell-gray">/lb</span></p>
                  <p className="text-xs text-washwell-gray">after {BASE_LBS} lbs</p>
                </div>
              </div>
            </button>
          ))}
        </div>

        <p className="text-xs text-washwell-gray text-center">Prices exclude tax & delivery. Delivery fee charged per trip. Final weight confirmed by our tech. Payment via SMS — no upfront charge.</p>
        <button onClick={() => signOut()} className="mt-8 block mx-auto text-xs text-washwell-gray hover:text-washwell-gray-dark">Sign out</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-washwell-cream font-body flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-lg max-w-md w-full p-6 border border-washwell-gray-light">
        <button onClick={() => setStep("select")} className="text-sm text-washwell-gray hover:text-washwell-gray-dark mb-4">← Back</button>
        <h2 className="text-xl font-bold text-washwell-black mb-1">Confirm Your Request</h2>

        {/* Selected type summary */}
        <div className="bg-washwell-green-pale border border-washwell-green rounded-2xl p-4 mb-5">
          <div className="flex justify-between items-center">
            <div>
              <p className="font-bold text-washwell-black">{selectedTier?.name}</p>
              <p className="text-sm text-washwell-gray-dark">{selectedTier?.description}</p>
            </div>
            <div className="text-right ml-4 shrink-0">
              <p className="text-base font-bold text-washwell-green">${BASE_PRICE} <span className="text-xs font-normal text-washwell-gray">up to {BASE_LBS} lbs</span></p>
              <p className="text-xs text-washwell-green">${selectedTier?.rate?.toFixed(2)}/lb after</p>
            </div>
          </div>
          <p className="text-xs text-washwell-gray-dark mt-2 pt-2 border-t border-washwell-green/20">
            + delivery fee (per trip) · taxes not included · payment link sent via SMS after weighing
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-washwell-gray-dark mb-1">Phone Number <span className="text-red-500">*</span></label>
            <input type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+1 416 555 0100"
              className="w-full border-2 border-washwell-gray-light rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-washwell-green" />
            <p className="text-xs text-washwell-gray mt-0.5">Your Stripe payment link will be sent here</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-washwell-gray-dark mb-1">Room Number</label>
            <input type="text" value={roomNumber} onChange={e=>setRoomNumber(e.target.value)} placeholder="412"
              className="w-full border-2 border-washwell-gray-light rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-washwell-green" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-washwell-gray-dark mb-1">Special Instructions</label>
            <input type="text" value={instructions} onChange={e=>setInstructions(e.target.value)} placeholder="Cold wash, no scent, hang dry…"
              className="w-full border-2 border-washwell-gray-light rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-washwell-green" />
          </div>
        </div>

        {error && <p className="text-sm text-red-600 mt-3 bg-red-50 rounded-xl px-3 py-2">{error}</p>}

        <button onClick={handleRequestPickup} disabled={step==="submitting" || !phone.trim()}
          className="mt-5 w-full bg-washwell-green text-white py-3.5 rounded-2xl font-bold hover:bg-washwell-green-dark disabled:opacity-50 transition-colors shadow-washwell-green text-sm">
          {step === "submitting" ? "Placing order…" : "Request Pickup →"}
        </button>
      </div>
    </div>
  );
}
