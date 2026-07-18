// api/sponsor-packages.js
// GET    → list sponsorship packages for 2026
// POST   → create package (body: { name, price, description, benefits[], sortOrder })
// PATCH  → update package (body: { id, ...fields })
// DELETE → remove package (?id=<uuid>)
// Gated by x-organizer-key header.
const SB   = process.env.SUPABASE_URL;
const KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASS = process.env.ORGANIZER_PASSCODE;
const YEAR = 2026;
const H    = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const base = () => `${SB}/rest/v1/sponsor_packages`;

async function fail(res, r, label) {
  const body = await r.text().catch(() => "");
  console.error(`sponsor-packages ${label} error:`, r.status, body);
  return res.status(500).json({ error: "Database error" });
}

export default async function handler(req, res) {
  if (req.headers["x-organizer-key"] !== PASS) return res.status(401).json({ error: "Unauthorized" });
  try {
    if (req.method === "GET") {
      const r = await fetch(`${base()}?event_year=eq.${YEAR}&order=sort_order.asc,created_at.asc`, { headers: H });
      if (!r.ok) return fail(res, r, "GET");
      return res.status(200).json(await r.json());
    }
    if (req.method === "POST") {
      const b = req.body || {};
      const r = await fetch(base(), {
        method: "POST",
        headers: { ...H, Prefer: "return=representation" },
        body: JSON.stringify({
          event_year: YEAR,
          name: b.name,
          price: Number(b.price) || 0,
          description: b.description || null,
          benefits: Array.isArray(b.benefits) ? b.benefits : [],
          sort_order: Number(b.sortOrder) || 0,
        }),
      });
      if (!r.ok) return fail(res, r, "POST");
      const rows = await r.json();
      return res.status(200).json(Array.isArray(rows) ? rows[0] : rows);
    }
    if (req.method === "PATCH") {
      const { id, ...b } = req.body || {};
      if (!id) return res.status(400).json({ error: "Missing id" });
      const patch = {};
      if ("name"        in b) patch.name        = b.name;
      if ("price"       in b) patch.price       = Number(b.price) || 0;
      if ("description" in b) patch.description = b.description ?? null;
      if ("benefits"    in b) patch.benefits    = Array.isArray(b.benefits) ? b.benefits : [];
      if ("sortOrder"   in b) patch.sort_order  = Number(b.sortOrder) || 0;
      const r = await fetch(`${base()}?id=eq.${id}`, {
        method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(patch),
      });
      if (!r.ok) return fail(res, r, "PATCH");
      return res.status(200).json({ ok: true });
    }
    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "Missing id" });
      const r = await fetch(`${base()}?id=eq.${id}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
      if (!r.ok) return fail(res, r, "DELETE");
      return res.status(200).json({ ok: true });
    }
    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("sponsor-packages error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
