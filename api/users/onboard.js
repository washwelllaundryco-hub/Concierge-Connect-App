import { createClerkClient } from "@clerk/backend";

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const token = authHeader.replace("Bearer ", "");
    const { sub: userId } = JSON.parse(
      Buffer.from(token.split(".")[1], "base64").toString()
    );

    const { role, customerType, hotelName, hotelId, roomNumber, pickupAddress, unitNumber } = req.body;
    if (!role) return res.status(400).json({ error: "role is required" });

    const metadata = { role };

    if (role === "concierge") {
      if (!hotelName) return res.status(400).json({ error: "hotelName is required for concierge" });
      metadata.hotelName = hotelName;
      metadata.hotelId = hotelId || hotelName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
    }

    if (role === "guest") {
      metadata.customerType = customerType || "hotel";
      metadata.hotelId = "the-hotel";

      if (customerType === "direct") {
        if (pickupAddress) metadata.pickupAddress = pickupAddress;
        if (unitNumber)    metadata.unitNumber    = unitNumber;
      } else {
        if (roomNumber) metadata.roomNumber = roomNumber;
      }
    }

    await clerk.users.updateUserMetadata(userId, { publicMetadata: metadata });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("Onboard error:", err);
    return res.status(500).json({ error: "Failed to update user metadata" });
  }
}
