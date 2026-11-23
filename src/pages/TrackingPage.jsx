import { useParams, Link } from "react-router-dom";
import DriverLocationMap from "../components/DriverLocationMap";

export default function TrackingPage() {
  const { orderId } = useParams();

  return (
    <div className="min-h-screen bg-washwell-cream font-body p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Link to="/" className="flex items-center gap-3">
            <img src="/logo.png" alt="Washwell Laundry Co." className="h-12 w-auto" />
          </Link>
          <h1 className="text-xl font-display font-bold text-washwell-black">
            Live Delivery Tracking
          </h1>
          <Link
            to="/"
            className="text-sm font-semibold text-washwell-gray-dark hover:text-washwell-black transition-colors"
          >
            ← My Orders
          </Link>
        </div>

        <DriverLocationMap orderId={orderId} />

        <p className="text-center text-xs text-washwell-gray mt-4">
          Order #{orderId} • Powered by Washwell Laundry Co.
        </p>
      </div>
    </div>
  );
}
