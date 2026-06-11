import React, { useState, useMemo } from "react";
import {
  Plus, Trash2, Settings, Database, AlertTriangle, Check, X,
  Pencil, DollarSign, Users, Image, ChevronDown, ChevronUp, Download,
} from "lucide-react";

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
    .head{background:linear-gradient(160deg,#123C2E,#0C2A20);color:#EAF1EC;}
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
  `}</style>
);

const tierColor = (t) => TIERS.find((x) => x.name === t)?.color || "#9DB3A8";
const statusClass = (s) => s === "Paid" ? "b-paid" : s === "Partial" ? "b-partial" : s === "Invoiced" ? "b-invoiced" : "b-unpaid";

const blankForm = { name: "", contactName: "", contactEmail: "", contactPhone: "", tier: "Gold", amountPledged: "", amountPaid: "", paymentStatus: "Unpaid", benefits: "", logoReceived: false, notes: "" };

export default function Sponsorships() {
  const [sponsors, setSponsors] = useState([]);
  const [passcode, setPasscode] = useState("");
  const [db, setDb] = useState("idle");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState(blankForm);
  const [formErr, setFormErr] = useState("");
  const [expandId, setExpandId] = useState(null);
  const [editBuf, setEditBuf] = useState({});

  const connected = db === "live";
  const hdr = () => ({ "Content-Type": "application/json", "x-organizer-key": passcode });
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const dotColor = db === "live" ? "var(--ok)" : db === "offline" ? "var(--warn)" : "#9DB3A8";

  const connect = async () => {
    setDb("loading"); setMsg("");
    try {
      const r = await fetch("/api/sponsors", { headers: hdr() });
      if (!r.ok) throw new Error(r.status === 401 ? "Wrong passcode." : `Error ${r.status}`);
      const data = await r.json();
      setSponsors(Array.isArray(data) ? data.map(dbToUI) : []);
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
    };
    setSponsors((p) => [...p, ui]);
    setForm(blankForm);
    if (connected) {
      try {
        const r = await fetch("/api/sponsors", { method: "POST", headers: hdr(), body: JSON.stringify(ui) });
        if (r.ok) { const row = await r.json(); setSponsors((p) => p.map((s) => s.id === ui.id ? { ...s, id: row.id } : s)); }
      } catch {}
    }
  };

  const saveSponsor = async (id) => {
    const patch = editBuf[id] || {};
    setSponsors((p) => p.map((s) => s.id === id ? { ...s, ...patch } : s));
    setExpandId(null);
    if (connected && !String(id).startsWith("tmp-")) {
      try { await fetch("/api/sponsors", { method: "PATCH", headers: hdr(), body: JSON.stringify({ id, ...patch }) }); } catch {}
    }
  };

  const patchField = async (id, key, value) => {
    setSponsors((p) => p.map((s) => s.id === id ? { ...s, [key]: value } : s));
    if (connected && !String(id).startsWith("tmp-")) {
      try { await fetch("/api/sponsors", { method: "PATCH", headers: hdr(), body: JSON.stringify({ id, [key]: value }) }); } catch {}
    }
  };

  const delSponsor = async (id) => {
    setSponsors((p) => p.filter((s) => s.id !== id));
    if (connected && !String(id).startsWith("tmp-")) {
      try { await fetch(`/api/sponsors?id=${id}`, { method: "DELETE", headers: hdr() }); } catch {}
    }
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

  const byTier = useMemo(() => {
    const order = TIER_NAMES;
    const map = {};
    sponsors.forEach((s) => { const k = s.tier || "Custom"; (map[k] ||= []).push(s); });
    return order.filter((t) => map[t]?.length).map((t) => ({ tier: t, items: map[t] }));
  }, [sponsors]);

  return (
    <div className="spo"><Styles />
      <div className="head"><div className="wrap head-in">
        <div className="eyebrow">Exotic Wildlife Association · 2026 Annual Membership Meeting</div>
        <h1 className="serif">Sponsorship Management</h1>
        <div className="sub">Track sponsors, tiers, payments, and artwork</div>
      </div></div>

      <div className="wrap panel">
        {/* ---- connection bar ---- */}
        <div className="settings">
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}><span className="dot" style={{ background: dotColor }} />{db === "live" ? "Connected" : db === "offline" ? "Offline" : "Not connected"}</span>
            <input className="pwd" type="password" placeholder="Organizer passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && connect()} />
            <button className="btn" onClick={connect} disabled={db === "loading"}><Database size={15} />{db === "loading" ? "Connecting…" : "Connect"}</button>
          </div>
        </div>
        {msg && <div className="hint" style={{ marginTop: -10, marginBottom: 16, color: db === "offline" ? "var(--warn)" : "var(--ok)" }}>{db === "offline" && <AlertTriangle size={14} />}{msg}</div>}

        {/* ---- KPIs ---- */}
        <div className="cards">
          <div className="kpi"><div className="l"><Users size={13} /> Total sponsors</div><div className="n">{sponsors.length}</div></div>
          <div className="kpi"><div className="l"><DollarSign size={13} /> Total pledged</div><div className="n">{money0(totPledged)}</div></div>
          <div className="kpi accent"><div className="l"><DollarSign size={13} /> Total paid</div><div className="n">{money0(totPaid)}</div></div>
          <div className="kpi"><div className="l"><DollarSign size={13} /> Outstanding</div><div className="n">{money0(totBalance)}</div></div>
          <div className="kpi"><div className="l"><Image size={13} /> Logos received</div><div className="n">{logoCount} / {sponsors.length}</div></div>
        </div>

        {/* ---- add form ---- */}
        <div className="addcard">
          <div className="addhdr"><Plus size={17} /> Add Sponsor</div>
          <div className="fgrid">
            <div className="f span4"><label>Sponsor name *</label><input value={form.name} onChange={(e) => setF("name", e.target.value)} placeholder="Acme Ranch Supply" /></div>
            <div className="f span3"><label>Tier</label>
              <select value={form.tier} onChange={(e) => { const t = TIERS.find((x) => x.name === e.target.value); setForm((p) => ({ ...p, tier: e.target.value, amountPledged: t?.amount || p.amountPledged })); }}>
                {TIER_NAMES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div className="f span2"><label>Amount pledged</label><input inputMode="decimal" value={form.amountPledged} onChange={(e) => setF("amountPledged", e.target.value.replace(/[^\d.]/g, ""))} placeholder="5000" /></div>
            <div className="f span2"><label>Amount paid</label><input inputMode="decimal" value={form.amountPaid} onChange={(e) => setF("amountPaid", e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" /></div>
            <div className="f span1"><label>Status</label><select value={form.paymentStatus} onChange={(e) => setF("paymentStatus", e.target.value)}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div className="f span3"><label>Contact name</label><input value={form.contactName} onChange={(e) => setF("contactName", e.target.value)} placeholder="Jane Smith" /></div>
            <div className="f span3"><label>Contact email</label><input type="email" value={form.contactEmail} onChange={(e) => setF("contactEmail", e.target.value)} placeholder="jane@ranch.com" /></div>
            <div className="f span3"><label>Contact phone</label><input value={form.contactPhone} onChange={(e) => setF("contactPhone", e.target.value)} placeholder="(555) 000-0000" /></div>
            <div className="f span3" style={{ justifyContent: "flex-end" }}>
              <label className="chkrow" style={{ marginTop: 20 }}><input type="checkbox" checked={form.logoReceived} onChange={(e) => setF("logoReceived", e.target.checked)} /> Logo received</label>
            </div>
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

          {byTier.map(({ tier, items }) => (
            <div key={tier} className="tier-section">
              <div className="tier-hdr">
                <span className="tier-chip" style={{ background: tierColor(tier) }}>{tier}</span>
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
                            <div style={{ fontWeight: 700 }}>{s.name}</div>
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
    </div>
  );
}
