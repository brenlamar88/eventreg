// api/_lib/org.js — resolve the client organization for a request.
// Org-scoped screens pass ?client=<slug> (or x-org-slug). Event-scoped
// requests resolve the org transitively through the event.

import { urlParam } from "./event.js";

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const SLUG = /^[a-z0-9][a-z0-9_-]{0,40}$/;

export function requestedOrgSlug(req) {
  const raw = String(req.query?.client || urlParam(req, "client") || req.headers["x-org-slug"] || "").trim().toLowerCase();
  return raw && SLUG.test(raw) ? raw : "";
}

export function isValidOrgSlug(s) {
  return SLUG.test(String(s || ""));
}

export async function orgBySlug(slug) {
  if (!isValidOrgSlug(slug)) return null;
  try {
    const r = await fetch(`${SB}/rest/v1/organizations?slug=eq.${encodeURIComponent(slug)}&limit=1`, { headers: H });
    if (!r.ok) return null;
    return (await r.json())[0] || null;
  } catch { return null; }
}
