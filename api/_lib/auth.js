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
import { sessionUser, roleForOrgSlug, isPlatformAdmin } from "./session.js";

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

// The org slug that owns an event (for session/role checks).
async function eventOrgSlug(eventId, now) {
  return cached("evorg:" + eventId, async () => {
    const r = await fetch(
      `${SB}/rest/v1/event_settings?event_id=eq.${encodeURIComponent(eventId)}&select=organizations(slug)&limit=1`,
      { headers: H }
    );
    if (!r.ok) return null;
    return (await r.json())[0]?.organizations?.slug || null;
  }, now);
}

// ---------------------------------------------------------------------------
// CAPABILITY LEVELS. Each credential grants a level for the request's org/
// event context; each endpoint requires one. Higher includes lower.
//   checkin (1) — door: scan tickets, read the roster, toggle check-in.
//   manage  (2) — organizer: edit roster/sponsors/lots/settlement/branding.
//   platform(3) — you: manage organizations, billing, payouts, event creation.
export const LEVELS = { checkin: 1, manage: 2, platform: 3 };

// The level a header/body PASSCODE grants for this request's context (0 = none).
async function keyLevel(req, key) {
  if (!key) return 0;
  if (MASTER && key === MASTER) return LEVELS.platform;
  const now = Date.now();
  let lvl = 0;
  const slug = requestedOrgSlug(req);
  if (slug) {
    const op = await orgPasscodeBySlug(slug, now);
    if (op && key === op) lvl = Math.max(lvl, LEVELS.manage);   // org owner passcode
  }
  const { event, org } = await eventCreds(requestedEvent(req), now);
  if (org && key === org) lvl = Math.max(lvl, LEVELS.manage);   // event's org owner passcode
  if (event && key === event) lvl = Math.max(lvl, LEVELS.checkin); // event door passcode
  return lvl;
}

// The level a logged-in SESSION grants for this request's context.
async function sessionLevel(req) {
  const user = await sessionUser(req);
  if (!user) return 0;
  if (await isPlatformAdmin(user.id)) return LEVELS.platform;
  const now = Date.now();
  const slug = requestedOrgSlug(req) || (await eventOrgSlug(requestedEvent(req), now));
  if (!slug) return 0;
  const role = await roleForOrgSlug(user.id, slug);
  if (role === "owner" || role === "admin" || role === "staff") return LEVELS.manage;
  if (role === "door") return LEVELS.checkin;
  return 0;
}

function required(opts = {}) {
  if (opts.masterOnly) return LEVELS.platform;             // back-compat
  return LEVELS[opts.capability] || LEVELS.manage;         // default: manage
}

// Authorize an EXPLICIT key (used where the key isn't in the header — e.g. a
// POST body). Honors { capability } / { masterOnly }.
export async function authorizeOrganizerKey(req, key, opts) {
  return (await keyLevel(req, key)) >= required(opts);
}

// The common case: a request authenticates with EITHER the passcode header
// (x-organizer-key) OR a logged-in Supabase session (Authorization: Bearer),
// and must reach the endpoint's required capability level.
//   authorizeOrganizer(req)                         → needs 'manage'
//   authorizeOrganizer(req, { capability:'checkin' })→ door is enough
//   authorizeOrganizer(req, { masterOnly:true })     → platform only
export async function authorizeOrganizer(req, opts) {
  const need = required(opts);
  if ((await keyLevel(req, req.headers["x-organizer-key"])) >= need) return true;
  return (await sessionLevel(req)) >= need;
}
