// api/registrants.js
// ---------------------------------------------------------------------------
// Organizer-only endpoint for the Boil on the Bend roster.
// GET    → list all registrants (newest first); coalesces ranch from notes
// PATCH  → toggle a check-in   (body: { id, checked_in })
// DELETE → remove a registrant (body: { id })
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

import { requestedEvent } from "./event.js";
import { authorizeOrganizer } from "./auth.js";
const SB_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSCODE = process.env.ORGANIZER_PASSCODE;
const TABLE = "registrants";

export default async function handler(req, res) {
  if (!(await authorizeOrganizer(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const base = `${SB_URL}/rest/v1/${TABLE}`;
  const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };

  try {
    if (req.method === "GET") {
      // Fetch registrants with sponsor name via PostgREST resource embedding
      const r = await fetch(`${base}?event_id=eq.${encodeURIComponent(requestedEvent(req))}&order=created_at.desc&select=*,sponsors(id,name)`, { headers });
      const data = await r.json();
      // Coalesce ranch from notes; flatten sponsor name
      const rows = Array.isArray(data) ? data.map((row) => ({
        ...row,
        ranch: row.ranch || row.notes || null,
        sponsor_name: row.sponsors?.name || null,
      })) : data;
      return res.status(r.ok ? 200 : 500).json(rows);
    }

    if (req.method === "PATCH") {
      const { id, checked_in, bidder_number, phone, sponsor_id, ...rest } = req.body || {};
      if (!id) return res.status(400).json({ error: "Missing id" });
      const patch = {};
      if ("checked_in" in (req.body || {})) patch.checked_in = !!checked_in;
      if ("bidder_number" in (req.body || {})) patch.bidder_number = bidder_number ?? null;
      if ("phone" in (req.body || {})) patch.phone = phone ?? null;
      if ("sponsor_id" in (req.body || {})) patch.sponsor_id = sponsor_id ?? null;
      // Cashier settling a pay-at-the-door registration (station flow)
      if ("status" in (req.body || {})) patch.status = req.body.status;
      if ("amount" in (req.body || {})) patch.amount = Number(req.body.amount) || 0;
      const r = await fetch(`${base}?id=eq.${id}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
      return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
    }

    if (req.method === "DELETE") {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: "Missing id" });
      const r = await fetch(`${base}?id=eq.${id}`, {
        method: "DELETE",
        headers: { ...headers, Prefer: "return=minimal" },
      });
      return res.status(r.ok ? 200 : 500).json({ ok: r.ok });
    }

    res.setHeader("Allow", "GET, PATCH, DELETE");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("registrants error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
