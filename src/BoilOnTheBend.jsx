import React, { useState, useMemo, useEffect } from "react";
import {
  Calendar, MapPin, Check, ChevronRight, ChevronLeft, Users, Plus, Minus,
  ShieldCheck, Lock, Trash2, UserPlus, Search, CheckCircle2, Circle,
  Upload, Heart, LayoutGrid, Ticket, Database, RefreshCw, AlertTriangle,
  ScanLine, CreditCard, FileText,
} from "lucide-react";
import OrganizerNav from "./OrganizerNav.jsx";
import TicketQR from "./TicketQR.jsx";
import { DEMO_REGISTRANTS, DEMO_SPONSORS } from "./demoData.js";
import {
  saveManifest, manifestAll, manifestByToken, manifestPatch, manifestPut,
  queueOp, pendingCount, getMeta, fetchT, flushOutbox,
} from "./offline.js";
import { getEventConfig } from "./eventConfig.js";

const URL_PARAMS = new URLSearchParams(window.location.search);
const IS_DEMO = URL_PARAMS.get("demo") === "true";
// Locked iPad station modes: "/?station=scan" (ticket scanning) and
// "/?station=register" (self-serve walk-in registration).
const STATION = URL_PARAMS.get("station");

/* ============================================================================
   1. EVENT CONFIG — white-label. Everything here is edited on the Event Setup
   screen (/?app=setup) and served by /api/event-config; the defaults are the
   original Boil on the Bend values. main.jsx resolves the config BEFORE this
   module is imported, so module-level reads are safe.
   ========================================================================== */
const CFG = getEventConfig();
const EVENT = {
  name: CFG.eventName,
  org: CFG.orgName,
  orgShort: CFG.orgShort,
  tagline: CFG.tagline,
  dateLabel: CFG.dateLabel,
  venue: CFG.venue,
  city: CFG.city,
  logoUrl: CFG.logoUrl,
};
const TICKET = { id: CFG.eventId, name: CFG.ticketName, price: CFG.ticketPrice };
const SUGGESTED_DONATIONS = CFG.donationPresets;

/* ============================================================================
   2. SUPABASE  (project: yellow-kite)
   ----------------------------------------------------------------------------
   The publishable key below is safe to ship in the browser: row-level security
   only allows INSERTing a registration — it can't read the attendee list.
   Reading the roster + check-ins go through /api/registrants (service role +
   organizer passcode). NOTE: inside the Claude preview, the browser sandbox
   blocks calls to supabase.co, so the app falls back to in-memory data. Once
   deployed to Vercel it talks to yellow-kite for real.
   ========================================================================== */
const SUPABASE = {
  url: "https://mwwvcjpyrriqhugoazag.supabase.co",
  publishableKey: "sb_publishable_FYlNxo_PzEW-qUQUZCSjGQ_CFgIBEr9",
  table: "registrants",
};
const ROSTER_ENDPOINT = "/api/registrants"; // server route (see api/registrants.js)

async function dbInsert(row) {
  const r = await fetch(`${SUPABASE.url}/rest/v1/${SUPABASE.table}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE.publishableKey,
      Authorization: `Bearer ${SUPABASE.publishableKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ event_id: TICKET.id, ...row }),
  });
  if (!r.ok) throw new Error(`Supabase insert failed (${r.status})`);
}

// Upsert flavor used by the offline outbox: keyed on the unique ticket_token,
// so replaying a queued registration a second time is a no-op, never a dupe.
// Takes the FULL row (event_id included) exactly as stored in the outbox.
async function dbInsertUpsertRaw(fullRow) {
  const r = await fetchT(`${SUPABASE.url}/rest/v1/${SUPABASE.table}?on_conflict=ticket_token`, {
    method: "POST",
    headers: {
      apikey: SUPABASE.publishableKey,
      Authorization: `Bearer ${SUPABASE.publishableKey}`,
      "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=minimal",
    },
    body: JSON.stringify(fullRow),
  });
  if (!r.ok) throw new Error(`Supabase upsert failed (${r.status})`);
}

// Write a registration now if we can, queue it if we can't. Every row that
// takes this path MUST carry a ticket_token (it's the idempotency key).
// Returns "online" or "queued" so the UI can say which happened.
async function persistRegistrant(row) {
  const fullRow = { event_id: TICKET.id, ...row };
  try {
    await dbInsertUpsertRaw(fullRow);
    return "online";
  } catch {
    await queueOp({ type: "insert", row: fullRow });
    return "queued";
  }
}
const dbRowToUI = (r) => ({
  id: r.id, name: r.name, email: r.email, phone: r.phone, party: r.party,
  source: r.source, status: r.status, amount: Number(r.amount) || 0,
  checkedIn: r.checked_in, date: (r.created_at || "").slice(0, 10),
  notes: r.notes || null, ranch: r.ranch || null, bidderNumber: r.bidder_number || "",
  sponsorId: r.sponsor_id || null, sponsorName: r.sponsor_name || null,
});

/* ============================================================================
   3. STRIPE  (placeholder — drop your keys in)
   ========================================================================== */
const STRIPE_CONFIG = {
  publishableKey: "pk_test_REPLACE_WITH_YOUR_PUBLISHABLE_KEY",
  checkoutEndpoint: "/api/create-checkout-session",
  liveMode: false, // false = simulated payment (writes straight to Supabase); true = Stripe Checkout
};
async function startStripeCheckout({ lineItems, email, total, party, name, phone }) {
  const res = await fetch(STRIPE_CONFIG.checkoutEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, total, lineItems, party, name, phone, eventId: TICKET.id }),
  });
  if (!res.ok) throw new Error("Checkout session could not be created.");
  const { url } = await res.json();
  window.location.href = url;
}

async function startStripeWalkIn({ name, phone, party, total, lineItems }) {
  const res = await fetch(STRIPE_CONFIG.checkoutEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name, phone, party, total, lineItems,
      eventId: TICKET.id, source: "Walk-in", walkin: true,
    }),
  });
  if (!res.ok) throw new Error("Checkout session could not be created.");
  const { url } = await res.json();
  window.location.href = url;
}

/* sample roster shown until the live DB loads (or in the preview) */
const SAMPLE_ROSTER = [
  { id: "sample-1", name: "Sample — load from DB", email: "guest1@example.com", phone: "(337) 555-0101", party: 2, source: "Jotform", status: "Paid", amount: 170, checkedIn: false, date: "2026-05-01" },
];

const money = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function csvEsc(v) { const s = v == null ? "" : String(v); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; }
function downloadCsv(filename, rows) { const csv = rows.map((r) => r.map(csvEsc).join(",")).join("\r\n"); const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url); }
const blankAtt = () => ({ firstName: "", lastName: "", email: "", phone: "", ranch: "", notes: "" });
const splitName = (name) => { const parts = (name || "").trim().split(/\s+/); return { first: parts[0] || "", last: parts.slice(1).join(" ") || "" }; };

/* ---- Jotform CSV/JSON parsing ---- */
function splitCSVLine(line) {
  const out = []; let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === "," && !q) { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur); return out;
}
function rowsFromText(text) {
  const t = text.trim(); if (!t) return [];
  if (t[0] === "[" || t[0] === "{") { try { const j = JSON.parse(t); return Array.isArray(j) ? j : [j]; } catch { return []; } }
  const lines = t.split(/\r?\n/);
  const headers = splitCSVLine(lines[0]).map((h) => h.trim().toLowerCase());
  return lines.slice(1).filter(Boolean).map((ln) => { const cells = splitCSVLine(ln); const o = {}; headers.forEach((h, i) => (o[h] = (cells[i] || "").trim())); return o; });
}
function mapJotformRow(row) {
  const keys = Object.keys(row);
  const grab = (...needles) => { for (const n of needles) { const k = keys.find((h) => h.toLowerCase().includes(n)); if (k && row[k]) return String(row[k]).trim(); } return ""; };
  // Look for a standalone "name" or "full name" column, but never match "first name" / "last name"
  const nameKey = keys.find((h) => { const l = h.toLowerCase(); return l === "name" || l === "full name" || (l.includes("name") && !l.includes("first") && !l.includes("last")); });
  const first = grab("first"); const last = grab("last");
  let name = (first || last) ? `${first} ${last}`.trim() : (nameKey && row[nameKey] ? String(row[nameKey]).trim() : "");
  if (!name || name.toLowerCase() === "name") name = "";
  const partyRaw = grab("quantity", "tickets", "guests", "party", "# of");
  return {
    name: name || "Unnamed registrant", email: grab("email", "e-mail"),
    phone: grab("phone", "mobile", "cell", "number"),
    party: Math.max(1, parseInt(partyRaw, 10) || 1), source: "Jotform",
    status: grab("paid", "payment").toLowerCase().includes("paid") ? "Paid" : "Pending",
    amount: 0, checkedIn: false, date: grab("submission date", "date") || "",
    notes: grab("notes", "note", "ranch", "affiliation", "organization", "company", "group") || null,
  };
}

/* ============================================================================
   STYLES
   ========================================================================== */
