// src/offline.js
// ---------------------------------------------------------------------------
// The offline door layer. Two IndexedDB stores make the door work with no
// connectivity:
//
//   registrants — the ticket MANIFEST: a local copy of the roster, refreshed
//                 every time it loads while online. Scans validate against it
//                 when the network is down.
//   outbox      — queued mutations made while offline: walk-in registrations
//                 ("insert"), scans ("scan"), and staff edits ("patch").
//                 Flushed in order when connectivity returns.
//
// Reconciliation is FIRST-SCAN-WINS: the server's atomic conditional update
// (checked_in=is.false) decides who really checked a ticket in; an offline
// accept that loses the race comes back as a conflict and is surfaced to
// staff, never silently dropped. Scan ops carry a client_op_id so a retried
// flush can never double-log or turn our own accepted scan into a conflict.
// ---------------------------------------------------------------------------

const DB_NAME = "eventreg-door";
const DB_VER = 1;

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("registrants")) {
        const s = db.createObjectStore("registrants", { keyPath: "id" });
        s.createIndex("ticket_token", "ticket_token", { unique: false });
      }
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "opId" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function reqp(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function store(name, mode) {
  const db = await openDb();
  return db.transaction(name, mode).objectStore(name);
}

/* ---- manifest ---- */

// Replace the server-known rows, preserving offline-created tmp- rows (their
// server copies arrive via the insert outbox, after which a fresh roster load
// supersedes them).
export async function saveManifest(rows) {
  try {
    const s = await store("registrants", "readwrite");
    const keys = await reqp(s.getAllKeys());
    for (const k of keys) if (!String(k).startsWith("tmp-")) s.delete(k);
    for (const r of rows) if (r && r.id != null) s.put(r);
    await setMeta("lastSyncAt", Date.now());
  } catch { /* IDB unavailable (private mode) — offline features degrade */ }
}

export async function manifestAll() {
  try { return await reqp((await store("registrants", "readonly")).getAll()); }
  catch { return []; }
}

export async function manifestByToken(token) {
  try {
    const s = await store("registrants", "readonly");
    return (await reqp(s.index("ticket_token").get(token))) || null;
  } catch { return null; }
}

export async function manifestPut(row) {
  try { if (row && row.id != null) (await store("registrants", "readwrite")).put(row); } catch {}
}

export async function manifestPatch(id, fields) {
  try {
    const s = await store("registrants", "readwrite");
    const row = await reqp(s.get(id));
    if (row) s.put({ ...row, ...fields });
  } catch {}
}

/* ---- outbox ---- */

export async function queueOp(op) {
  const full = { opId: crypto.randomUUID(), queuedAt: new Date().toISOString(), ...op };
  try { (await store("outbox", "readwrite")).put(full); } catch {}
  return full;
}

export async function listOps() {
  try { return await reqp((await store("outbox", "readonly")).getAll()); }
  catch { return []; }
}

export async function removeOp(opId) {
  try { (await store("outbox", "readwrite")).delete(opId); } catch {}
}

export async function pendingCount() {
  try { return await reqp((await store("outbox", "readonly")).count()); }
  catch { return 0; }
}

/* ---- meta ---- */

export async function setMeta(key, value) {
  try { (await store("meta", "readwrite")).put({ key, value }); } catch {}
}
export async function getMeta(key) {
  try { return (await reqp((await store("meta", "readonly")).get(key)))?.value ?? null; }
  catch { return null; }
}

/* ---- helpers ---- */

// fetch with a hard timeout: venue wifi often hangs rather than failing fast,
// and navigator.onLine happily lies. A timed-out request falls back to the
// offline path.
export function fetchT(url, opts = {}, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fetch(url, { ...opts, signal: ctl.signal }).finally(() => clearTimeout(t));
}

/* ---- flush ---- */

let flushing = false;

// Push everything queued. `insertFn(row)` performs the walk-in registration
// upsert (publishable key — needs no passcode, so the self-serve station can
// flush its own registrations); scans and patches need the organizer
// passcode and are skipped without one. Returns what happened so the UI can
// report it. Ops that still fail stay queued for the next flush.
export async function flushOutbox({ passcode, insertFn }) {
  if (flushing) return { flushed: 0, conflicts: [], remaining: await pendingCount() };
  flushing = true;
  try {
    const ops = await listOps();
    let flushed = 0;
    const conflicts = [];

    // 1. Registrations first — they create the rows later ops refer to.
    for (const op of ops.filter((o) => o.type === "insert")) {
      try {
        if (!insertFn) break;
        await insertFn(op.row); // upsert on ticket_token → retry-safe
        await removeOp(op.opId);
        flushed++;
      } catch { /* still offline or rejected — retry next flush */ }
    }

    // 2. Scans, in one batch. First-scan-wins on the server.
    const scans = ops.filter((o) => o.type === "scan");
    if (scans.length && passcode) {
      try {
        const r = await fetchT("/api/scan-batch", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-organizer-key": passcode },
          body: JSON.stringify({
            scans: scans.map((o) => ({ opId: o.opId, token: o.token, device: o.device, scannedAt: o.scannedAt })),
          }),
        }, 20000);
        if (r.ok) {
          const { results } = await r.json();
          for (const res of results || []) {
            const op = scans.find((o) => o.opId === res.opId);
            if (!op) continue;
            await removeOp(op.opId);
            flushed++;
            // We told the guest "accepted" offline, but another device beat
            // us to it — staff needs to know, not the void.
            if (!res.echoed && res.result === "duplicate" && op.localResult === "accepted") {
              conflicts.push({
                name: res.registrant?.name || "Unknown guest",
                at: res.registrant?.checked_in_at || null,
                token: op.token,
              });
            }
          }
        }
      } catch { /* retry next flush */ }
    }

    // 3. Staff edits (check-ins, mark-paid, bidder #s) — idempotent PATCHes.
    for (const op of ops.filter((o) => o.type === "patch")) {
      if (!passcode) continue;
      if (String(op.id).startsWith("tmp-")) { await removeOp(op.opId); continue; } // row reached the server via its insert op
      try {
        const r = await fetchT("/api/registrants", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", "x-organizer-key": passcode },
          body: JSON.stringify({ id: op.id, ...op.fields }),
        });
        if (r.ok) { await removeOp(op.opId); flushed++; }
      } catch { /* retry next flush */ }
    }

    await setMeta("lastFlushAt", Date.now());
    return { flushed, conflicts, remaining: await pendingCount() };
  } finally {
    flushing = false;
  }
}
