import React, { useState, useMemo, useEffect } from "react";
import {
  Plus, Trash2, Settings, Database, AlertTriangle, Check, X,
  Pencil, DollarSign, Users, Image, ChevronDown, ChevronUp, Download,
} from "lucide-react";
import AdminShell from "./AdminShell.jsx";
import { DEMO_SPONSORS } from "./demoData.js";
import { getEventConfig, withEvent, setAdminKey, getAdminKey } from "./eventConfig.js";

const IS_DEMO = new URLSearchParams(window.location.search).get("demo") === "true";
const CFG = getEventConfig();

const TIERS = [
  { name: "Presenting",  amount: 15000, color: "#7B61FF" },
  { name: "Platinum",    amount: 10000, color: "#B9842B" },
  { name: "Gold",        amount:  5000, color: "#C8A84B" },
  { name: "Silver",      amount:  2500, color: "#7A8FA6" },
  { name: "Bronze",      amount:  1000, color: "#A0673A" },
  { name: "Supporter",   amount:   500, color: "#4A7C59" },
  { name: "Custom",      amount:     0, color: "#5C564C" },
];
const TIER_NAMES = TIERS.map((t) => t.name);
const STATUSES = ["Unpaid", "Partial", "Paid", "Invoiced"];

const money = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });

function csvEsc(v) { const s = v == null ? "" : String(v); return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s; }
function downloadCsv(filename, rows) {
  const csv = rows.map((r) => r.map(csvEsc).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Quote-aware CSV line split (same approach as BoilOnTheBend.jsx)
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

// Combined benefit checklist for a sponsor: package benefits + any lines from
// the free-text benefits field (split on newlines/semicolons), deduped.
const benefitList = (s) => {
  const extra = String(s.benefits || "").split(/[\n;]+/).map((x) => x.trim()).filter(Boolean);
  return [...new Set([...(s.packageBenefits || []), ...extra])];
};

const dbToUI = (r) => ({
  id: r.id,
  name: r.name || "",
  contactName: r.contact_name || "",
  contactEmail: r.contact_email || "",
  contactPhone: r.contact_phone || "",
  tier: r.tier || "",
  amountPledged: Number(r.amount_pledged) || 0,
  amountPaid: Number(r.amount_paid) || 0,
  paymentStatus: r.payment_status || "Unpaid",
  benefits: r.benefits || "",
  logoReceived: !!r.logo_received,
  notes: r.notes || "",
  packageId: r.package_id || null,
  packageName: r.sponsor_packages?.name || null,
  packageBenefits: Array.isArray(r.sponsor_packages?.benefits) ? r.sponsor_packages.benefits : [],
  benefitsDone: r.benefits_done || {},
  logoUrl: r.logo_url || null,
});

const pkgDbToUI = (r) => ({
  id: r.id,
  name: r.name || "",
  price: Number(r.price) || 0,
  description: r.description || "",
  benefits: Array.isArray(r.benefits) ? r.benefits : [],
  sortOrder: Number(r.sort_order) || 0,
});

const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
    :root{--bone:#F4EFE6;--bone2:#EBE3D4;--paper:#FBF8F2;--ink:#1B1915;--inkSoft:#5C564C;
      --pine:#123C2E;--pine2:#0C2A20;--pineLine:#23604A;--gold:#B9842B;--goldSoft:#E2C282;
      --line:#DCD2C0;--ok:#2E7D5B;--warn:#A9601C;}
    *{box-sizing:border-box}
    .spo{font-family:'Hanken Grotesk',ui-sans-serif,system-ui;color:var(--ink);background:var(--bone);min-height:100vh;-webkit-font-smoothing:antialiased;}
    .serif{font-family:'Fraunces',Georgia,serif;}
    .wrap{max-width:1200px;margin:0 auto;padding:0 22px;}
    .head{background:linear-gradient(160deg,var(--pine),var(--pine2));color:#EAF1EC;}
    .head-in{padding:30px 0 0;}
    .eyebrow{font-size:11.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--goldSoft);font-weight:600;}
    .head h1{font-family:'Fraunces',serif;font-size:34px;font-weight:600;margin:8px 0 0;letter-spacing:-.01em;}
    .head .sub{color:#A9C0B5;font-size:14px;margin-top:4px;padding-bottom:28px;}
    .panel{padding:24px 0 90px;}
    .settings{background:var(--paper);border:1.5px solid var(--line);border-radius:14px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:18px;flex-wrap:wrap;}
    .settings label{font-size:12.5px;font-weight:700;color:#4a463d;display:flex;align-items:center;gap:7px;}
    .dot{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:6px;}
    .pwd{font-family:inherit;font-size:13px;padding:8px 11px;border:1.5px solid var(--line);border-radius:9px;background:#fff;outline:none;width:150px;}
    .btn{font-family:inherit;font-weight:700;font-size:13.5px;border-radius:10px;cursor:pointer;padding:9px 15px;display:inline-flex;align-items:center;gap:8px;border:1.5px solid transparent;background:var(--pine);color:#fff;}
    .btn:hover{background:var(--pine2);}
    .btn:disabled{opacity:.4;cursor:not-allowed;}
    .btn.ghost{background:transparent;color:var(--pine);border-color:var(--line);}
    .btn.ghost:hover{border-color:var(--pine);}
    .btn.sm{font-size:12px;padding:6px 11px;}
    .cards{display:grid;grid-template-columns:repeat(6,1fr);gap:13px;margin-bottom:22px;}
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
    .f input,.f select,.f textarea{font-family:inherit;font-size:13.5px;padding:9px 11px;border:1.5px solid var(--line);border-radius:9px;background:#fff;color:var(--ink);outline:none;width:100%;}
    .f input:focus,.f select:focus,.f textarea:focus{border-color:var(--pine);}
    .f textarea{resize:vertical;min-height:60px;}
    .span2{grid-column:span 2;}.span3{grid-column:span 3;}.span4{grid-column:span 4;}.span6{grid-column:span 6;}.span12{grid-column:span 12;}
    @media(max-width:760px){.span2,.span3,.span4,.span6{grid-column:span 6;}}
    .hint{font-size:12px;color:var(--inkSoft);margin-top:10px;display:flex;align-items:center;gap:7px;}
    .tbl{width:100%;border-collapse:collapse;background:var(--paper);border:1.5px solid var(--line);border-radius:13px;overflow:hidden;font-size:13px;}
    .tbl th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--inkSoft);font-weight:700;padding:11px 12px;background:var(--bone2);border-bottom:1.5px solid var(--line);}
    .tbl td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle;}
    .tbl .num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;}
    .tbl tr:last-child td{border-bottom:none;}
    .badge{font-size:10.5px;font-weight:700;padding:3px 8px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap;display:inline-block;}
    .b-paid{background:#e4f0e9;color:var(--ok);}
    .b-partial{background:#fef3e2;color:#8a5c00;}
    .b-unpaid{background:#fde8e0;color:var(--warn);}
    .b-invoiced{background:#e7eef0;color:#2a5560;}
    .tier-chip{font-size:11px;font-weight:700;padding:3px 9px;border-radius:999px;color:#fff;display:inline-block;white-space:nowrap;}
    .logo-yes{color:var(--ok);font-weight:700;font-size:12px;}
    .logo-no{color:#ccc;font-size:12px;}
    .mini{font-family:inherit;font-size:12.5px;padding:5px 8px;border:1.5px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);outline:none;}
    .mini:focus{border-color:var(--pine);}
    .edit-btn{background:none;border:none;cursor:pointer;color:var(--inkSoft);padding:2px;}
    .edit-btn:hover{color:var(--pine);}
    .trash{background:none;border:none;cursor:pointer;color:#a23b1c;padding:2px;}
    .expand-row td{background:#f0f4f0;padding:16px 20px;border-bottom:2px solid var(--pine);}
    .exp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:14px;}
    .exp-field label{font-size:11px;font-weight:700;color:#4a463d;display:block;margin-bottom:4px;}
    .exp-field input,.exp-field select,.exp-field textarea{font-family:inherit;font-size:13px;padding:7px 9px;border:1.5px solid var(--line);border-radius:8px;background:#fff;color:var(--ink);outline:none;width:100%;}
    .exp-field input:focus,.exp-field select:focus,.exp-field textarea:focus{border-color:var(--pine);}
    .exp-field textarea{resize:vertical;min-height:58px;}
    .chkrow{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:#4a463d;margin-top:20px;}
    .tier-section{margin-bottom:28px;}
    .tier-hdr{font-family:'Fraunces',serif;font-size:15px;font-weight:600;color:var(--pine);padding:10px 0 6px;border-bottom:2px solid var(--line);margin-bottom:8px;display:flex;align-items:center;gap:10px;}
    .bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;justify-content:space-between;}
    .empty{background:var(--paper);border:1.5px dashed var(--line);border-radius:14px;padding:46px 20px;text-align:center;color:var(--inkSoft);}
    .empty .big{font-family:'Fraunces',serif;font-size:18px;color:var(--ink);margin-bottom:4px;}
    .pkgs{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:13px;margin-bottom:16px;}
    .pkg{background:var(--paper);border:1.5px solid var(--line);border-radius:14px;padding:15px 16px;display:flex;flex-direction:column;gap:5px;}
    .pkg .nm{font-family:'Fraunces',serif;font-size:16px;font-weight:600;display:flex;justify-content:space-between;align-items:flex-start;gap:8px;}
    .pkg .pr{font-family:'Fraunces',serif;font-size:20px;font-weight:600;color:var(--pine);}
    .pkg .desc{font-size:12.5px;color:var(--inkSoft);}
    .pkg ul{margin:4px 0 0;padding-left:18px;font-size:12.5px;color:var(--inkSoft);}
    .pkg ul li{margin-bottom:2px;}
    .pkg .cnt{margin-top:auto;padding-top:8px;font-size:11.5px;font-weight:700;color:var(--pine);text-transform:uppercase;letter-spacing:.05em;}
    .chklist{display:flex;flex-direction:column;gap:5px;margin-top:6px;}
    .chklist label{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink);cursor:pointer;}
    .chklist label.done{color:var(--ok);text-decoration:line-through;}
    .blk-hdr{font-size:11px;font-weight:700;color:#4a463d;display:flex;align-items:center;gap:8px;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em;}
  `}</style>
);

const tierColor = (t) => TIERS.find((x) => x.name === t)?.color || "#9DB3A8";
const statusClass = (s) => s === "Paid" ? "b-paid" : s === "Partial" ? "b-partial" : s === "Invoiced" ? "b-invoiced" : "b-unpaid";

const blankForm = { name: "", contactName: "", contactEmail: "", contactPhone: "", tier: "Gold", packageId: "", amountPledged: "", amountPaid: "", paymentStatus: "Unpaid", benefits: "", logoReceived: false, notes: "" };
const blankPkgForm = { name: "", price: "", description: "", benefitsText: "" };

const DEMO_PACKAGES = [
  { id: "pkg-demo-1", name: "Presenting Partner", price: 15000, description: "Top billing across the entire event.", benefits: ["10 registrations", "Stage banner", "Full-page program ad", "2 VIP tables"], sortOrder: 0 },
  { id: "pkg-demo-2", name: "Gold Package", price: 5000, description: "Strong visibility throughout the weekend.", benefits: ["5 registrations", "Half-page program ad", "1 table"], sortOrder: 1 },
  { id: "pkg-demo-3", name: "Supporter Package", price: 500, description: "Show your support in the program.", benefits: ["2 registrations", "Name in program"], sortOrder: 2 },
];

export default function Sponsorships() {
  const [sponsors, setSponsors] = useState([]);
  const [passcode, setPasscode] = useState(getAdminKey());
  const [db, setDb] = useState("idle");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(blankForm);
  const [formErr, setFormErr] = useState("");
  const [expandId, setExpandId] = useState(null);
  const [editBuf, setEditBuf] = useState({});
  const [packages, setPackages] = useState([]);
  const [pkgForm, setPkgForm] = useState(blankPkgForm);
  const [pkgErr, setPkgErr] = useState("");
  const [editPkgId, setEditPkgId] = useState(null);
  const [pkgEditBuf, setPkgEditBuf] = useState({});
  const [csvText, setCsvText] = useState("");
  const [importMsg, setImportMsg] = useState("");

  const connected = db === "live";
  const hdr = () => ({ "Content-Type": "application/json", "x-organizer-key": passcode });
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const dotColor = db === "live" ? "var(--ok)" : db === "offline" ? "var(--warn)" : "#9DB3A8";

  useEffect(() => {
    if (!IS_DEMO) return;
    setSponsors(DEMO_SPONSORS.map((s) => ({ id: s.id, name: s.name, contactName: s.contact_name || "", contactEmail: s.contact_email || "", contactPhone: s.contact_phone || "", tier: s.tier, amountPledged: s.amount, amountPaid: s.status === "paid" ? s.amount : 0, paymentStatus: s.status === "paid" ? "Paid" : "Invoiced", benefits: "", logoReceived: false, notes: s.notes || "", packageId: null, packageName: null, packageBenefits: [], benefitsDone: {}, logoUrl: null })));
    setPackages(DEMO_PACKAGES);
    setDb("live");
  }, []);

  const connect = async () => {
    setDb("loading"); setMsg("");
    try {
      const r = await fetch(withEvent("/api/sponsors"), { headers: hdr() });
      if (!r.ok) throw new Error(r.status === 401 ? "Wrong passcode." : `Error ${r.status}`);
      const data = await r.json();
      setSponsors(Array.isArray(data) ? data.map(dbToUI) : []);
      try {
        const pr = await fetch(withEvent("/api/sponsor-packages"), { headers: hdr() });
        if (pr.ok) { const pd = await pr.json(); setPackages(Array.isArray(pd) ? pd.map(pkgDbToUI) : []); }
      } catch {}
      setAdminKey(passcode);
      setDb("live");
      setMsg(`Connected — ${Array.isArray(data) ? data.length : 0} sponsor${data.length === 1 ? "" : "s"} loaded.`);
    } catch (e) {
      setDb("offline");
      setMsg(`Could not connect (${e.message})`);
    }
  };

  const addSponsor = async () => {
    setFormErr("");
    if (!form.name.trim()) { setFormErr("Sponsor name is required."); return; }
    const pkg = packages.find((p) => p.id === form.packageId);
    const ui = {
      id: "tmp-" + Date.now(),
      name: form.name.trim(),
      contactName: form.contactName.trim(),
      contactEmail: form.contactEmail.trim(),
      contactPhone: form.contactPhone.trim(),
      tier: form.tier,
      amountPledged: Number(form.amountPledged) || 0,
      amountPaid: Number(form.amountPaid) || 0,
      paymentStatus: form.paymentStatus,
      benefits: form.benefits.trim(),
      logoReceived: form.logoReceived,
      notes: form.notes.trim(),
      packageId: form.packageId || null,
      packageName: pkg?.name || null,
      packageBenefits: pkg?.benefits || [],
      benefitsDone: {},
      logoUrl: null,
    };
    setSponsors((p) => [...p, ui]);
    setForm(blankForm);
    if (!IS_DEMO && connected) {
      try {
        const r = await fetch(withEvent("/api/sponsors"), { method: "POST", headers: hdr(), body: JSON.stringify({ ...ui, packageId: String(ui.packageId || "").startsWith("tmp-") ? null : ui.packageId }) });
        if (r.ok) { const row = await r.json(); setSponsors((p) => p.map((s) => s.id === ui.id ? { ...s, id: row.id } : s)); }
      } catch {}
    }
  };

  const saveSponsor = async (id) => {
    const patch = editBuf[id] || {};
    setSponsors((p) => p.map((s) => s.id === id ? { ...s, ...patch } : s));
    setExpandId(null);
    if (!IS_DEMO && connected && !String(id).startsWith("tmp-")) {
      try { await fetch(withEvent("/api/sponsors"), { method: "PATCH", headers: hdr(), body: JSON.stringify({ id, ...patch }) }); } catch {}
    }
  };

  const patchField = async (id, key, value) => {
    setSponsors((p) => p.map((s) => s.id === id ? { ...s, [key]: value } : s));
    if (!IS_DEMO && connected && !String(id).startsWith("tmp-")) {
      try { await fetch(withEvent("/api/sponsors"), { method: "PATCH", headers: hdr(), body: JSON.stringify({ id, [key]: value }) }); } catch {}
    }
  };

  const delSponsor = async (id) => {
    setSponsors((p) => p.filter((s) => s.id !== id));
    if (!IS_DEMO && connected && !String(id).startsWith("tmp-")) {
      try { await fetch(withEvent(`/api/sponsors?id=${id}`), { method: "DELETE", headers: hdr() }); } catch {}
    }
  };

  /* ---- sponsorship packages ---- */
  const createPackage = async (data) => {
    const ui = { id: "tmp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7), ...data };
    setPackages((p) => [...p, ui]);
    if (!IS_DEMO && connected) {
      try {
        const r = await fetch(withEvent("/api/sponsor-packages"), { method: "POST", headers: hdr(), body: JSON.stringify(data) });
        if (r.ok) { const row = await r.json(); setPackages((p) => p.map((x) => x.id === ui.id ? pkgDbToUI(row) : x)); }
      } catch {}
    }
  };

  const addPackage = async () => {
    setPkgErr("");
    if (!pkgForm.name.trim()) { setPkgErr("Package name is required."); return; }
    const benefits = pkgForm.benefitsText.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    await createPackage({ name: pkgForm.name.trim(), price: Number(pkgForm.price) || 0, description: pkgForm.description.trim(), benefits, sortOrder: packages.length });
    setPkgForm(blankPkgForm);
  };

  const savePackage = async (id) => {
    const buf = pkgEditBuf[id]; if (!buf) { setEditPkgId(null); return; }
    const benefits = String(buf.benefitsText || "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    const patch = { name: buf.name.trim(), price: Number(buf.price) || 0, description: (buf.description || "").trim(), benefits };
    setPackages((p) => p.map((x) => x.id === id ? { ...x, ...patch } : x));
    setSponsors((p) => p.map((s) => s.packageId === id ? { ...s, packageName: patch.name, packageBenefits: benefits } : s));
    setEditPkgId(null);
    if (!IS_DEMO && connected && !String(id).startsWith("tmp-")) {
      try { await fetch(withEvent("/api/sponsor-packages"), { method: "PATCH", headers: hdr(), body: JSON.stringify({ id, ...patch }) }); } catch {}
    }
  };

  const delPackage = async (id) => {
    setPackages((p) => p.filter((x) => x.id !== id));
    setSponsors((p) => p.map((s) => s.packageId === id ? { ...s, packageId: null, packageName: null, packageBenefits: [] } : s));
    if (!IS_DEMO && connected && !String(id).startsWith("tmp-")) {
      try { await fetch(withEvent(`/api/sponsor-packages?id=${id}`), { method: "DELETE", headers: hdr() }); } catch {}
    }
  };

  const openPkgEdit = (p) => { setEditPkgId(p.id); setPkgEditBuf((b) => ({ ...b, [p.id]: { name: p.name, price: p.price, description: p.description, benefitsText: p.benefits.join("\n") } })); };
  const setPB = (id, k, v) => setPkgEditBuf((p) => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));

  const downloadPkgTemplate = () => downloadCsv("sponsor-packages-template.csv", [
    ["Package Name", "Price", "Description", "Benefits"],
    ["Gold Package", "5000", "Strong visibility throughout the weekend", "5 registrations; Full-page ad; 1 table"],
  ]);

  const exportPkgCsv = () => downloadCsv("sponsor-packages-2026.csv", [
    ["Package Name", "Price", "Description", "Benefits"],
    ...packages.map((p) => [p.name, p.price, p.description, p.benefits.join("; ")]),
  ]);

  const importPkgCsv = async (text) => {
    setImportMsg("");
    const lines = String(text || "").replace(/^\uFEFF/, "").trim().split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) { setImportMsg("Nothing to import."); return; }
    let rows = lines.map(splitCSVLine);
    if (rows[0][0] && rows[0][0].trim().toLowerCase().replace(/\s+/g, " ") === "package name") rows = rows.slice(1);
    let n = 0;
    for (const cells of rows) {
      const [name, price, description, benefitsStr] = cells.map((c) => (c || "").trim());
      if (!name) continue;
      const benefits = (benefitsStr || "").split(";").map((x) => x.trim()).filter(Boolean);
      await createPackage({ name, price: Number(String(price).replace(/[^\d.]/g, "")) || 0, description: description || "", benefits, sortOrder: packages.length + n });
      n++;
    }
    setImportMsg(`Imported ${n} package${n === 1 ? "" : "s"}.`);
    setCsvText("");
  };

  /* ---- logo upload ---- */
  const uploadLogo = (s, file) => {
    if (!file || IS_DEMO || String(s.id).startsWith("tmp-")) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataBase64 = String(reader.result).split(",")[1] || "";
      try {
        const r = await fetch(withEvent("/api/sponsor-logo"), { method: "POST", headers: hdr(), body: JSON.stringify({ sponsorId: s.id, filename: file.name, contentType: file.type, dataBase64 }) });
        if (r.ok) {
          const j = await r.json();
          setSponsors((p) => p.map((x) => x.id === s.id ? { ...x, logoUrl: j.logoUrl, logoReceived: true } : x));
        }
      } catch {}
    };
    reader.readAsDataURL(file);
  };

  const setEB = (id, k, v) => setEditBuf((p) => ({ ...p, [id]: { ...(p[id] || {}), [k]: v } }));
  const openExpand = (s) => { setExpandId(s.id); setEditBuf((p) => ({ ...p, [s.id]: { ...s } })); };

  const exportCsv = () => {
    const rows = [...sponsors].sort((a, b) => a.name.localeCompare(b.name)).map((s) => [
      s.name, s.contactName, s.contactEmail, s.contactPhone, s.tier,
      s.amountPledged, s.amountPaid, Math.max(0, s.amountPledged - s.amountPaid),
      s.paymentStatus, s.logoReceived ? "Yes" : "No", s.benefits, s.notes,
    ]);
    downloadCsv("sponsors-2026.csv", [["Name","Contact","Email","Phone","Tier","Pledged","Paid","Balance","Status","Logo Received","Benefits","Notes"], ...rows]);
  };

  const totPledged  = sponsors.reduce((a, s) => a + s.amountPledged, 0);
  const totPaid     = sponsors.reduce((a, s) => a + s.amountPaid, 0);
  const totBalance  = Math.max(0, totPledged - totPaid);
  const logoCount   = sponsors.filter((s) => s.logoReceived).length;
  const benefitTotals = sponsors.reduce((a, s) => {
    const list = benefitList(s);
    a.total += list.length;
    a.done  += list.filter((b) => s.benefitsDone?.[b]).length;
    return a;
  }, { total: 0, done: 0 });

  const byTier = useMemo(() => {
    const map = {};
    sponsors.forEach((s) => { const k = s.packageName || s.tier || "Custom"; (map[k] ||= []).push(s); });
    const pkgNames = packages.map((p) => p.name);
    const order = [...pkgNames, ...TIER_NAMES.filter((t) => !pkgNames.includes(t))];
    const groups = order.filter((k) => map[k]?.length).map((k) => ({ tier: k, isPackage: pkgNames.includes(k), items: map[k] }));
    Object.keys(map).forEach((k) => { if (!order.includes(k)) groups.push({ tier: k, isPackage: false, items: map[k] }); });
    return groups;
  }, [sponsors, packages]);

  return (
    <AdminShell active="sponsorships"><div className="spo"><Styles />
      <div className="head"><div className="wrap head-in">
        <div className="eyebrow">{`${CFG.orgName} · 2026`}</div>
        <h1 className="serif">Sponsorship Management</h1>
        <div className="sub">Track sponsors, tiers, payments, and artwork</div>
      </div></div>

      <div className="wrap panel">
        {IS_DEMO && (
          <div style={{background:"#B9842B",color:"#fff",borderRadius:10,padding:"10px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:10,fontWeight:600,fontSize:14}}>
            <AlertTriangle size={16}/> DEMO MODE — Sample data only. No real data is shown or saved. All features are fully functional.
          </div>
        )}
        {/* ---- connection bar ---- */}
        {!IS_DEMO && <div className="settings">
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}><span className="dot" style={{ background: dotColor }} />{db === "live" ? "Connected" : db === "offline" ? "Offline" : "Not connected"}</span>
            <input className="pwd" type="password" placeholder="Organizer passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && connect()} />
            <button className="btn" onClick={connect} disabled={db === "loading"}><Database size={15} />{db === "loading" ? "Connecting…" : "Connect"}</button>
          </div>
        </div>}
        {!IS_DEMO && msg && <div className="hint" style={{ marginTop: -10, marginBottom: 16, color: db === "offline" ? "var(--warn)" : "var(--ok)" }}>{db === "offline" && <AlertTriangle size={14} />}{msg}</div>}

        {/* ---- KPIs ---- */}
        <div className="cards">
          <div className="kpi"><div className="l"><Users size={13} /> Total sponsors</div><div className="n">{sponsors.length}</div></div>
          <div className="kpi"><div className="l"><DollarSign size={13} /> Total pledged</div><div className="n">{money0(totPledged)}</div></div>
          <div className="kpi accent"><div className="l"><DollarSign size={13} /> Total paid</div><div className="n">{money0(totPaid)}</div></div>
          <div className="kpi"><div className="l"><DollarSign size={13} /> Outstanding</div><div className="n">{money0(totBalance)}</div></div>
          <div className="kpi"><div className="l"><Image size={13} /> Logos received</div><div className="n">{logoCount} / {sponsors.length}</div></div>
          <div className="kpi"><div className="l"><Check size={13} /> Benefits delivered</div><div className="n">{benefitTotals.done} / {benefitTotals.total}</div></div>
        </div>

        {/* ---- sponsorship packages ---- */}
        <div className="addcard">
          <div className="addhdr" style={{ justifyContent: "space-between" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 9 }}><DollarSign size={17} /> Sponsorship Packages</span>
            <button className="btn ghost sm" onClick={exportPkgCsv} disabled={!packages.length}><Download size={13} /> Export packages CSV</button>
          </div>

          {packages.length > 0 && (
            <div className="pkgs">
              {packages.map((p) => {
                const count = sponsors.filter((s) => s.packageId === p.id).length;
                const isEd = editPkgId === p.id;
                const pb = pkgEditBuf[p.id] || {};
                return (
                  <div key={p.id} className="pkg">
                    {isEd ? (
                      <div className="fgrid" style={{ gap: 8 }}>
                        <div className="f span12"><label>Name</label><input value={pb.name || ""} onChange={(e) => setPB(p.id, "name", e.target.value)} /></div>
                        <div className="f span6"><label>Price</label><input inputMode="decimal" value={pb.price ?? ""} onChange={(e) => setPB(p.id, "price", e.target.value.replace(/[^\d.]/g, ""))} /></div>
                        <div className="f span6"><label>Description</label><input value={pb.description || ""} onChange={(e) => setPB(p.id, "description", e.target.value)} /></div>
                        <div className="f span12"><label>Benefits (one per line)</label><textarea value={pb.benefitsText || ""} onChange={(e) => setPB(p.id, "benefitsText", e.target.value)} /></div>
                        <div className="f span12" style={{ flexDirection: "row", gap: 8 }}>
                          <button className="btn sm" onClick={() => savePackage(p.id)}><Check size={13} /> Save</button>
                          <button className="btn ghost sm" onClick={() => setEditPkgId(null)}><X size={13} /> Cancel</button>
                        </div>
                      </div>
                    ) : (<>
                      <div className="nm">
                        <span>{p.name}</span>
                        <span style={{ whiteSpace: "nowrap" }}>
                          <button className="edit-btn" title="Edit package" onClick={() => openPkgEdit(p)}><Pencil size={14} /></button>
                          <button className="trash" title="Delete package" onClick={() => delPackage(p.id)}><Trash2 size={14} /></button>
                        </span>
                      </div>
                      <div className="pr">{money0(p.price)}</div>
                      {p.description && <div className="desc">{p.description}</div>}
                      {p.benefits.length > 0 && <ul>{p.benefits.map((b) => <li key={b}>{b}</li>)}</ul>}
                      <div className="cnt">{count} sponsor{count !== 1 ? "s" : ""}</div>
                    </>)}
                  </div>
                );
              })}
            </div>
          )}

          <div className="fgrid">
            <div className="f span3"><label>Package name *</label><input value={pkgForm.name} onChange={(e) => setPkgForm((p) => ({ ...p, name: e.target.value }))} placeholder="Gold Package" /></div>
            <div className="f span2"><label>Price</label><input inputMode="decimal" value={pkgForm.price} onChange={(e) => setPkgForm((p) => ({ ...p, price: e.target.value.replace(/[^\d.]/g, "") }))} placeholder="5000" /></div>
            <div className="f span3"><label>Description</label><input value={pkgForm.description} onChange={(e) => setPkgForm((p) => ({ ...p, description: e.target.value }))} placeholder="Strong visibility throughout the weekend" /></div>
            <div className="f span4"><label>Benefits (one per line)</label><textarea value={pkgForm.benefitsText} onChange={(e) => setPkgForm((p) => ({ ...p, benefitsText: e.target.value }))} placeholder={"5 registrations\nFull-page program ad\n1 table"} /></div>
            <div className="f span12" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              {pkgErr ? <span style={{ fontSize: 12.5, color: "var(--warn)", display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} />{pkgErr}</span> : <span />}
              <button className="btn" onClick={addPackage}><Plus size={16} /> Add package</button>
            </div>
          </div>

          <div style={{ marginTop: 14, borderTop: "1.5px solid var(--line)", paddingTop: 14 }}>
            <div className="blk-hdr">CSV import</div>
            <div className="fgrid">
              <div className="f span6"><label>Paste CSV rows (Package Name, Price, Description, Benefits — semicolon-separated)</label>
                <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={'Gold Package,5000,Great visibility,"5 registrations; Full-page ad; 1 table"'} />
              </div>
              <div className="f span6" style={{ justifyContent: "flex-end", gap: 8 }}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <button className="btn ghost sm" onClick={downloadPkgTemplate}><Download size={13} /> Download template</button>
                  <button className="btn sm" onClick={() => importPkgCsv(csvText)} disabled={!csvText.trim()}><Plus size={13} /> Import</button>
                  <input type="file" accept=".csv" style={{ fontSize: 12.5 }}
                    onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => importPkgCsv(String(rd.result)); rd.readAsText(f); e.target.value = ""; }} />
                </div>
                {importMsg && <div className="hint" style={{ marginTop: 4, color: "var(--ok)" }}><Check size={13} />{importMsg}</div>}
              </div>
            </div>
          </div>
        </div>

        {/* ---- add form ---- */}
        <div className="addcard">
          <div className="addhdr"><Plus size={17} /> Add Sponsor</div>
          <div className="fgrid">
            <div className="f span4"><label>Sponsor name *</label><input value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder="Acme Ranch Supply" /></div>
            <div className="f span4"><label>Package</label>
              <select value={form.packageId} onChange={(e) => { const pkg = packages.find((x) => x.id === e.target.value); setForm((p) => ({ ...p, packageId: e.target.value, ...(pkg ? { amountPledged: pkg.price, tier: pkg.name } : {}) })); }}>
                <option value="">— None —</option>
                {packages.map((p) => <option key={p.id} value={p.id}>{p.name} ({money0(p.price)})</option>)}
              </select>
            </div>
            <div className="f span4"><label>Tier</label>
              <select value={form.tier} onChange={(e) => { const t = TIERS.find((x) => x.name === e.target.value); setForm((p) => ({ ...p, tier: e.target.value, amountPledged: t?.amount || p.amountPledged })); }}>
                {form.tier && !TIER_NAMES.includes(form.tier) && <option>{form.tier}</option>}
                {TIER_NAMES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="f span3"><label>Amount pledged</label><input inputMode="decimal" value={form.amountPledged} onChange={(e) => setF("amountPledged", e.target.value.replace(/[^\d.]/g, ""))} placeholder="5000" /></div>
            <div className="f span3"><label>Amount paid</label><input inputMode="decimal" value={form.amountPaid} onChange={(e) => setF("amountPaid", e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" /></div>
            <div className="f span3"><label>Status</label><select value={form.paymentStatus} onChange={(e) => setF("paymentStatus", e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="f span3" style={{ justifyContent: "flex-end" }}>
              <label className="chkrow" style={{ marginTop: 20 }}><input type="checkbox" checked={form.logoReceived} onChange={(e) => setF("logoReceived", e.target.checked)} /> Logo received</label>
            </div>
            <div className="f span4"><label>Contact name</label><input value={form.contactName} onChange={(e) => setF("contactName", e.target.value)} placeholder="Jane Smith" /></div>
            <div className="f span4"><label>Contact email</label><input type="email" value={form.contactEmail} onChange={(e) => setF("contactEmail", e.target.value)} placeholder="jane@ranch.com" /></div>
            <div className="f span4"><label>Contact phone</label><input value={form.contactPhone} onChange={(e) => setF("contactPhone", e.target.value)} placeholder="(555) 000-0000" /></div>
            <div className="f span6"><label>Benefits</label><textarea value={form.benefits} onChange={(e) => setF("benefits", e.target.value)} placeholder="Banner on stage, full-page program ad, 2 VIP tables…" /></div>
            <div className="f span6"><label>Notes</label><textarea value={form.notes} onChange={(e) => setF("notes", e.target.value)} placeholder="Internal notes…" /></div>
            <div className="f span12" style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              {formErr ? <span style={{ fontSize: 12.5, color: "var(--warn)", display: "flex", alignItems: "center", gap: 6 }}><AlertTriangle size={13} />{formErr}</span> : <span />}
              <button className="btn" onClick={addSponsor}><Plus size={16} /> Add sponsor</button>
            </div>
          </div>
        </div>

        {/* ---- sponsor list ---- */}
        {sponsors.length === 0 ? (
          <div className="empty"><div className="big">No sponsors yet</div>Connect with your organizer passcode, then add sponsors above.</div>
        ) : (<>
          <div className="bar">
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--inkSoft)" }}>{sponsors.length} sponsor{sponsors.length !== 1 ? "s" : ""} · {money0(totPledged)} pledged · {money0(totPaid)} paid</span>
            <button className="btn ghost" onClick={exportCsv}><Download size={14} /> Export CSV</button>
          </div>

          {byTier.map(({ tier, isPackage, items }) => (
            <div key={tier} className="tier-section">
              <div className="tier-hdr">
                <span className="tier-chip" style={{ background: isPackage ? "#123C2E" : tierColor(tier) }}>{tier}</span>
                <span style={{ fontSize: 13, color: "var(--inkSoft)" }}>{items.length} sponsor{items.length !== 1 ? "s" : ""} · {money0(items.reduce((a, s) => a + s.amountPledged, 0))} pledged</span>
              </div>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Sponsor</th><th>Contact</th><th className="num">Pledged</th><th className="num">Paid</th><th className="num">Balance</th><th>Status</th><th>Logo</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => {
                    const bal = Math.max(0, s.amountPledged - s.amountPaid);
                    const isOpen = expandId === s.id;
                    const eb = editBuf[s.id] || s;
                    return (
                      <React.Fragment key={s.id}>
                        <tr>
                          <td>
                            <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                              {s.name}
                              {s.packageName && <span className="tier-chip" style={{ background: TIERS.find((x) => x.name === s.packageName)?.color || "#123C2E" }}>{s.packageName}</span>}
                            </div>
                            {s.benefits && <div style={{ fontSize: 11.5, color: "var(--inkSoft)", marginTop: 2 }}>{s.benefits}</div>}
                          </td>
                          <td>
                            <div>{s.contactName || "—"}</div>
                            {s.contactEmail && <div style={{ fontSize: 11.5, color: "var(--inkSoft)" }}>{s.contactEmail}</div>}
                            {s.contactPhone && <div style={{ fontSize: 11.5, color: "var(--inkSoft)" }}>{s.contactPhone}</div>}
                          </td>
                          <td className="num">{money(s.amountPledged)}</td>
                          <td className="num">
                            <input className="mini" style={{ width: 90, textAlign: "right" }} inputMode="decimal"
                              value={s.amountPaid === 0 ? "" : s.amountPaid} placeholder="0.00"
                              onChange={(e) => { const v = Number(e.target.value.replace(/[^\d.]/g,""))||0; patchField(s.id,"amountPaid",v); }} />
                          </td>
                          <td className="num" style={{ fontWeight: 700, color: bal > 0 ? "var(--warn)" : "var(--ok)" }}>{money(bal)}</td>
                          <td>
                            <select className="mini" value={s.paymentStatus} onChange={(e) => patchField(s.id, "paymentStatus", e.target.value)}>
                              {STATUSES.map((st) => <option key={st}>{st}</option>)}
                            </select>
                          </td>
                          <td>
                            <button className={`ci ${s.logoReceived ? "on" : ""}`} style={{ background: "none", border: "none", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "inherit", fontSize: 12, fontWeight: 600, color: s.logoReceived ? "var(--ok)" : "#bbb" }}
                              onClick={() => patchField(s.id, "logoReceived", !s.logoReceived)}>
                              {s.logoReceived ? <Check size={14} /> : <X size={14} />}{s.logoReceived ? "Yes" : "No"}
                            </button>
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <button className="edit-btn" title="Edit" onClick={() => isOpen ? setExpandId(null) : openExpand(s)}>
                              {isOpen ? <ChevronUp size={15} /> : <Pencil size={15} />}
                            </button>
                            <button className="trash" onClick={() => delSponsor(s.id)}><Trash2 size={15} /></button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="expand-row">
                            <td colSpan={8}>
                              <div className="exp-grid">
                                <div className="exp-field"><label>Sponsor name</label><input value={eb.name||""} onChange={(e) => setEB(s.id,"name",e.target.value)} /></div>
                                <div className="exp-field"><label>Tier</label>
                                  <select value={eb.tier||""} onChange={(e) => setEB(s.id,"tier",e.target.value)}>
                                    {TIER_NAMES.map((t) => <option key={t}>{t}</option>)}
                                  </select>
                                </div>
                                <div className="exp-field"><label>Amount pledged</label><input inputMode="decimal" value={eb.amountPledged||""} onChange={(e) => setEB(s.id,"amountPledged",Number(e.target.value.replace(/[^\d.]/g,""))||0)} /></div>
                                <div className="exp-field"><label>Contact name</label><input value={eb.contactName||""} onChange={(e) => setEB(s.id,"contactName",e.target.value)} /></div>
                                <div className="exp-field"><label>Contact email</label><input value={eb.contactEmail||""} onChange={(e) => setEB(s.id,"contactEmail",e.target.value)} /></div>
                                <div className="exp-field"><label>Contact phone</label><input value={eb.contactPhone||""} onChange={(e) => setEB(s.id,"contactPhone",e.target.value)} /></div>
                                <div className="exp-field" style={{ gridColumn: "span 2" }}><label>Benefits</label><textarea value={eb.benefits||""} onChange={(e) => setEB(s.id,"benefits",e.target.value)} /></div>
                                <div className="exp-field" style={{ gridColumn: "span 2" }}><label>Notes</label><textarea value={eb.notes||""} onChange={(e) => setEB(s.id,"notes",e.target.value)} /></div>
                              </div>
                              {(() => {
                                const list = benefitList(s);
                                const done = list.filter((b) => s.benefitsDone?.[b]).length;
                                const canUpload = !IS_DEMO && !String(s.id).startsWith("tmp-");
                                return (
                                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
                                    <div>
                                      <div className="blk-hdr">Benefits checklist {list.length > 0 && <span style={{ color: "var(--pine)" }}>{done} of {list.length} delivered</span>}</div>
                                      {list.length === 0 ? (
                                        <div style={{ fontSize: 12.5, color: "var(--inkSoft)" }}>No benefits — pick a package or add benefit lines above.</div>
                                      ) : (
                                        <div className="chklist">
                                          {list.map((b) => {
                                            const cur = !!s.benefitsDone?.[b];
                                            return (
                                              <label key={b} className={cur ? "done" : ""}>
                                                <input type="checkbox" checked={cur} onChange={() => patchField(s.id, "benefitsDone", { ...s.benefitsDone, [b]: !cur })} />
                                                {b}
                                              </label>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                    <div>
                                      <div className="blk-hdr">Logo</div>
                                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                        {s.logoUrl ? (
                                          <img src={s.logoUrl} alt={`${s.name} logo`} style={{ maxHeight: 48, maxWidth: 140, borderRadius: 6, border: "1.5px solid var(--line)", background: "#fff", padding: 3 }} />
                                        ) : (
                                          <span style={{ fontSize: 12.5, color: "var(--inkSoft)" }}>No logo uploaded yet.</span>
                                        )}
                                        <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" disabled={!canUpload} style={{ fontSize: 12.5 }}
                                          onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(s, f); e.target.value = ""; }} />
                                        {!canUpload && <span style={{ fontSize: 11.5, color: "var(--inkSoft)" }}>{IS_DEMO ? "Upload disabled in demo." : "Save the sponsor first."}</span>}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })()}
                              <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
                                <button className="btn sm" onClick={() => saveSponsor(s.id)}><Check size={13} /> Save</button>
                                <button className="btn ghost sm" onClick={() => setExpandId(null)}><X size={13} /> Cancel</button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}

          <div style={{ marginTop: 24, background: "var(--pine)", color: "#EAF1EC", borderRadius: 14, padding: "18px 22px", display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            <div><div style={{ fontSize: 11, color: "var(--goldSoft)", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600 }}>Total sponsors</div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 23, fontWeight: 600, color: "#fff", marginTop: 4 }}>{sponsors.length}</div></div>
            <div><div style={{ fontSize: 11, color: "var(--goldSoft)", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600 }}>Total pledged</div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 23, fontWeight: 600, color: "#fff", marginTop: 4 }}>{money0(totPledged)}</div></div>
            <div><div style={{ fontSize: 11, color: "var(--goldSoft)", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600 }}>Total paid</div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 23, fontWeight: 600, color: "#fff", marginTop: 4 }}>{money0(totPaid)}</div></div>
            <div><div style={{ fontSize: 11, color: "var(--goldSoft)", textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 600 }}>Outstanding</div><div style={{ fontFamily: "'Fraunces',serif", fontSize: 23, fontWeight: 600, color: "#fff", marginTop: 4 }}>{money0(totBalance)}</div></div>
          </div>
        </>)}
      </div>
    </div></AdminShell>
  );
}
