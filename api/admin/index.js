// /api/admin — merged admin endpoint
// Routes by ?resource= query param:
//   business-accounts → GET list / POST upsert / DELETE deactivate
//   invoices          → GET ?company=&from=&to=
// Admin only (Clerk publicMetadata.role === "admin")

import { sql } from "@vercel/postgres";

function isAdmin(req) {
  try {
    const t = (req.headers.authorization || "").replace("Bearer ", "");
    if (!t) return false;
    const payload = JSON.parse(Buffer.from(t.split(".")[1] || "e30=", "base64").toString());
    return payload?.publicMetadata?.role === "admin" || payload?.metadata?.role === "admin";
  } catch { return false; }
}

export default async function handler(req, res) {
  if (!isAdmin(req)) return res.status(403).json({ error: "Admin only" });

  const resource = req.query.resource || "business-accounts";

  // ── Business Accounts ──────────────────────────────────────────────────────
  if (resource === "business-accounts") {
    await sql`
      CREATE TABLE IF NOT EXISTS business_accounts (
        id                   SERIAL PRIMARY KEY,
        company_name         TEXT NOT NULL UNIQUE,
        contact_name         TEXT,
        contact_email        TEXT,
        contact_phone        TEXT,
        billing_email        TEXT,
        pricing_standard_lbs NUMERIC(6,2) DEFAULT 2.90,
        pricing_heavy_lbs    NUMERIC(6,2) DEFAULT 3.25,
        payment_method       TEXT DEFAULT 'stripe',
        invoice_cycle        TEXT DEFAULT 'monthly',
        notes                TEXT,
        active               BOOLEAN DEFAULT true,
        created_at           TIMESTAMPTZ DEFAULT NOW(),
        updated_at           TIMESTAMPTZ DEFAULT NOW()
      )
    `;

    if (req.method === "GET") {
      const rows = await sql`SELECT * FROM business_accounts WHERE active = true ORDER BY company_name`;
      return res.json({ accounts: rows.rows });
    }

    if (req.method === "POST") {
      const {
        company_name, contact_name, contact_email, contact_phone, billing_email,
        pricing_standard_lbs, pricing_heavy_lbs, payment_method, invoice_cycle, notes,
      } = req.body;
      if (!company_name?.trim()) return res.status(400).json({ error: "company_name required" });
      const result = await sql`
        INSERT INTO business_accounts (
          company_name, contact_name, contact_email, contact_phone, billing_email,
          pricing_standard_lbs, pricing_heavy_lbs, payment_method, invoice_cycle, notes
        ) VALUES (
          ${company_name.trim()}, ${contact_name||null}, ${contact_email||null},
          ${contact_phone||null}, ${billing_email||null},
          ${pricing_standard_lbs ?? 2.90}, ${pricing_heavy_lbs ?? 3.25},
          ${payment_method||"stripe"}, ${invoice_cycle||"monthly"}, ${notes||null}
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

    return res.status(405).end();
  }

  // ── Invoices ───────────────────────────────────────────────────────────────
  if (resource === "invoices") {
    if (req.method !== "GET") return res.status(405).end();
    const { company, from, to } = req.query;
    if (!company) return res.status(400).json({ error: "company query param required" });

    const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const toDate   = to   ? new Date(to)   : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);

    const orders = await sql`
      SELECT lo.id, lo.order_number, lo.created_at,
             lo.guest_first_name, lo.guest_last_name, lo.guest_room_number,
             lo.tier, lo.total_weight_lbs, lo.total_amount,
             lo.status, lo.payment_method, lo.payment_verified, lo.payment_confirmed_at,
             lo.special_instructions, lo.company_name, lo.account_type
      FROM laundry_orders lo
      WHERE LOWER(lo.company_name) = LOWER(${company})
        AND lo.account_type = 'business'
        AND lo.payment_method = 'invoice'
        AND lo.created_at >= ${fromDate.toISOString()}
        AND lo.created_at <= ${toDate.toISOString()}
        AND lo.status NOT IN ('cancelled')
      ORDER BY lo.created_at ASC
    `;

    const rows = orders.rows;
    const totalAmount = rows.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0);
    const totalLbs    = rows.reduce((s, o) => s + parseFloat(o.total_weight_lbs || 0), 0);
    const unpaidCount = rows.filter(o => !o.payment_verified).length;

    let billingEmail = null;
    try {
      const ba = await sql`SELECT billing_email FROM business_accounts WHERE LOWER(company_name) = LOWER(${company}) LIMIT 1`;
      billingEmail = ba.rows[0]?.billing_email || null;
    } catch {}

    return res.json({
      company,
      period: { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) },
      billingEmail,
      orders: rows,
      summary: { orderCount: rows.length, unpaidCount, totalLbs: parseFloat(totalLbs.toFixed(2)), totalAmount: parseFloat(totalAmount.toFixed(2)) },
    });
  }

  res.status(400).json({ error: "Unknown resource. Use ?resource=business-accounts or ?resource=invoices" });
}
