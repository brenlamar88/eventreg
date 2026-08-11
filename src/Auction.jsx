// src/Auction.jsx — attendee-facing silent-auction mobile bidding.
// -----------------------------------------------------------------------------
// Public page (/?app=auction). An attendee identifies with their bidder number
// + name, browses items, and places a MAX (proxy) bid. The page polls the API
// every few seconds so current bids, leaders, and countdowns stay live; the
// server owns the proxy math + anti-snipe extension (place_bid()).
// -----------------------------------------------------------------------------
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Gavel, Clock, Check, X, TrendingUp, Trophy, AlertCircle, ChevronRight, Tag } from "lucide-react";
import { getEventConfig, withEvent } from "./eventConfig.js";

const CFG = getEventConfig();
const LS = "auction-bidder";
const money = (n) => "$" + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 0 });

function loadBidder() {
  try { return JSON.parse(sessionStorage.getItem(LS) || "null"); } catch { return null; }
}
function saveBidder(b) {
  try { sessionStorage.setItem(LS, JSON.stringify(b)); } catch { /* private mode */ }
}

// "2h 14m" / "8m 03s" / "Closed"
function useCountdown(closeAt, offsetMs) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!closeAt) return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [closeAt]);
  if (!closeAt) return { label: "Open", closed: false, urgent: false };
  const ms = new Date(closeAt).getTime() - (Date.now() + (offsetMs || 0));
  if (ms <= 0) return { label: "Closed", closed: true, urgent: false };
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const label = h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${String(sec).padStart(2, "0")}s` : `${sec}s`;
  return { label, closed: false, urgent: ms < 120000 };
}

export default function Auction() {
  const [bidder, setBidder] = useState(loadBidder());
  const [items, setItems] = useState(null);
  const [offset, setOffset] = useState(0);         // serverTime - clientTime
  const [sheet, setSheet] = useState(null);        // the item being bid on
  const [toast, setToast] = useState(null);
  const [err, setErr] = useState("");
  const pollRef = useRef(null);

  async function refresh() {
    try {
      const r = await fetch(withEvent("/api/bids"), { cache: "no-store" });
      if (!r.ok) return;
      const d = await r.json();
      setItems(Array.isArray(d.items) ? d.items : []);
      if (d.server_time) setOffset(new Date(d.server_time).getTime() - Date.now());
    } catch { /* keep last */ }
  }

  useEffect(() => {
    refresh();
    pollRef.current = setInterval(refresh, 5000);
    return () => clearInterval(pollRef.current);
  }, []);

  function flash(msg, kind = "ok") { setToast({ msg, kind }); setTimeout(() => setToast(null), 3200); }

  const openCount = useMemo(() => (items || []).filter((i) => i.bidding_open).length, [items]);

  if (!bidder) return <IdentityGate onDone={(b) => { saveBidder(b); setBidder(b); }} err={err} setErr={setErr} />;

  return (
    <div className="auc">
      <Style />
      <header className="auc-top">
        <div className="auc-top-in">
          <div className="auc-brand">
            <span className="auc-eyebrow">{CFG.orgShort || CFG.orgName}</span>
            <h1 className="auc-title"><Gavel size={22} strokeWidth={2.2} /> Silent Auction</h1>
          </div>
          <button className="auc-me" onClick={() => { sessionStorage.removeItem(LS); setBidder(null); }}>
            <span className="auc-me-no">#{bidder.no}</span>
            <span className="auc-me-name">{bidder.name.split(" ")[0]}</span>
          </button>
        </div>
        <div className="auc-sub">{openCount} item{openCount === 1 ? "" : "s"} open for bidding · updates live</div>
      </header>

      {items == null ? (
        <div className="auc-empty">Loading items…</div>
      ) : items.length === 0 ? (
        <div className="auc-empty"><Tag size={26} /><p>No auction items are open yet.<br />Check back soon.</p></div>
      ) : (
        <div className="auc-grid">
          {items.map((it) => (
            <ItemCard key={it.id} it={it} offset={offset} bidder={bidder} onBid={() => setSheet(it)} />
          ))}
        </div>
      )}

      {sheet && (
        <BidSheet
          it={sheet} bidder={bidder} offset={offset}
          onClose={() => setSheet(null)}
          onResult={(res, item) => {
            refresh();
            if (res.ok && res.you_are_high) flash(`You're winning ${item.lot_no ? "lot " + item.lot_no : "this item"} at ${money(res.price)}`, "ok");
            else if (res.ok) flash(`Outbid — current bid is ${money(res.price)}. Raise your max to lead.`, "warn");
            else flash(res.error || "Bid not accepted", "err");
            setSheet(null);
          }}
        />
      )}

      {toast && (
        <div className={`auc-toast ${toast.kind}`}>
          {toast.kind === "ok" ? <Trophy size={16} /> : toast.kind === "warn" ? <TrendingUp size={16} /> : <AlertCircle size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function ItemCard({ it, offset, bidder, onBid }) {
  const cd = useCountdown(it.bid_close_at, offset);
  const winning = it.high_bidder_no && String(it.high_bidder_no) === String(bidder.no);
  const hasBids = it.bid_count > 0 && it.current_bid != null;
  const closed = cd.closed || !it.bidding_open;
  const min = hasBids ? Number(it.current_bid) + Number(it.min_increment || 0) : Math.max(Number(it.starting_bid || 0), Number(it.min_increment || 0));

  return (
    <div className={`card ${winning ? "win" : ""} ${closed ? "closed" : ""}`}>
      <div className="card-img">
        {it.image_url ? <img src={it.image_url} alt="" loading="lazy" /> : <div className="card-img-ph"><Gavel size={26} /></div>}
        {it.lot_no && <span className="card-lot">Lot {it.lot_no}</span>}
        <span className={`card-clock ${cd.urgent ? "urgent" : ""} ${closed ? "off" : ""}`}>
          <Clock size={12} />{closed ? "Closed" : cd.label}
        </span>
      </div>
      <div className="card-body">
        <div className="card-desc">{it.description || "Auction item"}</div>
        <div className="card-bidrow">
          <div>
            <div className="card-cur-l">{hasBids ? "Current bid" : "Opening bid"}</div>
            <div className="card-cur">{money(hasBids ? it.current_bid : min)}</div>
          </div>
          {hasBids && (
            <div className="card-leader">
              {winning ? <span className="chip win"><Trophy size={12} /> You lead</span>
                       : <span className="chip">Bidder #{it.high_bidder_no}</span>}
            </div>
          )}
        </div>
        {closed ? (
          <div className="card-final">{it.high_bidder_no ? <>Won by <b>#{it.high_bidder_no}</b> · {money(it.current_bid)}</> : "No bids"}</div>
        ) : (
          <button className={`card-cta ${winning ? "ghost" : ""}`} onClick={onBid}>
            {winning ? "Raise your max" : hasBids ? `Bid ${money(min)}+` : `Start at ${money(min)}`} <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

function BidSheet({ it, bidder, offset, onClose, onResult }) {
  const hasBids = it.bid_count > 0 && it.current_bid != null;
  const min = hasBids ? Number(it.current_bid) + Number(it.min_increment || 0) : Math.max(Number(it.starting_bid || 0), Number(it.min_increment || 0));
  const winning = it.high_bidder_no && String(it.high_bidder_no) === String(bidder.no);
  const [amt, setAmt] = useState(String(min));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const quick = [min, min + Number(it.min_increment || 0) * 2, min + Number(it.min_increment || 0) * 5];

  async function submit() {
    const v = Number(amt);
    if (!isFinite(v) || v < min) { setError(`Enter at least ${money(min)}`); return; }
    setBusy(true); setError("");
    try {
      const r = await fetch(withEvent("/api/bids"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lotId: it.id, bidderNo: bidder.no, name: bidder.name, maxAmount: v }),
      });
      const res = await r.json();
      onResult(res, it);
    } catch { setError("Network error — try again"); setBusy(false); }
  }

  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <button className="sheet-x" onClick={onClose}><X size={18} /></button>
        <div className="sheet-eyebrow">{it.lot_no ? `Lot ${it.lot_no}` : "Auction item"}</div>
        <div className="sheet-title">{it.description || "Auction item"}</div>
        <div className="sheet-cur">
          <span>{hasBids ? "Current bid" : "Opening bid"}</span>
          <b>{money(hasBids ? it.current_bid : min)}</b>
          {hasBids && (winning ? <em className="win">You're winning</em> : <em>Bidder #{it.high_bidder_no} leads</em>)}
        </div>

        <label className="sheet-l">Your maximum bid</label>
        <p className="sheet-help">We'll bid for you only as high as needed to keep you in front — up to your max.</p>
        <div className="sheet-amt">
          <span>$</span>
          <input type="number" inputMode="numeric" min={min} step={it.min_increment || 1}
            value={amt} onChange={(e) => setAmt(e.target.value)} autoFocus />
        </div>
        <div className="sheet-quick">
          {quick.map((q) => <button key={q} onClick={() => setAmt(String(q))} className={Number(amt) === q ? "on" : ""}>{money(q)}</button>)}
        </div>
        {error && <div className="sheet-err"><AlertCircle size={14} /> {error}</div>}
        <button className="sheet-go" onClick={submit} disabled={busy}>
          {busy ? "Placing…" : <><Gavel size={16} /> {winning ? "Raise my max" : "Place bid"} · {money(Number(amt) || min)}</>}
        </button>
        <div className="sheet-foot">Bidding as <b>#{bidder.no} · {bidder.name}</b></div>
      </div>
    </div>
  );
}

function IdentityGate({ onDone, err, setErr }) {
  const [no, setNo] = useState("");
  const [name, setName] = useState("");
  return (
    <div className="gate">
      <Style />
      <div className="gate-card">
        <div className="gate-icon"><Gavel size={24} /></div>
        <div className="gate-eyebrow">{CFG.orgShort || CFG.orgName}</div>
        <h1 className="gate-title">Silent Auction</h1>
        <p className="gate-sub">Enter your bidder number and name from check-in to start bidding.</p>
        <label className="sheet-l">Bidder number</label>
        <input className="gate-in" inputMode="numeric" value={no} onChange={(e) => setNo(e.target.value)} placeholder="e.g. 142" />
        <label className="sheet-l">Your name</label>
        <input className="gate-in" value={name} onChange={(e) => setName(e.target.value)} placeholder="First & last name" onKeyDown={(e) => e.key === "Enter" && go()} />
        {err && <div className="sheet-err"><AlertCircle size={14} /> {err}</div>}
        <button className="sheet-go" onClick={go}><Check size={16} /> Start bidding</button>
        <p className="gate-foot">Don't have a number? See a volunteer at the registration table.</p>
      </div>
    </div>
  );
  function go() {
    const n = no.trim(), nm = name.trim();
    if (!n) return setErr("Enter your bidder number");
    if (!nm) return setErr("Enter your name");
    setErr(""); onDone({ no: n, name: nm });
  }
}

function Style() {
  return (
    <style>{`
    .auc,.gate{min-height:100vh;background:var(--bone);color:var(--ink);font-family:var(--font-sans);}
    .auc-top{position:sticky;top:0;z-index:10;background:var(--pine);color:#fff;padding:16px 18px 12px;box-shadow:var(--shadow-sm);}
    .auc-top-in{display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:1080px;margin:0 auto;}
    .auc-eyebrow{display:block;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);font-weight:600;}
    .auc-title{display:flex;align-items:center;gap:9px;font-size:24px;font-weight:600;letter-spacing:-.02em;margin:2px 0 0;color:#fff;}
    .auc-title svg{color:var(--gold);}
    .auc-me{display:flex;flex-direction:column;align-items:flex-end;gap:0;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);color:#fff;border-radius:var(--radius);padding:7px 12px;cursor:pointer;}
    .auc-me-no{font-weight:700;font-size:14px;color:var(--gold);}
    .auc-me-name{font-size:11px;opacity:.8;}
    .auc-sub{max-width:1080px;margin:6px auto 0;font-size:12.5px;color:rgba(255,255,255,.7);}
    .auc-grid{max-width:1080px;margin:0 auto;padding:16px;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;}
    .auc-empty{max-width:600px;margin:0 auto;padding:80px 24px;text-align:center;color:var(--inkSoft);display:flex;flex-direction:column;align-items:center;gap:12px;}
    .card{background:var(--paper);border:1px solid var(--line);border-radius:var(--radius-lg);overflow:hidden;display:flex;flex-direction:column;transition:box-shadow var(--dur) var(--ease),transform var(--dur) var(--ease);}
    .card:hover{box-shadow:var(--shadow-md);transform:translateY(-2px);}
    .card.win{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold);}
    .card.closed{opacity:.72;}
    .card-img{position:relative;aspect-ratio:16/10;background:var(--bone2);}
    .card-img img{width:100%;height:100%;object-fit:cover;display:block;}
    .card-img-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#c3c3c9;}
    .card-lot{position:absolute;top:10px;left:10px;background:var(--pine);color:#fff;font-size:11px;font-weight:600;padding:4px 9px;border-radius:999px;letter-spacing:.02em;}
    .card-clock{position:absolute;top:10px;right:10px;display:flex;align-items:center;gap:4px;background:rgba(255,255,255,.94);color:var(--ink);font-size:11.5px;font-weight:600;padding:4px 9px;border-radius:999px;box-shadow:var(--shadow-xs);}
    .card-clock.urgent{background:var(--gold);color:#fff;}
    .card-clock.off{background:#e7e7e8;color:#86868b;}
    .card-body{padding:13px 14px 14px;display:flex;flex-direction:column;gap:10px;flex:1;}
    .card-desc{font-size:15px;font-weight:600;letter-spacing:-.01em;line-height:1.3;color:var(--ink);}
    .card-bidrow{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;margin-top:auto;}
    .card-cur-l{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--inkSoft);font-weight:600;}
    .card-cur{font-size:24px;font-weight:700;letter-spacing:-.02em;color:var(--ink);line-height:1.1;}
    .chip{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:600;padding:4px 9px;border-radius:999px;background:var(--bone2);color:var(--inkSoft);}
    .chip.win{background:color-mix(in srgb,var(--gold) 16%,#fff);color:var(--gold);}
    .card-cta{display:flex;align-items:center;justify-content:center;gap:6px;background:var(--pine);color:#fff;border:none;font-family:inherit;font-size:14.5px;font-weight:600;padding:12px;border-radius:var(--radius);cursor:pointer;}
    .card-cta:hover{background:var(--pine2);}
    .card-cta.ghost{background:var(--gold);color:#fff;}
    .card-final{font-size:13px;color:var(--inkSoft);padding:6px 0 2px;}
    .card-final b{color:var(--ink);}
    /* Bid sheet */
    .sheet-wrap{position:fixed;inset:0;z-index:50;background:rgba(17,17,20,.5);backdrop-filter:blur(3px);display:flex;align-items:flex-end;justify-content:center;animation:fade var(--dur) var(--ease);}
    .sheet{background:var(--paper);width:100%;max-width:460px;border-radius:var(--radius-xl) var(--radius-xl) 0 0;padding:22px 20px 20px;position:relative;box-shadow:var(--shadow-lg);animation:rise var(--dur-slow) var(--ease);}
    @media(min-width:560px){.sheet-wrap{align-items:center;}.sheet{border-radius:var(--radius-xl);}}
    .sheet-x{position:absolute;top:16px;right:16px;background:var(--bone2);border:none;border-radius:999px;width:32px;height:32px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink);}
    .sheet-eyebrow{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--gold);font-weight:600;}
    .sheet-title{font-size:20px;font-weight:600;letter-spacing:-.02em;margin:3px 0 12px;}
    .sheet-cur{display:flex;align-items:baseline;gap:8px;background:var(--bone);border:1px solid var(--line);border-radius:var(--radius);padding:11px 13px;margin-bottom:16px;}
    .sheet-cur span{font-size:12px;color:var(--inkSoft);font-weight:600;text-transform:uppercase;letter-spacing:.08em;}
    .sheet-cur b{font-size:22px;font-weight:700;letter-spacing:-.02em;}
    .sheet-cur em{margin-left:auto;font-style:normal;font-size:12px;color:var(--inkSoft);}
    .sheet-cur em.win{color:var(--gold);font-weight:600;}
    .sheet-l{display:block;font-size:12.5px;font-weight:600;color:var(--ink);margin:2px 0 4px;}
    .sheet-help{font-size:12.5px;color:var(--inkSoft);margin:0 0 10px;line-height:1.4;}
    .sheet-amt{display:flex;align-items:center;gap:6px;border:1.5px solid var(--line);border-radius:var(--radius);padding:0 14px;background:var(--bone);}
    .sheet-amt:focus-within{border-color:var(--gold);}
    .sheet-amt span{font-size:26px;font-weight:700;color:var(--inkSoft);}
    .sheet-amt input{flex:1;border:none;background:none;font-family:inherit;font-size:30px;font-weight:700;letter-spacing:-.02em;padding:12px 0;outline:none;color:var(--ink);width:100%;}
    .sheet-quick{display:flex;gap:8px;margin:12px 0 4px;}
    .sheet-quick button{flex:1;background:var(--bone2);border:1.5px solid transparent;color:var(--ink);font-family:inherit;font-size:14px;font-weight:600;padding:10px;border-radius:var(--radius-sm);cursor:pointer;}
    .sheet-quick button.on{border-color:var(--gold);background:color-mix(in srgb,var(--gold) 10%,#fff);color:var(--gold);}
    .sheet-err{display:flex;align-items:center;gap:6px;color:#c2410c;font-size:13px;font-weight:500;margin:10px 0 0;}
    .sheet-go{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:14px;background:var(--gold);color:#fff;border:none;font-family:inherit;font-size:16px;font-weight:600;padding:15px;border-radius:var(--radius);cursor:pointer;}
    .sheet-go:hover{filter:brightness(.96);}
    .sheet-go:disabled{opacity:.6;cursor:default;}
    .sheet-foot{text-align:center;font-size:12px;color:var(--inkSoft);margin-top:12px;}
    /* Identity gate */
    .gate{display:flex;align-items:center;justify-content:center;padding:24px;}
    .gate-card{background:var(--paper);border:1px solid var(--line);border-radius:var(--radius-xl);padding:30px 26px;max-width:400px;width:100%;box-shadow:var(--shadow-md);}
    .gate-icon{width:52px;height:52px;border-radius:var(--radius);background:var(--pine);color:var(--gold);display:flex;align-items:center;justify-content:center;margin-bottom:16px;}
    .gate-eyebrow{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);font-weight:600;}
    .gate-title{font-size:30px;font-weight:600;letter-spacing:-.025em;margin:3px 0 6px;}
    .gate-sub{font-size:14px;color:var(--inkSoft);margin:0 0 18px;line-height:1.45;}
    .gate-in{width:100%;border:1.5px solid var(--line);border-radius:var(--radius);padding:13px 14px;font-family:inherit;font-size:16px;background:var(--bone);margin-bottom:14px;outline:none;}
    .gate-in:focus{border-color:var(--gold);}
    .gate-foot{font-size:12px;color:var(--inkSoft);text-align:center;margin:14px 0 0;}
    .auc-toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:8px;background:var(--pine);color:#fff;padding:13px 18px;border-radius:999px;font-size:14px;font-weight:500;box-shadow:var(--shadow-lg);max-width:92vw;animation:rise var(--dur) var(--ease);}
    .auc-toast.ok svg{color:var(--gold);} .auc-toast.warn{background:var(--gold);} .auc-toast.err{background:#c2410c;}
    @keyframes rise{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
    @keyframes fade{from{opacity:0}to{opacity:1}}
    .sheet{animation:sheetrise var(--dur-slow) var(--ease);}
    @keyframes sheetrise{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
    `}</style>
  );
}
