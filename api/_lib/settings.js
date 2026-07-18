// api/settings.js
// ---------------------------------------------------------------------------
// The one event-wide lot fee. Service-role + organizer passcode.
//   GET -> { lotFee }
//   PUT -> set the fee   (body: { lotFee })
// ---------------------------------------------------------------------------
import { requestedEvent } from "./event.js";
import { authorizeOrganizer } from "./auth.js";
import { writeEventSettings } from "./settings-write.js";
const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASS = process.env.ORGANIZER_PASSCODE;
const YEAR = 2026;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

export default async function handler(req, res) {
  if (!(await authorizeOrganizer(req))) return res.status(401).json({ error: "Unauthorized" });
  const base = `${SB}/rest/v1/event_settings`;
  try {
    if (req.method === "GET") {
      const r = await fetch(`${base}?event_id=eq.${encodeURIComponent(requestedEvent(req))}&select=lot_fee`, { headers: H });
      const s = await r.json();
      return res.status(200).json({ lotFee: Array.isArray(s) && s[0] ? Number(s[0].lot_fee) : 50 });
    }
    if (req.method === "PUT") {
      const { lotFee } = req.body || {};
      const w = await writeEventSettings(requestedEvent(req), { lot_fee: Number(lotFee) || 0 });
      if (!w.ok) console.error("settings write failed:", w.status, w.error);
      return res.status(w.ok ? 200 : 500).json({ ok: w.ok, detail: w.ok ? undefined : w.error });
    }
    res.setHeader("Allow", "GET, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("settings error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