const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
    :root{--bone:#F4EFE6;--bone2:#EBE3D4;--paper:#FBF8F2;--ink:#1B1915;--inkSoft:#5C564C;
      --pine:#123C2E;--pine2:#0C2A20;--pineLine:#23604A;--gold:#B9842B;--goldSoft:#E2C282;
      --line:#DCD2C0;--ok:#2E7D5B;--warn:#A9601C;}
    *{box-sizing:border-box}
    .mrd{font-family:'Hanken Grotesk',ui-sans-serif,system-ui;color:var(--ink);background:var(--bone);min-height:100vh;-webkit-font-smoothing:antialiased;}
    .mrd-serif{font-family:'Fraunces',Georgia,serif;}
    .grain{position:absolute;inset:0;opacity:.5;pointer-events:none;mix-blend-mode:overlay;
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E");}
    .wrap{max-width:1080px;margin:0 auto;padding:0 22px;}
    .grid{display:grid;grid-template-columns:1fr 350px;gap:32px;align-items:start;}
    @media(max-width:900px){.grid{grid-template-columns:1fr;}}
    .util{background:var(--pine2);color:#cfe0d7;}
    .util-in{display:flex;align-items:center;justify-content:space-between;padding:10px 0;gap:10px;flex-wrap:wrap;}
    .brandtag{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--goldSoft);font-weight:600;}
    .vtoggle{display:flex;gap:4px;background:#0a2118;border-radius:999px;padding:4px;}
    .vtoggle button{font-family:inherit;border:none;background:transparent;color:#9DB3A8;font-weight:600;font-size:13px;padding:7px 15px;border-radius:999px;cursor:pointer;display:flex;align-items:center;gap:7px;}
    .vtoggle button.on{background:var(--gold);color:#1b1407;}
    .hero{position:relative;overflow:hidden;color:var(--bone);background:radial-gradient(120% 90% at 12% 0%,var(--pineLine) 0%,transparent 55%),radial-gradient(120% 120% at 100% 0%,var(--pine2) 0%,transparent 60%),linear-gradient(160deg,var(--pine),var(--pine2));}
    .hero-in{position:relative;z-index:2;padding:64px 0 58px;}
    .eyebrow{font-size:12px;letter-spacing:.26em;text-transform:uppercase;color:var(--goldSoft);font-weight:600;}
    .hero h1{font-size:clamp(40px,7vw,78px);line-height:.96;margin:14px 0 0;font-weight:600;letter-spacing:-.02em;}
    .hero-sub{max-width:520px;margin:18px 0 0;color:#D9E5DE;font-size:17.5px;line-height:1.5;}
    .meta{display:flex;flex-wrap:wrap;gap:24px;margin-top:30px;}
    .meta div{display:flex;align-items:center;gap:9px;font-size:14.5px;color:#E7EFE9;}
    .meta svg{color:var(--goldSoft);}
    .cta{margin-top:36px;display:inline-flex;align-items:center;gap:10px;background:var(--gold);color:#1b1407;border:none;font-family:inherit;font-weight:700;font-size:16px;padding:16px 28px;border-radius:999px;cursor:pointer;transition:.2s;}
    .cta:hover{background:#cf982f;transform:translateY(-1px);}
    .price-from{margin-top:16px;font-size:13.5px;color:#BFCFC6;}
    .stepbar{background:var(--pine2);border-bottom:1px solid var(--pineLine);}
    .steps{display:flex;gap:6px;padding:13px 0;flex-wrap:wrap;}
    .stp{display:flex;align-items:center;gap:9px;padding:7px 13px;border-radius:999px;font-size:13px;font-weight:600;color:#9DB3A8;}
    .stp .num{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;border:1.5px solid #3c6d59;color:#9DB3A8;}
    .stp.active{color:#F4EFE6;background:#1a4d3a;}
    .stp.active .num{background:var(--gold);border-color:var(--gold);color:#1b1407;}
    .stp.done .num{background:transparent;border-color:var(--gold);color:var(--gold);}
    .panel{padding:40px 0 90px;}
    .section-h{font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold);font-weight:700;}
    .section-t{font-family:'Fraunces',serif;font-size:30px;font-weight:600;letter-spacing:-.01em;margin:6px 0 4px;}
    .section-d{color:var(--inkSoft);margin:0 0 24px;font-size:15px;}
    .anim{animation:rise .42s cubic-bezier(.2,.7,.2,1) both;}
    @keyframes rise{from{opacity:0;transform:translateY(13px)}to{opacity:1;transform:none}}
    .card{background:var(--paper);border:1.5px solid var(--line);border-radius:16px;padding:22px;}
    .field{display:flex;flex-direction:column;gap:6px;}
    .field label{font-size:12.5px;font-weight:600;color:#4a463d;}
    .field label .req{color:#b4471f;}
    .inp{font-family:inherit;font-size:14.5px;padding:12px 13px;border:1.5px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);outline:none;transition:.15s;width:100%;}
    .inp:focus{border-color:var(--pine);box-shadow:0 0 0 3px rgba(18,60,46,.1);}
    .inp.err{border-color:#cf6b45;background:#fdf4f0;}
    .errtxt{font-size:11.5px;color:#b4471f;}
    .frow{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
    @media(max-width:520px){.frow{grid-template-columns:1fr;}}
    .pkg{display:flex;align-items:center;gap:20px;background:var(--paper);border:1.5px solid var(--line);border-radius:18px;padding:24px;flex-wrap:wrap;}
    .pkg .ic{width:58px;height:58px;border-radius:14px;background:var(--pine);color:var(--goldSoft);display:grid;place-items:center;flex-shrink:0;}
    .pkg .pname{font-family:'Fraunces',serif;font-size:21px;font-weight:600;}
    .pkg .pprice{font-family:'Fraunces',serif;font-size:30px;font-weight:600;margin-left:auto;}
    .pkg .pprice span{font-family:'Hanken Grotesk';font-size:13px;color:var(--inkSoft);font-weight:500;}
    .qtybar{display:flex;align-items:center;justify-content:space-between;margin-top:16px;background:var(--paper);border:1.5px solid var(--line);border-radius:14px;padding:16px 20px;}
    .qty{display:flex;align-items:center;border:1.5px solid var(--line);border-radius:11px;overflow:hidden;background:#fff;}
    .qty button{width:42px;height:42px;border:none;background:#fff;font-family:inherit;font-size:18px;cursor:pointer;color:var(--pine);}
    .qty button:hover{background:var(--bone2);}
    .qty button:disabled{opacity:.35;cursor:not-allowed;}
    .qty span{width:46px;text-align:center;font-weight:700;font-size:16px;font-family:'Fraunces',serif;}
    .dona{margin-top:16px;background:var(--paper);border:1.5px solid var(--line);border-radius:16px;padding:20px;}
    .dona-h{display:flex;align-items:center;gap:9px;font-weight:700;font-size:15px;}
    .dchips{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;}
    .dchip{font-family:inherit;border:1.5px solid var(--line);background:#fff;color:var(--ink);font-weight:600;padding:9px 16px;border-radius:999px;cursor:pointer;font-size:14px;}
    .dchip.on{background:var(--pine);color:#fff;border-color:var(--pine);}
    .attblock{border:1.5px solid var(--line);border-radius:16px;background:var(--paper);overflow:hidden;margin-bottom:14px;}
    .atth{display:flex;align-items:center;justify-content:space-between;padding:13px 18px;background:var(--bone2);border-bottom:1.5px solid var(--line);}
    .atth .who{font-weight:700;font-size:14px;display:flex;align-items:center;gap:9px;}
    .pill{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;padding:3px 9px;border-radius:999px;background:var(--pine);color:var(--goldSoft);}
    .linkbtn{background:none;border:none;font-family:inherit;color:#a23b1c;font-weight:600;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;}
    .sum{position:sticky;top:18px;background:var(--pine);color:#EAF1EC;border-radius:20px;overflow:hidden;}
    .sum-h{padding:20px 22px 16px;border-bottom:1px solid var(--pineLine);}
    .sum-h .evt{font-family:'Fraunces',serif;font-size:19px;font-weight:600;color:#fff;}
    .sum-h .dt{font-size:12.5px;color:#A9C0B5;margin-top:3px;}
    .sum-b{padding:18px 22px;}
    .li{display:flex;justify-content:space-between;gap:12px;font-size:13.5px;padding:7px 0;color:#D4E0D9;}
    .li .sub{font-size:11.5px;color:#9DB3A8;}
    .li .amt{font-variant-numeric:tabular-nums;white-space:nowrap;}
    .sum-div{height:1px;background:var(--pineLine);margin:8px 0;}
    .total{display:flex;justify-content:space-between;align-items:baseline;padding-top:8px;}
    .total .lbl{font-size:13px;color:#A9C0B5;text-transform:uppercase;letter-spacing:.1em;}
    .total .val{font-family:'Fraunces',serif;font-size:32px;font-weight:600;color:#fff;}
    .nav{display:flex;justify-content:space-between;gap:14px;margin-top:28px;}
    .btn{font-family:inherit;font-weight:700;font-size:15px;border-radius:12px;cursor:pointer;padding:14px 26px;display:inline-flex;align-items:center;gap:9px;transition:.18s;border:1.5px solid transparent;}
    .btn-p{background:var(--pine);color:#fff;}
    .btn-p:hover{background:var(--pine2);}
    .btn-p:disabled{opacity:.45;cursor:not-allowed;}
    .btn-g{background:transparent;color:var(--pine);border-color:var(--line);}
    .btn-g:hover{border-color:var(--pine);}
    .secure{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--inkSoft);margin-top:14px;}
    .secure svg{color:var(--ok);}
    .stripe-note{font-size:12px;background:#f3ede0;border:1px dashed var(--line);border-radius:10px;padding:11px 13px;color:var(--inkSoft);margin-top:14px;}
    .conf{text-align:center;padding:56px 0 90px;max-width:560px;margin:0 auto;}
    .conf .badge{width:76px;height:76px;border-radius:50%;background:var(--ok);display:grid;place-items:center;margin:0 auto 22px;color:#fff;animation:pop .5s cubic-bezier(.2,1.3,.4,1) both;}
    @keyframes pop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
    .conf h2{font-family:'Fraunces',serif;font-size:34px;font-weight:600;margin:0;}
    .conf p{color:var(--inkSoft);font-size:15.5px;margin:10px 0 0;}
    .ticket{margin:32px auto 0;background:var(--paper);border:1.5px solid var(--line);border-radius:18px;display:flex;overflow:hidden;text-align:left;}
    @media(max-width:560px){.ticket{flex-direction:column;}}
    .ticket .stub{background:var(--pine);color:#EAF1EC;padding:24px;display:flex;flex-direction:column;align-items:center;gap:12px;}
    .ticket .body{padding:24px 26px;flex:1;}
    .ticket .body .row{display:flex;justify-content:space-between;padding:7px 0;font-size:13.5px;border-bottom:1px dashed var(--line);}
    .ticket .body .row:last-child{border:none;}
    .ticket .body .k{color:var(--inkSoft);}
    .ticket .body .v{font-weight:700;}
    .conf-code{font-family:'Fraunces',serif;letter-spacing:.06em;font-size:15px;color:var(--goldSoft);}
    .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px;}
    @media(max-width:680px){.stats{grid-template-columns:repeat(2,1fr);}}
    .stat{background:var(--paper);border:1.5px solid var(--line);border-radius:14px;padding:16px 18px;}
    .stat .n{font-family:'Fraunces',serif;font-size:28px;font-weight:600;}
    .stat .l{font-size:12px;color:var(--inkSoft);text-transform:uppercase;letter-spacing:.08em;font-weight:600;margin-top:2px;}
    .dbbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--paper);border:1.5px solid var(--line);border-radius:14px;padding:13px 16px;margin-bottom:18px;}
    .dbbar .pwd{flex:1;min-width:160px;}
    .dot{width:9px;height:9px;border-radius:50%;display:inline-block;}
    .rtools{display:flex;gap:12px;align-items:center;margin-bottom:14px;flex-wrap:wrap;}
    .searchbox{flex:1;min-width:200px;display:flex;align-items:center;gap:9px;background:#fff;border:1.5px solid var(--line);border-radius:11px;padding:10px 13px;}
    .searchbox input{border:none;outline:none;font-family:inherit;font-size:14px;flex:1;background:transparent;color:var(--ink);}
    .tbl{width:100%;border-collapse:collapse;background:var(--paper);border:1.5px solid var(--line);border-radius:14px;overflow:hidden;}
    .tbl th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--inkSoft);font-weight:700;padding:13px 14px;background:var(--bone2);border-bottom:1.5px solid var(--line);}
    .tbl td{padding:13px 14px;font-size:13.5px;border-bottom:1px solid var(--line);vertical-align:middle;}
    .tbl tr:last-child td{border-bottom:none;}
    .badge-s{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em;}
    .b-jot{background:#e7eef0;color:#2a5560;}
    .b-onl{background:#eef1e7;color:#4a6321;}
    .b-comp{background:#f1e9da;color:#7a5a17;}
    .b-paid{background:#e4f0e9;color:var(--ok);}
    .b-pend{background:#f6ece0;color:var(--warn);}
    .ci{background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:7px;font-family:inherit;font-weight:600;font-size:13px;color:var(--inkSoft);}
    .ci.on{color:var(--ok);}
    .importbox{background:var(--paper);border:1.5px solid var(--line);border-radius:16px;padding:20px;margin-bottom:22px;}
    .importbox textarea{width:100%;min-height:96px;font-family:ui-monospace,monospace;font-size:12.5px;border:1.5px solid var(--line);border-radius:10px;padding:12px;outline:none;resize:vertical;background:#fff;}
    .importbox textarea:focus{border-color:var(--pine);}
    .door-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:24px;}
    @media(max-width:500px){.door-stats{grid-template-columns:1fr 1fr;}}
    .door-result{display:flex;align-items:center;gap:16px;padding:16px 18px;border-bottom:1px solid var(--line);flex-wrap:wrap;}
    .door-result:last-child{border-bottom:none;}
    .door-ci-btn{font-family:inherit;font-weight:700;font-size:15px;padding:13px 22px;border-radius:12px;cursor:pointer;border:none;display:flex;align-items:center;gap:8px;transition:.2s;background:var(--pine);color:#fff;white-space:nowrap;}
    .door-ci-btn:hover{background:var(--pine2);}
    .door-ci-btn.done{background:var(--ok);cursor:default;}
    .door-flash{background:#e4f0e9;color:var(--ok);border:1.5px solid #b8dcc6;border-radius:12px;padding:14px 18px;font-weight:600;font-size:14px;display:flex;align-items:center;gap:9px;margin-bottom:18px;animation:rise .3s ease;}
    .pay-toggle{display:flex;border:1.5px solid var(--line);border-radius:11px;overflow:hidden;}
    .pay-toggle button{flex:1;font-family:inherit;font-weight:600;font-size:14px;padding:11px 18px;border:none;background:#fff;cursor:pointer;transition:.15s;color:var(--inkSoft);}
    .pay-toggle button.on{background:var(--pine);color:#fff;}
    .walkin-row{display:flex;align-items:center;gap:14px;padding:13px 0;border-bottom:1px solid var(--line);font-size:13.5px;flex-wrap:wrap;}
    .walkin-row:last-child{border-bottom:none;}
    .door-section-h{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--pine);font-weight:700;margin-bottom:10px;display:flex;align-items:center;gap:8px;}
  `}</style>
);

/* Mint a ticket token in the browser (simulated + cash walk-in paths — the
   Stripe path's token is minted server-side by the webhook). Same shape as the
   server's: 128 random bits, base64url. */
function mintTicketToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = "";
  bytes.forEach((b) => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* Camera scanner shared by the Door modal and the standalone Scan Station.
   Decodes ticket QR codes with the device camera (@zxing/browser over
   getUserMedia — works in Safari on iPad) and redeems each token against
   /api/scan, which checks in atomically and classifies accepted / duplicate /
   invalid. Manual entry is the fallback for damaged codes or no camera. */
function useTicketScanner(passcode, device, onAccepted) {
  const videoRef = React.useRef(null);
  const busyRef = React.useRef(false);
  const lastRef = React.useRef({ token: "", at: 0 });
  const [status, setStatus] = useState(null);
  const [cameraError, setCameraError] = useState("");

  const redeem = async (token) => {
    token = (token || "").trim();
    if (!token) return;
    // Debounce: the camera decodes the same code many times per second, and a
    // request in flight must finish before the next fires.
    const now = Date.now();
    if (busyRef.current) return;
    if (lastRef.current.token === token && now - lastRef.current.at < 4000) return;
    busyRef.current = true;
    lastRef.current = { token, at: now };
    try {
      const r = await fetchT("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-organizer-key": passcode },
        body: JSON.stringify({ token, device }),
      }, 6000);
      const data = await r.json();
      if (!r.ok) throw Object.assign(new Error(data.error || `Scan failed (${r.status})`), { http: true });
      setStatus(data);
      if (data.registrant?.id) {
        // keep the offline manifest in step with what the server just decided
        manifestPatch(data.registrant.id, { checked_in: true, checked_in_at: data.registrant.checked_in_at || null });
      }
      if (data.result === "accepted") onAccepted?.(data.registrant);
    } catch (err) {
      if (err.http) {
        // The server answered — that's a real verdict (e.g. wrong passcode),
        // not a connectivity problem. Don't fall back.
        setStatus({ result: "error", message: err.message });
      } else {
        // Network down or hanging: judge against the offline manifest and
        // queue the scan for first-scan-wins reconciliation.
        const res = await offlineScan(token, device);
        setStatus(res);
        if (res.result === "accepted") onAccepted?.(res.registrant);
      }
    } finally {
      busyRef.current = false;
    }
  };

  useEffect(() => {
    let controls = null;
    let cancelled = false;
    import("@zxing/browser")
      .then(({ BrowserQRCodeReader }) => {
        if (cancelled) return;
        const reader = new BrowserQRCodeReader();
        return reader
          .decodeFromVideoDevice(undefined, videoRef.current, (result) => {
            if (result) redeem(result.getText());
          })
          .then((c) => { controls = c; if (cancelled) c.stop(); });
      })
      .catch((err) => setCameraError(err?.message || "Camera unavailable — use manual entry below."));
    return () => { cancelled = true; if (controls) controls.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { videoRef, status, cameraError, redeem };
}

// Offline verdict for a scanned token: check the local manifest, queue the
// scan for reconciliation. "unknown" = not in the offline roster (could be a
// ticket sold after the last sync) — staff verifies manually; the queued op
// still gets a real verdict from the server later.
async function offlineScan(token, device) {
  const scannedAt = new Date().toISOString();
  const row = await manifestByToken(token);
  const localResult = !row ? "unknown" : row.checked_in ? "duplicate" : "accepted";
  await queueOp({ type: "scan", token, device, scannedAt, localResult });
  if (localResult === "accepted") {
    await manifestPatch(row.id, { checked_in: true, checked_in_at: scannedAt });
    return { result: "accepted", offline: true, registrant: { ...row, checked_in: true, checked_in_at: scannedAt } };
  }
  if (localResult === "duplicate") return { result: "duplicate", offline: true, registrant: row };
  return { result: "unknown", offline: true, syncedAt: await getMeta("lastSyncAt") };
}

function ScanBanner({ status, big }) {
  if (!status) return null;
  const tone = status.result === "accepted" ? { bg: "#e4f0e9", fg: "var(--ok)", bd: "#b8dcc6" }
    : status.result === "duplicate" || status.result === "unknown" ? { bg: "#f6ece0", fg: "var(--warn)", bd: "#e6cfa8" }
    : { bg: "#fdf0ec", fg: "#b4471f", bd: "#efc4b3" };
  const unpaid = status.registrant && status.registrant.status && status.registrant.status !== "Paid";
  const Icon = status.result === "accepted" ? CheckCircle2 : AlertTriangle;
  const sz = big ? 22 : 16;
  return (
    <div style={{ marginTop: 12, background: tone.bg, color: tone.fg, border: `1.5px solid ${tone.bd}`, borderRadius: 12, padding: big ? "18px 20px" : "12px 14px", fontWeight: 600, fontSize: big ? 19 : 14 }}>
      <Icon size={sz} style={{ display: "inline", verticalAlign: "middle", marginRight: 8 }} />
      {status.result === "accepted" && <>{status.registrant?.name || "Guest"} — party of {status.registrant?.party || 1} checked in!</>}
      {status.result === "duplicate" && <>Already checked in: {status.registrant?.name || "Guest"}{status.registrant?.checked_in_at ? ` at ${new Date(status.registrant.checked_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</>}
      {status.result === "unknown" && <>Not in the offline roster{status.syncedAt ? ` (last synced ${new Date(status.syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })})` : ""} — verify manually. It will reconcile when back online.</>}
      {status.result === "invalid" && <>Ticket not recognized.</>}
      {status.result === "error" && <>{status.message}</>}
      {unpaid && (status.result === "accepted" || status.result === "duplicate") && (
        <div style={{ marginTop: 6, fontSize: big ? 15 : 12.5, color: "var(--warn)" }}>Payment due — status is {status.registrant.status}. Send them to the cashier.</div>
      )}
      {status.offline && status.result !== "unknown" && (
        <div style={{ marginTop: 6, fontSize: big ? 14 : 12, opacity: 0.85 }}>Offline — recorded locally, will sync.</div>
      )}
    </div>
  );
}

function ScanModal({ passcode, onClose, onCheckedIn }) {
  const { videoRef, status, cameraError, redeem } = useTicketScanner(passcode, "door", onCheckedIn);
  const [manual, setManual] = useState("");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(12,42,32,.66)", zIndex: 60, display: "grid", placeItems: "center", padding: 18 }} onClick={onClose}>
      <div style={{ background: "var(--paper)", borderRadius: 18, border: "1.5px solid var(--line)", width: "min(440px,100%)", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "var(--pine)", color: "#EAF1EC" }}>
          <span style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}><ScanLine size={17} /> Scan tickets</span>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#EAF1EC", fontFamily: "inherit", fontWeight: 700, fontSize: 14, cursor: "pointer" }}>Done</button>
        </div>
        <div style={{ padding: 16 }}>
          {cameraError ? (
            <div style={{ fontSize: 13.5, color: "var(--warn)", background: "#f6ece0", border: "1.5px solid #e6cfa8", borderRadius: 12, padding: "12px 14px" }}>
              <AlertTriangle size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />{cameraError}
            </div>
          ) : (
            <video ref={videoRef} style={{ width: "100%", borderRadius: 12, background: "#0C2A20", aspectRatio: "4/3", objectFit: "cover" }} muted playsInline />
          )}
          <ScanBanner status={status} />
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <input
              className="inp" style={{ flex: 1 }} placeholder="Or type the ticket code…"
              value={manual} onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && manual.trim()) { redeem(manual); setManual(""); } }}
            />
            <button className="btn btn-p" style={{ padding: "11px 16px" }} onClick={() => { if (manual.trim()) { redeem(manual); setManual(""); } }}>Check in</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================================
   STATION MODES — locked, single-purpose screens for door iPads.
   Launch them from the Door view; pin the iPad to the tab with iOS Guided
   Access so guests can't wander.

   Validation model (why guests can't check in as someone else):
   - Self-serve check-in requires POSSESSION of the ticket — the QR code or
     its code, an unguessable 128-bit token. There is no name search on any
     self-serve screen, so "type three letters of somebody's name" is not
     possible outside the staff-only Door view (organizer passcode).
   - Every accept flashes the name + party size, so a staffer standing at the
     scan station can eyeball that a party of 2 isn't walking six people in.
   ========================================================================== */

function StationShell({ icon, title, subtitle, children, onExit, exitLabel }) {
  return (
    <div className="mrd" style={{ minHeight: "100vh", background: "var(--pine2)", display: "flex", flexDirection: "column" }}>
      <Styles />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 22px", borderBottom: "1px solid var(--pineLine)" }}>
        <span className="brandtag">{EVENT.org}</span>
        {onExit && <button onClick={onExit} style={{ background: "none", border: "1px solid #3c6d59", borderRadius: 999, color: "#9DB3A8", fontFamily: "inherit", fontWeight: 600, fontSize: 12, padding: "6px 14px", cursor: "pointer" }}>{exitLabel || "Exit station"}</button>}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", padding: "34px 22px 60px" }}>
        <div style={{ color: "var(--goldSoft)", display: "flex", alignItems: "center", gap: 10, fontSize: 13, letterSpacing: ".2em", textTransform: "uppercase", fontWeight: 600 }}>{icon}{title}</div>
        <h1 className="mrd-serif" style={{ color: "#F4EFE6", fontSize: "clamp(28px,5vw,44px)", margin: "10px 0 6px", fontWeight: 600, textAlign: "center" }}>{EVENT.name}</h1>
        {subtitle && <p style={{ color: "#A9C0B5", fontSize: 15.5, margin: "0 0 26px", textAlign: "center", maxWidth: 480 }}>{subtitle}</p>}
        {children}
      </div>
    </div>
  );
}

/* "/?station=scan" — fullscreen ticket scanner for a door iPad. Needs the
   organizer passcode once (stored for the session), because /api/scan is
   staff-gated. */
function ScanStation() {
  const [key, setKeyState] = useState(() => sessionStorage.getItem("doorKey") || "");
  const [keyInput, setKeyInput] = useState("");
  const [keyErr, setKeyErr] = useState("");
  const [checking, setChecking] = useState(false);
  const [accepted, setAccepted] = useState(0);
  const [manual, setManual] = useState("");
  const [exitOpen, setExitOpen] = useState(false);
  const [exitInput, setExitInput] = useState("");

  const unlock = async () => {
    if (!keyInput.trim()) return;
    setChecking(true); setKeyErr("");
    try {
      const r = await fetchT("/api/registrants", { headers: { "x-organizer-key": keyInput } }, 8000);
      if (!r.ok) throw Object.assign(new Error(r.status === 401 ? "Wrong passcode." : `Server returned ${r.status}.`), { http: true });
      sessionStorage.setItem("doorKey", keyInput);
      setKeyState(keyInput);
    } catch (err) {
      // Offline arming is allowed only with the passcode this device already
      // verified while online — we can't check a new one against anything.
      if (!err.http && keyInput === sessionStorage.getItem("doorKey")) setKeyState(keyInput);
      else setKeyErr(err.http ? err.message : "Offline — enter the passcode this iPad was armed with while online.");
    }
    setChecking(false);
  };

  if (!key) {
    return (
      <StationShell icon={<ScanLine size={15} />} title="Scan Station" subtitle="Staff setup — enter the organizer passcode to arm this station.">
        <div style={{ display: "flex", gap: 10, width: "min(400px,100%)" }}>
          <input className="inp" type="password" placeholder="Organizer passcode" value={keyInput} onChange={(e) => setKeyInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && unlock()} autoFocus />
          <button className="btn btn-p" onClick={unlock} disabled={checking}>{checking ? "…" : "Arm"}</button>
        </div>
        {keyErr && <p style={{ color: "#E2A98F", fontSize: 13.5, marginTop: 12 }}>{keyErr}</p>}
      </StationShell>
    );
  }

  return <ArmedScanStation passcode={key} accepted={accepted} onAccepted={() => setAccepted((n) => n + 1)}
    manual={manual} setManual={setManual}
    exitOpen={exitOpen} setExitOpen={setExitOpen} exitInput={exitInput} setExitInput={setExitInput} />;
}

function ArmedScanStation({ passcode, accepted, onAccepted, manual, setManual, exitOpen, setExitOpen, exitInput, setExitInput }) {
  const { videoRef, status, cameraError, redeem } = useTicketScanner(passcode, "scan-station", onAccepted);
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState([]);

  // Keep the station's manifest fresh while online, and flush queued scans
  // the moment connectivity returns (retrying every 30 s while any remain).
  useEffect(() => {
    const refreshManifest = async () => {
      try {
        const r = await fetchT("/api/registrants", { headers: { "x-organizer-key": passcode } }, 10000);
        if (r.ok) saveManifest(await r.json());
      } catch { /* offline — the saved manifest carries the station */ }
    };
    const flush = async () => {
      const { conflicts: found } = await flushOutbox({ passcode, insertFn: dbInsertUpsertRaw });
      if (found.length) setConflicts((prev) => [...prev, ...found]);
      setPending(await pendingCount());
    };
    refreshManifest();
    pendingCount().then(setPending);
    const onOnline = () => { flush(); refreshManifest(); };
    window.addEventListener("online", onOnline);
    const iv = setInterval(async () => {
      if (navigator.onLine && (await pendingCount()) > 0) flush();
    }, 30000);
    const mv = setInterval(() => { if (navigator.onLine) refreshManifest(); }, 120000);
    return () => { window.removeEventListener("online", onOnline); clearInterval(iv); clearInterval(mv); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passcode]);

  // Reflect each redeem in the pending badge without waiting for the interval
  useEffect(() => { pendingCount().then(setPending); }, [status]);

  return (
    <StationShell
      icon={<ScanLine size={15} />} title="Scan Station"
      subtitle="Hold your ticket QR code up to the camera."
      onExit={() => setExitOpen((v) => !v)}
    >
      <div style={{ width: "min(560px,100%)" }}>
        {exitOpen && (
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input className="inp" type="password" placeholder="Passcode to exit" value={exitInput} onChange={(e) => setExitInput(e.target.value)} />
            <button className="btn btn-p" onClick={() => { if (exitInput === passcode) { window.location.href = "/"; } else { setExitInput(""); } }}>Unlock</button>
          </div>
        )}
        {cameraError ? (
          <div style={{ fontSize: 14.5, color: "#E2C282", background: "#1a4d3a", border: "1.5px solid #3c6d59", borderRadius: 14, padding: "16px 18px" }}>
            <AlertTriangle size={15} style={{ display: "inline", verticalAlign: "middle", marginRight: 7 }} />{cameraError}
          </div>
        ) : (
          <video ref={videoRef} style={{ width: "100%", borderRadius: 16, background: "#0C2A20", aspectRatio: "4/3", objectFit: "cover", border: "1.5px solid var(--pineLine)" }} muted playsInline />
        )}
        <ScanBanner status={status} big />
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <input
            className="inp" style={{ flex: 1, fontSize: 16 }} placeholder="No QR? Type the ticket code…"
            value={manual} onChange={(e) => setManual(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && manual.trim()) { redeem(manual); setManual(""); } }}
          />
          <button className="btn btn-p" onClick={() => { if (manual.trim()) { redeem(manual); setManual(""); } }}>Check in</button>
        </div>
        {conflicts.length > 0 && (
          <div style={{ marginTop: 14, background: "#fdf0ec", border: "1.5px solid #efc4b3", borderRadius: 12, padding: "12px 14px", fontSize: 13.5, color: "#b4471f" }}>
            <b><AlertTriangle size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />Conflicts after sync:</b>{" "}
            {conflicts.map((c) => c.name).join(", ")} had already checked in on another device.
            <button onClick={() => setConflicts([])} style={{ marginLeft: 10, background: "none", border: "none", color: "#b4471f", fontFamily: "inherit", fontWeight: 700, fontSize: 12.5, cursor: "pointer", textDecoration: "underline" }}>Dismiss</button>
          </div>
        )}
        <p style={{ color: "#9DB3A8", fontSize: 13, marginTop: 16, textAlign: "center" }}>
          {accepted} checked in at this station{pending > 0 ? ` · ${pending} queued to sync` : ""} · not registered yet? Use the registration iPad.
        </p>
      </div>
    </StationShell>
  );
}

/* "/?station=register" — self-serve walk-in registration for a door iPad.
   Card payments go through Stripe Checkout (kiosk returns here afterward);
   otherwise the guest registers now and pays at the cashier — their ticket
   scans either way, and unpaid tickets flash "payment due" at the scanner. */
function RegisterStation() {
  const isStripeReturn = URL_PARAMS.get("status") === "success" && !!URL_PARAMS.get("session_id");
  const [form, setForm] = useState({ firstName: "", lastName: "", phone: "", email: "", party: 1 });
  const [done, setDone] = useState(null); // { token, name, party, paid, queued }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [online, setOnline] = useState(navigator.onLine);

  // Card payments need Stripe (a network), so track connectivity — and flush
  // any queued registrations when it returns (upserts on the ticket_token
  // need no passcode, so the self-serve station syncs itself).
  useEffect(() => {
    const up = () => { setOnline(true); flushOutbox({ passcode: sessionStorage.getItem("doorKey") || "", insertFn: dbInsertUpsertRaw }); };
    const down = () => setOnline(false);
    window.addEventListener("online", up);
    window.addEventListener("offline", down);
    const iv = setInterval(async () => {
      if (navigator.onLine && (await pendingCount()) > 0) flushOutbox({ passcode: sessionStorage.getItem("doorKey") || "", insertFn: dbInsertUpsertRaw });
    }, 30000);
    return () => { window.removeEventListener("online", up); window.removeEventListener("offline", down); clearInterval(iv); };
  }, []);

  // Returning from kiosk card payment: fetch the webhook-minted ticket.
  useEffect(() => {
    if (!isStripeReturn) return;
    const sid = URL_PARAMS.get("session_id");
    let tries = 0;
    const poll = async () => {
      tries++;
      try {
        const r = await fetch(`/api/ticket?session_id=${encodeURIComponent(sid)}`);
        if (r.ok) {
          const t = await r.json();
          setDone({ token: t.ticket_token, name: t.name, party: t.party, paid: true });
          return;
        }
      } catch { /* retry */ }
      if (tries < 12) setTimeout(poll, 2500);
    };
    poll();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = (form.party || 1) * TICKET.price;
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const reset = () => {
    setForm({ firstName: "", lastName: "", phone: "", email: "", party: 1 });
    setDone(null); setErr("");
    if (isStripeReturn) window.history.replaceState(null, "", "/?station=register");
  };

  const registerPayAtDoor = async () => {
    if (!form.firstName.trim()) { setErr("First name is required."); return; }
    setBusy(true); setErr("");
    const name = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
    const token = mintTicketToken();
    const row = {
      name, phone: form.phone.trim() || null, email: form.email.trim() || null,
      party: form.party || 1, source: "Walk-in", status: "Pending", amount: 0,
      checked_in: false, ticket_token: token,
    };
    // Online: writes straight through. Offline: queues on the outbox and
    // lands in the local manifest so the ticket scans on this device now.
    const wrote = await persistRegistrant(row);
    if (wrote === "queued") manifestPut({ id: `tmp-${crypto.randomUUID()}`, ...row });
    setDone({ token, name, party: form.party || 1, paid: false, queued: wrote === "queued" });
    setBusy(false);
  };

  const registerPayCard = async () => {
    if (!form.firstName.trim()) { setErr("First name is required."); return; }
    setBusy(true); setErr("");
    sessionStorage.setItem("stationMode", "register");
    try {
      await startStripeWalkIn({
        name: `${form.firstName.trim()} ${form.lastName.trim()}`.trim(),
        phone: form.phone.trim(), party: form.party || 1, total,
        lineItems: [{ name: TICKET.name, amount: Math.round(total * 100), quantity: 1 }],
      });
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  if (done) {
    return (
      <StationShell icon={<Ticket size={15} />} title="Registration" subtitle={done.paid ? "You're all set — welcome!" : "One more stop: pay at the cashier, then you're in."}>
        <div className="ticket" style={{ margin: 0, width: "min(520px,100%)" }}>
          <div className="stub"><TicketQR value={done.token} size={140} /></div>
          <div className="body">
            <div className="row"><span className="k">Name</span><span className="v">{done.name || "Guest"}</span></div>
            <div className="row"><span className="k">Party of</span><span className="v">{done.party}</span></div>
            <div className="row"><span className="k">Status</span><span className="v" style={{ color: done.paid ? "var(--ok)" : "var(--warn)" }}>{done.paid ? "Paid — checked in" : "Payment due at cashier"}</span></div>
          </div>
        </div>
        <p style={{ color: "#A9C0B5", fontSize: 14.5, marginTop: 18, textAlign: "center", maxWidth: 440 }}>
          {done.paid ? "Enjoy the event!" : "Show this screen at the cashier table. They'll take your payment and scan you in."}
          {" "}Take a photo of the QR code to keep your ticket.
          {done.queued ? " (Saved on this iPad — syncs automatically when the internet returns.)" : ""}
        </p>
        <button className="btn btn-p" style={{ marginTop: 22 }} onClick={reset}>Done — next guest</button>
      </StationShell>
    );
  }

  return (
    <StationShell icon={<Ticket size={15} />} title="Registration" subtitle={`Register here — ${money(TICKET.price).replace(".00", "")} per person.`}
      onExit={() => { sessionStorage.removeItem("stationMode"); window.location.href = "/"; }} exitLabel="Staff exit">
      <div className="card" style={{ width: "min(520px,100%)", display: "grid", gap: 16 }}>
        <div className="frow">
          <div className="field"><label>First name <span className="req">*</span></label><input className="inp" value={form.firstName} onChange={(e) => setF("firstName", e.target.value)} placeholder="Jean" /></div>
          <div className="field"><label>Last name</label><input className="inp" value={form.lastName} onChange={(e) => setF("lastName", e.target.value)} placeholder="Boudreaux" /></div>
        </div>
        <div className="frow">
          <div className="field"><label>Phone</label><input className="inp" value={form.phone} onChange={(e) => setF("phone", e.target.value)} placeholder="(337) 555-0123" inputMode="tel" /></div>
          <div className="field"><label>Email</label><input className="inp" value={form.email} onChange={(e) => setF("email", e.target.value)} placeholder="jean@example.com" inputMode="email" /></div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div className="field">
            <label>Party size</label>
            <div className="qty" style={{ width: "fit-content" }}>
              <button onClick={() => setF("party", Math.max(1, (form.party || 1) - 1))}><Minus size={17} /></button>
              <span>{form.party || 1}</span>
              <button onClick={() => setF("party", Math.min(20, (form.party || 1) + 1))}><Plus size={17} /></button>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "var(--inkSoft)", fontWeight: 600 }}>TOTAL</div>
            <div className="mrd-serif" style={{ fontSize: 30, fontWeight: 600 }}>{money(total)}</div>
          </div>
        </div>
        {err && <div style={{ fontSize: 13.5, color: "#b4471f", fontWeight: 600 }}><AlertTriangle size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 6 }} />{err}</div>}
        <div style={{ display: "grid", gap: 10 }}>
          {STRIPE_CONFIG.liveMode && (
            <button className="btn btn-p" style={{ justifyContent: "center", width: "100%" }} onClick={registerPayCard} disabled={busy || !online}>
              <CreditCard size={17} /> {busy ? "One moment…" : !online ? "Card unavailable offline" : `Pay ${money(total)} by card`}
            </button>
          )}
          <button className={`btn ${STRIPE_CONFIG.liveMode && online ? "btn-g" : "btn-p"}`} style={{ justifyContent: "center", width: "100%" }} onClick={registerPayAtDoor} disabled={busy}>
            <UserPlus size={17} /> {busy ? "One moment…" : "Register — pay at the cashier"}
          </button>
          {!online && <div style={{ fontSize: 12.5, color: "var(--warn)", fontWeight: 600, textAlign: "center" }}>Offline — registrations are saved on this iPad and sync automatically.</div>}
        </div>
      </div>
    </StationShell>
  );
}

/* ============================================================================ */
export default function BoilOnTheBend() {
  const [view, setView] = useState("register");
  const [step, setStep] = useState(-1);
  const [attendees, setAttendees] = useState([blankAtt()]);
  const [donation, setDonation] = useState(0);
  const [donationCustom, setDonationCustom] = useState("");
  const [pay, setPay] = useState({ name: "", card: "", exp: "", cvc: "" });
  const [errors, setErrors] = useState({});
  const [confCode] = useState(() => "BOTB-" + Math.random().toString(36).slice(2, 7).toUpperCase());
  // The real ticket shown on the confirmation screen: { token, name, party }.
  // Simulated/cash paths set it at mint time; the Stripe path fills it by
  // polling /api/ticket with the session_id from the success redirect.
  const [ticket, setTicket] = useState(null);
  // Which wallet buttons to show — the endpoints are env-gated, so probe once
  // on the confirmation screen and only render buttons that will work.
  const [walletAvail, setWalletAvail] = useState({ apple: false, google: false });

  // Offline sync state: queued ops waiting to reach the server, last good
  // roster sync, and first-scan-wins conflicts surfaced to staff.
  const [pending, setPending] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState(null);
  const [conflicts, setConflicts] = useState([]);
  const refreshPending = async () => {
    setPending(await pendingCount());
    setLastSyncAt(await getMeta("lastSyncAt"));
  };
  const doFlush = async (pc = passcode || sessionStorage.getItem("doorKey") || "") => {
    const { flushed, conflicts: found } = await flushOutbox({ passcode: pc, insertFn: dbInsertUpsertRaw });
    if (found.length) setConflicts((prev) => [...prev, ...found]);
    await refreshPending();
    if (flushed > 0 && navigator.onLine && pc) loadRoster(pc);
    return flushed;
  };

  // Flush the outbox the moment connectivity returns (and retry every 30 s
  // while anything is queued — the "online" event is not always reliable).
  useEffect(() => {
    if (IS_DEMO) return;
    refreshPending();
    const onOnline = () => { doFlush(); };
    window.addEventListener("online", onOnline);
    const iv = setInterval(async () => {
      if (navigator.onLine && (await pendingCount()) > 0) doFlush();
    }, 30000);
    return () => { window.removeEventListener("online", onOnline); clearInterval(iv); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [passcode]);

  const [roster, setRoster] = useState(SAMPLE_ROSTER);
  const [sponsors, setSponsors] = useState([]);
  const [search, setSearch] = useState("");
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [passcode, setPasscode] = useState("");
  const [dbState, setDbState] = useState("idle"); // idle | loading | live | offline
  const [dbMsg, setDbMsg] = useState("");

  // Door view state
  const [doorUnlocked, setDoorUnlocked] = useState(false);
  const [doorSearch, setDoorSearch] = useState("");
  const [doorFlash, setDoorFlash] = useState(null);
  const [walkInForm, setWalkInForm] = useState({ firstName: "", lastName: "", ranch: "", phone: "", party: 1, payment: "cash" });
  const [walkInMsg, setWalkInMsg] = useState("");
  const [walkInLoading, setWalkInLoading] = useState(false);
  const [walkIns, setWalkIns] = useState([]);
  const [scanOpen, setScanOpen] = useState(false);

  const qty = attendees.length;
  const ticketsTotal = qty * TICKET.price;
  const total = ticketsTotal + (Number(donation) || 0);
  const lineItems = useMemo(() => {
    const items = [{ name: TICKET.name, sub: `${qty} × ${money(TICKET.price)}`, amount: ticketsTotal }];
    if (donation > 0) items.push({ name: `Donation to ${EVENT.orgShort}`, sub: "Thank you!", amount: Number(donation) });
    return items;
  }, [qty, ticketsTotal, donation]);

  /* boot demo mode — load sample registrants + sponsors, skip passcode */
  useEffect(() => {
    if (!IS_DEMO) return;
    const mapped = DEMO_REGISTRANTS.map((x) => ({
      id: x.id, name: x.name, email: x.email, phone: x.phone, party: x.party,
      source: x.source, status: x.status, amount: x.amount,
      checkedIn: x.checked_in, date: x.created_at,
      notes: null, ranch: x.ranch, bidderNumber: x.bidder_number,
      sponsorId: null, sponsorName: x.sponsor_name || null,
    }));
    setRoster(mapped);
    setSponsors(DEMO_SPONSORS.map((s) => ({ id: s.id, name: s.name })));
    setDbState("live");
    setDbMsg("Demo mode — sample data only.");
  }, []);

  /* handle Stripe redirect return (live mode) */
  useEffect(() => {
    if (IS_DEMO) return;
    const p = new URLSearchParams(window.location.search);
    // Register-station card payments return with walkin=1 too, but that leg is
    // handled entirely inside RegisterStation (see the stationMode flag).
    if (sessionStorage.getItem("stationMode") === "register") return;
    if (p.get("status") === "success") {
      if (p.get("walkin") === "1") {
        const saved = sessionStorage.getItem("doorKey") || "";
        if (saved) {
          setPasscode(saved);
          setDoorUnlocked(true);
          setView("door");
          loadRoster(saved);
          setWalkInMsg("Walk-in payment complete — they've been added to the roster.");
        }
      } else {
        setStep(3);
        // The webhook mints the ticket; it usually lands within a second or
        // two of the redirect. Poll briefly until it's there.
        const sid = p.get("session_id");
        if (sid) {
          let tries = 0;
          const poll = async () => {
            tries++;
            try {
              const r = await fetch(`/api/ticket?session_id=${encodeURIComponent(sid)}`);
              if (r.ok) {
                const t = await r.json();
                setTicket({ token: t.ticket_token, name: t.name, party: t.party });
                return;
              }
            } catch { /* retry below */ }
            if (tries < 12) setTimeout(poll, 2500);
          };
          poll();
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Probe the env-gated wallet endpoints once we reach the confirmation screen
  useEffect(() => {
    if (IS_DEMO || step !== 3) return;
    fetch("/api/wallet-pass?probe=1").then((r) => setWalletAvail((w) => ({ ...w, apple: r.ok }))).catch(() => {});
    fetch("/api/google-wallet?probe=1").then((r) => setWalletAvail((w) => ({ ...w, google: r.ok }))).catch(() => {});
  }, [step]);

  // Auto-refresh roster every 20 s when connected so all devices stay in sync
  useEffect(() => {
    if (IS_DEMO || dbState !== "live") return;
    const id = setInterval(() => {
      if (!navigator.onLine) return; // offline: the manifest is the roster
      fetch(ROSTER_ENDPOINT, { headers: { "x-organizer-key": passcode } })
        .then((r) => r.ok ? r.json() : null)
        .then((rows) => { if (rows) { setRoster(rows.map(dbRowToUI)); saveManifest(rows); } })
        .catch(() => {});
    }, 20000);
    return () => clearInterval(id);
  }, [dbState, passcode]);

  const setQty = (n) => { n = Math.max(1, Math.min(20, n)); setAttendees((prev) => { const a = [...prev]; while (a.length < n) a.push(blankAtt()); while (a.length > n) a.pop(); return a; }); };
  const updateAtt = (i, f, v) => setAttendees((p) => p.map((a, idx) => idx === i ? { ...a, [f]: v } : a));
  const removeAtt = (i) => setAttendees((p) => p.filter((_, idx) => idx !== i));
  const pickDonation = (v) => { setDonation(v); setDonationCustom(""); };

  const validatePrimary = () => {
    const e = {};
    if (!attendees[0].firstName.trim()) e["0-firstName"] = 1;
    if (!attendees[0].lastName.trim()) e["0-lastName"] = 1;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(attendees[0].email)) e["0-email"] = 1;
    setErrors(e); return Object.keys(e).length === 0;
  };
  const validatePay = () => {
    const e = {};
    if (!pay.name.trim()) e.name = 1;
    if (pay.card.replace(/\s/g, "").length < 15) e.card = 1;
    if (!/^\d{2}\s*\/\s*\d{2}$/.test(pay.exp)) e.exp = 1;
    if (pay.cvc.length < 3) e.cvc = 1;
    setErrors(e); return Object.keys(e).length === 0;
  };

  const completeRegistration = async () => {
    const a = attendees[0];
    const bidderNo = String(await nextBidderNumber());
    const token = mintTicketToken();
    const row = {
      name: `${a.firstName} ${a.lastName}`.trim(), email: a.email, phone: a.phone,
      party: qty, source: "Online", status: "Paid", amount: total, notes: a.notes || null, ranch: a.ranch || null,
      bidder_number: bidderNo, ticket_token: token,
    };
    try { await dbInsert(row); } catch (err) { console.warn("DB write skipped:", err.message); }
    setRoster((r) => [{ ...row, id: `tmp-${crypto.randomUUID()}`, checkedIn: false, date: new Date().toISOString().slice(0, 10), bidderNumber: bidderNo }, ...r]);
    setTicket({ token, name: row.name, party: qty });
    setStep(3); window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handlePay = async () => {
    if (!validatePay()) return;
    if (STRIPE_CONFIG.liveMode) {
      try {
        const a = attendees[0];
        await startStripeCheckout({
          email: a.email, total, party: qty, name: `${a.firstName} ${a.lastName}`.trim(), phone: a.phone,
          lineItems: lineItems.map((li) => ({ name: li.name, amount: Math.round(li.amount * 100), quantity: 1 })),
        });
      } catch (err) { setErrors({ stripe: err.message }); }
    } else {
      completeRegistration();
    }
  };

  const next = () => { if (step === 1 && !validatePrimary()) return; setStep((s) => s + 1); setErrors({}); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const back = () => { setStep((s) => s - 1); setErrors({}); window.scrollTo({ top: 0, behavior: "smooth" }); };

  /* ---- DB-backed roster ---- */
  const loadRoster = async (pc = passcode) => {
    setDbState("loading"); setDbMsg("");
    try {
      const r = await fetchT(ROSTER_ENDPOINT, { headers: { "x-organizer-key": pc } }, 10000);
      if (!r.ok) throw Object.assign(new Error(r.status === 401 ? "Wrong passcode." : `Server returned ${r.status}.`), { http: true });
      const rows = await r.json();
      setRoster(rows.map(dbRowToUI));
      // This passcode just proved itself against the server — it's the one an
      // offline unlock may trust later. (Stored only on success, on purpose.)
      sessionStorage.setItem("doorKey", pc);
      saveManifest(rows);
      refreshPending();
      setDbState("live"); setDbMsg(`Loaded ${rows.length} registrant${rows.length === 1 ? "" : "s"} from yellow-kite.`);
      // Load sponsors for association dropdown (best-effort)
      try { const sr = await fetch("/api/sponsors", { headers: { "x-organizer-key": pc } }); if (sr.ok) { const sd = await sr.json(); setSponsors(Array.isArray(sd) ? sd : []); } } catch {}
    } catch (err) {
      // Network down (not a server verdict like 401): run the door from the
      // offline manifest — but only for the passcode that armed this device
      // while online, since we can't verify a new one without a server.
      if (!err.http && pc && pc === sessionStorage.getItem("doorKey")) {
        const rows = await manifestAll();
        if (rows.length) {
          setRoster(rows.map(dbRowToUI));
          const syncedAt = await getMeta("lastSyncAt");
          refreshPending();
          setDbState("offline");
          setDbMsg(`Offline — running from the saved roster (${rows.length} people, synced ${syncedAt ? new Date(syncedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "earlier"}). Check-ins and walk-ins queue and sync automatically.`);
          return;
        }
      }
      setDbState("offline");
      setDbMsg(`Live DB unavailable (${err.message}) — showing local data. This works once deployed to Vercel.`);
    }
  };

  const runImport = async () => {
    const raw = rowsFromText(importText);
    if (!raw.length) { setImportMsg("Couldn't read any rows. Paste a CSV (with a header row) or a JSON array."); return; }
    const mapped = raw.map(mapJotformRow).filter((r) => r.email || r.name !== "Unnamed registrant");
    let written = 0;
    for (const m of mapped) {
      try { await dbInsert({ name: m.name, email: m.email, phone: m.phone, party: m.party, source: "Jotform", status: m.status, amount: m.amount, notes: m.notes || null }); written++; }
      catch (err) { /* preview / offline */ }
    }
    setRoster((r) => [...mapped.map((m) => ({ ...m, id: `tmp-${crypto.randomUUID()}` })), ...r]); setImportText("");
    setImportMsg(written ? `Imported ${mapped.length} registrants (${written} written to Supabase).` : `Added ${mapped.length} locally. Connect the live DB (deploy) to persist them.`);
  };

  // All roster mutations key on the row's id — never its array index, which
  // races the 20 s poll (a reorder mid-tap used to hit the wrong person).
  // Server-bound rows: PATCH now, queue the same patch if the network fails.
  // tmp- rows (created offline) reach the server via their queued insert,
  // which already carries their latest local state.
  const isServerRow = (p) => p.id && !String(p.id).startsWith("tmp-") && !String(p.id).startsWith("sample-");
  const patchOrQueue = async (person, fields) => {
    if (IS_DEMO || !isServerRow(person) || !passcode) return;
    try {
      const r = await fetchT(ROSTER_ENDPOINT, { method: "PATCH", headers: { "Content-Type": "application/json", "x-organizer-key": passcode }, body: JSON.stringify({ id: person.id, ...fields }) });
      if (!r.ok) throw new Error(`PATCH ${r.status}`);
    } catch {
      await queueOp({ type: "patch", id: person.id, fields });
      refreshPending();
    }
  };

  const toggleCheckIn = async (person) => {
    const next = !person.checkedIn;
    setRoster((r) => r.map((p) => (p.id === person.id ? { ...p, checkedIn: next } : p)));
    manifestPatch(person.id, { checked_in: next, checked_in_at: next ? new Date().toISOString() : null });
    await patchOrQueue(person, { checked_in: next });
  };

  // Cashier control: settle a pay-at-the-door registration (from the
  // self-serve registration station) once cash/check/card is collected.
  const markPaid = async (person) => {
    const amount = (person.party || 1) * TICKET.price;
    setRoster((r) => r.map((p) => (p.id === person.id ? { ...p, status: "Paid", amount } : p)));
    manifestPatch(person.id, { status: "Paid", amount });
    await patchOrQueue(person, { status: "Paid", amount });
  };

  const deleteRegistrant = async (person) => {
    if (!window.confirm(`Delete ${person.name}? This cannot be undone.`)) return;
    setRoster((r) => r.filter((p) => p.id !== person.id));
    if (isServerRow(person) && passcode) {
      try {
        await fetch(ROSTER_ENDPOINT, { method: "DELETE", headers: { "Content-Type": "application/json", "x-organizer-key": passcode }, body: JSON.stringify({ id: person.id }) });
      } catch (err) { /* deletes are online-only; the poll restores the row if it failed */ }
    }
  };

  const saveBidderNumber = async (person, value) => {
    setRoster((r) => r.map((p) => (p.id === person.id ? { ...p, bidderNumber: value } : p)));
    await patchOrQueue(person, { bidder_number: value || null });
  };

  const savePhone = async (person, value) => {
    setRoster((r) => r.map((p) => (p.id === person.id ? { ...p, phone: value } : p)));
    await patchOrQueue(person, { phone: value || null });
  };

  const saveSponsor = async (person, sponsorId) => {
    const sp = sponsors.find((s) => s.id === sponsorId) || null;
    setRoster((r) => r.map((p) => (p.id === person.id ? { ...p, sponsorId: sponsorId || null, sponsorName: sp?.name || null } : p)));
    await patchOrQueue(person, { sponsor_id: sponsorId || null });
  };

  const nextBidderNumber = async () => {
    // Always fetch fresh roster from DB to avoid duplicates across devices
    // (timeboxed: offline falls back to the local roster quickly)
    try {
      const r = await fetchT(ROSTER_ENDPOINT, { headers: { "x-organizer-key": passcode } }, 6000);
      if (r.ok) {
        const rows = await r.json();
        setRoster(rows.map(dbRowToUI)); // also refresh local state
        const nums = rows.map((p) => parseInt(p.bidder_number || "0", 10)).filter((n) => !isNaN(n) && n > 0);
        return nums.length ? Math.max(...nums) + 1 : 1;
      }
    } catch {}
    // Fallback to local state if offline
    const nums = roster.map((p) => parseInt(p.bidderNumber || "0", 10)).filter((n) => !isNaN(n) && n > 0);
    return nums.length ? Math.max(...nums) + 1 : 1;
  };

  const filtered = roster.filter((p) => `${p.name} ${p.email} ${p.phone}`.toLowerCase().includes(search.toLowerCase()));
  const totalGuests = roster.reduce((s, p) => s + (p.party || 1), 0);
  const checkedIn = roster.filter((p) => p.checkedIn).length;
  const revenue = roster.reduce((s, p) => s + (p.amount || 0), 0);

  const UtilBar = () => (
    <div className="util"><div className="wrap util-in">
      <span className="brandtag">{EVENT.org}</span>
      <div className="vtoggle">
        <button className={view === "register" ? "on" : ""} onClick={() => setView("register")}><Ticket size={15} /> Register</button>
        <button className={view === "door" ? "on" : ""} onClick={() => setView("door")}><ScanLine size={15} /> Door</button>
        <button className={view === "admin" ? "on" : ""} onClick={() => setView("admin")}><LayoutGrid size={15} /> Organizer</button>
        <button onClick={() => window.location.href = "/?app=settlement"} style={{ borderLeft: "1px solid #23604A", marginLeft: 4, paddingLeft: 12 }}><FileText size={15} /> Ledger</button>
      </div>
    </div></div>
  );

  /* ---------- STATION MODES (locked door iPads) ---------- */
  if (STATION === "scan") return <ScanStation />;
  // The register station also owns the Stripe return leg of its own card
  // payments (the success URL drops the station param, so we key off the
  // stationMode flag set right before the redirect).
  if (STATION === "register" || (URL_PARAMS.get("walkin") === "1" && sessionStorage.getItem("stationMode") === "register")) {
    return <RegisterStation />;
  }

  /* ---------- DOOR CHECK-IN ---------- */
  if (view === "door") {
    const doorFiltered = doorSearch.trim().length >= 2
      ? roster.filter((p) => `${p.name} ${p.email} ${p.phone}`.toLowerCase().includes(doorSearch.toLowerCase()))
      : [];
    const walkInTotal = (walkInForm.party || 1) * TICKET.price;
    const doorCheckedIn = roster.filter((p) => p.checkedIn).length;

    const handleDoorUnlock = async () => {
      if (!passcode.trim()) return;
      // doorKey is stored by loadRoster only after the server (or the
      // offline-manifest match) accepts this passcode — never before.
      setDoorUnlocked(true);
      await loadRoster(passcode);
    };

    const addCashWalkIn = async () => {
      if (!walkInForm.firstName.trim()) { setWalkInMsg("First name is required."); return; }
      setWalkInLoading(true);
      const fullName = `${walkInForm.firstName.trim()} ${walkInForm.lastName.trim()}`.trim();
      const bidderNo = String(await nextBidderNumber());
      const row = {
        name: fullName, phone: walkInForm.phone.trim(), ranch: walkInForm.ranch.trim() || null,
        notes: walkInForm.ranch.trim() || null,
        party: walkInForm.party || 1, source: "Walk-in",
        status: "Paid", amount: walkInTotal, checked_in: true, checked_in_at: new Date().toISOString(),
        bidder_number: bidderNo, ticket_token: mintTicketToken(),
      };
      // Writes now, or queues on the outbox when offline (idempotent on the
      // ticket_token, so the sync replay can never create a duplicate).
      const wrote = await persistRegistrant(row);
      const tmpId = `tmp-${crypto.randomUUID()}`;
      // Into the local manifest too, so their fresh QR scans even offline.
      manifestPut({ id: tmpId, ...row });
      const uiRow = { ...row, checkedIn: true, date: new Date().toISOString().slice(0, 10), id: tmpId, bidderNumber: bidderNo };
      setRoster((r) => [uiRow, ...r]);
      setWalkIns((w) => [{ ...row, payment: "cash", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...w]);
      setWalkInForm({ firstName: "", lastName: "", ranch: "", phone: "", party: 1, payment: walkInForm.payment });
      setWalkInMsg(`${fullName} added and checked in!${wrote === "queued" ? " (offline — will sync)" : ""}`);
      if (wrote === "queued") refreshPending();
      setWalkInLoading(false);
      setTimeout(() => setWalkInMsg(""), 6000);
    };

    const addCardWalkIn = async () => {
      if (!walkInForm.firstName.trim()) { setWalkInMsg("First name is required."); return; }
      sessionStorage.setItem("doorKey", passcode);
      setWalkInLoading(true);
      const fullName = `${walkInForm.firstName.trim()} ${walkInForm.lastName.trim()}`.trim();
      try {
        await startStripeWalkIn({
          name: fullName, phone: walkInForm.phone.trim(),
          party: walkInForm.party || 1, total: walkInTotal,
          lineItems: [{ name: TICKET.name, amount: Math.round(walkInTotal * 100), quantity: 1 }],
        });
      } catch (err) {
        setWalkInMsg(err.message);
        setWalkInLoading(false);
      }
    };

    return (
      <div className="mrd"><Styles /><UtilBar />
        <div className="wrap panel anim">
          <div className="section-h">Door</div>
          <h2 className="section-t mrd-serif">Check-In &amp; Walk-Ins</h2>

          {!doorUnlocked ? (
            <>
              <p className="section-d">Enter the organizer passcode to unlock the roster.</p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", background: "var(--paper)", border: "1.5px solid var(--line)", borderRadius: 14, padding: 20, maxWidth: 480 }}>
                <Lock size={18} color="var(--pine)" />
                <input
                  className="inp" style={{ flex: 1, minWidth: 180 }} type="password"
                  placeholder="Organizer passcode" value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleDoorUnlock()}
                />
                <button className="btn btn-p" onClick={handleDoorUnlock} disabled={dbState === "loading"}>
                  {dbState === "loading" ? "Loading…" : "Unlock"}
                </button>
              </div>
              {dbState === "offline" && <p style={{ fontSize: 13, color: "var(--warn)", marginTop: 10, display: "flex", alignItems: "center", gap: 7 }}><AlertTriangle size={14} />Wrong passcode or roster unavailable.</p>}
            </>
          ) : (
            <>
              {/* Stats */}
              <div className="door-stats">
                <div className="stat"><div className="n">{doorCheckedIn}</div><div className="l">Checked in</div></div>
                <div className="stat"><div className="n">{roster.length}</div><div className="l">Registered</div></div>
                <div className="stat"><div className="n">{walkIns.length}</div><div className="l">Walk-ins today</div></div>
              </div>

              {/* Station launchers — put each door iPad in a locked single-purpose mode */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 24, background: "var(--paper)", border: "1.5px solid var(--line)", borderRadius: 14, padding: "13px 16px" }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--pine)" }}>iPad stations:</span>
                <button className="btn btn-g" style={{ padding: "9px 16px", fontSize: 13.5 }} onClick={() => { window.location.href = "/?station=scan"; }}><ScanLine size={15} /> Launch Scan Station</button>
                <button className="btn btn-g" style={{ padding: "9px 16px", fontSize: 13.5 }} onClick={() => { window.location.href = "/?station=register"; }}><UserPlus size={15} /> Launch Registration Station</button>
                <span style={{ fontSize: 12, color: "var(--inkSoft)" }}>Pin with iOS Guided Access. Exit needs the passcode.</span>
              </div>

              {/* Offline sync status */}
              {(dbState === "offline" || pending > 0) && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 18, background: "#f6ece0", border: "1.5px solid #e6cfa8", borderRadius: 14, padding: "12px 16px", fontSize: 13.5, fontWeight: 600, color: "var(--warn)" }}>
                  <span className="dot" style={{ background: dbState === "offline" ? "var(--warn)" : "var(--ok)" }} />
                  {dbState === "offline" ? "Offline — working from the saved roster." : "Back online."}
                  {pending > 0 && <span>{pending} update{pending === 1 ? "" : "s"} queued</span>}
                  {lastSyncAt && <span style={{ fontWeight: 500 }}>Last synced {new Date(lastSyncAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>}
                  {pending > 0 && (
                    <button className="btn btn-g" style={{ padding: "7px 14px", fontSize: 12.5 }} onClick={() => doFlush()}>
                      <RefreshCw size={13} /> Sync now
                    </button>
                  )}
                </div>
              )}

              {/* First-scan-wins conflicts surfaced to staff, never dropped */}
              {conflicts.length > 0 && (
                <div style={{ marginBottom: 18, background: "#fdf0ec", border: "1.5px solid #efc4b3", borderRadius: 14, padding: "14px 16px" }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#b4471f", display: "flex", alignItems: "center", gap: 8 }}>
                    <AlertTriangle size={16} /> Check-in conflicts — first scan won
                  </div>
                  <ul style={{ margin: "8px 0 10px", paddingLeft: 22, fontSize: 13.5, color: "var(--ink)" }}>
                    {conflicts.map((c, i) => (
                      <li key={i}><b>{c.name}</b> was accepted on this device while offline, but had already checked in{c.at ? ` at ${new Date(c.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""} elsewhere.</li>
                    ))}
                  </ul>
                  <button className="btn btn-g" style={{ padding: "7px 14px", fontSize: 12.5 }} onClick={() => setConflicts([])}>Dismiss</button>
                </div>
              )}

              {doorFlash && <div className="door-flash"><CheckCircle2 size={20} />{doorFlash}</div>}

              {/* ---- Check In Pre-Registered ---- */}
              <div style={{ marginBottom: 36 }}>
                <div className="door-section-h"><Search size={16} />Check In Pre-Registered</div>
                <div className="rtools">
                  <div className="searchbox">
                    <Search size={18} color="var(--inkSoft)" />
                    <input
                      value={doorSearch}
                      onChange={(e) => setDoorSearch(e.target.value)}
                      placeholder="Search name, email, or phone…"
                      style={{ fontSize: 15 }}
                      autoFocus
                    />
                  </div>
                  <button className="btn btn-p" style={{ padding: "12px 20px" }} onClick={() => setScanOpen(true)}>
                    <ScanLine size={17} /> Scan tickets
                  </button>
                </div>
                {scanOpen && (
                  <ScanModal
                    passcode={passcode}
                    onClose={() => { setScanOpen(false); loadRoster(passcode); }}
                    onCheckedIn={(reg) => {
                      // Reflect the scan in the local roster immediately (by id,
                      // not index — the 20 s poll may reorder rows underneath us)
                      setRoster((r) => r.map((p) => (p.id === reg?.id ? { ...p, checkedIn: true } : p)));
                    }}
                  />
                )}

                {doorSearch.trim().length === 0 && (
                  <p style={{ fontSize: 13, color: "var(--inkSoft)", marginTop: 8 }}>Type at least 2 characters to search the roster.</p>
                )}
                {doorSearch.trim().length === 1 && (
                  <p style={{ fontSize: 13, color: "var(--inkSoft)", marginTop: 8 }}>Keep typing…</p>
                )}

                {doorSearch.trim().length >= 2 && (
                  <div style={{ background: "var(--paper)", border: "1.5px solid var(--line)", borderRadius: 14, overflow: "hidden" }}>
                    {doorFiltered.length === 0 ? (
                      <div style={{ padding: 28, textAlign: "center", color: "var(--inkSoft)" }}>No matches for &ldquo;{doorSearch}&rdquo;</div>
                    ) : (
                      doorFiltered.map((p, i) => {
                        const { first, last } = splitName(p.name);
                        return (
                          <div className="door-result" key={p.id || i}>
                            <div style={{ flex: 1, minWidth: 140 }}>
                              <div style={{ fontWeight: 700, fontSize: 16 }}>{first} <span style={{ fontWeight: 400 }}>{last}</span></div>
                              {(p.ranch || p.notes) && <div style={{ fontSize: 13, color: "var(--pine)", fontWeight: 600, marginTop: 1 }}>{p.ranch || p.notes}</div>}
                              <div style={{ color: "var(--inkSoft)", fontSize: 13, marginTop: 2 }}>
                                Party of {p.party || 1}{p.phone ? ` · ${p.phone}` : p.email ? ` · ${p.email}` : ""}
                              </div>
                            </div>
                            <span className={`badge-s ${p.status === "Paid" ? "b-paid" : "b-pend"}`}>{p.status}</span>
                            {p.status !== "Paid" && (
                              <button className="btn btn-g" style={{ padding: "10px 16px", fontSize: 13.5 }} onClick={() => {
                                markPaid(p);
                                setDoorFlash(`${p.name} — ${money((p.party || 1) * TICKET.price)} collected, marked paid.`);
                                setTimeout(() => setDoorFlash(null), 5000);
                              }}>
                                Mark paid {money((p.party || 1) * TICKET.price)}
                              </button>
                            )}
                            <button
                              className={`door-ci-btn${p.checkedIn ? " done" : ""}`}
                              onClick={() => {
                                if (!p.checkedIn) {
                                  toggleCheckIn(p);
                                  setDoorFlash(`${p.name} — party of ${p.party || 1} checked in!`);
                                  setTimeout(() => setDoorFlash(null), 5000);
                                }
                              }}
                            >
                              {p.checkedIn
                                ? <><CheckCircle2 size={17} /> Checked in</>
                                : <><Circle size={17} /> Check in</>}
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* ---- Add Walk-In ---- */}
              <div>
                <div className="door-section-h"><UserPlus size={16} />Add Walk-In</div>
                <div className="card" style={{ display: "grid", gap: 16, marginBottom: 18 }}>
                  <div className="frow">
                    <div className="field">
                      <label>First name <span className="req">*</span></label>
                      <input className="inp" value={walkInForm.firstName} onChange={(e) => setWalkInForm({ ...walkInForm, firstName: e.target.value })} placeholder="Jean" />
                    </div>
                    <div className="field">
                      <label>Last name</label>
                      <input className="inp" value={walkInForm.lastName} onChange={(e) => setWalkInForm({ ...walkInForm, lastName: e.target.value })} placeholder="Boudreaux" />
                    </div>
                  </div>
                  <div className="frow">
                    <div className="field">
                      <label>Ranch / Business name</label>
                      <input className="inp" value={walkInForm.ranch} onChange={(e) => setWalkInForm({ ...walkInForm, ranch: e.target.value })} placeholder="Bayou Ranch" />
                    </div>
                    <div className="field">
                      <label>Phone</label>
                      <input className="inp" value={walkInForm.phone} onChange={(e) => setWalkInForm({ ...walkInForm, phone: e.target.value })} placeholder="(337) 555-0123" />
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "flex-end", gap: 20, flexWrap: "wrap" }}>
                    <div className="field">
                      <label>Party size</label>
                      <div className="qty" style={{ width: "fit-content" }}>
                        <button onClick={() => setWalkInForm({ ...walkInForm, party: Math.max(1, (walkInForm.party || 1) - 1) })}><Minus size={17} /></button>
                        <span>{walkInForm.party || 1}</span>
                        <button onClick={() => setWalkInForm({ ...walkInForm, party: Math.min(20, (walkInForm.party || 1) + 1) })}><Plus size={17} /></button>
                      </div>
                    </div>
                    <div className="field" style={{ flex: 1, minWidth: 220 }}>
                      <label>Payment method</label>
                      <div className="pay-toggle">
                        <button className={walkInForm.payment === "cash" ? "on" : ""} onClick={() => setWalkInForm({ ...walkInForm, payment: "cash" })}>Cash / Check / Square</button>
                        <button className={walkInForm.payment === "card" ? "on" : ""} onClick={() => setWalkInForm({ ...walkInForm, payment: "card" })}><CreditCard size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />Card (Stripe)</button>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 14, paddingTop: 4 }}>
                    <div>
                      <span style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 600 }}>{money(walkInTotal)}</span>
                      <span style={{ color: "var(--inkSoft)", fontSize: 13, marginLeft: 8 }}>{walkInForm.party || 1} × {money(TICKET.price)}</span>
                    </div>
                    {walkInForm.payment === "cash" ? (
                      <button className="btn btn-p" onClick={addCashWalkIn} disabled={walkInLoading}>
                        <UserPlus size={16} />{walkInLoading ? "Adding…" : "Add & Check In"}
                      </button>
                    ) : (
                      <button className="btn btn-p" onClick={addCardWalkIn} disabled={walkInLoading || !STRIPE_CONFIG.liveMode}>
                        <CreditCard size={16} />{walkInLoading ? "Redirecting…" : `Charge ${money(walkInTotal)} via Stripe`}
                      </button>
                    )}
                  </div>

                  {walkInForm.payment === "card" && !STRIPE_CONFIG.liveMode && (
                    <div className="stripe-note"><b>Simulation mode:</b> Set <code>liveMode: true</code> and add your Stripe keys to enable live card payments for walk-ins.</div>
                  )}

                  {walkInMsg && (
                    <div className="door-flash" style={{ margin: 0 }}><CheckCircle2 size={17} />{walkInMsg}</div>
                  )}
                </div>

                {/* Walk-in list */}
                {walkIns.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>Walk-ins added this session ({walkIns.length})</div>
                    <div style={{ background: "var(--paper)", border: "1.5px solid var(--line)", borderRadius: 14, overflow: "hidden", padding: "0 18px" }}>
                      {walkIns.map((w, i) => (
                        <div className="walkin-row" key={i}>
                          <CheckCircle2 size={16} color="var(--ok)" />
                          <div style={{ flex: 1 }}>
                            <span style={{ fontWeight: 700 }}>{w.name}</span>
                            <span style={{ color: "var(--inkSoft)", marginLeft: 8 }}>Party of {w.party}</span>
                            {w.phone && <span style={{ color: "var(--inkSoft)", marginLeft: 8 }}>{w.phone}</span>}
                          </div>
                          <span className={`badge-s ${w.payment === "card" ? "b-onl" : "b-comp"}`}>{w.payment === "card" ? "Card" : "Cash"}</span>
                          <span style={{ fontWeight: 700 }}>{money(w.amount)}</span>
                          <span style={{ color: "var(--inkSoft)", fontSize: 12, whiteSpace: "nowrap" }}>{w.time}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ---------- ORGANIZER ---------- */
  if (view === "admin") {
    const dotColor = dbState === "live" ? "var(--ok)" : dbState === "offline" ? "var(--warn)" : "#9DB3A8";
    return (
      <div className="mrd"><Styles /><UtilBar />
        <div className="wrap panel anim">
          <div className="section-h">Organizer</div>
          <h2 className="section-t mrd-serif">{EVENT.name} — Registrants</h2>
          <p className="section-d">Live from Supabase (yellow-kite). Enter the organizer passcode to load the roster.</p>

          {IS_DEMO && (
            <div style={{background:"#B9842B",color:"#fff",borderRadius:10,padding:"10px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:10,fontWeight:600,fontSize:14}}>
              <AlertTriangle size={16}/> DEMO MODE — Sample data only. No real data is shown or saved.
            </div>
          )}
          {!IS_DEMO && <div className="dbbar">
            <Database size={17} color="var(--pine)" />
            <span className="dot" style={{ background: dotColor }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{dbState === "live" ? "Connected" : dbState === "offline" ? "Offline (local)" : "Not loaded"}</span>
            <input className="inp pwd" type="password" placeholder="Organizer passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
            <button className="btn btn-p" style={{ padding: "11px 18px" }} onClick={loadRoster} disabled={dbState === "loading"}>
              <RefreshCw size={15} /> {dbState === "loading" ? "Loading…" : "Load roster"}
            </button>
          </div>}
          {!IS_DEMO && dbMsg && <p style={{ fontSize: 12.5, color: dbState === "offline" ? "var(--warn)" : "var(--ok)", margin: "-8px 0 18px", display: "flex", alignItems: "center", gap: 7 }}>{dbState === "offline" && <AlertTriangle size={14} />}{dbMsg}</p>}

          <div className="stats">
            <div className="stat"><div className="n">{roster.length}</div><div className="l">Registrations</div></div>
            <div className="stat"><div className="n">{totalGuests}</div><div className="l">Total guests</div></div>
            <div className="stat"><div className="n">{checkedIn}</div><div className="l">Checked in</div></div>
            <div className="stat"><div className="n">{money(revenue).replace(".00", "")}</div><div className="l">Revenue</div></div>
          </div>

          <div className="importbox">
            <div style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 700, fontSize: 15, marginBottom: 4 }}><Upload size={17} color="var(--pine)" /> Import prior registrants from Jotform</div>
            <p style={{ fontSize: 13, color: "var(--inkSoft)", margin: "0 0 12px" }}>Paste your Jotform export (CSV with a header row, or a JSON array). Matching rows are written to Supabase.</p>
            <textarea value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={'First Name,Last Name,Email,Phone Number,Quantity\nJohn,Boudreaux,john@example.com,(337) 555-0199,2'} />
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 12 }}>
              <button className="btn btn-p" onClick={runImport}><Upload size={16} /> Import</button>
              {importMsg && <span style={{ fontSize: 13, color: "var(--ok)", fontWeight: 600 }}>{importMsg}</span>}
            </div>
          </div>

          <div className="rtools" style={{justifyContent:"space-between"}}>
            <div className="searchbox"><Search size={16} color="var(--inkSoft)" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone…" /></div>
            <button className="org-btn" style={{display:"inline-flex",alignItems:"center",gap:6,fontFamily:"inherit",fontWeight:700,fontSize:13,padding:"8px 14px",borderRadius:9,cursor:"pointer",border:"1.5px solid #2d5a42",background:"transparent",color:"#2d5a42"}} onClick={() => {
              const hdr = ["Bidder #","First Name","Last Name","Full Name","Ranch / Company","Sponsor","Email","Phone","Party Size","Status","Source","Amount Paid","Checked In"];
              const rows = roster.map((p) => { const parts = (p.name||"").trim().split(/\s+/); const first = parts[0]||""; const last = parts.slice(1).join(" ")||""; return [p.bidderNumber||"", first, last, p.name||"", p.ranch||"", p.sponsorName||"", p.email||"", p.phone||"", p.party||1, p.status||"", p.source||"", p.amount||0, p.checkedIn?"Yes":"No"]; });
              downloadCsv("registrants-2026.csv",[hdr,...rows]);
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export CSV
            </button>
          </div>

          <table className="tbl">
            <thead><tr><th>Bidder #</th><th>First Name</th><th>Last Name</th><th>Ranch / Company</th><th>Sponsor</th><th>Email</th><th>Phone</th><th>Party</th><th>Status</th><th>Check-in</th><th></th></tr></thead>
            <tbody>
              {filtered.map((p, i) => {
                const { first, last } = splitName(p.name);
                const ranch = p.ranch || p.notes || "—";
                const inpStyle = { fontFamily: "inherit", fontSize: 12.5, padding: "5px 7px", border: "1.5px solid var(--line)", borderRadius: 8, width: "100%", minWidth: 90 };
                return (
                  <tr key={p.id || i}>
                    <td><input style={{ fontFamily: "inherit", fontSize: 13, fontWeight: 700, width: 64, padding: "5px 7px", border: "1.5px solid var(--line)", borderRadius: 8, textAlign: "center" }} value={p.bidderNumber || ""} placeholder="—" onChange={(e) => setRoster((r) => r.map((x) => x.id === p.id ? { ...x, bidderNumber: e.target.value } : x))} onBlur={(e) => saveBidderNumber(p, e.target.value)} /></td>
                    <td style={{ fontWeight: 700 }}>{first}</td>
                    <td style={{ fontWeight: 700 }}>{last}</td>
                    <td style={{ color: "var(--inkSoft)" }}>{ranch}</td>
                    <td>
                      <select style={{ fontFamily: "inherit", fontSize: 12.5, padding: "5px 7px", border: "1.5px solid var(--line)", borderRadius: 8, background: "#fff", color: "var(--ink)", minWidth: 130 }}
                        value={p.sponsorId || ""}
                        onChange={(e) => saveSponsor(p, e.target.value || null)}>
                        <option value="">— None —</option>
                        {sponsors.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                    </td>
                    <td style={{ color: "var(--inkSoft)", fontSize: 12.5 }}>{p.email}</td>
                    <td><input style={inpStyle} value={p.phone || ""} placeholder="—" onChange={(e) => setRoster((r) => r.map((x) => x.id === p.id ? { ...x, phone: e.target.value } : x))} onBlur={(e) => savePhone(p, e.target.value)} /></td>
                    <td>{p.party || 1}</td>
                    <td><span className={`badge-s ${p.status === "Paid" ? "b-paid" : "b-pend"}`}>{p.status}</span></td>
                    <td><button className={`ci ${p.checkedIn ? "on" : ""}`} onClick={() => toggleCheckIn(p)}>{p.checkedIn ? <CheckCircle2 size={18} /> : <Circle size={18} />}{p.checkedIn ? "In" : "Check in"}</button></td>
                    <td><button className="ci" style={{ color: "#b4471f" }} onClick={() => deleteRegistrant(p)}><Trash2 size={16} /></button></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={11} style={{ textAlign: "center", color: "var(--inkSoft)", padding: 30 }}>No registrants match "{search}".</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  /* ---------- HERO ---------- */
  if (step === -1) {
    return (
      <div className="mrd"><Styles /><UtilBar />
        <header className="hero"><div className="grain" /><div className="wrap hero-in">
          {EVENT.logoUrl && <img src={EVENT.logoUrl} alt={`${EVENT.org} logo`} style={{ maxHeight: 64, maxWidth: 220, marginBottom: 16, display: "block" }} />}
          <div className="eyebrow">{EVENT.org}</div>
          <h1 className="mrd-serif">{EVENT.name}</h1>
          <p className="hero-sub">{EVENT.tagline}</p>
          <div className="meta"><div><Calendar size={17} /> {EVENT.dateLabel}</div><div><MapPin size={17} /> {EVENT.venue}, {EVENT.city}</div></div>
          <button className="cta" onClick={() => setStep(0)}>Register now <ChevronRight size={18} /></button>
          <div className="price-from">{money(TICKET.price).replace(".00", "")} per person</div>
        </div></header>
      </div>
    );
  }

  /* ---------- CONFIRMATION ---------- */
  if (step === 3) {
    const a = attendees[0];
    const token = ticket?.token || null;
    return (
      <div className="mrd"><Styles /><UtilBar />
        <div className="wrap"><div className="conf anim">
          <div className="badge"><Check size={36} strokeWidth={3} /></div>
          <h2 className="mrd-serif">You're in!</h2>
          <p>A confirmation is headed to <b>{a.email || "your inbox"}</b>. This QR code is your ticket — show it at the door.</p>
          <div className="ticket">
            <div className="stub">
              {token
                ? <TicketQR value={token} />
                : <div style={{ width: 116, height: 116, borderRadius: 10, background: "rgba(255,255,255,.12)", display: "grid", placeItems: "center", fontSize: 11.5, color: "#A9C0B5", textAlign: "center", padding: 10 }}>Preparing your ticket…</div>}
              <div className="conf-code">{confCode}</div>
            </div>
            <div className="body">
              <div className="row"><span className="k">Event</span><span className="v">{EVENT.name}</span></div>
              <div className="row"><span className="k">Name</span><span className="v">{ticket?.name || `${a.firstName} ${a.lastName}`.trim() || "—"}</span></div>
              <div className="row"><span className="k">Party of</span><span className="v">{ticket?.party || qty}</span></div>
              <div className="row"><span className="k">Total paid</span><span className="v">{total > 0 ? money(total) : "Paid"}</span></div>
            </div>
          </div>
          {token && (
            <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 20 }}>
              {walletAvail.apple && <a className="btn btn-p" style={{ textDecoration: "none" }} href={`/api/wallet-pass?token=${encodeURIComponent(token)}`}>Add to Apple Wallet</a>}
              {walletAvail.google && <a className="btn btn-p" style={{ textDecoration: "none" }} href={`/api/google-wallet?token=${encodeURIComponent(token)}`}>Add to Google Wallet</a>}
              <a className="btn btn-g" style={{ textDecoration: "none" }} href={`/?ticket=${encodeURIComponent(token)}`}>Open my ticket page</a>
            </div>
          )}
        </div></div>
      </div>
    );
  }

  /* ---------- WIZARD ---------- */
  const STEPS = ["Tickets", "Guests", "Checkout"];
  return (
    <div className="mrd"><Styles /><OrganizerNav /><UtilBar />
      <div className="stepbar"><div className="wrap steps">
        {STEPS.map((l, i) => (<div key={l} className={`stp ${i === step ? "active" : i < step ? "done" : ""}`}><span className="num">{i < step ? <Check size={13} strokeWidth={3} /> : i + 1}</span>{l}</div>))}
      </div></div>

      <div className="wrap panel"><div className="grid">
        <div key={step} className="anim">

          {step === 0 && (<>
            <div className="section-h">Step 1</div>
            <h2 className="section-t mrd-serif">How many are coming?</h2>
            <p className="section-d">One ticket covers admission, the boil, and the festivities.</p>
            <div className="pkg">
              <div className="ic"><Users size={26} /></div>
              <div><div className="pname mrd-serif">{TICKET.name}</div><div style={{ fontSize: 13, color: "var(--inkSoft)", marginTop: 2 }}>All-inclusive admission</div></div>
              <div className="pprice mrd-serif">{money(TICKET.price).replace(".00", "")}<span> / person</span></div>
            </div>
            <div className="qtybar">
              <div style={{ fontWeight: 700, fontSize: 15 }}>Number of tickets</div>
              <div className="qty"><button onClick={() => setQty(qty - 1)} disabled={qty <= 1}><Minus size={17} /></button><span>{qty}</span><button onClick={() => setQty(qty + 1)}><Plus size={17} /></button></div>
            </div>
            <div className="dona">
              <div className="dona-h"><Heart size={17} color="var(--gold)" /> Add a donation to {EVENT.orgShort} <span style={{ fontWeight: 500, color: "var(--inkSoft)", fontSize: 13 }}>(optional)</span></div>
              <div className="dchips">
                {SUGGESTED_DONATIONS.map((d) => <button key={d} className={`dchip ${donation === d && !donationCustom ? "on" : ""}`} onClick={() => pickDonation(d)}>{money(d).replace(".00", "")}</button>)}
                <button className={`dchip ${donation === 0 && !donationCustom ? "on" : ""}`} onClick={() => pickDonation(0)}>None</button>
                <input className="inp" style={{ width: 130 }} placeholder="Custom $" inputMode="numeric" value={donationCustom} onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ""); setDonationCustom(v); setDonation(Number(v) || 0); }} />
              </div>
            </div>
          </>)}

          {step === 1 && (<>
            <div className="section-h">Step 2</div>
            <h2 className="section-t mrd-serif">Who's in your party?</h2>
            <p className="section-d">We just need the lead registrant's contact info. Add names for the rest if you'd like.</p>
            {attendees.map((a, i) => (
              <div className="attblock" key={i}>
                <div className="atth"><div className="who"><Users size={16} /> {i === 0 ? "Lead registrant" : `Guest ${i}`}{i === 0 && <span className="pill">Contact</span>}</div>{i > 0 && <button className="linkbtn" onClick={() => removeAtt(i)}><Trash2 size={14} /> Remove</button>}</div>
                <div style={{ padding: 18, display: "grid", gap: 14 }}>
                  <div className="frow">
                    <div className="field"><label>First name {i === 0 && <span className="req">*</span>}</label><input className={`inp ${errors[`${i}-firstName`] ? "err" : ""}`} value={a.firstName} onChange={(e) => updateAtt(i, "firstName", e.target.value)} placeholder="Jean" /></div>
                    <div className="field"><label>Last name {i === 0 && <span className="req">*</span>}</label><input className={`inp ${errors[`${i}-lastName`] ? "err" : ""}`} value={a.lastName} onChange={(e) => updateAtt(i, "lastName", e.target.value)} placeholder="Boudreaux" /></div>
                  </div>
                  {i === 0 && (
                    <div className="frow">
                      <div className="field"><label>Email <span className="req">*</span></label><input className={`inp ${errors["0-email"] ? "err" : ""}`} value={a.email} onChange={(e) => updateAtt(0, "email", e.target.value)} placeholder="jean@example.com" />{errors["0-email"] && <span className="errtxt">Enter a valid email.</span>}</div>
                      <div className="field"><label>Phone</label><input className="inp" value={a.phone} onChange={(e) => updateAtt(0, "phone", e.target.value)} placeholder="(337) 555-0123" /></div>
                    </div>
                  )}
                  {i === 0 && (
                    <div className="field"><label>Ranch / Company</label><input className="inp" value={a.ranch} onChange={(e) => updateAtt(0, "ranch", e.target.value)} placeholder="Bayou Ranch" /></div>
                  )}
                  <div className="field"><label>Notes / dietary</label><input className="inp" value={a.notes} onChange={(e) => updateAtt(i, "notes", e.target.value)} placeholder="Allergies, seating requests…" /></div>
                </div>
              </div>
            ))}
            <button className="btn btn-g" style={{ width: "100%", justifyContent: "center" }} onClick={() => setQty(qty + 1)}><UserPlus size={17} /> Add another guest</button>
          </>)}

          {step === 2 && (<>
            <div className="section-h">Step 3</div>
            <h2 className="section-t mrd-serif">Payment</h2>
            <p className="section-d">Secure checkout powered by Stripe.</p>
            <div className="card" style={{ display: "grid", gap: 16 }}>
              <div className="field"><label>Name on card <span className="req">*</span></label><input className={`inp ${errors.name ? "err" : ""}`} value={pay.name} onChange={(e) => setPay({ ...pay, name: e.target.value })} placeholder="Jean Boudreaux" /></div>
              <div className="field"><label>Card number <span className="req">*</span></label><input className={`inp ${errors.card ? "err" : ""}`} value={pay.card} onChange={(e) => setPay({ ...pay, card: e.target.value.replace(/[^\d]/g, "").replace(/(.{4})/g, "$1 ").trim().slice(0, 19) })} placeholder="4242 4242 4242 4242" inputMode="numeric" /></div>
              <div className="frow">
                <div className="field"><label>Expiry <span className="req">*</span></label><input className={`inp ${errors.exp ? "err" : ""}`} value={pay.exp} onChange={(e) => { let v = e.target.value.replace(/[^\d]/g, "").slice(0, 4); if (v.length > 2) v = v.slice(0, 2) + " / " + v.slice(2); setPay({ ...pay, exp: v }); }} placeholder="MM / YY" inputMode="numeric" /></div>
                <div className="field"><label>CVC <span className="req">*</span></label><input className={`inp ${errors.cvc ? "err" : ""}`} value={pay.cvc} onChange={(e) => setPay({ ...pay, cvc: e.target.value.replace(/[^\d]/g, "").slice(0, 4) })} placeholder="123" inputMode="numeric" /></div>
              </div>
              <div className="secure"><ShieldCheck size={15} /> Card details are handled by Stripe and never touch your server.</div>
              {errors.stripe && <span className="errtxt">{errors.stripe}</span>}
              <div className="stripe-note"><b>Wiring:</b> {STRIPE_CONFIG.liveMode ? "Stripe live — Pay redirects to Checkout; the webhook records the paid registrant in Supabase." : "Simulation mode (no charge). The registrant is written to Supabase on confirm. Add your Stripe keys + flip liveMode to true for real payments."}</div>
            </div>
          </>)}

          <div className="nav">
            {step > 0 ? <button className="btn btn-g" onClick={back}><ChevronLeft size={17} /> Back</button> : <span />}
            {step < 2 ? <button className="btn btn-p" onClick={next}>Continue <ChevronRight size={17} /></button> : <button className="btn btn-p" onClick={handlePay}><Lock size={16} /> Pay {money(total)}</button>}
          </div>
        </div>

        <aside className="sum">
          <div className="sum-h"><div className="evt mrd-serif">{EVENT.name}</div><div className="dt">{EVENT.dateLabel} · {EVENT.city}</div></div>
          <div className="sum-b">
            {lineItems.map((li, i) => (<div className="li" key={i}><div><span>{li.name}</span><br /><span className="sub">{li.sub}</span></div><div className="amt">{money(li.amount)}</div></div>))}
            <div className="sum-div" />
            <div className="total"><span className="lbl">Total</span><span className="val mrd-serif">{money(total)}</span></div>
          </div>
        </aside>
      </div></div>
    </div>
  );
}
