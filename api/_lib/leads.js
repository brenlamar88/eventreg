// api/_lib/leads.js — demo-request leads from the marketing landing page.
//   POST  (PUBLIC)            → create a lead from the "Book a demo" form
//   GET   (platform master)   → list the pipeline
//   PUT   ?id=<id> {status}   → update a lead's status (platform master)
// ---------------------------------------------------------------------------
import { authorizeOrganizer } from "./auth.js";

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const STATUSES = ["new", "contacted", "booked", "won", "lost"];
const clip = (v, n = 2000) => (v == null ? null : String(v).slice(0, n));

export default async function handler(req, res) {
  try {
    if (req.method === "POST") {
      // Public: anyone can request a demo.
      const b = req.body || {};
      const email = String(b.email || "").trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "A valid email is required" });
      const row = {
        name: clip(b.name, 200), email, org_name: clip(b.orgName, 200), phone: clip(b.phone, 60),
        event_type: clip(b.eventType, 200), message: clip(b.message, 4000),
        preferred_time: clip(b.preferredTime, 200), source: clip(b.source || "landing", 100),
      };
      const r = await fetch(`${SB}/rest/v1/leads`, { method: "POST", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify(row) });
      if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
      return res.status(200).json({ ok: true });
    }

    // Reading / updating the pipeline is platform-admin only.
    if (!(await authorizeOrganizer(req, { masterOnly: true }))) return res.status(401).json({ error: "Unauthorized" });

    if (req.method === "GET") {
      const r = await fetch(`${SB}/rest/v1/leads?order=created_at.desc&limit=500`, { headers: H });
      if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
      return res.status(200).json(await r.json());
    }

    if (req.method === "PUT") {
      const id = String(req.query?.id || "").trim();
      const status = req.body?.status;
      if (!id) return res.status(400).json({ error: "Missing id" });
      if (!STATUSES.includes(status)) return res.status(400).json({ error: "Bad status" });
      const r = await fetch(`${SB}/rest/v1/leads?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { ...H, Prefer: "return=minimal" }, body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, PUT");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    console.error("leads error:", e);
    return res.status(500).json({ error: "Server error" });
  }
}
