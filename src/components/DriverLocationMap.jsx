import { useState, useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import io from "socket.io-client";

// Fix Leaflet default marker icons bundled by Vite
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const WASHWELL = {
  black: "#0d0d0c",
  green: "#00c419",
  greenDark: "#00a015",
  gray: "#adada9",
  grayLight: "#d6d6d4",
};

const pickupIcon = L.divIcon({
  className: "custom-marker",
  html: `<div style="width:40px;height:40px;background:${WASHWELL.black};border:3px solid ${WASHWELL.green};border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,196,25,0.3);font-size:20px;">🏢</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

const dropoffIcon = L.divIcon({
  className: "custom-marker",
  html: `<div style="width:40px;height:40px;background:${WASHWELL.green};border:3px solid ${WASHWELL.black};border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(13,13,12,0.3);font-size:20px;">🏨</div>`,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
});

function createDriverIcon(bearing = 0) {
  return L.divIcon({
    className: "driver-marker",
    html: `<div style="width:50px;height:50px;background:white;border:4px solid ${WASHWELL.green};border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 16px rgba(0,196,25,0.4);transform:rotate(${bearing}deg);font-size:24px;">🚗</div>`,
    iconSize: [50, 50],
    iconAnchor: [25, 25],
  });
}

function MapBoundsFitter({ positions }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      map.fitBounds(L.latLngBounds(positions), { padding: [50, 50], maxZoom: 15 });
    }
  }, [positions, map]);
  return null;
}

function DriverInfoCard({ driver, eta }) {
  if (!driver) return null;
  return (
    <div className="absolute top-4 left-4 z-[1000] bg-white rounded-2xl shadow-xl border-2 border-washwell-gray-light max-w-xs">
      <div className="p-5">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-16 h-16 rounded-full bg-washwell-cream border-2 border-washwell-green flex items-center justify-center text-2xl">
            {driver.photo_url ? (
              <img src={driver.photo_url} alt={driver.name} className="w-full h-full rounded-full object-cover" />
            ) : "👤"}
          </div>
          <div>
            <h3 className="text-lg font-display font-bold text-washwell-black">{driver.name}</h3>
            <p className="text-xs text-washwell-gray uppercase tracking-wider font-semibold">Your Driver</p>
          </div>
        </div>
        {driver.vehicle && (
          <div className="bg-washwell-cream rounded-xl p-4 mb-4 border-2 border-washwell-gray-light">
            <div className="flex items-center gap-2 mb-1">
              <span>🚗</span>
              <span className="text-sm font-semibold text-washwell-black">
                {driver.vehicle.color} {driver.vehicle.make} {driver.vehicle.model}
              </span>
            </div>
            <div className="text-xs font-mono text-washwell-gray-dark">{driver.vehicle.license_plate}</div>
          </div>
        )}
        {eta && (
          <div className="bg-washwell-green rounded-xl p-4 flex items-center gap-3 mb-4">
            <span className="text-2xl">⏱</span>
            <div>
              <p className="text-xs text-white/80 font-semibold uppercase tracking-wider">Arriving in</p>
              <p className="text-xl font-mono font-bold text-white">{eta}</p>
            </div>
          </div>
        )}
        <a
          href={`tel:${driver.phone}`}
          className="block w-full text-center py-3 bg-washwell-black text-white font-bold rounded-xl transition-colors hover:opacity-90"
        >
          📞 Call Driver
        </a>
      </div>
    </div>
  );
}

function StatusBanner({ status }) {
  const statusConfig = {
    pending: { icon: "⏳", label: "Finding a driver..." },
    assigned: { icon: "✓", label: "Driver assigned" },
    en_route_to_pickup: { icon: "🚗", label: "Driver heading to facility" },
    picked_up: { icon: "📦", label: "Laundry picked up" },
    en_route_to_delivery: { icon: "🚚", label: "On the way to you" },
    completed: { icon: "🎉", label: "Delivered!" },
  };
  const config = statusConfig[status] ?? statusConfig.pending;
  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[1000] bg-white rounded-full px-8 py-4 shadow-xl border-2 border-washwell-green flex items-center gap-3">
      <span className="text-2xl">{config.icon}</span>
      <span className="font-display font-bold text-lg text-washwell-green">{config.label}</span>
    </div>
  );
}

export default function DriverLocationMap({ orderId }) {
  const [deliveryData, setDeliveryData] = useState(null);
  const [driverLocation, setDriverLocation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const socketRef = useRef(null);

  function formatETA(iso) {
    if (!iso) return null;
    const mins = Math.max(0, Math.ceil((new Date(iso) - Date.now()) / 60000));
    if (mins < 60) return `${mins} min`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  }

  useEffect(() => {
    fetch(`/api/orders/${orderId}/delivery-status`)
      .then((r) => { if (!r.ok) throw new Error("Failed to fetch"); return r.json(); })
      .then((data) => {
        setDeliveryData(data);
        if (data.driver?.location) setDriverLocation(data.driver.location);
        setLoading(false);
      })
      .catch((err) => { setError(err.message); setLoading(false); });
  }, [orderId]);

  useEffect(() => {
    const wsUrl = import.meta.env.VITE_WEBSOCKET_URL || "http://localhost:3001";
    const socket = io(wsUrl, { transports: ["websocket"] });
    socketRef.current = socket;
    socket.emit("join_order", orderId);

    socket.on("driver_location", (data) => {
      if (data.order_id === orderId) {
        setDriverLocation({ lat: data.lat, lng: data.lng, bearing: data.bearing, updated_at: data.timestamp });
      }
    });
    socket.on("driver_assigned", (data) => {
      if (data.order_id === orderId) {
        setDeliveryData((prev) => ({ ...prev, driver: data.driver, estimated_delivery_time: data.estimated_delivery_time }));
      }
    });
    socket.on("pickup_completed", (data) => {
      if (data.order_id === orderId) setDeliveryData((prev) => ({ ...prev, status: "picked_up" }));
    });
    socket.on("delivery_completed", (data) => {
      if (data.order_id === orderId) setDeliveryData((prev) => ({ ...prev, status: "completed" }));
    });

    return () => { socket.emit("leave_order", orderId); socket.disconnect(); };
  }, [orderId]);

  if (loading) {
    return (
      <div className="h-[600px] bg-washwell-cream rounded-3xl flex items-center justify-center border-2 border-washwell-gray-light">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-washwell-green border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-washwell-gray font-semibold">Loading delivery status...</p>
        </div>
      </div>
    );
  }

  if (error || !deliveryData) {
    return (
      <div className="h-[600px] bg-washwell-cream rounded-3xl flex flex-col items-center justify-center border-2 border-washwell-gray-light">
        <span className="text-6xl mb-4">📍</span>
        <p className="text-washwell-gray-dark font-semibold">No active delivery found</p>
      </div>
    );
  }

  const { pickup_location, dropoff_location, driver, status, estimated_delivery_time } = deliveryData;
  const positions = [
    [pickup_location.lat, pickup_location.lng],
    [dropoff_location.lat, dropoff_location.lng],
    ...(driverLocation ? [[driverLocation.lat, driverLocation.lng]] : []),
  ];

  return (
    <div className="relative h-[600px] rounded-3xl overflow-hidden shadow-xl border-2 border-washwell-gray-light">
      <div className="absolute top-0 left-0 right-0 z-[1000] bg-washwell-black/95 backdrop-blur-sm px-6 py-4 flex items-center justify-between border-b-2 border-washwell-green">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Washwell Laundry Co." className="h-10 w-auto" />
          <div>
            <h3 className="text-white font-display font-bold text-lg">Live Tracking</h3>
            <p className="text-washwell-gray text-xs uppercase tracking-wider font-semibold">Washwell Delivery</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-washwell-green rounded-full animate-pulse" />
          <span className="text-washwell-gray text-sm font-semibold">Live</span>
        </div>
      </div>

      <MapContainer center={[pickup_location.lat, pickup_location.lng]} zoom={13} style={{ height: "100%", width: "100%" }} zoomControl={false}>
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        />
        <Marker position={[pickup_location.lat, pickup_location.lng]} icon={pickupIcon}>
          <Popup><strong>Pickup Location</strong><br />Washwell Facility</Popup>
        </Marker>
        <Marker position={[dropoff_location.lat, dropoff_location.lng]} icon={dropoffIcon}>
          <Popup><strong>Delivery Location</strong><br />Your Hotel Room</Popup>
        </Marker>
        {driverLocation && (
          <Marker position={[driverLocation.lat, driverLocation.lng]} icon={createDriverIcon(driverLocation.bearing)}>
            <Popup><strong>{driver?.name || "Your Driver"}</strong><br />Updated: {new Date(driverLocation.updated_at).toLocaleTimeString()}</Popup>
          </Marker>
        )}
        <Polyline
          positions={[[pickup_location.lat, pickup_location.lng], [dropoff_location.lat, dropoff_location.lng]]}
          color={WASHWELL.green}
          weight={4}
          opacity={0.7}
          dashArray="10, 10"
        />
        <MapBoundsFitter positions={positions} />
      </MapContainer>

      <DriverInfoCard driver={driver} eta={formatETA(estimated_delivery_time)} />
      <StatusBanner status={status} />
    </div>
  );
}
