// api/sponsors.js
// GET    → list all sponsors for 2026
// POST   → create sponsor
// PATCH  → update sponsor (body: { id, ...fields })
// DELETE → remove sponsor (?id=<uuid>)
// Gated by x-organizer-key header.
const SB   = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASS = process.env.ORGANIZER_PASSCODE;
const YEAR = 2026;
const H    = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const base = () => `${SB}/rest/v1/sponsors`;

export default async function handler(req, res) {
  if (req.headers["x-organizer-key"] !== PASS) return res.status(401).json({ error: "Unauthorized" });
  try {
    if (req.method === "GET") {
      const r = await fetch(`${base()}?select=*,sponsor_packages(id,name,price,benefits)&event_year=eq.${YEAR}&order=created_at.asc`, { headers: H });
      return res.status(r.ok ? 200 : 500).json(await r.json());
    }
    if (req.method === "POST") {
      const b = req.body || {};
      const r = await fetch(base(), {
        method: "POST",
        headers: { ...H, Prefer: "return=representation" },
        body: JSON.stringify({
          event_year: YEAR,
          name: b.name,
          contact_name: b.contactName || null,
          contact_email: b.contactEmail || null,
          contact_phone: b.contactPhone || null,
          tier: b.tier || null,
          amount_pledged: Number(b.amountPledged) || 0,
          amount_paid: Number(b.amountPaid) || 0,
          payment_status: b.paymentStatus || "Unpaid",
          benefits: b.benefits || null,
          logo_received: !!b.logoReceived,
          notes: b.notes || null,
          package_id: b.packageId ?? null,
          benefits_done: b.benefitsDone ?? {},
          logo_url: b.logoUrl ?? null,
        }),
      });
      const rows = await r.json();
      return res.status(r.ok ? 200 : 500).json(Array.isArray(rows) ? rows[0] : rows);
    }
    if (req.method === "PATCH") {
      const { id, ...b } = req.body || {};
      if (!id) return res.status(400).json({ error: "Missing id" });
      const patch = {};
      if ("name"          in b) patch.name           = b.name;
      if ("contactName"   in b) patch.contact_name   = b.contactName   ?? null;
      if ("contactEmail"  in b) patch.contact_email  = b.contactEmail  ?? null;
      if ("contactPhone"  in b) patch.contact_phone  = b.contactPhone  ?? null;
      if ("tier"          in b) patch.tier           = b.tier          ?? null;
      if ("amountPledged" in b) patch.amount_pledged = Number(b.amountPledged) || 0;
      if ("amountPaid"    in b) patch.amount_paid    = Number(b.amountPaid)    || 0;
      if ("paymentStatus" in b) patch.payment_status = b.paymentStatus;
      if ("benefits"      in b) patch.benefits       = b.benefits      ?? null;
      if ("logoReceived"  in b) patch.logo_received  = !!b.logoReceived;
      if ("notes"         in b) patch.notes          = b.notes         ?? null;
      if ("packageId"     in b) patch.package_id     = b.packageId     ?? null;
      if ("benefitsDone"  in b) patch.benefits_done  = b.benefitsDone  ?? {};
      if ("logoUrl"       in b) patch.logo_url       = b.logoUrl       ?? null;
      const r = await fetch(`${base()}?id=eq.${id}`, {
        method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(patch),
      });
      return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
    }
    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "Missing id" });
      const r = await fetch(`${base()}?id=eq.${id}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
      return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
    }
    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("sponsors error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
