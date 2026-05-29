import { db } from "../../_db.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { id: orderId } = req.query;

  try {
    const { rows } = await db.query(
      `SELECT
         lo.status,
         lo.estimated_delivery_time,
         wf.latitude          AS pickup_lat,
         wf.longitude         AS pickup_lng,
         h.latitude           AS dropoff_lat,
         h.longitude          AS dropoff_lng,
         d.id                 AS driver_id,
         d.name               AS driver_name,
         d.phone              AS driver_phone,
         d.photo_url          AS driver_photo,
         d.current_lat        AS driver_lat,
         d.current_lng        AS driver_lng,
         d.bearing            AS driver_bearing,
         d.location_updated_at,
         v.color              AS vehicle_color,
         v.make               AS vehicle_make,
         v.model              AS vehicle_model,
         v.license_plate
       FROM laundry_orders lo
       JOIN washwell_facilities wf ON lo.facility_id  = wf.id
       JOIN hotel_guests        hg ON lo.guest_id     = hg.id
       JOIN hotels               h ON hg.hotel_id     = h.id
       LEFT JOIN burq_deliveries bd ON lo.id          = bd.order_id AND bd.status != 'cancelled'
       LEFT JOIN drivers         d  ON bd.driver_id   = d.id
       LEFT JOIN driver_vehicles  v  ON d.id          = v.driver_id
       WHERE lo.id = $1
       LIMIT 1`,
      [orderId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }

    const r = rows[0];

    res.json({
      status: r.status,
      estimated_delivery_time: r.estimated_delivery_time,
      pickup_location:  { lat: r.pickup_lat,  lng: r.pickup_lng  },
      dropoff_location: { lat: r.dropoff_lat, lng: r.dropoff_lng },
      driver: r.driver_id
        ? {
            name:      r.driver_name,
            phone:     r.driver_phone,
            photo_url: r.driver_photo,
            vehicle: {
              color:         r.vehicle_color,
              make:          r.vehicle_make,
              model:         r.vehicle_model,
              license_plate: r.license_plate,
            },
            location: r.driver_lat
              ? {
                  lat:        r.driver_lat,
                  lng:        r.driver_lng,
                  bearing:    r.driver_bearing,
                  updated_at: r.location_updated_at,
                }
              : null,
          }
        : null,
    });
  } catch (error) {
    console.error("Delivery status error:", error);
    res.status(500).json({ error: "Failed to fetch delivery status" });
  }
}
