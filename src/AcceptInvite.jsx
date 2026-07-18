import React, { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle } from "lucide-react";
import LoginPanel from "./LoginPanel.jsx";
import { getUser, authHeaders, onAuthChange } from "./authClient.js";

/* ============================================================================
   Accept team invite — /?invite=<token>&client=<slug>
   ----------------------------------------------------------------------------
   The link an org admin emails a new team member. If they're not signed in we
   show LoginPanel (magic link redirects back to this same URL). Once signed in
   we POST the accept action with the Bearer session and confirm membership.
   ========================================================================== */

const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
    :root{--bone:#F4EFE6;--paper:#FBF8F2;--ink:#1B1915;--inkSoft:#5C564C;
      --pine:#123C2E;--pine2:#0C2A20;--pineLine:#23604A;--gold:#B9842B;--goldSoft:#E2C282;
      --line:#DCD2C0;--ok:#2E7D5B;--warn:#A9601C;}
    *{box-sizing:border-box}
    .inv-page{font-family:'Hanken Grotesk',ui-sans-serif,system-ui;color:var(--ink);background:var(--bone);min-height:100vh;display:flex;flex-direction:column;-webkit-font-smoothing:antialiased;}
    .inv-head{background:var(--pine2);padding:14px 22px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--goldSoft);font-weight:600;text-align:center;}
    .inv-wrap{max-width:520px;margin:0 auto;padding:48px 22px 80px;width:100%;}
    .inv-card{background:var(--paper);border:1.5px solid var(--line);border-radius:18px;padding:28px 26px;}
    .inv-title{font-family:'Fraunces',Georgia,serif;font-size:28px;font-weight:600;margin:0 0 8px;text-align:center;}
    .inv-sub{color:var(--inkSoft);font-size:14px;text-align:center;margin-bottom:22px;}
    .btn{font-family:inherit;font-weight:700;font-size:14px;border-radius:11px;cursor:pointer;padding:11px 20px;display:inline-flex;align-items:center;gap:8px;border:1.5px solid transparent;background:var(--pine);color:#fff;text-decoration:none;}
    .btn:hover{background:var(--pine2);} .btn:disabled{opacity:.4;cursor:not-allowed;}
    .btn.ghost{background:transparent;color:var(--pine);border-color:var(--line);}
    .btn.sm{font-size:12px;padding:6px 11px;}
    .pwd,.inp{font-family:inherit;font-size:13.5px;padding:9px 11px;border:1.5px solid var(--line);border-radius:9px;background:#fff;outline:none;}
    .pwd:focus,.inp:focus{border-color:var(--pine);}
    .hint{font-size:12.5px;color:var(--inkSoft);}
    .inv-status{display:flex;align-items:center;justify-content:center;gap:8px;font-weight:700;border-radius:12px;padding:13px 16px;margin-bottom:18px;font-size:14.5px;}
    .inv-status.in{background:#e4f0e9;color:var(--ok);border:1.5px solid #b8dcc6;}
    .inv-status.err{background:#fdf0ec;color:#b4471f;border:1.5px solid #efc4b3;}
  `}</style>
);

export default function AcceptInvite() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("invite") || "";
  const client = (params.get("client") || "").trim().toLowerCase();

  const [user, setUser] = useState(undefined); // undefined = still checking
  const [state, setState] = useState("idle");  // idle | joining | joined | error
  const [role, setRole] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    getUser().then((u) => alive && setUser(u));
    const { data } = onAuthChange((session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null);
    });
    return () => { alive = false; data?.subscription?.unsubscribe?.(); };
  }, []);

  useEffect(() => {
    if (!user || state !== "idle") return;
    (async () => {
      setState("joining"); setErr("");
      try {
        const r = await fetch(`/api/members?client=${encodeURIComponent(client)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ action: "accept", token }),
        });
        const j = await r.json().catch(() => ({}));
        if (r.status === 404) throw new Error("This invite wasn't found.");
        if (r.status === 410) throw new Error("This invite has expired.");
        if (r.status === 409) throw new Error("This invite has already been used.");
        if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
        setRole(j.role || "team member");
        setState("joined");
      } catch (e) { setErr(e.message); setState("error"); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const consoleHref = `/?app=setup&client=${encodeURIComponent(client)}`;

  return (
    <div className="inv-page"><Styles />
      <div className="inv-head">Team invitation</div>
      <div className="inv-wrap">
        <div className="inv-card">
          <h1 className="inv-title">Join {client || "the team"}</h1>

          {!token || !client ? (
            <div className="inv-status err"><AlertTriangle size={17} /> This invite link is incomplete.</div>
          ) : user === undefined ? (
            <div className="inv-sub">Checking your session…</div>
          ) : user === null ? (
            <LoginPanel note={`Sign in to join ${client} as a team member`} />
          ) : state === "joining" ? (
            <div className="inv-sub">Joining {client}…</div>
          ) : state === "joined" ? (
            <>
              <div className="inv-status in"><CheckCircle2 size={17} /> You've joined {client} as {role}</div>
              <div style={{ textAlign: "center" }}><a className="btn" href={consoleHref}>Go to console</a></div>
            </>
          ) : state === "error" ? (
            <>
              <div className="inv-status err"><AlertTriangle size={17} /> {err}</div>
              <div className="hint" style={{ textAlign: "center" }}>Signed in as {user.email}. Ask whoever invited you for a fresh link if needed.</div>
            </>
          ) : (
            <div className="inv-sub">Preparing…</div>
          )}
        </div>
      </div>
    </div>
  );
}
