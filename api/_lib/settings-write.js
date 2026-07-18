// api/_lib/settings-write.js — write an event_settings row without depending
// on a unique index for PostgREST's on_conflict upsert.
//
// PATCH the row for this event; if nothing was updated (row doesn't exist
// yet), INSERT it. This works whether or not event_settings has a unique
// index on event_id, so a save can't 500 just because the index statement in
// db/phase-e.sql didn't take. A single organizer edits config at a time, so
// the check-then-insert race is a non-issue.
//
// Returns { ok, status, error } — ok:false carries the PostgREST detail so
// the caller can surface it to the (organizer-gated) client.

const SB = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };

export async function writeEventSettings(eventId, patch) {
  const body = { ...patch, updated_at: new Date().toISOString() };

  // 1. Try to update the existing row (ask for the rows back so we know if
  //    any matched).
  const upd = await fetch(`${SB}/rest/v1/event_settings?event_id=eq.${encodeURIComponent(eventId)}`, {
    method: "PATCH",
    headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!upd.ok) return { ok: false, status: upd.status, error: await upd.text().catch(() => "") };
  const updated = await upd.json().catch(() => []);
  if (Array.isArray(updated) && updated.length > 0) return { ok: true, status: 200 };

  // 2. No existing row — insert one.
  const ins = await fetch(`${SB}/rest/v1/event_settings`, {
    method: "POST",
    headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ event_id: eventId, ...body }),
  });
  if (!ins.ok) return { ok: false, status: ins.status, error: await ins.text().catch(() => "") };
  return { ok: true, status: 201 };
}
