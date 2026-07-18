// api/_lib/auth.js — organizer authorization (platform / org / event tiers).
// ---------------------------------------------------------------------------
// authorizeOrganizer(req, { masterOnly }) → Promise<boolean>
//
//   Three tiers of key, checked in order:
//   1. PLATFORM MASTER — env ORGANIZER_PASSCODE. Works for every org and
//      every event, and is the only key allowed platform actions (manage
//      organizations, list all events, set defaults). masterOnly stops here.
//   2. ORG OWNER — organizations.owner_passcode. Unlocks that org's console
//      (?client=<slug>) and all of that org's events.
//   3. EVENT — event_settings.organizer_passcode. Unlocks one event's door.
//
// Fail-closed: any lookup error returns false.
// ---------------------------------------------------------------------------
import { requestedEvent } from "./event.js";
import { requestedOrgSlug } from "./org.js";

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MASTER = process.env.ORGANIZER_PASSCODE;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

// Short cache so a burst of door requests doesn't hit the DB each scan.
const cache = new Map();
const TTL_MS = 30_000;
async function cached(key, loader, now) {
  const hit = cache.get(key);
  if (hit && now - hit.at < TTL_MS) return hit.val;
  let val = null;
  try { val = await loader(); } catch { val = null; }
  cache.set(key, { val, at: now });
  return val;
}

// Event passcode + the owner passcode of the org that owns the event, in one
// embedded query through the org_id FK.
async function eventCreds(eventId, now) {
  return cached("ev:" + eventId, async () => {
    const r = await fetch(
      `${SB}/rest/v1/event_settings?event_id=eq.${encodeURIComponent(eventId)}&select=organizer_passcode,organizations(owner_passcode)&limit=1`,
      { headers: H }
    );
    if (!r.ok) return { event: null, org: null };
    const row = (await r.json())[0] || {};
    return { event: row.organizer_passcode || null, org: row.organizations?.owner_passcode || null };
  }, now) || { event: null, org: null };
}

async function orgPasscodeBySlug(slug, now) {
  return cached("org:" + slug, async () => {
    const r = await fetch(`${SB}/rest/v1/organizations?slug=eq.${encodeURIComponent(slug)}&select=owner_passcode&limit=1`, { headers: H });
    if (!r.ok) return null;
    return (await r.json())[0]?.owner_passcode || null;
  }, now);
}

// Authorize an EXPLICIT key (used where the key isn't in the header — e.g. a
// POST body) against the request's org/event context.
export async function authorizeOrganizerKey(req, key, { masterOnly = false } = {}) {
  if (!key) return false;
  if (MASTER && key === MASTER) return true;   // platform master
  if (masterOnly) return false;
  const now = Date.now();

  // Org-scoped screens: ?client=<slug>
  const slug = requestedOrgSlug(req);
  if (slug) {
    const op = await orgPasscodeBySlug(slug, now);
    if (op && key === op) return true;
  }

  // Event-scoped screens: the event's own passcode OR its org's owner passcode
  const { event, org } = await eventCreds(requestedEvent(req), now);
  if (event && key === event) return true;
  if (org && key === org) return true;
  return false;
}

// The common case: key comes in the x-organizer-key header.
export async function authorizeOrganizer(req, opts) {
  return authorizeOrganizerKey(req, req.headers["x-organizer-key"], opts);
}
