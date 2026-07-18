import React, { useEffect, useState } from "react";
import { Mail, LogOut, Check } from "lucide-react";
import { getUser, signInWithEmail, signOut, onAuthChange } from "./authClient.js";

/* ============================================================================
   LoginPanel — reusable real-login (Supabase magic link) widget.
   ----------------------------------------------------------------------------
   Runs ALONGSIDE the passcode model. Shows the current user + Sign out when
   signed in, otherwise an email input + "Send magic link". onSignedIn(user)
   fires whenever auth state resolves to a signed-in user.
   ========================================================================== */

export default function LoginPanel({ onSignedIn, note }) {
  const [user, setUser] = useState(null);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let alive = true;
    getUser().then((u) => { if (alive) { setUser(u); if (u) onSignedIn && onSignedIn(u); } });
    const { data } = onAuthChange((session) => {
      const u = session?.user ? { id: session.user.id, email: session.user.email } : null;
      setUser(u);
      if (u) onSignedIn && onSignedIn(u);
    });
    return () => { alive = false; data?.subscription?.unsubscribe?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const send = async () => {
    setErr(""); setBusy(true);
    try {
      const { error } = await signInWithEmail(email, window.location.href);
      if (error) throw new Error(error.message || "Couldn't send the link.");
      setSent(true);
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (user) {
    return (
      <div className="login-panel" style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Signed in as {user.email}</span>
        <button className="btn ghost sm" onClick={() => signOut()}><LogOut size={13} /> Sign out</button>
      </div>
    );
  }

  return (
    <div className="login-panel" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontFamily: "'Fraunces',Georgia,serif", fontSize: 17, fontWeight: 600 }}>Sign in</div>
      {note && <div className="hint" style={{ fontSize: 12.5 }}>{note}</div>}
      {sent ? (
        <div className="hint" style={{ color: "var(--ok)", display: "flex", alignItems: "center", gap: 7 }}>
          <Check size={14} /> Check your email for a sign-in link.
        </div>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="pwd inp" type="email" placeholder="you@example.com" value={email}
              style={{ minWidth: 200 }}
              onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && email.trim() && send()} />
            <button className="btn" disabled={busy || !email.trim()} onClick={send}><Mail size={15} /> {busy ? "…" : "Send magic link"}</button>
          </div>
          {err && <div className="hint" style={{ color: "var(--warn)" }}>{err}</div>}
        </>
      )}
    </div>
  );
}
