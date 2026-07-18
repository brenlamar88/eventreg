// api/scan-batch.js
// ---------------------------------------------------------------------------
// Reconciliation for OFFLINE scans. The door queues scans in IndexedDB while
// connectivity is down and posts them here when it returns:
//
//   POST /api/scan-batch   body: { scans: [{ opId, token, device, scannedAt }] }
//   →                            { results: [{ opId, result, registrant?, echoed? }] }
//
// Semantics — FIRST-SCAN-WINS, same atomic claim as /api/scan:
//   accepted   this op won the ticket (checked_in flips exactly once)
//   duplicate  someone else (or an earlier op) already had it — the client
//              compares against what it told the guest and surfaces a
//              conflict to staff if it had said "accepted"
//   invalid    token unknown
//
// Idempotent by client_op_id: every processed op is logged in ticket_scans
// with its opId (unique index, db/phase-c.sql), and a re-flushed op gets its
// recorded result echoed back (echoed: true) instead of being re-judged —
// so a retry can never turn our own accepted scan into a false conflict.
// ---------------------------------------------------------------------------

const SB_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSCODE = process.env.ORGANIZER_PASSCODE;
const MAX_BATCH = 500;

const HEADERS = {
  apikey: SERVICE,
  Authorization: `Bearer ${SERVICE}`,
  "Content-Type": "application/json",
};

const PUB = "id,name,party,event_id,checked_in,checked_in_at,bidder_number,status";

async function logScan(entry) {
  try {
    const r = await fetch(`${SB_URL}/rest/v1/ticket_scans`, {
      method: "POST",
      headers: { ...HEADERS, Prefer: "return=minimal" },
      body: JSON.stringify(entry),
    });
    if (!r.ok) console.error("ticket_scans log failed:", r.status, await r.text().catch(() => ""));
  } catch (err) {
    console.error("ticket_scans log failed:", err);
  }
}

export default async function handler(req, res) {
  if (!req.headers["x-organizer-key"] || req.headers["x-organizer-key"] !== PASSCODE) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }

  const scans = Array.isArray(req.body?.scans) ? req.body.scans : null;
  if (!scans) return res.status(400).json({ error: "Missing scans array" });
  if (scans.length > MAX_BATCH) return res.status(413).json({ error: `Max ${MAX_BATCH} scans per batch` });

  const results = [];
  try {
    for (const s of scans) {
      const opId = String(s?.opId || "");
      const token = String(s?.token || "").trim();
      if (!opId || !token) { results.push({ opId, result: "invalid" }); continue; }
      const tok = encodeURIComponent(token);

      // Idempotency: already processed this exact op? Echo the recorded verdict.
      const seen = await fetch(
        `${SB_URL}/rest/v1/ticket_scans?client_op_id=eq.${encodeURIComponent(opId)}&select=result&limit=1`,
        { headers: HEADERS }
      );
      if (!seen.ok) throw new Error(`PostgREST ${seen.status}: ${await seen.text()}`);
      const seenRows = await seen.json();
      if (seenRows.length) { results.push({ opId, result: seenRows[0].result, echoed: true }); continue; }

      // Atomic claim — the offline scan time becomes the check-in time.
      const scannedAt = s.scannedAt && !isNaN(Date.parse(s.scannedAt)) ? s.scannedAt : new Date().toISOString();
      const claim = await fetch(
        `${SB_URL}/rest/v1/registrants?ticket_token=eq.${tok}&checked_in=is.false&select=${PUB}`,
        {
          method: "PATCH",
          headers: { ...HEADERS, Prefer: "return=representation" },
          body: JSON.stringify({ checked_in: true, checked_in_at: scannedAt }),
        }
      );
      if (!claim.ok) throw new Error(`PostgREST ${claim.status}: ${await claim.text()}`);
      const claimed = await claim.json();

      if (claimed.length === 1) {
        await logScan({ client_op_id: opId, ticket_token: token, registrant_id: claimed[0].id, result: "accepted", scanned_by: s.device || null, scanned_at: scannedAt });
        results.push({ opId, result: "accepted", registrant: claimed[0] });
        continue;
      }

      const look = await fetch(`${SB_URL}/rest/v1/registrants?ticket_token=eq.${tok}&select=${PUB}&limit=1`, { headers: HEADERS });
      if (!look.ok) throw new Error(`PostgREST ${look.status}: ${await look.text()}`);
      const rows = await look.json();
      if (rows.length === 1) {
        await logScan({ client_op_id: opId, ticket_token: token, registrant_id: rows[0].id, result: "duplicate", scanned_by: s.device || null, scanned_at: scannedAt });
        results.push({ opId, result: "duplicate", registrant: rows[0] });
      } else {
        await logScan({ client_op_id: opId, ticket_token: token, result: "invalid", scanned_by: s.device || null, scanned_at: scannedAt });
        results.push({ opId, result: "invalid" });
      }
    }
    return res.status(200).json({ results });
  } catch (err) {
    console.error("scan-batch error:", err);
    // Partial progress is fine: processed ops are logged with their opId, so
    // the client's retry gets them echoed and only re-judges the rest.
    return res.status(500).json({ error: "Server error", results });
  }
}
