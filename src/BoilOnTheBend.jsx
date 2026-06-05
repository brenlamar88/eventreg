import React, { useState, useMemo, useEffect } from "react";
import {
  Calendar, MapPin, Check, ChevronRight, ChevronLeft, Users, Plus, Minus,
  ShieldCheck, Lock, Trash2, UserPlus, Search, CheckCircle2, Circle,
  Upload, Heart, LayoutGrid, Ticket, Database, RefreshCw, AlertTriangle,
  ScanLine, CreditCard, FileText,
} from "lucide-react";

/* ============================================================================
   1. EVENT CONFIG
   ========================================================================== */
const EVENT = {
  name: "Boil on the Bend",          // ← if spelled "Boyle," change this one line
  org: "Exotic Wildlife Association of Louisiana",
  tagline: "An evening on the bayou — crawfish, cold drinks, and good company in support of EWA-LA.",
  dateLabel: "Saturday · Date TBD",
  venue: "On the Bend",
  city: "Louisiana",
};
const TICKET = { id: "boil85", name: "Boil on the Bend — Admission", price: 85 };
const SUGGESTED_DONATIONS = [25, 50, 100];

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
const dbRowToUI = (r) => ({
  id: r.id, name: r.name, email: r.email, phone: r.phone, party: r.party,
  source: r.source, status: r.status, amount: Number(r.amount) || 0,
  checkedIn: r.checked_in, date: (r.created_at || "").slice(0, 10),
  notes: r.notes || null, ranch: r.ranch || null,
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
  { name: "Sample — load from DB", email: "guest1@example.com", phone: "(337) 555-0101", party: 2, source: "Jotform", status: "Paid", amount: 170, checkedIn: false, date: "2026-05-01" },
];

const money = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
    .hero{position:relative;overflow:hidden;color:#F4EFE6;background:radial-gradient(120% 90% at 12% 0%,#1c5340 0%,rgba(18,60,46,0) 55%),radial-gradient(120% 120% at 100% 0%,#0a261c 0%,rgba(10,38,28,0) 60%),linear-gradient(160deg,#123C2E,#0C2A20);}
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

function CheckinQR({ value, size = 116 }) {
  const grid = useMemo(() => {
    const cells = 25; let seed = 7;
    for (let i = 0; i < value.length; i++) seed = (seed * 31 + value.charCodeAt(i)) >>> 0;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const fin = (r, c) => [[0, 0], [0, cells - 7], [cells - 7, 0]].some(([zr, zc]) => r >= zr && r < zr + 7 && c >= zc && c < zc + 7);
    const m = []; for (let r = 0; r < cells; r++) { const row = []; for (let c = 0; c < cells; c++) row.push(!fin(r, c) && rnd() > 0.52); m.push(row); } return m;
  }, [value]);
  const cells = 25, u = size / cells;
  const F = (x, y) => (<g key={`f${x}${y}`}><rect x={x * u} y={y * u} width={7 * u} height={7 * u} fill="#0C2A20" /><rect x={(x + 1) * u} y={(y + 1) * u} width={5 * u} height={5 * u} fill="#fff" /><rect x={(x + 2) * u} y={(y + 2) * u} width={3 * u} height={3 * u} fill="#0C2A20" /></g>);
  return (<svg width={size} height={size} style={{ background: "#fff", borderRadius: 10, padding: 6 }}>{grid.map((row, r) => row.map((on, c) => on ? <rect key={`${r}-${c}`} x={c * u} y={r * u} width={u} height={u} fill="#0C2A20" /> : null))}{F(0, 0)}{F(cells - 7, 0)}{F(0, cells - 7)}</svg>);
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

  const [roster, setRoster] = useState(SAMPLE_ROSTER);
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

  const qty = attendees.length;
  const ticketsTotal = qty * TICKET.price;
  const total = ticketsTotal + (Number(donation) || 0);
  const lineItems = useMemo(() => {
    const items = [{ name: TICKET.name, sub: `${qty} × ${money(TICKET.price)}`, amount: ticketsTotal }];
    if (donation > 0) items.push({ name: "Donation to EWA-LA", sub: "Thank you!", amount: Number(donation) });
    return items;
  }, [qty, ticketsTotal, donation]);

  /* handle Stripe redirect return (live mode) */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
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
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    const row = {
      name: `${a.firstName} ${a.lastName}`.trim(), email: a.email, phone: a.phone,
      party: qty, source: "Online", status: "Paid", amount: total, notes: a.notes || null, ranch: a.ranch || null,
    };
    try { await dbInsert(row); } catch (err) { console.warn("DB write skipped:", err.message); }
    setRoster((r) => [{ ...row, checkedIn: false, date: new Date().toISOString().slice(0, 10) }, ...r]);
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
      const r = await fetch(ROSTER_ENDPOINT, { headers: { "x-organizer-key": pc } });
      if (!r.ok) throw new Error(r.status === 401 ? "Wrong passcode." : `Server returned ${r.status}.`);
      const rows = await r.json();
      setRoster(rows.map(dbRowToUI));
      setDbState("live"); setDbMsg(`Loaded ${rows.length} registrant${rows.length === 1 ? "" : "s"} from yellow-kite.`);
    } catch (err) {
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
    setRoster((r) => [...mapped, ...r]); setImportText("");
    setImportMsg(written ? `Imported ${mapped.length} registrants (${written} written to Supabase).` : `Added ${mapped.length} locally. Connect the live DB (deploy) to persist them.`);
  };

  const toggleCheckIn = async (idx) => {
    const target = roster[idx];
    setRoster((r) => r.map((p, i) => i === idx ? { ...p, checkedIn: !p.checkedIn } : p));
    if (target.id && passcode) {
      try {
        await fetch(ROSTER_ENDPOINT, { method: "PATCH", headers: { "Content-Type": "application/json", "x-organizer-key": passcode }, body: JSON.stringify({ id: target.id, checked_in: !target.checkedIn }) });
      } catch (err) { /* keep optimistic local state */ }
    }
  };

  const deleteRegistrant = async (idx) => {
    const target = roster[idx];
    if (!window.confirm(`Delete ${target.name}? This cannot be undone.`)) return;
    setRoster((r) => r.filter((_, i) => i !== idx));
    if (target.id && passcode) {
      try {
        await fetch(ROSTER_ENDPOINT, { method: "DELETE", headers: { "Content-Type": "application/json", "x-organizer-key": passcode }, body: JSON.stringify({ id: target.id }) });
      } catch (err) { /* keep optimistic local state */ }
    }
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

  /* ---------- DOOR CHECK-IN ---------- */
  if (view === "door") {
    const doorFiltered = doorSearch.trim().length >= 2
      ? roster.filter((p) => `${p.name} ${p.email} ${p.phone}`.toLowerCase().includes(doorSearch.toLowerCase()))
      : [];
    const walkInTotal = (walkInForm.party || 1) * TICKET.price;
    const doorCheckedIn = roster.filter((p) => p.checkedIn).length;

    const handleDoorUnlock = async () => {
      if (!passcode.trim()) return;
      sessionStorage.setItem("doorKey", passcode);
      setDoorUnlocked(true);
      await loadRoster(passcode);
    };

    const addCashWalkIn = async () => {
      if (!walkInForm.firstName.trim()) { setWalkInMsg("First name is required."); return; }
      setWalkInLoading(true);
      const fullName = `${walkInForm.firstName.trim()} ${walkInForm.lastName.trim()}`.trim();
      const row = {
        name: fullName, phone: walkInForm.phone.trim(), ranch: walkInForm.ranch.trim() || null,
        notes: walkInForm.ranch.trim() || null,
        party: walkInForm.party || 1, source: "Walk-in",
        status: "Paid", amount: walkInTotal, checked_in: true,
      };
      try { await dbInsert(row); } catch (err) { /* offline fallback */ }
      const uiRow = { ...row, checkedIn: true, date: new Date().toISOString().slice(0, 10), id: `wi-${Date.now()}` };
      setRoster((r) => [uiRow, ...r]);
      setWalkIns((w) => [{ ...row, payment: "cash", time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) }, ...w]);
      setWalkInForm({ firstName: "", lastName: "", ranch: "", phone: "", party: 1, payment: walkInForm.payment });
      setWalkInMsg(`${fullName} added and checked in!`);
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
                </div>

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
                        const idx = roster.indexOf(p);
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
                            <button
                              className={`door-ci-btn${p.checkedIn ? " done" : ""}`}
                              onClick={() => {
                                if (!p.checkedIn) {
                                  toggleCheckIn(idx);
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

          <div className="dbbar">
            <Database size={17} color="var(--pine)" />
            <span className="dot" style={{ background: dotColor }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>{dbState === "live" ? "Connected" : dbState === "offline" ? "Offline (local)" : "Not loaded"}</span>
            <input className="inp pwd" type="password" placeholder="Organizer passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
            <button className="btn btn-p" style={{ padding: "11px 18px" }} onClick={loadRoster} disabled={dbState === "loading"}>
              <RefreshCw size={15} /> {dbState === "loading" ? "Loading…" : "Load roster"}
            </button>
          </div>
          {dbMsg && <p style={{ fontSize: 12.5, color: dbState === "offline" ? "var(--warn)" : "var(--ok)", margin: "-8px 0 18px", display: "flex", alignItems: "center", gap: 7 }}>{dbState === "offline" && <AlertTriangle size={14} />}{dbMsg}</p>}

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

          <div className="rtools"><div className="searchbox"><Search size={16} color="var(--inkSoft)" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email, phone…" /></div></div>

          <table className="tbl">
            <thead><tr><th>First Name</th><th>Last Name</th><th>Ranch / Company</th><th>Contact</th><th>Party</th><th>Status</th><th>Check-in</th><th></th></tr></thead>
            <tbody>
              {filtered.map((p, i) => {
                const idx = roster.indexOf(p);
                const { first, last } = splitName(p.name);
                const ranch = p.ranch || p.notes || "—";
                return (
                  <tr key={p.id || i}>
                    <td style={{ fontWeight: 700 }}>{first}</td>
                    <td style={{ fontWeight: 700 }}>{last}</td>
                    <td style={{ color: "var(--inkSoft)" }}>{ranch}</td>
                    <td style={{ color: "var(--inkSoft)" }}>{p.email}<br /><span style={{ fontSize: 12 }}>{p.phone}</span></td>
                    <td>{p.party || 1}</td>
                    <td><span className={`badge-s ${p.status === "Paid" ? "b-paid" : "b-pend"}`}>{p.status}</span></td>
                    <td><button className={`ci ${p.checkedIn ? "on" : ""}`} onClick={() => toggleCheckIn(idx)}>{p.checkedIn ? <CheckCircle2 size={18} /> : <Circle size={18} />}{p.checkedIn ? "In" : "Check in"}</button></td>
                    <td><button className="ci" style={{ color: "#b4471f" }} onClick={() => deleteRegistrant(idx)}><Trash2 size={16} /></button></td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={8} style={{ textAlign: "center", color: "var(--inkSoft)", padding: 30 }}>No registrants match "{search}".</td></tr>}
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
    return (
      <div className="mrd"><Styles /><UtilBar />
        <div className="wrap"><div className="conf anim">
          <div className="badge"><Check size={36} strokeWidth={3} /></div>
          <h2 className="mrd-serif">You're in!</h2>
          <p>A confirmation is headed to <b>{a.email || "your inbox"}</b>. Show this code at the door.</p>
          <div className="ticket">
            <div className="stub"><CheckinQR value={confCode} /><div className="conf-code">{confCode}</div></div>
            <div className="body">
              <div className="row"><span className="k">Event</span><span className="v">{EVENT.name}</span></div>
              <div className="row"><span className="k">Name</span><span className="v">{`${a.firstName} ${a.lastName}`.trim() || "—"}</span></div>
              <div className="row"><span className="k">Party of</span><span className="v">{qty}</span></div>
              <div className="row"><span className="k">Total paid</span><span className="v">{money(total)}</span></div>
            </div>
          </div>
        </div></div>
      </div>
    );
  }

  /* ---------- WIZARD ---------- */
  const STEPS = ["Tickets", "Guests", "Checkout"];
  return (
    <div className="mrd"><Styles /><UtilBar />
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
              <div className="dona-h"><Heart size={17} color="var(--gold)" /> Add a donation to EWA-LA <span style={{ fontWeight: 500, color: "var(--inkSoft)", fontSize: 13 }}>(optional)</span></div>
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
