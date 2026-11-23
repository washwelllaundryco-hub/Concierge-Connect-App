import { sql } from "@vercel/postgres";
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { clerkUserId, firstName, lastName, email, phone, role } = req.body;
  if (!clerkUserId) return res.status(400).json({ error: "clerkUserId required" });
  try {
    await sql`INSERT INTO users (clerk_user_id, first_name, last_name, email, phone, role, created_at, updated_at) VALUES (${clerkUserId},${firstName||null},${lastName||null},${email||null},${phone||null},${role||"guest"},NOW(),NOW()) ON CONFLICT (clerk_user_id) DO UPDATE SET first_name=COALESCE(EXCLUDED.first_name,users.first_name),last_name=COALESCE(EXCLUDED.last_name,users.last_name),email=COALESCE(EXCLUDED.email,users.email),phone=COALESCE(EXCLUDED.phone,users.phone),updated_at=NOW()`;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
}
