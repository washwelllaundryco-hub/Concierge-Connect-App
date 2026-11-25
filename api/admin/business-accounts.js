// /api/admin/business-accounts
// GET  → list all business accounts
// POST → create/update a business account
// Only callable by Washwell admin (role = "admin" in Clerk publicMetadata)
import { sql } from "@vercel/postgres";

function isAdmin(req) {
  // Decode Clerk JWT sub + publicMetadata.role without full verification (edge-safe)
  try {
    const t = (req.headers.authorization || "").replace("Bearer ", "");
    if (!t) return false;
    const payload = JSON.parse(Buffer.from(t.split(".")[1] || "e30=", "base64").toString());
    return payload?.publicMetadata?.role === "admin" || payload?.metadata?.role === "admin";
  } catch { return false; }
}

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin only" });

  // Ensure table exists
  await sql`
    CREATE TABLE IF NOT EXISTS business_accounts (
      id                     SERIAL PRIMARY KEY,
      company_name           TEXT NOT NULL UNIQUE,
      contact_name           TEXT,
      contact_email          TEXT,
      contact_phone          TEXT,
      billing_email          TEXT,
      pricing_standard_lbs   NUMERIC(6,2) DEFAULT 2.90,
      pricing_heavy_lbs      NUMERIC(6,2) DEFAULT 3.25,
      payment_method         TEXT DEFAULT 'stripe',   -- 'stripe' | 'invoice'
      invoice_cycle          TEXT DEFAULT 'monthly',
      notes                  TEXT,
      active                 BOOLEAN DEFAULT true,
      created_at             TIMESTAMPTZ DEFAULT NOW(),
      updated_at             TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  if (req.method === "GET") {
    const rows = await sql`SELECT * FROM business_accounts WHERE active = true ORDER BY company_name`;
    return res.json({ accounts: rows.rows });
  }

  if (req.method === "POST") {
    const {
      company_name, contact_name, contact_email, contact_phone, billing_email,
      pricing_standard_lbs, pricing_heavy_lbs,
      payment_method, invoice_cycle, notes,
    } = req.body;
    if (!company_name?.trim()) return res.status(400).json({ error: "company_name required" });

    // Upsert — update on conflict
    const result = await sql`
      INSERT INTO business_accounts (
        company_name, contact_name, contact_email, contact_phone, billing_email,
        pricing_standard_lbs, pricing_heavy_lbs, payment_method, invoice_cycle, notes
      ) VALUES (
        ${company_name.trim()},
        ${contact_name || null},
        ${contact_email || null},
        ${contact_phone || null},
        ${billing_email || null},
        ${pricing_standard_lbs ?? 2.90},
        ${pricing_heavy_lbs ?? 3.25},
        ${payment_method || "stripe"},
        ${invoice_cycle || "monthly"},
        ${notes || null}
      )
      ON CONFLICT (company_name) DO UPDATE SET
        contact_name         = EXCLUDED.contact_name,
        contact_email        = EXCLUDED.contact_email,
        contact_phone        = EXCLUDED.contact_phone,
        billing_email        = EXCLUDED.billing_email,
        pricing_standard_lbs = EXCLUDED.pricing_standard_lbs,
        pricing_heavy_lbs    = EXCLUDED.pricing_heavy_lbs,
        payment_method       = EXCLUDED.payment_method,
        invoice_cycle        = EXCLUDED.invoice_cycle,
        notes                = EXCLUDED.notes,
        active               = true,
        updated_at           = NOW()
      RETURNING *
    `;
    return res.json({ success: true, account: result.rows[0] });
  }

  if (req.method === "DELETE") {
    const { company_name } = req.body;
    await sql`UPDATE business_accounts SET active = false, updated_at = NOW() WHERE company_name = ${company_name}`;
    return res.json({ success: true });
  }

  res.status(405).end();
}
