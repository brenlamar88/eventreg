// api/registrants.js
// ---------------------------------------------------------------------------
// Organizer-only endpoint for the Boil on the Bend roster.
// GET   → list all registrants (newest first)
// PATCH → toggle a check-in   (body: { id, checked_in })
//
// Uses the Supabase SERVICE ROLE key, which bypasses RLS, so it must live
// ONLY on the server. Access is gated by a shared organizer passcode that the
// app sends in the `x-organizer-key` header.
//
// Vercel env vars required:
//   SUPABASE_URL              = https://mwwvcjpyrriqhugoazag.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY = (Project → Settings → API → service_role)  ← secret!
//   ORGANIZER_PASSCODE        = a passphrase you give door staff
// ---------------------------------------------------------------------------

const SB_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSCODE = process.env.ORGANIZER_PASSCODE;
const TABLE = "registrants";
const EVENT_ID = "boil85";

export default async function handler(req, res) {
  if (!req.headers["x-organizer-key"] || req.headers["x-organizer-key"] !== PASSCODE) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const base = `${SB_URL}/rest/v1/${TABLE}`;
  const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

  try {
    if (req.method === "GET") {
      const r = await fetch(`${base}?event_id=eq.${EVENT_ID}&order=created_at.desc`, { headers });
      const data = await r.json();
      return res.status(r.ok ? 200 : 500).json(data);
    }

    if (req.method === "PATCH") {
      const { id, checked_in } = req.body || {};
      if (!id) return res.status(400).json({ error: "Missing id" });
      const r = await fetch(`${base}?id=eq.${id}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({ checked_in: !!checked_in }),
      });
      return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
    }

    res.setHeader("Allow", "GET, PATCH");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("registrants error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
