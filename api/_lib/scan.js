// api/scan.js
// ---------------------------------------------------------------------------
// Door scan check-in. Organizer-gated (same x-organizer-key as the roster).
//
//   POST /api/scan   body: { token, device? }
//
// The check-in itself is a single conditional PATCH —
//   registrants?ticket_token=eq.<token>&checked_in=is.false
// — so two devices scanning the same ticket at the same moment can't both
// win: PostgREST runs it as one UPDATE, exactly one request flips the row.
//
// Responses (200 with a result field, so the scanner UI can flash the state):
//   { result: "accepted",  registrant: {...} }   ticket valid, now checked in
//   { result: "duplicate", registrant: {...} }   already checked in (shows when/who)
//   { result: "invalid" }                        token unknown
//
// Every attempt is appended to ticket_scans for audit (and Phase B offline
// reconciliation). Scan logging is best-effort — a log failure never blocks
// the door.
// ---------------------------------------------------------------------------

import { authorizeOrganizer } from "./auth.js";
const SB_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSCODE = process.env.ORGANIZER_PASSCODE;

const HEADERS = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  "Content-Type": "application/json",
};

const PUB = "id,name,party,event_id,checked_in,checked_in_at,bidder_number,status";

async function logScan(entry) {
  try {
    await fetch(`${SB_URL}/rest/v1/ticket_scans`, {
      method: "POST",
      headers: { ...HEADERS, Prefer: "return=minimal" },
      body: JSON.stringify(entry),
    });
  } catch (err) {
    console.error("ticket_scans log failed:", err);
  }
}

export default async function handler(req, res) {
  if (!(await authorizeOrganizer(req))) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }

  const { token, device } = req.body || {};
  if (!token || typeof token !== "string") return res.status(400).json({ error: "Missing token" });
  const tok = encodeURIComponent(token.trim());

  try {
    // Atomic claim: only flips a row that is NOT yet checked in.
    const claim = await fetch(
      `${SB_URL}/rest/v1/registrants?ticket_token=eq.${tok}&checked_in=is.false&select=${PUB}`,
      {
        method: "PATCH",
        headers: { ...HEADERS, Prefer: "return=representation" },
        body: JSON.stringify({ checked_in: true, checked_in_at: new Date().toISOString() }),
      }
    );
    if (!claim.ok) throw new Error(`PostgREST ${claim.status}: ${await claim.text()}`);
    const claimed = await claim.json();

    if (claimed.length === 1) {
      await logScan({ ticket_token: token, registrant_id: claimed[0].id, result: "accepted", scanned_by: device || null });
      return res.status(200).json({ result: "accepted", registrant: claimed[0] });
    }

    // Nothing claimed: already checked in, or the token doesn't exist.
    const look = await fetch(`${SB_URL}/rest/v1/registrants?ticket_token=eq.${tok}&select=${PUB}&limit=1`, { headers: HEADERS });
    if (!look.ok) throw new Error(`PostgREST ${look.status}: ${await look.text()}`);
    const rows = await look.json();

    if (rows.length === 1) {
      await logScan({ ticket_token: token, registrant_id: rows[0].id, result: "duplicate", scanned_by: device || null });
      return res.status(200).json({ result: "duplicate", registrant: rows[0] });
    }

    await logScan({ ticket_token: token, result: "invalid", scanned_by: device || null });
    return res.status(200).json({ result: "invalid" });
  } catch (err) {
    console.error("scan error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
