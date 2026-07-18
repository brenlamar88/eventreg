// api/_lib/auth.js — organizer authorization (per-event + master).
// ---------------------------------------------------------------------------
// authorizeOrganizer(req, { masterOnly }) → Promise<boolean>
//
//   • The env ORGANIZER_PASSCODE is the MASTER key: it authorizes every
//     event and every platform action (list/create events, set default).
//   • Otherwise, if the request's event (?event=<id>) has its own
//     organizer_passcode set, the header key must equal it — access is
//     scoped to that one event.
//   • masterOnly:true skips the per-event path (for cross-event actions).
//
// Fail-closed: any lookup error returns false.
// ---------------------------------------------------------------------------
import { requestedEvent } from "./event.js";

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MASTER = process.env.ORGANIZER_PASSCODE;

// Cache each event's passcode briefly so a burst of door requests doesn't hit
// the DB every time. Short TTL so a passcode change takes effect quickly.
const cache = new Map(); // event_id -> { passcode: string|null, at: number }
const TTL_MS = 30_000;

async function eventPasscode(eventId, now) {
  const hit = cache.get(eventId);
  if (hit && now - hit.at < TTL_MS) return hit.passcode;
  let passcode = null;
  try {
    const r = await fetch(
      `${SB}/rest/v1/event_settings?event_id=eq.${encodeURIComponent(eventId)}&select=organizer_passcode&limit=1`,
      { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } }
    );
    if (r.ok) {
      const rows = await r.json();
      passcode = rows[0]?.organizer_passcode || null;
    }
  } catch { /* fail closed: no per-event passcode resolved */ }
  cache.set(eventId, { passcode, at: now });
  return passcode;
}

// Authorize an EXPLICIT key against the request's event (used where the key
// arrives somewhere other than the x-organizer-key header, e.g. a POST body).
export async function authorizeOrganizerKey(req, key, { masterOnly = false } = {}) {
  if (!key) return false;
  if (MASTER && key === MASTER) return true;   // master unlocks everything
  if (masterOnly) return false;                // cross-event action, master only
  const pc = await eventPasscode(requestedEvent(req), Date.now());
  return !!pc && key === pc;
}

// The common case: key comes in the x-organizer-key header.
export async function authorizeOrganizer(req, opts) {
  return authorizeOrganizerKey(req, req.headers["x-organizer-key"], opts);
}
