import React, { useEffect, useState } from "react";
import { Check, CheckCircle2, AlertTriangle, Calendar, MapPin } from "lucide-react";
import TicketQR from "./TicketQR.jsx";

/* ============================================================================
   Public ticket page — /?ticket=<token>
   ----------------------------------------------------------------------------
   The link that lives in the confirmation email and behind the wallet passes.
   Anyone with the (unguessable) token sees just the ticket: QR, name, party,
   and check-in status. Nothing else about the roster is reachable from here.
   ========================================================================== */

const EVENT = {
  name: "Boil on the Bend",
  org: "Exotic Wildlife Association of Louisiana",
  dateLabel: "Saturday · Date TBD",
  venue: "On the Bend",
  city: "Louisiana",
};

const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
    :root{--bone:#F4EFE6;--paper:#FBF8F2;--ink:#1B1915;--inkSoft:#5C564C;
      --pine:#123C2E;--pine2:#0C2A20;--pineLine:#23604A;--gold:#B9842B;--goldSoft:#E2C282;
      --line:#DCD2C0;--ok:#2E7D5B;--warn:#A9601C;}
    *{box-sizing:border-box}
    .tkt-page{font-family:'Hanken Grotesk',ui-sans-serif,system-ui;color:var(--ink);background:var(--bone);min-height:100vh;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;}
    .tkt-head{background:var(--pine2);color:#cfe0d7;padding:14px 22px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--goldSoft);font-weight:600;text-align:center;}
    .tkt-wrap{max-width:520px;margin:0 auto;padding:40px 22px 80px;width:100%;}
    .tkt-title{font-family:'Fraunces',Georgia,serif;font-size:32px;font-weight:600;margin:0 0 6px;text-align:center;}
    .tkt-meta{display:flex;justify-content:center;gap:20px;flex-wrap:wrap;color:var(--inkSoft);font-size:14px;margin-bottom:26px;}
    .tkt-meta div{display:flex;align-items:center;gap:7px;}
    .tkt-meta svg{color:var(--gold);}
    .ticket{background:var(--paper);border:1.5px solid var(--line);border-radius:18px;display:flex;overflow:hidden;text-align:left;}
    @media(max-width:560px){.ticket{flex-direction:column;}}
    .ticket .stub{background:var(--pine);color:#EAF1EC;padding:24px;display:flex;flex-direction:column;align-items:center;gap:12px;}
    .ticket .body{padding:24px 26px;flex:1;}
    .ticket .body .row{display:flex;justify-content:space-between;padding:7px 0;font-size:13.5px;border-bottom:1px dashed var(--line);gap:12px;}
    .ticket .body .row:last-child{border:none;}
    .ticket .body .k{color:var(--inkSoft);}
    .ticket .body .v{font-weight:700;text-align:right;}
    .tkt-note{text-align:center;color:var(--inkSoft);font-size:14px;margin-top:18px;}
    .tkt-btns{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:20px;}
    .btn{font-family:inherit;font-weight:700;font-size:15px;border-radius:12px;cursor:pointer;padding:14px 26px;display:inline-flex;align-items:center;gap:9px;border:1.5px solid transparent;text-decoration:none;}
    .btn-p{background:var(--pine);color:#fff;}
    .btn-g{background:transparent;color:var(--pine);border-color:var(--line);}
    .tkt-status{display:flex;align-items:center;justify-content:center;gap:8px;font-weight:700;border-radius:12px;padding:13px 16px;margin-bottom:20px;font-size:14.5px;}
    .tkt-status.in{background:#e4f0e9;color:var(--ok);border:1.5px solid #b8dcc6;}
    .tkt-status.err{background:#fdf0ec;color:#b4471f;border:1.5px solid #efc4b3;}
  `}</style>
);

export default function TicketPage() {
  const token = new URLSearchParams(window.location.search).get("ticket") || "";
  const [ticket, setTicket] = useState(null);
  const [state, setState] = useState("loading"); // loading | ok | notfound | error
  const [wallet, setWallet] = useState({ apple: false, google: false });

  useEffect(() => {
    if (!token) { setState("notfound"); return; }
    fetch(`/api/ticket?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        if (r.status === 404) { setState("notfound"); return; }
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        setTicket(await r.json());
        setState("ok");
      })
      .catch(() => setState("error"));
    fetch("/api/wallet-pass?probe=1").then((r) => setWallet((w) => ({ ...w, apple: r.ok }))).catch(() => {});
    fetch("/api/google-wallet?probe=1").then((r) => setWallet((w) => ({ ...w, google: r.ok }))).catch(() => {});
  }, [token]);

  return (
    <div className="tkt-page"><Styles />
      <div className="tkt-head">{EVENT.org}</div>
      <div className="tkt-wrap">
        <h1 className="tkt-title">{EVENT.name}</h1>
        <div className="tkt-meta">
          <div><Calendar size={15} /> {EVENT.dateLabel}</div>
          <div><MapPin size={15} /> {EVENT.venue}, {EVENT.city}</div>
        </div>

        {state === "loading" && <p style={{ textAlign: "center", color: "var(--inkSoft)" }}>Loading your ticket…</p>}

        {(state === "notfound" || state === "error") && (
          <div className="tkt-status err">
            <AlertTriangle size={17} />
            {state === "notfound" ? "This ticket link isn't valid." : "Couldn't load the ticket — try again in a moment."}
          </div>
        )}

        {state === "ok" && ticket && (
          <>
            {ticket.checked_in && (
              <div className="tkt-status in">
                <CheckCircle2 size={17} /> Checked in{ticket.checked_in_at ? ` at ${new Date(ticket.checked_in_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
              </div>
            )}
            <div className="ticket">
              <div className="stub"><TicketQR value={ticket.ticket_token} size={140} /></div>
              <div className="body">
                <div className="row"><span className="k">Event</span><span className="v">{EVENT.name}</span></div>
                <div className="row"><span className="k">Name</span><span className="v">{ticket.name || "Guest"}</span></div>
                <div className="row"><span className="k">Party of</span><span className="v">{ticket.party || 1}</span></div>
                <div className="row"><span className="k">Status</span><span className="v">{ticket.checked_in ? <span style={{ color: "var(--ok)" }}><Check size={14} style={{ display: "inline", verticalAlign: "middle" }} /> Checked in</span> : "Valid"}</span></div>
              </div>
            </div>
            <p className="tkt-note">Show this QR code at the door — staff scan it to check you in.</p>
            <div className="tkt-btns">
              {wallet.apple && <a className="btn btn-p" href={`/api/wallet-pass?token=${encodeURIComponent(ticket.ticket_token)}`}>Add to Apple Wallet</a>}
              {wallet.google && <a className="btn btn-p" href={`/api/google-wallet?token=${encodeURIComponent(ticket.ticket_token)}`}>Add to Google Wallet</a>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
