import React, { useState, useMemo } from "react";
import {
  Check, DollarSign, FileText, Truck, Receipt, Landmark, Printer,
  CheckCircle2, Circle, Plus, Trash2, Users, Settings, Database, RefreshCw, AlertTriangle, Pencil, X,
} from "lucide-react";

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
  const rate = rateFor(lot.amount);
  const commission = Math.round(lot.amount * rate * 100) / 100;
  const fee = Number(eventFee) || 0;
  return { rate, fee, commission, net: lot.amount - commission - fee };
}
const money = (n) => "$" + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n) => "$" + Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
const display = (name, ranch) => ranch ? `${name} — ${ranch}` : name;
const CATEGORIES = ["Elite Registry", "Exotic Conservation", "Grand Auction", "Raffle", "Golf", "Fuller Family", "Donated"];

/* ---- data layer (yellow-kite via same-origin API; falls back to local) ---- */
const dbLotToUI = (r) => ({
  id: r.id, lotNo: r.lot_no, description: r.description || "",
  category: r.auction_category || (r.donated ? "Donated" : ""),
  consignorName: r.consignor_name || "", consignorRanch: r.consignor_ranch || "",
  buyerName: r.buyer_name || "", buyerRanch: r.buyer_ranch || "",
  consignor: display(r.consignor_name || "(unnamed)", r.consignor_ranch || ""),
  buyer: r.buyer_name ? display(r.buyer_name, r.buyer_ranch || "") : "—",
  amount: Number(r.amount) || 0, donated: !!r.donated,
  delivered: !!r.delivered, checkNo: r.check_no || "", checkDate: r.check_date || "",
  buyerPaid: !!r.buyer_paid,
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
    @media print {.head,.bar,.settings,.addcard,.btn{display:none !important;} .ewa{background:#fff;}}
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
  const blankForm = { lotNo: "", description: "", category: "Elite Registry", consignorName: "", consignorRanch: "", buyerName: "", buyerRanch: "", amount: "", donated: false };
  const [form, setForm] = useState(blankForm);
  const [consignorSel, setConsignorSel] = useState("");
  const [buyerSel, setBuyerSel] = useState("");
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const setEF = (k, v) => setEditForm((p) => ({ ...p, [k]: v }));
  const startEdit = (l) => { setEditId(l.id); setEditForm({ lotNo: l.lotNo, description: l.description, category: l.category, consignorName: l.consignorName, consignorRanch: l.consignorRanch, donated: l.donated }); };
  const cancelEdit = () => { setEditId(null); setEditForm({}); };

  const connected = db === "live";
  const hdr = () => ({ "Content-Type": "application/json", "x-organizer-key": passcode });
  const setF = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const findRanch = (name) => (people.find((p) => p.name.toLowerCase() === name.toLowerCase()) || {}).ranch || "";
  const findBidder = (name) => (people.find((p) => p.name.toLowerCase() === name.toLowerCase()) || {}).bidderNo || "";
  const onNameChange = (which, v) => setForm((p) => ({ ...p, [which + "Name"]: v, [which + "Ranch"]: findRanch(v) || p[which + "Ranch"] }));
  const rememberPerson = (name, ranch) => { if (name) setPeople((prev) => prev.some((p) => p.name.toLowerCase() === name.toLowerCase()) ? prev : [...prev, { name, ranch: ranch || "" }]); };

  const saveLotEdit = async () => {
    const patch = {
      lotNo: editForm.lotNo.trim(), description: editForm.description.trim(),
      category: editForm.donated ? "Donated" : editForm.category,
      consignorName: editForm.consignorName.trim(), consignorRanch: editForm.consignorRanch.trim(),
      donated: editForm.donated,
      consignor: display(editForm.consignorName.trim(), editForm.consignorRanch.trim()),
    };
    setLots((p) => p.map((l) => l.id === editId ? { ...l, ...patch } : l));
    if (connected && typeof editId === "string" && !editId.startsWith("tmp-")) {
      try {
        await fetch("/api/lots", { method: "PATCH", headers: hdr(), body: JSON.stringify({ id: editId, lot_no: patch.lotNo, description: patch.description, auction_category: patch.category, consignor_name: patch.consignorName, consignor_ranch: patch.consignorRanch, donated: patch.donated }) });
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
      try { const rr = await fetch("/api/registrants", { headers: hdr() }); if (rr.ok) { const rows = await rr.json(); const seen = new Set(); const ppl = []; rows.forEach((x) => { const k = (x.name || "").toLowerCase(); if (x.name && !seen.has(k)) { seen.add(k); ppl.push({ name: x.name, ranch: x.ranch || "", bidderNo: x.bidder_number || "" }); } }); setPeople(ppl); } } catch {}
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
      consignorName: form.consignorName.trim(), consignorRanch: form.consignorRanch.trim(),
      buyerName: form.buyerName.trim(), buyerRanch: form.buyerRanch.trim(),
      amount: Number(form.amount) || 0, donated: form.donated,
    };
    const ui = {
      id: "tmp-" + Date.now(), ...base,
      consignor: display(base.consignorName, base.consignorRanch),
      buyer: base.buyerName ? display(base.buyerName, base.buyerRanch) : "—",
      delivered: false, checkNo: "", checkDate: "",
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

  const setLot = async (id, patch) => {
    setLots((p) => p.map((l) => l.id === id ? { ...l, ...patch } : l));
    if (connected && typeof id === "string" && !id.startsWith("tmp-")) {
      const dbPatch = {};
      if ("delivered" in patch) dbPatch.delivered = patch.delivered;
      if ("checkNo" in patch) dbPatch.check_no = patch.checkNo || null;
      if ("checkDate" in patch) dbPatch.check_date = patch.checkDate || null;
      if ("buyerName" in patch) dbPatch.buyer_name = patch.buyerName || null;
      if ("buyerRanch" in patch) dbPatch.buyer_ranch = patch.buyerRanch || null;
      if ("amount" in patch) dbPatch.amount = patch.amount;
      if ("buyerPaid" in patch) dbPatch.buyer_paid = patch.buyerPaid;
      try { await fetch("/api/lots", { method: "PATCH", headers: hdr(), body: JSON.stringify({ id, ...dbPatch }) }); } catch {}
    }
  };
  const delLot = async (id) => {
    setLots((p) => p.filter((l) => l.id !== id));
    if (connected && typeof id === "string" && !id.startsWith("tmp-")) { try { await fetch(`/api/lots?id=${id}`, { method: "DELETE", headers: hdr() }); } catch {} }
  };

  const grand = useMemo(() => lots.reduce((a, l) => { if (!l.donated) { const c = calc(l, eventFee); a.lotTotal += l.amount; a.fees += c.fee; a.commission += c.commission; a.net += c.net; } return a; }, { lotTotal: 0, fees: 0, commission: 0, net: 0 }), [lots, eventFee]);
  const byConsignor = useMemo(() => {
    const map = {}; lots.forEach((l) => { if (!l.donated) (map[l.consignor] ||= []).push(l); });
    return Object.entries(map).map(([name, ls]) => { const t = ls.reduce((a, l) => { const c = calc(l, eventFee); a.lotTotal += l.amount; a.fees += c.fee; a.commission += c.commission; a.net += c.net; return a; }, { lotTotal: 0, fees: 0, commission: 0, net: 0 }); return { name, ls, t }; }).sort((a, b) => b.t.net - a.t.net);
  }, [lots, eventFee]);
  const consignors = useMemo(() => [...new Set(lots.map((l) => l.consignor))].sort(), [lots]);
  const buyers = useMemo(() => [...new Set(lots.map((l) => l.buyer).filter((b) => b !== "—"))].sort(), [lots]);
  const deliveredCount = lots.filter((l) => !l.donated && l.delivered).length;
  const paidCount = lots.filter((l) => !l.donated && l.checkNo).length;

  const TabBtn = ({ id, icon: Icon, children }) => (<button className={`tab ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}><Icon size={16} /> {children}</button>);
  const dotColor = db === "live" ? "var(--ok)" : db === "offline" ? "var(--warn)" : "#9DB3A8";

  return (
    <div className="ewa"><Styles />
      <datalist id="people-list">{people.map((p) => <option key={p.name} value={p.name} />)}</datalist>
      <div className="head"><div className="wrap head-in">
        <div className="eyebrow">Exotic Wildlife Association · 2026 Annual Membership Meeting</div>
        <h1 className="serif">Auction Settlement</h1>
        <div className="sub">Consignor payouts, ledgers, and delivery tracking</div>
        <div className="tabs">
          <TabBtn id="payments" icon={DollarSign}>Consignor Payment Detail</TabBtn>
          <TabBtn id="grand" icon={Receipt}>Grand Auction</TabBtn>
          <TabBtn id="consignor" icon={FileText}>Consignor Ledger</TabBtn>
          <TabBtn id="buyer" icon={Receipt}>Buyer Ledger</TabBtn>
        </div>
      </div></div>

      <div className="wrap panel">
        <div className="settings">
          <label><Settings size={14} /> Event lot fee</label>
          <input className="feein" value={eventFee} inputMode="decimal" onChange={(e) => setEventFee(e.target.value.replace(/[^\d.]/g, ""))} onBlur={saveFee} />
          <span className="tiers">≤ $5,000 → 11% · $5,001–$9,999 → 10% · ≥ $10,000 → 9%</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600 }}><span className="dot" style={{ background: dotColor }} />{db === "live" ? "Connected" : db === "offline" ? "Local" : "Not connected"}</span>
            <input className="pwd" type="password" placeholder="Organizer passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} />
            <button className="btn" onClick={connect} disabled={db === "loading"}><Database size={15} /> {db === "loading" ? "Connecting…" : "Connect"}</button>
          </div>
        </div>
        {msg && <div className="hint" style={{ marginTop: -10, marginBottom: 16, color: db === "offline" ? "var(--warn)" : "var(--ok)" }}>{db === "offline" && <AlertTriangle size={14} />}{msg}</div>}

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
              <div className="f span6"><label>Description</label><input value={form.description} onChange={(e) => setF("description", e.target.value)} placeholder="0.1 Fallow — Green 211" /></div>
              <div className="f span4"><label>Auction category</label><select value={form.category} onChange={(e) => setF("category", e.target.value)} disabled={form.donated}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
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
            <table className="tbl">
              <thead><tr><th>Lot</th><th>Description</th><th>Buyer</th><th className="num">Lot total</th><th className="num">Fee</th><th className="num">Commission</th><th className="num">Net (check)</th><th>Buyer Paid</th><th>Delivery</th><th>Check #</th><th>Date</th><th></th></tr></thead>
              <tbody>
                {byConsignor.map((g) => (
                  <React.Fragment key={g.name}>
                    <tr className="grp2"><td colSpan={12}>{g.name}</td></tr>
                    {g.ls.map((l) => { const c = calc(l, eventFee); const status = l.checkNo ? "paid" : l.delivered ? "ready" : "wait"; const bidderNo = findBidder(l.buyerName); return (
                      <React.Fragment key={l.id}>
                      <tr>
                        <td className="lot">{l.lotNo}</td><td>{l.description || "—"}</td>
                        <td>
                          <input className="buyer-in" list="people-list" value={l.buyerName} placeholder="Buyer name" onChange={(e) => { const name = e.target.value; const ranch = findRanch(name) || l.buyerRanch; setLot(l.id, { buyerName: name, buyerRanch: ranch, buyer: name ? display(name, ranch) : "—" }); }} />
                          {bidderNo && <span style={{fontSize:11,fontWeight:700,color:"var(--pine)",marginLeft:5}}>#{bidderNo}</span>}
                        </td>
                        <td className="num"><input className="amt-in" inputMode="decimal" value={l.amount === 0 ? "" : l.amount} placeholder="0.00" onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setLot(l.id, { amount: Number(v) || 0 }); }} /></td><td className="num">{money(c.fee)}</td><td className="num">{money(c.commission)}</td><td className="num net">{money(c.net)}</td>
                        <td><button className={`ci ${l.buyerPaid ? "on" : ""}`} onClick={() => setLot(l.id, { buyerPaid: !l.buyerPaid })}>{l.buyerPaid ? <CheckCircle2 size={16}/> : <Circle size={16}/>}<span className={`badge ${l.buyerPaid ? "b-paid" : "b-wait"}`}>{l.buyerPaid ? "Paid" : "Unpaid"}</span></button></td>
                        <td><button className={`ci ${l.delivered ? "on" : ""}`} onClick={() => setLot(l.id, { delivered: !l.delivered, ...(l.delivered ? { checkNo: "", checkDate: "" } : {}) })}>{l.delivered ? <CheckCircle2 size={16} /> : <Circle size={16} />}<span className={`badge ${status === "paid" ? "b-paid" : status === "ready" ? "b-ready" : "b-wait"}`}>{status === "paid" ? "Paid" : status === "ready" ? "Ready" : "Awaiting"}</span></button></td>
                        <td><input className="mini" value={l.checkNo} disabled={!l.delivered} placeholder="—" onChange={(e) => setLot(l.id, { checkNo: e.target.value })} /></td>
                        <td><input className="mini" type="date" value={l.checkDate} disabled={!l.delivered} onChange={(e) => setLot(l.id, { checkDate: e.target.value })} /></td>
                        <td style={{whiteSpace:"nowrap"}}>
                          <button className="edit-btn" title="Edit lot" onClick={() => editId === l.id ? cancelEdit() : startEdit(l)}>{editId === l.id ? <X size={15} /> : <Pencil size={15} />}</button>
                          <button className="trash" onClick={() => delLot(l.id)}><Trash2 size={15} /></button>
                        </td>
                      </tr>
                      {editId === l.id && (
                        <tr className="edit-row">
                          <td colSpan={12}>
                            <div className="edit-grid">
                              <div className="f"><label>Lot #</label><input className="mini" style={{width:"100%"}} value={editForm.lotNo} onChange={(e) => setEF("lotNo", e.target.value)} /></div>
                              <div className="f"><label>Description</label><input style={{fontFamily:"inherit",fontSize:"13px",padding:"6px 8px",border:"1.5px solid var(--line)",borderRadius:"8px",width:"100%"}} value={editForm.description} onChange={(e) => setEF("description", e.target.value)} /></div>
                              <div className="f"><label>Category</label><select style={{fontFamily:"inherit",fontSize:"13px",padding:"6px 8px",border:"1.5px solid var(--line)",borderRadius:"8px",width:"100%"}} value={editForm.category} disabled={editForm.donated} onChange={(e) => setEF("category", e.target.value)}>{CATEGORIES.map((cat) => <option key={cat}>{cat}</option>)}</select></div>
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
                    <tr className="sub"><td colSpan={3}>Subtotal — {g.name}</td><td className="num">{money(g.t.lotTotal)}</td><td className="num">{money(g.t.fees)}</td><td className="num">{money(g.t.commission)}</td><td className="num">{money(g.t.net)}</td><td colSpan={5}></td></tr>
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
          const donated = ls.filter((l) => l.donated), sold = ls.filter((l) => !l.donated);
          const donatedTotal = donated.reduce((a, l) => a + l.amount, 0);
          const t = sold.reduce((a, l) => { const c = calc(l, eventFee); a.gross += l.amount; a.fees += c.fee; a.commission += c.commission; a.net += c.net; return a; }, { gross: 0, fees: 0, commission: 0, net: 0 });
          return (<>
            <div className="bar"><select className="sel" value={sel} onChange={(e) => setConsignorSel(e.target.value)}>{consignors.map((c) => <option key={c}>{c}</option>)}</select><button className="btn ghost" onClick={() => window.print()}><Printer size={15} /> Print / PDF</button></div>
            <div className="ledger">
              <div className="lh"><div><div className="who serif">{sel}</div><div className="whosub">Consignor Ledger · 2026 AMM</div></div><div style={{ textAlign: "right" }}><div className="whosub">Net due once delivered</div><div className="who serif" style={{ color: "var(--pine)" }}>{money(t.net)}</div></div></div>
              {donated.length > 0 && (<><div className="secLabel">Lots Donated (100% to EWA)</div><table className="tbl"><thead><tr><th>Lot</th><th>Description</th><th>Sold to</th><th>Bidder #</th><th className="num">Lot total</th></tr></thead><tbody>{donated.map((l) => { const bn = findBidder(l.buyerName); return <tr key={l.id}><td className="lot">{l.lotNo}</td><td className="donated">{l.description || "—"}</td><td>{l.buyer}</td><td style={{fontWeight:700,color:"var(--pine)"}}>{bn || "—"}</td><td className="num">{money(l.amount)}</td></tr>; })}<tr className="sub"><td colSpan={4}>Donated total</td><td className="num">{money(donatedTotal)}</td></tr></tbody></table></>)}
              {sold.length > 0 && (<><div className="secLabel">Lots Sold</div><table className="tbl"><thead><tr><th>Lot</th><th>Description</th><th>Sold to</th><th>Bidder #</th><th className="num">Lot total</th><th className="num">Fee</th><th className="num">Comm.</th><th className="num">Net</th></tr></thead><tbody>{sold.map((l) => { const c = calc(l, eventFee); const bn = findBidder(l.buyerName); return <tr key={l.id}><td className="lot">{l.lotNo}</td><td>{l.description || "—"}</td><td>{l.buyer}</td><td style={{fontWeight:700,color:"var(--pine)"}}>{bn || "—"}</td><td className="num">{money(l.amount)}</td><td className="num">{money(c.fee)}</td><td className="num">{money(c.commission)}</td><td className="num net">{money(c.net)}</td></tr>; })}</tbody></table></>)}
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
          return grandLots.length === 0
            ? <div className="empty"><div className="big">No Grand Auction lots</div>Add lots with category "Grand Auction" on the Payment Detail tab.</div>
            : (<>
              <div className="bar" style={{justifyContent:"space-between"}}>
                <span style={{fontSize:13,fontWeight:600,color:"var(--inkSoft)"}}>{withBuyer} of {grandLots.length} lots have a buyer · {money(totSold)} total</span>
                <button className="btn ghost" onClick={() => window.print()}><Printer size={15}/> Print / PDF</button>
              </div>
              <table className="tbl">
                <thead><tr><th>Lot</th><th>Description</th><th>Consignor</th><th>Buyer</th><th className="num">Amount</th><th className="num">Fee</th><th className="num">Commission</th><th className="num">Net (check)</th><th>Buyer Paid</th></tr></thead>
                <tbody>
                  {grandLots.map((l) => { const c = calc(l, eventFee); const bidderNo = findBidder(l.buyerName); return (
                    <tr key={l.id} style={!l.buyerName ? {background:"#fff8f3"} : {}}>
                      <td className="lot">{l.lotNo}</td>
                      <td>{l.description || "—"}</td>
                      <td style={{color:"var(--inkSoft)",fontSize:12.5}}>{l.consignorName || "—"}</td>
                      <td>
                        <input className="buyer-in" list="people-list" value={l.buyerName} placeholder="Enter buyer…" onChange={(e) => { const name = e.target.value; const ranch = findRanch(name) || l.buyerRanch; setLot(l.id, { buyerName: name, buyerRanch: ranch, buyer: name ? display(name, ranch) : "—" }); }} />
                        {bidderNo && <span style={{fontSize:11,fontWeight:700,color:"var(--pine)",marginLeft:5}}>#{bidderNo}</span>}
                      </td>
                      <td className="num"><input className="amt-in" inputMode="decimal" value={l.amount === 0 ? "" : l.amount} placeholder="0.00" onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); setLot(l.id, { amount: Number(v) || 0 }); }} /></td>
                      <td className="num">{money(c.fee)}</td>
                      <td className="num">{money(c.commission)}</td>
                      <td className="num net">{money(c.net)}</td>
                      <td><button className={`ci ${l.buyerPaid ? "on" : ""}`} onClick={() => setLot(l.id, { buyerPaid: !l.buyerPaid })}>{l.buyerPaid ? <CheckCircle2 size={16}/> : <Circle size={16}/>}<span className={`badge ${l.buyerPaid ? "b-paid" : "b-wait"}`}>{l.buyerPaid ? "Paid" : "Unpaid"}</span></button></td>
                    </tr>); })}
                </tbody>
              </table>
              <div className="grand" style={{gridTemplateColumns:"repeat(3,1fr)"}}>
                <div><div className="l">Grand Auction total</div><div className="n">{money(totSold)}</div></div>
                <div><div className="l">Lots with buyer</div><div className="n">{withBuyer} / {grandLots.length}</div></div>
                <div><div className="l">Net to consignors</div><div className="n">{money(grandLots.reduce((a, l) => a + calc(l, eventFee).net, 0))}</div></div>
              </div>
            </>);
        })()}

        {tab === "buyer" && (() => {
          if (buyers.length === 0) return <div className="empty"><div className="big">No buyers yet</div>Add lots with a buyer on the Payment Detail tab.</div>;
          const sel = buyerSel || buyers[0] || "";
          const ls = lots.filter((l) => l.buyer === sel);
          const byCat = {}; ls.forEach((l) => { (byCat[l.category] ||= []).push(l); });
          const lotTotal = ls.reduce((a, l) => a + l.amount, 0);
          const selBidder = findBidder(ls[0]?.buyerName || "");
          return (<>
            <div className="bar"><select className="sel" value={sel} onChange={(e) => setBuyerSel(e.target.value)}>{buyers.map((b) => <option key={b}>{b}</option>)}</select><button className="btn ghost" onClick={() => window.print()}><Printer size={15} /> Print / PDF</button></div>
            <div className="ledger">
              <div className="lh"><div><div className="who serif">{sel}</div><div className="whosub">Buyer Ledger · 2026 AMM{selBidder ? ` · Bidder #${selBidder}` : ""}</div></div><div style={{ textAlign: "right" }}><div className="whosub">Balance due</div><div className="who serif" style={{ color: "var(--pine)" }}>{money(lotTotal)}</div></div></div>
              {Object.entries(byCat).map(([cat, items]) => { const sub = items.reduce((a, l) => a + l.amount, 0); return (<div key={cat}><div className="secLabel">{cat}</div><table className="tbl"><thead><tr><th>Lot</th><th>Description</th><th>Consignor</th><th className="num">Amount</th></tr></thead><tbody>{items.map((l) => <tr key={l.id}><td className="lot">{l.lotNo}</td><td>{l.description || "—"}</td><td>{l.consignor}</td><td className="num">{money(l.amount)}</td></tr>)}<tr className="sub"><td colSpan={3}>{cat} subtotal</td><td className="num">{money(sub)}</td></tr></tbody></table></div>); })}
              <div style={{ maxWidth: 360, marginLeft: "auto", marginTop: 18 }}><div className="totline big"><span>Lot total</span><span>{money(lotTotal)}</span></div></div>
            </div>
          </>);
        })()}
      </div>
    </div>
  );
}
