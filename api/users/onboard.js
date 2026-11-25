import { sql } from "@vercel/postgres";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { clerkUserId, firstName, lastName, email, phone, role, hotelName, hotelId, roomNumber } = req.body;
  if (!clerkUserId) return res.status(400).json({ error: "clerkUserId required" });

  try {
    // 1. Save to postgres users table
    await sql`
      INSERT INTO users (clerk_user_id, first_name, last_name, email, phone, role, created_at, updated_at)
      VALUES (${clerkUserId}, ${firstName||null}, ${lastName||null}, ${email||null}, ${phone||null}, ${role||"guest"}, NOW(), NOW())
      ON CONFLICT (clerk_user_id) DO UPDATE SET
        first_name = COALESCE(EXCLUDED.first_name, users.first_name),
        last_name  = COALESCE(EXCLUDED.last_name,  users.last_name),
        email      = COALESCE(EXCLUDED.email,      users.email),
        phone      = COALESCE(EXCLUDED.phone,      users.phone),
        role       = EXCLUDED.role,
        updated_at = NOW()
    `;

    // Return metadata so the frontend can apply it via user.update()
    res.json({
      success: true,
      publicMetadata: {
        role,
        ...(hotelName ? { hotelName } : {}),
        ...(hotelId   ? { hotelId }   : {}),
        ...(roomNumber ? { roomNumber } : {}),
      },
    });
  } catch (err) {
    console.error("onboard error:", err);
    res.status(500).json({ error: err.message });
  }
}
