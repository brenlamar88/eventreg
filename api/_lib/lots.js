// api/lots.js
// ---------------------------------------------------------------------------
// Auction-settlement data for the EWA module. Service-role + organizer passcode.
//   GET    -> { lots: [...], lotFee }      (lots for the event + the event-wide fee)
//   POST   -> create a lot                  (body: lot fields)
//   PATCH  -> update a lot                  (body: { id, ...fields })  e.g. delivered/check
//   DELETE -> remove a lot                  (?id=<uuid>)
//
// Reuses the same env vars as /api/registrants:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ORGANIZER_PASSCODE
// ---------------------------------------------------------------------------
import { requestedEvent } from "./event.js";
import { authorizeOrganizer } from "./auth.js";
const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASS = process.env.ORGANIZER_PASSCODE;
const YEAR = 2026;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

export default async function handler(req, res) {
  if (!(await authorizeOrganizer(req))) return res.status(401).json({ error: "Unauthorized" });
  const base = `${SB}/rest/v1/lots`;
  try {
    if (req.method === "GET") {
      const ev = encodeURIComponent(requestedEvent(req));
      const lr = await fetch(`${base}?event_id=eq.${ev}&order=created_at.asc`, { headers: H });
      const lots = await lr.json();
      const sr = await fetch(`${SB}/rest/v1/event_settings?event_id=eq.${ev}&select=lot_fee`, { headers: H });
      const s = await sr.json();
      const lotFee = Array.isArray(s) && s[0] ? Number(s[0].lot_fee) : 50;
      return res.status(200).json({ lots, lotFee });
    }
    if (req.method === "POST") {
      const b = req.body || {};
      const r = await fetch(base, {
        method: "POST",
        headers: { ...H, Prefer: "return=representation" },
        body: JSON.stringify({
          event_year: YEAR,
          event_id: requestedEvent(req),
          lot_no: b.lotNo,
          description: b.description || null,
          auction_category: b.category || null,
          sale_type: b.saleType || "Live",
          consignor_name: b.consignorName || null,
          consignor_ranch: b.consignorRanch || null,
          buyer_name: b.buyerName || null,
          buyer_ranch: b.buyerRanch || null,
          amount: b.amount || 0,
          donated: !!b.donated,
          lot_fee: b.lotFee ?? null,
          commission: b.commission || 0,
          net: b.net || 0,
        }),
      });
      const rows = await r.json();
      return res.status(r.ok ? 200 : 500).json(Array.isArray(rows) ? rows[0] : rows);
    }
    if (req.method === "PATCH") {
      const { id, ...patch } = req.body || {};
      if (!id) return res.status(400).json({ error: "Missing id" });
      const r = await fetch(`${base}?id=eq.${id}`, { method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(patch) });
      return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
    }
    if (req.method === "DELETE") {
      const id = req.query.id;
      if (!id) return res.status(400).json({ error: "Missing id" });
      const r = await fetch(`${base}?id=eq.${id}`, { method: "DELETE", headers: { ...H, Prefer: "return=minimal" } });
      return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
    }
    res.setHeader("Allow", "GET, POST, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("lots error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
