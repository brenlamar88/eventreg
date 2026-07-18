import React, { useState, useMemo, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  Check, DollarSign, FileText, Truck, Receipt, Landmark, Printer,
  CheckCircle2, Circle, Plus, Trash2, Users, Settings, Database, RefreshCw, AlertTriangle, Pencil, X, CreditCard, Download,
} from "lucide-react";
import OrganizerNav from "./OrganizerNav.jsx";
import { DEMO_LOTS, DEMO_PEOPLE, DEMO_REGISTRANTS, DEMO_SPONSORS, DEMO_LOT_FEE } from "./demoData.js";

const IS_DEMO = new URLSearchParams(window.location.search).get("demo") === "true";

/* ============================================================================
   BUSINESS RULES
   - Commission: <= $5,000 → 11% · $5,001–$9,999 → 10% · >= $10,000 → 9%
   - Lot fee: a SINGLE event-wide value (default $50), stored in event_settings.
   - Net per lot = amount − commission − lot fee   (the check amount)
   - Donated lots (100% to EWA): no fee, no commission, net $0
   - Pay a consignor only AFTER the signed delivery form is received.
   ========================================================================== */
function rateFor(amt) { if (amt >= 10000) return 0.09; if (amt > 5000) return 0.10; return 0.11; }
function calc(lot, eventFee) {
  if (lot.donated) return { rate: 0, fee: 0, commission: 0, net: 0 };
  if (lot.category === "Grand Auction") { const fee = Number(eventFee) || 0; return { rate: 0, fee, commission: 0, net: lot.amount - fee }; }
  const rate = rateFor(lot.amount);
  const commission = Math.round(lot.amount * rate * 100) / 100;
  const fee = Number(eventFee) || 0;
  return { rate, fee, commission, net: lot.amount - commission - fee };
}
const money = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
const display = (name, ranch) => ranch ? `${name} — ${ranch}` : name;
const CATEGORIES = ["Elite Registry", "Exotic Conservation", "Grand Auction", "Raffle", "Golf", "Fuller Family", "Donated"];

function csvEsc(v) { const s = v == null ? "" : String(v); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; }
function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map(csvEsc).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

/* ---- data layer (yellow-kite via same-origin API; falls back to local) ---- */
const dbLotToUI = (r) => ({
  id: r.id, lotNo: r.lot_no, description: r.description || "",
  category: r.auction_category || (r.donated ? "Donated" : ""),
  saleType: r.sale_type || "Live",
  consignorName: r.consignor_name || "", consignorRanch: r.consignor_ranch || "",
  buyerName: r.buyer_name || "", buyerRanch: r.buyer_ranch || "",
  consignor: display(r.consignor_name || "(unnamed)", r.consignor_ranch || ""),
  buyer: r.buyer_name ? display(r.buyer_name, r.buyer_ranch || "") : "—",
  amount: Number(r.amount) || 0, amountPaid: Number(r.amount_paid) || 0, donated: !!r.donated,
  delivered: !!r.delivered, checkNo: r.check_no || "", checkDate: r.check_date || "",
  buyerPaid: !!r.buyer_paid, paymentMethod: r.payment_method || "cash",
});

