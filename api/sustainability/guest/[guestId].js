import { db } from "../../_db.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { guestId } = req.query;

  try {
    const { rows } = await db.query(
      `SELECT total_sustainability_orders, total_water_saved, total_energy_saved, total_co2_avoided
       FROM hotel_guests
       WHERE id = $1`,
      [guestId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Guest not found" });
    }

    const g = rows[0];
    res.json({
      totalOrders:       g.total_sustainability_orders || 0,
      waterSavedGallons: parseFloat(g.total_water_saved  || 0).toFixed(1),
      energySavedKwh:    parseFloat(g.total_energy_saved || 0).toFixed(1),
      co2AvoidedLbs:     parseFloat(g.total_co2_avoided  || 0).toFixed(1),
    });
  } catch (error) {
    console.error("Get sustainability error:", error);
    res.status(500).json({ error: "Failed to fetch sustainability data" });
  }
}
