// GET /api/admin/invoices?company=Acme&from=2026-11-01&to=2026-11-30
// Returns all invoice-method orders for a company in a date range, with totals
// Admin only
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
  if (req.method !== "GET") return res.status(405).end();

  const { company, from, to } = req.query;
  if (!company) return res.status(400).json({ error: "company query param required" });

  const fromDate = from ? new Date(from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const toDate   = to   ? new Date(to)   : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0, 23, 59, 59);

  const orders = await sql`
    SELECT
      lo.id, lo.order_number, lo.created_at,
      lo.guest_first_name, lo.guest_last_name, lo.guest_room_number,
      lo.tier, lo.total_weight_lbs, lo.total_amount,
      lo.status, lo.payment_method, lo.payment_verified, lo.payment_confirmed_at,
      lo.special_instructions, lo.company_name, lo.account_type
    FROM laundry_orders lo
    WHERE
      LOWER(lo.company_name) = LOWER(${company})
      AND lo.account_type = 'business'
      AND lo.payment_method = 'invoice'
      AND lo.created_at >= ${fromDate.toISOString()}
      AND lo.created_at <= ${toDate.toISOString()}
      AND lo.status NOT IN ('cancelled')
    ORDER BY lo.created_at ASC
  `;

  const rows = orders.rows;
  const totalAmount = rows.reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0);
  const totalLbs    = rows.reduce((sum, o) => sum + parseFloat(o.total_weight_lbs || 0), 0);
  const unpaidCount = rows.filter(o => !o.payment_verified).length;

  // Also look up billing email from business_accounts
  let billingEmail = null;
  try {
    const ba = await sql`SELECT billing_email FROM business_accounts WHERE LOWER(company_name) = LOWER(${company}) LIMIT 1`;
    billingEmail = ba.rows[0]?.billing_email || null;
  } catch {}

  res.json({
    company,
    period: { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) },
    billingEmail,
    orders: rows,
    summary: {
      orderCount: rows.length,
      unpaidCount,
      totalLbs: parseFloat(totalLbs.toFixed(2)),
      totalAmount: parseFloat(totalAmount.toFixed(2)),
    },
  });
}
