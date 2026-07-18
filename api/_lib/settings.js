// api/settings.js
// ---------------------------------------------------------------------------
// The one event-wide lot fee. Service-role + organizer passcode.
//   GET -> { lotFee }
//   PUT -> set the fee   (body: { lotFee })
// ---------------------------------------------------------------------------
import { requestedEvent } from "./event.js";
const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASS = process.env.ORGANIZER_PASSCODE;
const YEAR = 2026;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

export default async function handler(req, res) {
  if (req.headers["x-organizer-key"] !== PASS) return res.status(401).json({ error: "Unauthorized" });
  const base = `${SB}/rest/v1/event_settings`;
  try {
    if (req.method === "GET") {
      const r = await fetch(`${base}?event_id=eq.${encodeURIComponent(requestedEvent(req))}&select=lot_fee`, { headers: H });
      const s = await r.json();
      return res.status(200).json({ lotFee: Array.isArray(s) && s[0] ? Number(s[0].lot_fee) : 50 });
    }
    if (req.method === "PUT") {
      const { lotFee } = req.body || {};
      const r = await fetch(`${base}?on_conflict=event_id`, {
        method: "POST",
        headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({ event_id: requestedEvent(req), lot_fee: Number(lotFee) || 0, updated_at: new Date().toISOString() }),
      });
      return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
    }
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("settings error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