const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
    :root{--bone:#F4EFE6;--bone2:#EBE3D4;--paper:#FBF8F2;--ink:#1B1915;--inkSoft:#5C564C;
      --pine:#123C2E;--pine2:#0C2A20;--pineLine:#23604A;--gold:#B9842B;--goldSoft:#E2C282;
      --line:#DCD2C0;--ok:#2E7D5B;--warn:#A9601C;}
    *{box-sizing:border-box}
    .ewa{font-family:'Hanken Grotesk',ui-sans-serif,system-ui;color:var(--ink);background:var(--bone);min-height:100vh;-webkit-font-smoothing:antialiased;}
    .serif{font-family:'Fraunces',Georgia,serif;}
    .wrap{max-width:1180px;margin:0 auto;padding:0 22px;}
    .head{background:linear-gradient(160deg,#123C2E,#0C2A20);color:#EAF1EC;}
    .head-in{padding:30px 0 0;}
    .eyebrow{font-size:11.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--goldSoft);font-weight:600;}
    .head h1{font-family:'Fraunces',serif;font-size:34px;font-weight:600;margin:8px 0 0;letter-spacing:-.01em;}
    .head .sub{color:#A9C0B5;font-size:14px;margin-top:4px;}
    .tabs{display:flex;gap:4px;margin-top:22px;flex-wrap:wrap;}
    .tab{font-family:inherit;border:none;background:transparent;color:#9DB3A8;font-weight:600;font-size:14px;padding:11px 18px;border-radius:11px 11px 0 0;cursor:pointer;display:flex;align-items:center;gap:8px;}
    .tab.on{background:var(--bone);color:var(--pine);}
    .panel{padding:24px 0 90px;}
    .settings{background:var(--paper);border:1.5px solid var(--line);border-radius:14px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:18px;flex-wrap:wrap;}
    .settings label{font-size:12.5px;font-weight:700;color:#4a463d;display:flex;align-items:center;gap:7px;}
    .feein{font-family:'Fraunces',serif;font-size:18px;font-weight:600;width:110px;padding:9px 12px;border:1.5px solid var(--line);border-radius:10px;background:#fff;color:var(--pine);outline:none;}
    .feein:focus{border-color:var(--pine);}
    .tiers{font-size:12px;color:var(--inkSoft);}
    .dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:6px;}
    .pwd{font-family:inherit;font-size:13px;padding:8px 11px;border:1.5px solid var(--line);border-radius:9px;background:#fff;outline:none;width:150px;}
    .btn{font-family:inherit;font-weight:700;font-size:13.5px;border-radius:10px;cursor:pointer;padding:9px 15px;display:inline-flex;align-items:center;gap:8px;border:1.5px solid transparent;background:var(--pine);color:#fff;}
    .btn:hover{background:var(--pine2);}
    .btn.ghost{background:transparent;color:var(--pine);border-color:var(--line);}
    .btn.ghost:hover{border-color:var(--pine);}
    .cards{display:grid;grid-template-columns:repeat(5,1fr);gap:13px;margin-bottom:22px;}
    @media(max-width:900px){.cards{grid-template-columns:repeat(2,1fr);}}
    .kpi{background:var(--paper);border:1.5px solid var(--line);border-radius:14px;padding:15px 16px;}
    .kpi .l{font-size:11px;color:var(--inkSoft);text-transform:uppercase;letter-spacing:.07em;font-weight:600;display:flex;align-items:center;gap:6px;}
    .kpi .n{font-family:'Fraunces',serif;font-size:24px;font-weight:600;margin-top:6px;}
    .kpi.accent{background:var(--pine);color:#fff;border-color:var(--pine);}
    .kpi.accent .l{color:var(--goldSoft);} .kpi.accent .n{color:#fff;}
    .addcard{background:var(--paper);border:1.5px solid var(--line);border-radius:16px;padding:20px;margin-bottom:22px;}
    .addhdr{font-family:'Fraunces',serif;font-size:17px;font-weight:600;display:flex;align-items:center;gap:9px;margin-bottom:14px;}
    .fgrid{display:grid;grid-template-columns:repeat(12,1fr);gap:12px;}
    .f{display:flex;flex-direction:column;gap:5px;}
    .f label{font-size:11.5px;font-weight:600;color:#4a463d;}
    .f input,.f select{font-family:inherit;font-size:13.5px;padding:9px 11px;border:1.5px solid var(--line);border-radius:9px;background:#fff;color:var(--ink);outline:none;width:100%;}
    .f input:focus,.f select:focus{border-color:var(--pine);}
    .span2{grid-column:span 2;} .span3{grid-column:span 3;} .span4{grid-column:span 4;} .span6{grid-column:span 6;}
    @media(max-width:760px){.span2,.span3,.span4,.span6{grid-column:span 6;}}
    .chkrow{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#4a463d;}
    .hint{font-size:12px;color:var(--inkSoft);margin-top:10px;display:flex;align-items:center;gap:7px;}
    .tbl{width:100%;border-collapse:collapse;background:var(--paper);border:1.5px solid var(--line);border-radius:13px;overflow:hidden;font-size:13px;}
    .tbl th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--inkSoft);font-weight:700;padding:11px 12px;background:var(--bone2);border-bottom:1.5px solid var(--line);}
    .tbl td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle;}
    .tbl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
    .tbl .lot{font-weight:700;font-family:'Fraunces',serif;}
    .grp2{background:#eef1ea;} .grp2 td{font-family:'Fraunces',serif;font-weight:600;font-size:14px;color:var(--pine);padding:12px;}
    .sub td{background:#f6f3ec;font-weight:700;} .sub td.num{color:var(--pine);}
    .net{font-weight:700;color:var(--pine);}
    .donated{color:var(--inkSoft);font-style:italic;}
    .badge{font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;}
    .b-wait{background:#f6ece0;color:var(--warn);} .b-ready{background:#e7eef0;color:#2a5560;} .b-paid{background:#e4f0e9;color:var(--ok);}
    .ci{background:none;border:none;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit;font-weight:600;font-size:12.5px;color:var(--inkSoft);}
    .ci.on{color:var(--ok);}
    .mini{font-family:inherit;font-size:12.5px;padding:6px 8px;border:1.5px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);outline:none;width:90px;}
    .mini:focus{border-color:var(--pine);} .mini:disabled{background:#f0ece2;color:#aaa;cursor:not-allowed;}
    .buyer-in{font-family:inherit;font-size:12.5px;padding:6px 8px;border:1.5px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);outline:none;width:160px;}
    .buyer-in:focus{border-color:var(--pine);}
    .amt-in{font-family:inherit;font-size:12.5px;padding:6px 8px;border:1.5px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);outline:none;width:90px;text-align:right;}
    .amt-in:focus{border-color:var(--pine);}
    .trash{background:none;border:none;cursor:pointer;color:#a23b1c;}
    .edit-btn{background:none;border:none;cursor:pointer;color:var(--inkSoft);padding:2px;}
    .edit-btn:hover{color:var(--pine);}
    .pay-btn{font-family:inherit;font-size:11.5px;font-weight:700;padding:5px 10px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;gap:5px;border:1.5px solid var(--pine);background:var(--pine);color:#fff;}
    .pay-btn:hover{background:var(--pine2);}
    .pay-btn:disabled{opacity:.4;cursor:not-allowed;}
    .pmtog{display:inline-flex;border:1.5px solid var(--line);border-radius:8px;overflow:hidden;font-size:11.5px;font-weight:700;}
    .pmtog button{font-family:inherit;font-size:11.5px;font-weight:700;padding:4px 9px;border:none;cursor:pointer;background:#fff;color:var(--inkSoft);}
    .pmtog button.on{background:var(--pine);color:#fff;}
    .edit-row td{background:#f0f4f0;padding:14px 12px;border-bottom:2px solid var(--pine);}
    .edit-grid{display:grid;grid-template-columns:80px 1fr 160px 160px 100px 160px 100px 100px auto;gap:10px;align-items:end;}
    @media(max-width:1100px){.edit-grid{grid-template-columns:repeat(3,1fr);}}
    .grand{margin-top:18px;background:var(--pine);color:#EAF1EC;border-radius:14px;padding:18px 22px;display:grid;grid-template-columns:repeat(4,1fr);gap:14px;}
    @media(max-width:760px){.grand{grid-template-columns:repeat(2,1fr);}}
    .grand .l{font-size:11px;color:var(--goldSoft);text-transform:uppercase;letter-spacing:.08em;font-weight:600;}
    .grand .n{font-family:'Fraunces',serif;font-size:23px;font-weight:600;color:#fff;margin-top:4px;}
    .empty{background:var(--paper);border:1.5px dashed var(--line);border-radius:14px;padding:46px 20px;text-align:center;color:var(--inkSoft);}
    .empty .big{font-family:'Fraunces',serif;font-size:18px;color:var(--ink);margin-bottom:4px;}
    .bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;}
    .sel{font-family:inherit;font-size:14px;padding:10px 13px;border:1.5px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);outline:none;min-width:280px;}
    .ledger{background:var(--paper);border:1.5px solid var(--line);border-radius:16px;padding:26px;}
    .ledger .lh{display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;border-bottom:2px solid var(--pine);padding-bottom:14px;}
    .ledger .who{font-family:'Fraunces',serif;font-size:22px;font-weight:600;}
    .ledger .whosub{font-size:13px;color:var(--inkSoft);margin-top:2px;}
    .secLabel{font-family:'Fraunces',serif;font-weight:600;font-size:13px;color:var(--gold);text-transform:uppercase;letter-spacing:.08em;margin:18px 0 6px;}
    .totline{display:flex;justify-content:space-between;padding:7px 2px;font-size:14px;border-top:1px solid var(--line);}
    .totline.big{font-family:'Fraunces',serif;font-size:18px;font-weight:600;color:var(--pine);border-top:2px solid var(--pine);margin-top:4px;padding-top:12px;}
    @media print {
      @page { margin: 0; }
      body { margin: 15mm; }
      .head,.bar,.settings,.addcard,.btn,.OrganizerNav,nav,.hint{display:none !important;}
      .ewa{background:#fff;}
    }
  `}</style>
);

export default function AuctionSettlement() {
  const [tab, setTab] = useState("payments");
  const [eventFee, setEventFee] = useState(50);
  const [lots, setLots] = useState([]);
  const [people, setPeople] = useState([]);
  const [passcode, setPasscode] = useState("");
  const [db, setDb] = useState("idle");      // idle | loading | live | offline
  const [msg, setMsg] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [xlsxLoading, setXlsxLoading] = useState(false);
  const blankForm = { lotNo: "", description: "", category: "Elite Registry", saleType: "Live", consignorName: "", consignorRanch: "", buyerName: "", buyerRanch: "", amount: "", donated: false };
  const [form, setForm] = useState(blankForm);
  const [consignorSel, setConsignorSel] = useState("");
  const [buyerSel, setBuyerSel] = useState("");
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [grandFormErr, setGrandFormErr] = useState("");
  const [saleFilter, setSaleFilter] = useState("All");
  const setEF = (k, v) => setEditForm((p) => ({ ...p, [k]: v }));
  const startEdit = (l) => { setEditId(l.id); setEditForm({ lotNo: l.lotNo, description: l.description, category: l.category, saleType: l.saleType || "Live", consignorName: l.consignorName, consignorRanch: l.consignorRanch, donated: l.donated }); };
  const cancelEdit = () => { setEditId(null); setEditForm({}); };

  const connected = db === "live";
  const hdr = () => ({ "Content-Type": "application/json", "x-organizer-key": passcode });
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const findRanch  = (name) => (people.find((p) => p.name.toLowerCase() === name.toLowerCase()) || {}).ranch    || "";
  const findBidder = (name) => (people.find((p) => p.name.toLowerCase() === name.toLowerCase()) || {}).bidderNo || "";
  const findEmail  = (name) => (people.find((p) => p.name.toLowerCase() === name.toLowerCase()) || {}).email    || "";

  // Boot demo mode immediately — no passcode needed
  useEffect(() => {
    if (!IS_DEMO) return;
    setLots(DEMO_LOTS);
    setPeople(DEMO_PEOPLE);
    setEventFee(DEMO_LOT_FEE);
    setDb("live");
    setMsg("Demo mode — sample data only. No real data is shown or saved.");
  }, []);

  // Mark lot paid when Stripe redirects back with ?lot_paid=<id>
  useEffect(() => {
    if (IS_DEMO) return;
    const params = new URLSearchParams(window.location.search);
    const paidId = params.get("lot_paid");
    if (paidId) {
      setLots((prev) => prev.map((l) => String(l.id) === paidId ? { ...l, buyerPaid: true } : l));
      window.history.replaceState({}, "", "/?app=settlement");
    }
  }, []);

  const startLotCheckout = async (lot) => {
    const chargeAmount = lot.amountPaid || 0;
    if (!chargeAmount || !lot.buyerName) return;
    try {
      const r = await fetch("/api/lot-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passcode,
          lotId: lot.id,
          lotNo: lot.lotNo,
          description: lot.description,
          amount: chargeAmount,
          buyerName: lot.buyerName,
          buyerEmail: findEmail(lot.buyerName),
        }),
      });
      const data = await r.json();
      if (data.url) window.location.href = data.url;
      else alert("Stripe error: " + (data.error || "Unknown error"));
    } catch (err) {
      alert("Checkout failed: " + err.message);
    }
  };
  const parseBuyerInput = (val) => {
    // Strip "#42 - " prefix if the user selected from the datalist
    const m = val.match(/^#\S+\s+-\s+(.+)$/);
    return m ? m[1].trim() : val;
  };
  const onBuyerChange = (lotId, rawVal, currentRanch) => {
    const name = parseBuyerInput(rawVal);
    const ranch = findRanch(name) || currentRanch;
    setLot(lotId, { buyerName: name, buyerRanch: ranch, buyer: name ? display(name, ranch) : "—" });
  };
  const onNameChange = (which, v) => { const name = which === "buyer" ? parseBuyerInput(v) : v; setForm((p) => ({ ...p, [which + "Name"]: name, [which + "Ranch"]: findRanch(name) || p[which + "Ranch"] })); };
  const rememberPerson = (name, ranch) => { if (name) setPeople((prev) => prev.some((p) => p.name.toLowerCase() === name.toLowerCase()) ? prev : [...prev, { name, ranch: ranch || "" }]); };

  const saveLotEdit = async () => {
    const patch = {
      lotNo: editForm.lotNo.trim(), description: editForm.description.trim(),
      category: editForm.donated ? "Donated" : editForm.category,
      saleType: editForm.saleType || "Live",
      consignorName: editForm.consignorName.trim(), consignorRanch: editForm.consignorRanch.trim(),
      donated: editForm.donated,
      consignor: display(editForm.consignorName.trim(), editForm.consignorRanch.trim()),
    };
    setLots((p) => p.map((l) => l.id === editId ? { ...l, ...patch } : l));
    if (!IS_DEMO && connected && typeof editId === "string" && !editId.startsWith("tmp-")) {
      try {
        await fetch("/api/lots", { method: "PATCH", headers: hdr(), body: JSON.stringify({ id: editId, lot_no: patch.lotNo, description: patch.description, auction_category: patch.category, sale_type: patch.saleType, consignor_name: patch.consignorName, consignor_ranch: patch.consignorRanch, donated: patch.donated }) });
      } catch {}
    }
    cancelEdit();
  };

  /* ---- connect: load lots + fee + registered people ---- */
  const connect = async () => {
    setDb("loading"); setMsg("");
    try {
      const lr = await fetch("/api/lots", { headers: hdr() });
      if (!lr.ok) throw new Error(lr.status === 401 ? "Wrong passcode." : `Lots ${lr.status}`);
      const { lots: dbLots, lotFee } = await lr.json();
      setLots(dbLots.map(dbLotToUI)); setEventFee(lotFee);
      try { const rr = await fetch("/api/registrants", { headers: hdr() }); if (rr.ok) { const rows = await rr.json(); const seen = new Set(); const ppl = []; rows.forEach((x) => { const k = (x.name || "").toLowerCase(); if (x.name && !seen.has(k)) { seen.add(k); ppl.push({ name: x.name, ranch: x.ranch || "", bidderNo: x.bidder_number || "", email: x.email || "" }); } }); setPeople(ppl); } } catch {}
      setDb("live"); setMsg(`Connected — ${dbLots.length} lot${dbLots.length === 1 ? "" : "s"} loaded.`);
    } catch (e) {
      setDb("offline"); setMsg(`Live DB unavailable (${e.message}) — working locally. Wired up once deployed.`);
    }
  };

  const saveFee = async () => { if (connected) { try { await fetch("/api/settings", { method: "PUT", headers: hdr(), body: JSON.stringify({ lotFee: Number(eventFee) || 0 }) }); } catch {} } };

  const addLot = async () => {
    if (!form.lotNo.trim() || !form.consignorName.trim() || form.amount === "") return;
    const base = {
      lotNo: form.lotNo.trim(), description: form.description.trim(), category: form.donated ? "Donated" : form.category,
      saleType: form.saleType || "Live",
      consignorName: form.consignorName.trim(), consignorRanch: form.consignorRanch.trim(),
      buyerName: form.buyerName.trim(), buyerRanch: form.buyerRanch.trim(),
      amount: Number(form.amount) || 0, donated: form.donated,
    };
    const ui = {
      id: "tmp-" + Date.now(), ...base,
      consignor: display(base.consignorName, base.consignorRanch),
      buyer: base.buyerName ? display(base.buyerName, base.buyerRanch) : "—",
      delivered: false, checkNo: "", checkDate: "",
      buyerPaid: false, amountPaid: 0, paymentMethod: "cash",
    };
    setLots((p) => [...p, ui]);
    rememberPerson(base.consignorName, base.consignorRanch);
    rememberPerson(base.buyerName, base.buyerRanch);
    setForm(blankForm);
    if (connected) {
      const c = calc(base, eventFee);
      try {
        const r = await fetch("/api/lots", { method: "POST", headers: hdr(), body: JSON.stringify({ ...base, commission: c.commission, net: c.net, lotFee: null }) });
        if (r.ok) { const row = await r.json(); setLots((p) => p.map((l) => l.id === ui.id ? { ...l, id: row.id } : l)); }
      } catch {}
    }
  };

  const addGrandLot = async () => {
    setGrandFormErr("");
    if (!form.lotNo.trim()) { setGrandFormErr("Lot # is required."); return; }
    if (!form.consignorName.trim()) { setGrandFormErr("Consignor name is required."); return; }
    if (form.amount === "" || form.amount === "0") { setGrandFormErr("Sale amount is required."); return; }
    const base = {
      lotNo: form.lotNo.trim(), description: form.description.trim(), category: "Grand Auction", saleType: "Live",
      consignorName: form.consignorName.trim(), consignorRanch: form.consignorRanch.trim(),
      buyerName: form.buyerName.trim(), buyerRanch: form.buyerRanch.trim(),
      amount: Number(form.amount) || 0, donated: false,
    };
    const ui = {
      id: "tmp-" + Date.now(), ...base,
      consignor: display(base.consignorName, base.consignorRanch),
      buyer: base.buyerName ? display(base.buyerName, base.buyerRanch) : "—",
      delivered: false, checkNo: "", checkDate: "",
      buyerPaid: false, amountPaid: 0, paymentMethod: "cash",
    };
    setLots((p) => [...p, ui]);
    rememberPerson(base.consignorName, base.consignorRanch);
    rememberPerson(base.buyerName, base.buyerRanch);
    setForm(blankForm);
    if (!IS_DEMO && connected) {
      const c = calc(base, eventFee);
      try {
        const r = await fetch("/api/lots", { method: "POST", headers: hdr(), body: JSON.stringify({ ...base, commission: c.commission, net: c.net, lotFee: null }) });
        if (r.ok) { const row = await r.json(); setLots((p) => p.map((l) => l.id === ui.id ? { ...l, id: row.id } : l)); }
      } catch {}
    }
  };

  const setLot = async (id, patch) => {
    setLots((p) => p.map((l) => l.id === id ? { ...l, ...patch } : l));
    if (!IS_DEMO && connected && typeof id === "string" && !id.startsWith("tmp-")) {
      const dbPatch = {};
      if ("delivered" in patch) dbPatch.delivered = patch.delivered;
      if ("checkNo" in patch) dbPatch.check_no = patch.checkNo || null;
      if ("checkDate" in patch) dbPatch.check_date = patch.checkDate || null;
      if ("buyerName" in patch) dbPatch.buyer_name = patch.buyerName || null;
      if ("buyerRanch" in patch) dbPatch.buyer_ranch = patch.buyerRanch || null;
      if ("amount" in patch) dbPatch.amount = patch.amount;
      if ("amountPaid" in patch) dbPatch.amount_paid = patch.amountPaid;
      if ("buyerPaid" in patch) dbPatch.buyer_paid = patch.buyerPaid;
      if ("paymentMethod" in patch) dbPatch.payment_method = patch.paymentMethod;
      try { await fetch("/api/lots", { method: "PATCH", headers: hdr(), body: JSON.stringify({ id, ...dbPatch }) }); } catch {}
    }
  };
  const delLot = async (id) => {
    setLots((p) => p.filter((l) => l.id !== id));
    if (!IS_DEMO && connected && typeof id === "string" && !id.startsWith("tmp-")) { try { await fetch(`/api/lots?id=${id}`, { method: "DELETE", headers: hdr() }); } catch {} }
  };

  const grand = useMemo(() => lots.reduce((a, l) => { if (!l.donated) { const c = calc(l, eventFee); a.lotTotal += l.amount; a.fees += c.fee; a.commission += c.commission; a.net += c.net; } return a; }, { lotTotal: 0, fees: 0, commission: 0, net: 0 }), [lots, eventFee]);
  const byConsignor = useMemo(() => {
    const sortLot = (a, b) => Number(a.lotNo) - Number(b.lotNo) || a.lotNo.localeCompare(b.lotNo);
    const map = {}; lots.forEach((l) => { if (!l.donated) (map[l.consignor] ||= []).push(l); });
    return Object.entries(map).map(([name, ls]) => { ls.sort(sortLot); const t = ls.reduce((a, l) => { const c = calc(l, eventFee); a.lotTotal += l.amount; a.fees += c.fee; a.commission += c.commission; a.net += c.net; return a; }, { lotTotal: 0, fees: 0, commission: 0, net: 0 }); return { name, ls, t, minLot: ls[0]?.lotNo ?? "" }; }).sort((a, b) => Number(a.minLot) - Number(b.minLot) || a.minLot.localeCompare(b.minLot));
  }, [lots, eventFee]);
  const saleCounts = useMemo(() => ({ All: lots.length, Live: lots.filter((l) => (l.saleType || "Live") === "Live").length, Silent: lots.filter((l) => l.saleType === "Silent").length }), [lots]);
  const shownByConsignor = useMemo(() => {
    if (saleFilter === "All") return byConsignor;
    return byConsignor.map((g) => {
      const ls = g.ls.filter((l) => (l.saleType || "Live") === saleFilter);
      const t = ls.reduce((a, l) => { const c = calc(l, eventFee); a.lotTotal += l.amount; a.fees += c.fee; a.commission += c.commission; a.net += c.net; return a; }, { lotTotal: 0, fees: 0, commission: 0, net: 0 });
      return { ...g, ls, t };
    }).filter((g) => g.ls.length > 0);
  }, [byConsignor, saleFilter, eventFee]);
  const consignors = useMemo(() => [...new Set(lots.map((l) => l.consignor))].sort(), [lots]);
  const buyers = useMemo(() => [...new Set(lots.map((l) => l.buyer).filter((b) => b !== "—"))].sort(), [lots]);
  const deliveredCount = lots.filter((l) => !l.donated && l.delivered).length;
  const paidCount = lots.filter((l) => !l.donated && l.checkNo).length;

  const PayControls = ({ l }) => {
    const isCash = l.paymentMethod !== "card";
    const canPay = l.buyerName && l.amountPaid > 0 && !l.buyerPaid;
    const markCashPaid = () => setLot(l.id, { buyerPaid: true });
    return (
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
        <div className="pmtog">
          <button className={isCash ? "on" : ""} onClick={() => setLot(l.id, { paymentMethod: "cash" })}>Cash/Check</button>
          <button className={!isCash ? "on" : ""} onClick={() => setLot(l.id, { paymentMethod: "card" })}>Card</button>
        </div>
        {!l.buyerPaid && canPay && isCash && (
          <button className="pay-btn" onClick={markCashPaid}><Check size={13}/> Mark Paid</button>
        )}
        {!l.buyerPaid && canPay && !isCash && (
          <button className="pay-btn" onClick={() => startLotCheckout(l)}><CreditCard size={13}/> Pay {money(l.amountPaid)}</button>
        )}
        {l.buyerPaid && <span className="badge b-paid" style={{fontSize:12}}>Paid</span>}
      </div>
    );
  };

  const TabBtn = ({ id, icon: Icon, children }) => (<button className={`tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}><Icon size={16} /> {children}</button>);
  const dotColor = db === "live" ? "var(--ok)" : db === "offline" ? "var(--warn)" : "#9DB3A8";

  return (
    <div className="ewa"><Styles /><OrganizerNav />
      <datalist id="people-list">{people.map((p) => <option key={p.name} value={p.bidderNo ? `#${p.bidderNo} - ${p.name}` : p.name} />)}</datalist>
      <div className="head"><div className="wrap head-in">
        <div className="eyebrow">Exotic Wildlife Association · 2026 Annual Membership Meeting</div>
        <h1 className="serif">Auction Settlement</h1>
        <div className="sub">Consignor payouts, ledgers, and delivery tracking</div>
        <div className="tabs">
          <TabBtn id="payments" icon={DollarSign}>Consignor Payment Detail</TabBtn>
          <TabBtn id="grand" icon={Receipt}>Grand Auction</TabBtn>
          <TabBtn id="consignor" icon={FileText}>Consignor Ledger</TabBtn>
          <TabBtn id="buyer" icon={Receipt}>Buyer Ledger</TabBtn>
          <TabBtn id="reports" icon={Download}>Reports</TabBtn>
        </div>
      </div></div>

      <div className="wrap panel">
        {IS_DEMO && (
          <div style={{background:"#B9842B",color:"#fff",borderRadius:10,padding:"10px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:10,fontWeight:600,fontSize:14}}>
            <AlertTriangle size={16}/> DEMO MODE — Sample data only. No real data is shown or saved. All features are fully functional.
          </div>
        )}
        {!IS_DEMO && <div className="settings">
          <label><Settings size={14} /> Event lot fee</label>
          <input className="feein" value={eventFee} inputMode="decimal" onChange={(e) => setEventFee(e.target.value.replace(/[^\d.]/g, ""))} onBlur={saveFee} />
          <span className="tiers">≤ $5,000 → 11% · $5,001–$9,999 → 10% · ≥ $10,000 → 9%</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}><span className="dot" style={{ background: dotColor }} />{db === "live" ? "Connected" : db === "offline" ? "Local" : "Not connected"}</span>
            <input className="pwd" type="password" placeholder="Organizer passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
            <button className="btn" onClick={connect} disabled={db === "loading"}><Database size={15} /> {db === "loading" ? "Connecting…" : "Connect"}</button>
          </div>
        </div>}
        {!IS_DEMO && msg && <div className="hint" style={{ marginTop: -10, marginBottom: 16, color: db === "offline" ? "var(--warn)" : "var(--ok)" }}>{db === "offline" && <AlertTriangle size={14} />}{msg}</div>}

        {tab === "payments" && (<>
          <div className="cards">
            <div className="kpi"><div className="l"><Receipt size={13} /> Lot total</div><div className="n">{money0(grand.lotTotal)}</div></div>
            <div className="kpi"><div className="l"><FileText size={13} /> Lot fees</div><div className="n">{money0(grand.fees)}</div></div>
            <div className="kpi"><div className="l"><Landmark size={13} /> EWA commission</div><div className="n">{money0(grand.commission)}</div></div>
            <div className="kpi accent"><div className="l"><DollarSign size={13} /> Net to consignors</div><div className="n">{money0(grand.net)}</div></div>
            <div className="kpi"><div className="l"><Truck size={13} /> Delivered / Paid</div><div className="n">{deliveredCount} / {paidCount}</div></div>
          </div>

          <div className="addcard">
            <div className="addhdr"><Plus size={17} /> Add a lot</div>
            <div className="fgrid">
              <div className="f span2"><label>Lot #</label><input value={form.lotNo} onChange={(e) => setF("lotNo", e.target.value)} placeholder="501" /></div>
              <div className="f span4"><label>Description</label><input value={form.description} onChange={(e) => setF("description", e.target.value)} placeholder="0.1 Fallow — Green 211" /></div>
              <div className="f span3"><label>Auction category</label><select value={form.category} onChange={(e) => setF("category", e.target.value)} disabled={form.donated}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
              <div className="f span3"><label>Sale type</label><select value={form.saleType} onChange={(e) => setF("saleType", e.target.value)}>{["Live", "Silent"].map((t) => <option key={t}>{t}</option>)}</select></div>
              <div className="f span4"><label>Consignor name</label><input list="people-list" value={form.consignorName} onChange={(e) => onNameChange("consignor", e.target.value)} placeholder="Start typing…" /></div>
              <div className="f span2"><label>Ranch</label><input value={form.consignorRanch} onChange={(e) => setF("consignorRanch", e.target.value)} placeholder="Ranch" /></div>
              <div className="f span4"><label>Buyer name</label><input list="people-list" value={form.buyerName} onChange={(e) => onNameChange("buyer", e.target.value)} placeholder="Start typing…" /></div>
              <div className="f span2"><label>Ranch</label><input value={form.buyerRanch} onChange={(e) => setF("buyerRanch", e.target.value)} placeholder="Ranch" /></div>
              <div className="f span3"><label>Sale amount</label><input value={form.amount} inputMode="decimal" onChange={(e) => setF("amount", e.target.value.replace(/[^\d.]/g, ""))} placeholder="6000" /></div>
              <div className="f span3" style={{ justifyContent: "flex-end" }}><label className="chkrow"><input type="checkbox" checked={form.donated} onChange={(e) => setF("donated", e.target.checked)} /> 100% donation to EWA</label></div>
              <div className="f span6" style={{ justifyContent: "flex-end", alignItems: "flex-end" }}><button className="btn" onClick={addLot}><Plus size={16} /> Add lot</button></div>
            </div>
            <div className="hint"><Users size={13} /> Connect with your organizer passcode to load registered names + ranches and persist lots to the database.</div>
          </div>

          {lots.length === 0 ? (
            <div className="empty"><div className="big">No lots yet</div>Set your event lot fee, Connect to load registered people, then add lots as the auction settles.</div>
          ) : (<>
            <div className="bar">
              {["All", "Live", "Silent"].map((t) => (
                <button key={t} className="btn ghost" style={{fontSize:12.5,padding:"6px 14px",borderRadius:999,...(saleFilter === t ? {background:"var(--pine)",color:"#fff",borderColor:"var(--pine)"} : {})}} onClick={() => setSaleFilter(t)}>{t} ({saleCounts[t]})</button>
              ))}
            </div>
            <table className="tbl">
              <thead><tr><th>Lot</th><th>Description</th><th>Buyer</th><th className="num">Lot total</th><th className="num">Fee</th><th className="num">Commission</th><th className="num">Net (check)</th><th className="num">Amt Paid</th><th className="num">Balance Due</th><th>Buyer Paid</th><th>Delivery</th><th>Check #</th><th>Date</th><th></th></tr></thead>
              <tbody>
                {shownByConsignor.map((g) => (
                  <React.Fragment key={g.name}>
                    <tr className="grp2"><td colSpan={14}>{g.name}</td></tr>
                    {g.ls.map((l) => { const c = calc(l, eventFee); const status = l.checkNo ? "paid" : l.delivered ? "ready" : "wait"; const bidderNo = findBidder(l.buyerName); const balanceDue = l.amount - (l.amountPaid || 0); return (
                      <React.Fragment key={l.id}>
                      <tr>
                        <td className="lot">{l.lotNo}</td><td>{l.description || "—"}{l.saleType === "Silent" && <span className="badge" style={{background:"#e7eef0",color:"#2a5560",marginLeft:6}}>Silent</span>}</td>
                        <td>
                          <input className="buyer-in" list="people-list" value={l.buyerName} placeholder="Buyer name" onChange={(e) => onBuyerChange(l.id, e.target.value, l.buyerRanch)} />
                          {bidderNo && <span style={{fontSize:11,fontWeight:700,color:"var(--pine)",marginLeft:5}}>#{bidderNo}</span>}
                        </td>
                        <td className="num"><input className="amt-in" inputMode="decimal" value={l.amount === 0 ? "" : l.amount} placeholder="0.00" onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setLot(l.id, { amount: Number(v) || 0 }); }} /></td><td className="num">{money(c.fee)}</td><td className="num">{money(c.commission)}</td><td className="num net">{money(c.net)}</td>
                        <td className="num"><input className="amt-in" inputMode="decimal" value={l.amountPaid === 0 ? "" : l.amountPaid} placeholder="0.00" onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setLot(l.id, { amountPaid: Number(v) || 0 }); }} /></td>
                        <td className="num" style={{fontWeight:700,color: balanceDue <= 0 ? "var(--ok)" : "var(--warn)"}}>{money(Math.max(0, balanceDue))}</td>
                        <td><PayControls l={l} /></td>
                        <td><button className={`ci ${l.delivered ? "on" : ""}`} onClick={() => setLot(l.id, { delivered: !l.delivered, ...(l.delivered ? { checkNo: "", checkDate: "" } : {}) })}>{l.delivered ? <CheckCircle2 size={16} /> : <Circle size={16} />}<span className={`badge ${status === "paid" ? "b-paid" : status === "ready" ? "b-ready" : "b-wait"}`}>{status === "paid" ? "Paid" : status === "ready" ? "Ready" : "Awaiting"}</span></button></td>
                        <td><input className="mini" value={l.checkNo} disabled={!l.delivered} placeholder="—" onChange={(e) => setLot(l.id, { checkNo: e.target.value })} /></td>
                        <td><input className="mini" type="date" value={l.checkDate} disabled={!l.delivered} onChange={(e) => setLot(l.id, { checkDate: e.target.value })} /></td>
                        <td style={{whiteSpace:"nowrap",display:"flex",alignItems:"center",gap:4}}>
                          <button className="edit-btn" title="Edit lot" onClick={() => editId === l.id ? cancelEdit() : startEdit(l)}>{editId === l.id ? <X size={15} /> : <Pencil size={15} />}</button>
                          <button className="trash" onClick={() => delLot(l.id)}><Trash2 size={15} /></button>
                        </td>
                      </tr>
                      {editId === l.id && (
                        <tr className="edit-row">
                          <td colSpan={14}>
                            <div className="edit-grid">
                              <div className="f"><label>Lot #</label><input className="mini" style={{width:"100%"}} value={editForm.lotNo} onChange={(e) => setEF("lotNo", e.target.value)} /></div>
                              <div className="f"><label>Description</label><input style={{fontFamily:"inherit",fontSize:"13px",padding:"6px 8px",border:"1.5px solid var(--line)",borderRadius:"8px",width:"100%"}} value={editForm.description} onChange={(e) => setEF("description", e.target.value)} /></div>
                              <div className="f"><label>Category</label><select style={{fontFamily:"inherit",fontSize:"13px",padding:"6px 8px",border:"1.5px solid var(--line)",borderRadius:"8px",width:"100%"}} value={editForm.category} disabled={editForm.donated} onChange={(e) => setEF("category", e.target.value)}>{CATEGORIES.map((cat) => <option key={cat}>{cat}</option>)}</select></div>
                              <div className="f"><label>Sale type</label><select style={{fontFamily:"inherit",fontSize:"13px",padding:"6px 8px",border:"1.5px solid var(--line)",borderRadius:"8px",width:"100%"}} value={editForm.saleType} onChange={(e) => setEF("saleType", e.target.value)}>{["Live", "Silent"].map((t) => <option key={t}>{t}</option>)}</select></div>
                              <div className="f"><label>Consignor name</label><input list="people-list" style={{fontFamily:"inherit",fontSize:"13px",padding:"6px 8px",border:"1.5px solid var(--line)",borderRadius:"8px",width:"100%"}} value={editForm.consignorName} onChange={(e) => setEF("consignorName", e.target.value)} /></div>
                              <div className="f"><label>Ranch</label><input style={{fontFamily:"inherit",fontSize:"13px",padding:"6px 8px",border:"1.5px solid var(--line)",borderRadius:"8px",width:"100%"}} value={editForm.consignorRanch} onChange={(e) => setEF("consignorRanch", e.target.value)} /></div>
                              <div className="f" style={{gridColumn:"span 2"}}><label className="chkrow" style={{marginTop:20}}><input type="checkbox" checked={editForm.donated} onChange={(e) => setEF("donated", e.target.checked)} /> 100% donation to EWA</label></div>
                              <div className="f" style={{flexDirection:"row",gap:8,alignItems:"flex-end"}}>
                                <button className="btn" style={{fontSize:13,padding:"7px 14px"}} onClick={saveLotEdit}><Check size={14}/> Save</button>
                                <button className="btn ghost" style={{fontSize:13,padding:"7px 12px"}} onClick={cancelEdit}><X size={14}/> Cancel</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>); })}
                    <tr className="sub"><td colSpan={3}>Subtotal — {g.name}</td><td className="num">{money(g.t.lotTotal)}</td><td className="num">{money(g.t.fees)}</td><td className="num">{money(g.t.commission)}</td><td className="num">{money(g.t.net)}</td><td className="num">{money(g.ls.reduce((a,l)=>a+(l.amountPaid||0),0))}</td><td className="num" style={{fontWeight:700,color:"var(--warn)"}}>{money(Math.max(0,g.ls.reduce((a,l)=>a+(l.amount-(l.amountPaid||0)),0)))}</td><td colSpan={5}></td></tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            <div className="grand">
              <div><div className="l">Auction lot total</div><div className="n">{money(grand.lotTotal)}</div></div>
              <div><div className="l">Total lot fees</div><div className="n">{money(grand.fees)}</div></div>
              <div><div className="l">Total EWA commission</div><div className="n">{money(grand.commission)}</div></div>
              <div><div className="l">Total net to consignors</div><div className="n">{money(grand.net)}</div></div>
            </div>
          </>)}
        </>)}

        {tab === "consignor" && (() => {
          if (lots.length === 0) return <div className="empty"><div className="big">No consignors yet</div>Add lots on the Payment Detail tab.</div>;
          const sel = consignorSel || consignors[0] || "";
          const ls = lots.filter((l) => l.consignor === sel);
          const printConsignor = () => { const prev = document.title; document.title = `Consignor Ledger - ${sel} - 2026 AMM`; window.print(); setTimeout(() => { document.title = prev; }, 1000); };
          const donated = ls.filter((l) => l.donated), sold = ls.filter((l) => !l.donated);
          const soldWithBuyer = sold.filter((l) => l.buyerName), unsold = sold.filter((l) => !l.buyerName);
          const donatedTotal = donated.reduce((a, l) => a + l.amount, 0);
          const t = soldWithBuyer.reduce((a, l) => { const c = calc(l, eventFee); a.gross += l.amount; a.fees += c.fee; a.commission += c.commission; a.net += c.net; return a; }, { gross: 0, fees: 0, commission: 0, net: 0 });
          return (<>
            <div className="bar"><select className="sel" value={sel} onChange={(e) => setConsignorSel(e.target.value)}>{consignors.map((c) => <option key={c}>{c}</option>)}</select><button className="btn ghost" onClick={printConsignor}><Printer size={15} /> Print / PDF</button></div>
            <div className="ledger">
              <div className="lh"><div><div className="who serif">{sel}</div><div className="whosub">Consignor Ledger · 2026 AMM</div></div><div style={{ textAlign: "right" }}><div className="whosub">Net due once delivered</div><div className="who serif" style={{ color: "var(--pine)" }}>{money(t.net)}</div></div></div>
              {donated.length > 0 && (<><div className="secLabel">Lots Donated (100% to EWA)</div><table className="tbl"><thead><tr><th>Lot</th><th>Description</th><th>Sold to</th><th>Bidder #</th><th className="num">Lot total</th></tr></thead><tbody>{donated.map((l) => { const bn = findBidder(l.buyerName); return <tr key={l.id}><td className="lot">{l.lotNo}</td><td className="donated">{l.description || "—"}</td><td>{l.buyer}</td><td style={{fontWeight:700,color:"var(--pine)"}}>{bn || "—"}</td><td className="num">{money(l.amount)}</td></tr>; })}<tr className="sub"><td colSpan={4}>Donated total</td><td className="num">{money(donatedTotal)}</td></tr></tbody></table></>)}
              {soldWithBuyer.length > 0 && (<><div className="secLabel">Lots Sold</div><table className="tbl"><thead><tr><th>Lot</th><th>Description</th><th>Sold to</th><th>Bidder #</th><th className="num">Lot total</th><th className="num">Fee</th><th className="num">Comm.</th><th className="num">Net</th></tr></thead><tbody>{soldWithBuyer.map((l) => { const c = calc(l, eventFee); const bn = findBidder(l.buyerName); return <tr key={l.id}><td className="lot">{l.lotNo}</td><td>{l.description || "—"}</td><td>{l.buyer}</td><td style={{fontWeight:700,color:"var(--pine)"}}>{bn || "—"}</td><td className="num">{money(l.amount)}</td><td className="num">{money(c.fee)}</td><td className="num">{money(c.commission)}</td><td className="num net">{money(c.net)}</td></tr>; })}</tbody></table></>)}
              {unsold.length > 0 && (<><div className="secLabel" style={{color:"var(--inkSoft)"}}>Lots Not Yet Sold</div><table className="tbl"><thead><tr><th>Lot</th><th>Description</th><th className="num">List price</th><th className="num">Net</th></tr></thead><tbody>{unsold.map((l) => <tr key={l.id}><td className="lot">{l.lotNo}</td><td className="donated">{l.description || "—"}</td><td className="num" style={{color:"var(--inkSoft)"}}>{money(l.amount)}</td><td className="num donated">$0.00</td></tr>)}</tbody></table></>)}
              <div style={{ maxWidth: 360, marginLeft: "auto", marginTop: 18 }}>
                <div className="totline"><span>Gross lot total</span><span>{money(t.gross)}</span></div>
                <div className="totline"><span>Lot fees</span><span>{money(t.fees)}</span></div>
                <div className="totline"><span>EWA commission</span><span>{money(t.commission)}</span></div>
                <div className="totline big"><span>Consignor net</span><span>{money(t.net)}</span></div>
              </div>
            </div>
          </>);
        })()}

        {tab === "grand" && (() => {
          const grandLots = lots.filter((l) => l.category === "Grand Auction").sort((a, b) => Number(a.lotNo) - Number(b.lotNo));
          const totSold = grandLots.reduce((a, l) => a + l.amount, 0);
          const withBuyer = grandLots.filter((l) => l.buyerName).length;
          return (<>
            <div className="addcard">
              <div className="addhdr"><Plus size={17} /> Add Grand Auction lot</div>
              <div className="fgrid">
                <div className="f span2"><label>Lot #</label><input value={form.lotNo} onChange={(e) => setF("lotNo", e.target.value)} placeholder="GA-01" /></div>
                <div className="f span6"><label>Description</label><input value={form.description} onChange={(e) => setF("description", e.target.value)} placeholder="0.2 Whitetail — Monarch Ranch" /></div>
                <div className="f span4"><label>Consignor name</label><input list="people-list" value={form.consignorName} onChange={(e) => onNameChange("consignor", e.target.value)} placeholder="Start typing…" /></div>
                <div className="f span2"><label>Ranch</label><input value={form.consignorRanch} onChange={(e) => setF("consignorRanch", e.target.value)} placeholder="Ranch" /></div>
                <div className="f span4"><label>Buyer name</label><input list="people-list" value={form.buyerName} onChange={(e) => onNameChange("buyer", e.target.value)} placeholder="Start typing…" /></div>
                <div className="f span2"><label>Ranch</label><input value={form.buyerRanch} onChange={(e) => setF("buyerRanch", e.target.value)} placeholder="Ranch" /></div>
                <div className="f span3"><label>Sale amount</label><input value={form.amount} inputMode="decimal" onChange={(e) => setF("amount", e.target.value.replace(/[^\d.]/g, ""))} placeholder="6000" /></div>
                <div className="f span3" style={{ justifyContent: "flex-end", alignItems: "flex-end" }}><button className="btn" onClick={addGrandLot}><Plus size={16} /> Add lot</button></div>
              </div>
              {grandFormErr && <div className="hint" style={{color:"var(--warn)",marginTop:10}}><AlertTriangle size={13}/> {grandFormErr}</div>}
            </div>
            {grandLots.length === 0
              ? <div className="empty"><div className="big">No Grand Auction lots yet</div>Use the form above to add lots.</div>
              : (<>
              <div className="bar" style={{justifyContent:"space-between"}}>
                <span style={{fontSize:13,fontWeight:600,color:"var(--inkSoft)"}}>
                  {grandLots.length} lots total · <span style={{color:"var(--ok)"}}>{withBuyer} assigned</span>{grandLots.length - withBuyer > 0 && <span style={{color:"var(--warn)"}}> · {grandLots.length - withBuyer} need a buyer</span>} · {money(totSold)} total
                </span>
                <button className="btn ghost" onClick={() => window.print()}><Printer size={15}/> Print / PDF</button>
              </div>
              <table className="tbl">
                <thead><tr><th>Lot</th><th>Description</th><th>Consignor</th><th>Buyer</th><th className="num">Amount</th><th className="num">Fee</th><th className="num">Commission</th><th className="num">Net (check)</th><th className="num">Amt Paid</th><th className="num">Balance Due</th><th>Buyer Paid</th><th></th></tr></thead>
                <tbody>
                  {grandLots.map((l) => { const c = calc(l, eventFee); const bidderNo = findBidder(l.buyerName); const balanceDue = l.amount - (l.amountPaid || 0); return (
                    <React.Fragment key={l.id}>
                    <tr style={!l.buyerName ? {background:"#fff0e6",outline:"1px solid #f5c9a0"} : {}}>
                      <td className="lot">{l.lotNo}</td>
                      <td>{l.description || "—"}</td>
                      <td style={{color:"var(--inkSoft)",fontSize:12.5}}>{l.consignorName || "—"}</td>
                      <td>
                        <input className="buyer-in" list="people-list" value={l.buyerName} placeholder="Enter buyer…" onChange={(e) => onBuyerChange(l.id, e.target.value, l.buyerRanch)} />
                        {bidderNo && <span style={{fontSize:11,fontWeight:700,color:"var(--pine)",marginLeft:5}}>#{bidderNo}</span>}
                      </td>
                      <td className="num"><input className="amt-in" inputMode="decimal" value={l.amount === 0 ? "" : l.amount} placeholder="0.00" onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setLot(l.id, { amount: Number(v) || 0 }); }} /></td>
                      <td className="num">{money(c.fee)}</td>
                      <td className="num">{money(c.commission)}</td>
                      <td className="num net">{money(c.net)}</td>
                      <td className="num"><input className="amt-in" inputMode="decimal" value={l.amountPaid === 0 ? "" : l.amountPaid} placeholder="0.00" onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setLot(l.id, { amountPaid: Number(v) || 0 }); }} /></td>
                      <td className="num" style={{fontWeight:700,color: balanceDue <= 0 ? "var(--ok)" : "var(--warn)"}}>{money(Math.max(0, balanceDue))}</td>
                      <td><PayControls l={l} /></td>
                      <td style={{whiteSpace:"nowrap"}}>
                        <button className="edit-btn" title="Edit lot" onClick={() => editId === l.id ? cancelEdit() : startEdit(l)}>{editId === l.id ? <X size={15}/> : <Pencil size={15}/>}</button>
                        <button className="trash" onClick={() => delLot(l.id)}><Trash2 size={15}/></button>
                      </td>
                    </tr>
                    {editId === l.id && (
                      <tr className="edit-row">
                        <td colSpan={12}>
                          <div className="edit-grid">
                            <div className="f"><label>Lot #</label><input className="mini" style={{width:"100%"}} value={editForm.lotNo} onChange={(e) => setEF("lotNo", e.target.value)} /></div>
                            <div className="f"><label>Description</label><input style={{fontFamily:"inherit",fontSize:"13px",padding:"6px 8px",border:"1.5px solid var(--line)",borderRadius:"8px",width:"100%"}} value={editForm.description} onChange={(e) => setEF("description", e.target.value)} /></div>
                            <div className="f"><label>Consignor name</label><input list="people-list" style={{fontFamily:"inherit",fontSize:"13px",padding:"6px 8px",border:"1.5px solid var(--line)",borderRadius:"8px",width:"100%"}} value={editForm.consignorName} onChange={(e) => setEF("consignorName", e.target.value)} /></div>
                            <div className="f"><label>Ranch</label><input style={{fontFamily:"inherit",fontSize:"13px",padding:"6px 8px",border:"1.5px solid var(--line)",borderRadius:"8px",width:"100%"}} value={editForm.consignorRanch} onChange={(e) => setEF("consignorRanch", e.target.value)} /></div>
                            <div className="f" style={{flexDirection:"row",gap:8,alignItems:"flex-end"}}>
                              <button className="btn" style={{fontSize:13,padding:"7px 14px"}} onClick={saveLotEdit}><Check size={14}/> Save</button>
                              <button className="btn ghost" style={{fontSize:13,padding:"7px 12px"}} onClick={cancelEdit}><X size={14}/> Cancel</button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    </React.Fragment>); })}
                </tbody>
              </table>
              <div className="grand" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
                <div><div className="l">Grand Auction total</div><div className="n">{money(totSold)}</div></div>
                <div><div className="l">Lots with buyer</div><div className="n">{withBuyer} / {grandLots.length}</div></div>
                <div><div className="l">Net to consignors</div><div className="n">{money(grandLots.reduce((a, l) => a + calc(l, eventFee).net, 0))}</div></div>
              </div>
            </>)}
          </>);
        })()}

        {tab === "buyer" && (() => {
          if (buyers.length === 0) return <div className="empty"><div className="big">No buyers yet</div>Add lots with a buyer on the Payment Detail tab.</div>;
          const sel = buyerSel || buyers[0] || "";
          const ls = lots.filter((l) => l.buyer === sel);
          const byCat = {}; ls.forEach((l) => { (byCat[l.category] ||= []).push(l); });
          const lotTotal = ls.reduce((a, l) => a + l.amount, 0);
          const totalPaid = ls.reduce((a, l) => a + (l.amountPaid || 0), 0);
          const totalBalance = Math.max(0, lotTotal - totalPaid);
          const selBidder = findBidder(ls[0]?.buyerName || "");
          const printBuyer = () => { const prev = document.title; document.title = `Buyer Ledger - ${sel} - 2026 AMM`; window.print(); setTimeout(() => { document.title = prev; }, 1000); };
          return (<>
            <div className="bar"><select className="sel" value={sel} onChange={(e) => setBuyerSel(e.target.value)}>{buyers.map((b) => <option key={b}>{b}</option>)}</select><button className="btn ghost" onClick={printBuyer}><Printer size={15} /> Print / PDF</button></div>
            <div className="ledger">
              <div className="lh"><div><div className="who serif">{sel}</div><div className="whosub">Buyer Ledger · 2026 AMM{selBidder ? ` · Bidder #${selBidder}` : ""}</div></div><div style={{ textAlign: "right" }}><div className="whosub">Balance due</div><div className="who serif" style={{ color: totalBalance > 0 ? "var(--warn)" : "var(--ok)" }}>{money(totalBalance)}</div></div></div>
              {Object.entries(byCat).map(([cat, items]) => { const sub = items.reduce((a, l) => a + l.amount, 0); const subPaid = items.reduce((a, l) => a + (l.amountPaid || 0), 0); const subBal = Math.max(0, sub - subPaid); return (<div key={cat}><div className="secLabel">{cat}</div><table className="tbl"><thead><tr><th>Lot</th><th>Description</th><th>Consignor</th><th className="num">Amount</th><th className="num">Amt Paid</th><th className="num">Balance Due</th></tr></thead><tbody>{items.map((l) => { const bal = Math.max(0, l.amount - (l.amountPaid || 0)); return <tr key={l.id}><td className="lot">{l.lotNo}</td><td>{l.description || "—"}</td><td>{l.consignor}</td><td className="num">{money(l.amount)}</td><td className="num">{money(l.amountPaid || 0)}</td><td className="num" style={{fontWeight:700,color: bal <= 0 ? "var(--ok)" : "var(--warn)"}}>{money(bal)}</td></tr>; })}<tr className="sub"><td colSpan={3}>{cat} subtotal</td><td className="num">{money(sub)}</td><td className="num">{money(subPaid)}</td><td className="num" style={{color:"var(--warn)",fontWeight:700}}>{money(subBal)}</td></tr></tbody></table></div>); })}
              <div style={{ maxWidth: 420, marginLeft: "auto", marginTop: 18 }}>
                <div className="totline"><span>Total lot amount</span><span>{money(lotTotal)}</span></div>
                <div className="totline"><span>Amount paid</span><span>{money(totalPaid)}</span></div>
                <div className="totline big"><span>Balance due</span><span style={{color: totalBalance > 0 ? "var(--warn)" : "var(--ok)"}}>{money(totalBalance)}</span></div>
              </div>
            </div>
          </>);
        })()}

        {tab === "reports" && (() => {
          const fmt2 = (n) => Number(n).toFixed(2);

          const exportAllLots = () => {
            const hdr = ["Lot #","Description","Category","Sale Type","Consignor","Consignor Ranch","Buyer","Buyer Ranch","Bidder #","Sale Amount","Lot Fee","Commission","Net (Check)","Amt Paid","Balance Due","Buyer Paid","Delivered","Check #","Check Date"];
            const rows = [...lots].sort((a,b)=>Number(a.lotNo)-Number(b.lotNo)||a.lotNo.localeCompare(b.lotNo)).map((l)=>{
              const c=calc(l,eventFee);
              return [l.lotNo,l.description,l.category,l.saleType||"Live",l.consignorName,l.consignorRanch,l.buyerName,l.buyerRanch,findBidder(l.buyerName),fmt2(l.amount),fmt2(c.fee),fmt2(c.commission),fmt2(c.net),fmt2(l.amountPaid||0),fmt2(Math.max(0,l.amount-(l.amountPaid||0))),l.buyerPaid?"Yes":"No",l.delivered?"Yes":"No",l.checkNo,l.checkDate];
            });
            downloadCsv("lots-all.csv",[hdr,...rows]);
          };

          const exportBuyerSummary = () => {
            const hdr = ["Buyer","Bidder #","Ranch","Lots Purchased","Total Amount","Amount Paid","Balance Due"];
            const map = {};
            lots.forEach((l)=>{ if(!l.buyerName) return; (map[l.buyerName]||=([])).push(l); });
            const rows = Object.entries(map).sort((a,b)=>a[0].localeCompare(b[0])).map(([name,ls])=>{
              const total=ls.reduce((a,l)=>a+l.amount,0);
              const paid=ls.reduce((a,l)=>a+(l.amountPaid||0),0);
              return [name,findBidder(name),findRanch(name),ls.length,fmt2(total),fmt2(paid),fmt2(Math.max(0,total-paid))];
            });
            downloadCsv("buyers-summary.csv",[hdr,...rows]);
          };

          const exportConsignorSummary = () => {
            const hdr = ["Consignor","Ranch","Lots","Gross","Lot Fees","Commission","Net Due"];
            const rows = byConsignor.map(({name,ls,t})=>{
              const ranch = ls[0]?.consignorRanch||"";
              return [name,ranch,ls.length,fmt2(t.lotTotal),fmt2(t.fees),fmt2(t.commission),fmt2(t.net)];
            });
            downloadCsv("consignors-summary.csv",[hdr,...rows]);
          };

          const exportRegistrations = async () => {
            setRegLoading(true);
            try {
              const data = IS_DEMO ? DEMO_REGISTRANTS : await (await fetch("/api/registrants", { headers: hdr() })).json();
              const rows = (Array.isArray(data)?data:[]).map((x)=>[
                x.bidder_number||"", x.name||"", x.email||"", x.phone||"",
                x.ranch||x.notes||"", x.party||1, x.status||"", x.source||"",
                x.amount||0, x.checked_in?"Yes":"No", (x.created_at||"").slice(0,10)
              ]);
              downloadCsv("registrations.csv",[["Bidder #","Name","Email","Phone","Ranch / Company","Party Size","Status","Source","Amount Paid","Checked In","Date"],...rows]);
            } catch(e){ alert("Failed to load registrations: "+e.message); }
            setRegLoading(false);
          };

          const exportAllData = async () => {
            setXlsxLoading(true);
            try {
              let regData, sponsorData;
              if (IS_DEMO) {
                regData = DEMO_REGISTRANTS; sponsorData = DEMO_SPONSORS;
              } else {
                const [regRes, sponsorRes] = await Promise.all([fetch("/api/registrants", { headers: hdr() }), fetch("/api/sponsors", { headers: hdr() })]);
                regData = regRes.ok ? await regRes.json() : [];
                sponsorData = sponsorRes.ok ? await sponsorRes.json() : [];
              }

              const wb = XLSX.utils.book_new();

              // Sheet 1: Registrants
              const regHdr = ["Bidder #","Name","Email","Phone","Ranch / Company","Sponsor","Party Size","Status","Source","Amount Paid","Checked In","Date"];
              const regRows = (Array.isArray(regData)?regData:[]).map((x)=>[
                x.bidder_number||"", x.name||"", x.email||"", x.phone||"",
                x.ranch||x.notes||"", x.sponsor_name||"", x.party||1, x.status||"", x.source||"",
                x.amount||0, x.checked_in?"Yes":"No", (x.created_at||"").slice(0,10)
              ]);
              XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([regHdr,...regRows]), "Registrants");

              // Sheet 2: All Lots
              const lotHdr = ["Lot #","Description","Category","Sale Type","Consignor","Consignor Ranch","Buyer","Buyer Ranch","Bidder #","Sale Amount","Lot Fee","Commission","Net (Check)","Amt Paid","Balance Due","Buyer Paid","Delivered","Check #","Check Date"];
              const lotRows = [...lots].sort((a,b)=>Number(a.lotNo)-Number(b.lotNo)||a.lotNo.localeCompare(b.lotNo)).map((l)=>{
                const c=calc(l,eventFee);
                return [l.lotNo,l.description,l.category,l.saleType||"Live",l.consignorName,l.consignorRanch,l.buyerName,l.buyerRanch,findBidder(l.buyerName),l.amount,c.fee,c.commission,c.net,l.amountPaid||0,Math.max(0,l.amount-(l.amountPaid||0)),l.buyerPaid?"Yes":"No",l.delivered?"Yes":"No",l.checkNo,l.checkDate];
              });
              XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([lotHdr,...lotRows]), "All Lots");

              // Sheet 3: Grand Auction
              const grandRows = lots.filter(l=>l.category==="Grand Auction").sort((a,b)=>Number(a.lotNo)-Number(b.lotNo)||a.lotNo.localeCompare(b.lotNo)).map((l)=>{
                const c=calc(l,eventFee);
                return [l.lotNo,l.description,l.consignorName,l.consignorRanch,l.buyerName,l.buyerRanch,findBidder(l.buyerName),l.amount,c.fee,l.amountPaid||0,Math.max(0,l.amount-(l.amountPaid||0)),l.buyerPaid?"Yes":"No",l.delivered?"Yes":"No",l.checkNo,l.checkDate];
              });
              XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Lot #","Description","Consignor","Consignor Ranch","Buyer","Buyer Ranch","Bidder #","Sale Amount","Lot Fee","Amt Paid","Balance Due","Buyer Paid","Delivered","Check #","Check Date"],...grandRows]), "Grand Auction");

              // Sheet 4: Buyers Summary
              const buyerMap = {};
              lots.forEach((l)=>{ if(!l.buyerName) return; (buyerMap[l.buyerName]||=[]).push(l); });
              const buyerRows = Object.entries(buyerMap).sort((a,b)=>a[0].localeCompare(b[0])).map(([name,ls])=>{
                const total=ls.reduce((a,l)=>a+l.amount,0);
                const paid=ls.reduce((a,l)=>a+(l.amountPaid||0),0);
                return [name,findBidder(name),findRanch(name),ls.length,total,paid,Math.max(0,total-paid)];
              });
              XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Buyer","Bidder #","Ranch","Lots Purchased","Total Amount","Amount Paid","Balance Due"],...buyerRows]), "Buyers");

              // Sheet 5: Consignors Summary
              const consignorRows = byConsignor.map(({name,ls,t})=>[name,ls[0]?.consignorRanch||"",ls.length,t.lotTotal,t.fees,t.commission,t.net]);
              XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Consignor","Ranch","Lots","Gross","Lot Fees","Commission","Net Due"],...consignorRows]), "Consignors");

              // Sheet 6: Sponsors
              const sponsorHdr = ["Name","Tier","Amount","Status","Contact","Email","Phone","Notes"];
              const sponsorRows2 = (Array.isArray(sponsorData)?sponsorData:[]).map((s)=>[s.name||"",s.tier||"",s.amount||0,s.status||"",s.contact_name||"",s.contact_email||"",s.contact_phone||"",s.notes||""]);
              XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([sponsorHdr,...sponsorRows2]), "Sponsors");

              XLSX.writeFile(wb, "EWA-2026-AllData.xlsx");
            } catch(e){ alert("Export failed: "+e.message); }
            setXlsxLoading(false);
          };

          const Card = ({title, desc, onClick, loading, csv=true}) => (
            <div style={{background:"var(--paper)",border:"1.5px solid var(--line)",borderRadius:14,padding:"22px 24px",display:"flex",flexDirection:"column",gap:10}}>
              <div style={{fontFamily:"'Fraunces',serif",fontSize:17,fontWeight:600}}>{title}</div>
              <div style={{fontSize:13,color:"var(--inkSoft)",flex:1}}>{desc}</div>
              <button className="btn" onClick={onClick} disabled={loading} style={{alignSelf:"flex-start"}}>
                <Download size={15}/> {loading?"Preparing…":csv?"Download CSV":"Download Excel"}
              </button>
            </div>
          );

          return (<>
            <div style={{marginBottom:16}}>
              <div className="addhdr" style={{fontFamily:"'Fraunces',serif",fontSize:20,fontWeight:600,marginBottom:6}}><Download size={18}/> Export Reports</div>
              <div style={{fontSize:13,color:"var(--inkSoft)"}}>All files open directly in Excel. Connect with your organizer passcode first to export live data.</div>
            </div>
            <div style={{marginBottom:20}}>
              <Card title="Full Data Export (Excel)" desc="Single Excel workbook with all data: Registrants, All Lots, Grand Auction, Buyers, Consignors, and Sponsors — one sheet each." onClick={exportAllData} loading={xlsxLoading} csv={false} />
            </div>
            <div style={{fontSize:13,fontWeight:600,color:"var(--inkSoft)",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.05em"}}>Individual CSV Exports</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:16}}>
              <Card title="All Lots" desc="Every lot with consignor, buyer, sale amount, fees, commission, net, payment status, and delivery info." onClick={exportAllLots} />
              <Card title="Buyer Summary" desc="One row per buyer showing bidder number, ranch, lots purchased, total amount, amount paid, and balance due." onClick={exportBuyerSummary} />
              <Card title="Consignor Summary" desc="One row per consignor showing lot count, gross sales, lot fees, commission, and net check amount." onClick={exportConsignorSummary} />
              <Card title="Registrations" desc="Full registration roster with bidder numbers, contact info, party size, payment status, and check-in." onClick={exportRegistrations} loading={regLoading} />
            </div>
          </>);
        })()}
      </div>
    </div>
  );
}
