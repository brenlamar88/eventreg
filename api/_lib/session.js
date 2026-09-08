// api/_lib/session.js — real user sessions (Supabase Auth) for the API.
// ---------------------------------------------------------------------------
// The client signs in with Supabase Auth (magic link) and sends the access
// token as `Authorization: Bearer <token>`. Here we validate it against
// Supabase's /auth/v1/user endpoint (authoritative; no JWT-secret handling
// needed) and resolve the user's org memberships.
//
// This runs ALONGSIDE the passcode model — a request may authenticate with
// either. Nothing here changes passcode behavior.
// ---------------------------------------------------------------------------
const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || "";
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const PLATFORM_ORG = process.env.PLATFORM_ORG_SLUG || "house";

function bearer(req) {
  const h = req.headers["authorization"] || req.headers["Authorization"] || "";
  const m = /^Bearer\s+(.+)$/i.exec(String(h));
  return m ? m[1].trim() : "";
}

// Validate the access token → { id, email } or null. Cached briefly per token.
const userCache = new Map();
export async function sessionUser(req) {
  const token = bearer(req);
  if (!token) return null;
  const now = Date.now();
  const hit = userCache.get(token);
  if (hit && now - hit.at < 30_000) return hit.user;
  let user = null;
  try {
    const r = await fetch(`${SB}/auth/v1/user`, {
      headers: { apikey: ANON || KEY, Authorization: `Bearer ${token}` },
    });
    if (r.ok) {
      const u = await r.json();
      if (u && u.id) user = { id: u.id, email: u.email || null };
    }
  } catch { user = null; }
  userCache.set(token, { user, at: now });
  return user;
}

// The user's role in an org (by slug), or null. owner|admin|staff|door.
export async function roleForOrgSlug(userId, slug) {
  if (!userId || !slug) return null;
  try {
    const r = await fetch(
      `${SB}/rest/v1/memberships?user_id=eq.${userId}&select=role,organizations!inner(slug)&organizations.slug=eq.${encodeURIComponent(slug)}&limit=1`,
      { headers: H }
    );
    if (!r.ok) return null;
    return (await r.json())[0]?.role || null;
  } catch { return null; }
}

// Is this user a platform admin? (owner of the platform org, default 'house')
export async function isPlatformAdmin(userId) {
  const role = await roleForOrgSlug(userId, PLATFORM_ORG);
  return role === "owner";
}

export { PLATFORM_ORG };
