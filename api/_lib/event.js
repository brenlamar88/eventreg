// api/_lib/event.js — which event is this request about?
// The client passes ?event=<slug> (or x-event-id); no value means the
// default event. Slugs are validated hard because they end up inside
// PostgREST filter strings and storage paths.

export const DEFAULT_EVENT = process.env.DEFAULT_EVENT_ID || "boil85";
const SLUG = /^[a-z0-9][a-z0-9_-]{0,40}$/;

// Vercel populates req.query from the query string for bare functions, but we
// also parse req.url as a belt-and-suspenders fallback (the same reason the
// router resolves its route from the URL) so event scoping can never silently
// fall back to the default because of a param-parsing quirk.
export function urlParam(req, key) {
  try {
    const q = (req.url || "").split("?")[1];
    if (!q) return "";
    return new URLSearchParams(q).get(key) || "";
  } catch { return ""; }
}

export function requestedEvent(req) {
  const raw = String(req.query?.event || urlParam(req, "event") || req.headers["x-event-id"] || "").trim().toLowerCase();
  if (raw && SLUG.test(raw)) return raw;
  return DEFAULT_EVENT;
}

export function isValidSlug(id) {
  return SLUG.test(String(id || ""));
}
