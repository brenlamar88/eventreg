import React, { useState } from "react";
import {
  Ticket,
  ScanLine,
  Gavel,
  Heart,
  WifiOff,
  CreditCard,
  Check,
  ArrowRight,
  Building2,
  Calendar,
} from "lucide-react";

// ← product name placeholder; change this one line when you pick the real name
const BRAND = "Rally Events";
const TAGLINE =
  "Everything Cvent does for registration — plus the auction and sponsorship tools it doesn't — at a fraction of the price.";

const FEATURES = [
  {
    icon: Ticket,
    title: "Self-serve + iPad registration",
    body:
      "Attendees register online ahead of time or on an iPad at the door. Handle walk-ins in seconds without a laptop or a line.",
  },
  {
    icon: ScanLine,
    title: "QR tickets + Apple/Google Wallet",
    body:
      "Every registrant gets a real, scannable ticket they can add to Apple or Google Wallet — no printing, no will-call shuffle.",
  },
  {
    icon: WifiOff,
    title: "Camera check-in that works offline",
    body:
      "Scan tickets even when the venue wifi dies, then sync automatically when it's back. Works even when the internet doesn't.",
  },
  {
    icon: Gavel,
    title: "Live + silent auctions & settlement",
    body:
      "Consignor and buyer ledgers, commission tiers, and one-click statements and exports. The piece enterprise registration tools simply don't have.",
  },
  {
    icon: Heart,
    title: "Sponsorships that pay for themselves",
    body:
      "Tiered packages, benefit-delivery checklists, logo collection, and online payment — so sponsorship revenue actually gets tracked and delivered.",
  },
  {
    icon: CreditCard,
    title: "Get paid, fast",
    body:
      "Collect ticket and auction money and pay out to each chapter's own bank via Stripe. White-label branding on every event.",
  },
];

const WHOFOR = [
  { icon: Building2, label: "Association chapters" },
  { icon: Heart, label: "Sporting & conservation nonprofits" },
  { icon: Calendar, label: "Schools & ministries running banquets" },
];

const STEPS = [
  {
    n: "1",
    title: "Set up your event",
    body: "Name, branding, and pricing in minutes — white-labeled to your chapter.",
  },
  {
    n: "2",
    title: "Sell & run your night",
    body: "Take registrations and sponsorships, then run your live and silent auctions.",
  },
  {
    n: "3",
    title: "Check in & reconcile",
    body: "Scan at the door — online or offline — and settle every ledger when it's over.",
  },
];

const DIFFERENTIATORS = [
  "Auctions built in",
  "Offline door check-in",
  "Sponsorship tools",
  "Chapter-friendly pricing",
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Marketing() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    orgName: "",
    phone: "",
    eventType: "Banquet + auction",
    preferredTime: "",
    message: "",
  });
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState(false);

  const set = (k) => (e) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    if (errors[k]) setErrors((x) => ({ ...x, [k]: undefined }));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Please tell us your name.";
    if (!form.email.trim()) errs.email = "Email is required.";
    else if (!EMAIL_RE.test(form.email.trim())) errs.email = "That doesn't look like a valid email.";
    return errs;
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setSubmitError("");
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          email: form.email.trim(),
          orgName: form.orgName.trim(),
          phone: form.phone.trim(),
          eventType: form.eventType,
          preferredTime: form.preferredTime.trim(),
          message: form.message.trim(),
          source: "landing",
        }),
      });
      if (!res.ok) throw new Error("Request failed");
      setDone(true);
    } catch (err) {
      setSubmitError(
        "Something went wrong sending your request. Please try again, or email us directly."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mk">
      <Styles />

      {/* Top bar */}
      <div className="mk-topbar">
        <div className="wrap mk-topbar-in">
          <div className="mk-brand mk-serif">{BRAND}</div>
          <nav className="mk-topnav">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#demo" className="mk-topnav-cta">Book a demo</a>
          </nav>
        </div>
      </div>

      {/* Hero */}
      <header className="mk-hero">
        <div className="mk-grain" />
        <div className="wrap mk-hero-in">
          <div className="mk-eyebrow">The all-in-one platform for fundraising banquets</div>
          <h1 className="mk-serif">
            Registration, auctions &amp; sponsorships — in one place, for one fair price.
          </h1>
          <p className="mk-hero-sub">{TAGLINE}</p>
          <div className="mk-hero-cta">
            <a href="#demo" className="mk-btn mk-btn-gold">
              Book a demo <ArrowRight size={18} />
            </a>
            <a href="/?demo=true" className="mk-btn mk-btn-ghost">
              See it live
            </a>
          </div>
          <div className="mk-diffs">
            {DIFFERENTIATORS.map((d) => (
              <span className="mk-diff" key={d}>
                <Check size={14} /> {d}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Features */}
      <section id="features" className="mk-section">
        <div className="wrap">
          <div className="mk-sec-head">
            <div className="mk-kicker">What's inside</div>
            <h2 className="mk-serif mk-sec-title">One platform for the whole night</h2>
            <p className="mk-sec-lead">
              Built for the local chapters that run the banquets — the ones who can't justify
              a $15–20k/yr enterprise contract, but still want to run a flawless event.
            </p>
          </div>
          <div className="mk-grid">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div className="mk-card" key={f.title}>
                  <div className="mk-card-ic">
                    <Icon size={22} />
                  </div>
                  <h3 className="mk-serif mk-card-t">{f.title}</h3>
                  <p className="mk-card-b">{f.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Who it's for */}
      <section className="mk-whostrip">
        <div className="wrap mk-who-in">
          <div className="mk-who-label mk-serif">Built for</div>
          <div className="mk-who-items">
            {WHOFOR.map((w) => {
              const Icon = w.icon;
              return (
                <div className="mk-who" key={w.label}>
                  <Icon size={18} />
                  <span>{w.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mk-section mk-section-alt">
        <div className="wrap">
          <div className="mk-sec-head">
            <div className="mk-kicker">How it works</div>
            <h2 className="mk-serif mk-sec-title">Live in an afternoon</h2>
          </div>
          <div className="mk-steps">
            {STEPS.map((s) => (
              <div className="mk-step" key={s.n}>
                <div className="mk-step-n mk-serif">{s.n}</div>
                <h3 className="mk-serif mk-step-t">{s.title}</h3>
                <p className="mk-step-b">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing teaser */}
      <section id="pricing" className="mk-section">
        <div className="wrap">
          <div className="mk-price">
            <div className="mk-price-copy">
              <div className="mk-kicker">Pricing</div>
              <h2 className="mk-serif mk-sec-title">
                Flat, honest pricing — a fraction of enterprise platforms.
              </h2>
              <p className="mk-sec-lead">
                No per-ticket nickel-and-diming. You collect ticket and auction revenue and pay
                out to your chapter's own bank. We'll size a plan to your event, not the other way
                around.
              </p>
              <a href="#demo" className="mk-btn mk-btn-pine">
                Talk to us for a quote <ArrowRight size={18} />
              </a>
            </div>
            <ul className="mk-price-list">
              {DIFFERENTIATORS.map((d) => (
                <li key={d}>
                  <Check size={16} /> {d}
                </li>
              ))}
              <li>
                <Check size={16} /> No long-term enterprise lock-in
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Demo form */}
      <section id="demo" className="mk-section mk-section-demo">
        <div className="wrap mk-demo-wrap">
          <div className="mk-demo-card">
            {done ? (
              <div className="mk-thanks">
                <div className="mk-thanks-ic">
                  <Check size={30} />
                </div>
                <h2 className="mk-serif">Thanks — we'll be in touch.</h2>
                <p>
                  We'll reach out within one business day to set up your walkthrough of {BRAND}.
                </p>
              </div>
            ) : (
              <>
                <div className="mk-kicker">Book a demo</div>
                <h2 className="mk-serif mk-demo-title">See {BRAND} on your event</h2>
                <p className="mk-demo-lead">
                  Tell us about your event and we'll show you the platform.
                </p>
                <form className="mk-form" onSubmit={onSubmit} noValidate>
                  <label className="mk-field">
                    <span>Name</span>
                    <input
                      className={"mk-inp" + (errors.name ? " mk-inp-err" : "")}
                      value={form.name}
                      onChange={set("name")}
                      placeholder="Your name"
                    />
                    {errors.name && <em className="mk-err">{errors.name}</em>}
                  </label>

                  <label className="mk-field">
                    <span>Email *</span>
                    <input
                      className={"mk-inp" + (errors.email ? " mk-inp-err" : "")}
                      type="email"
                      value={form.email}
                      onChange={set("email")}
                      placeholder="you@chapter.org"
                    />
                    {errors.email && <em className="mk-err">{errors.email}</em>}
                  </label>

                  <label className="mk-field">
                    <span>Organization / chapter</span>
                    <input
                      className="mk-inp"
                      value={form.orgName}
                      onChange={set("orgName")}
                      placeholder="e.g. North Texas Chapter"
                    />
                  </label>

                  <label className="mk-field">
                    <span>Phone</span>
                    <input
                      className="mk-inp"
                      type="tel"
                      value={form.phone}
                      onChange={set("phone")}
                      placeholder="(555) 555-5555"
                    />
                  </label>

                  <label className="mk-field">
                    <span>Event type</span>
                    <select className="mk-inp" value={form.eventType} onChange={set("eventType")}>
                      <option>Banquet + auction</option>
                      <option>Registration only</option>
                      <option>Sponsorships</option>
                      <option>Not sure yet</option>
                    </select>
                  </label>

                  <label className="mk-field">
                    <span>Preferred time</span>
                    <input
                      className="mk-inp"
                      value={form.preferredTime}
                      onChange={set("preferredTime")}
                      placeholder="e.g. weekday mornings"
                    />
                  </label>

                  <label className="mk-field mk-field-full">
                    <span>Message</span>
                    <textarea
                      className="mk-inp mk-textarea"
                      value={form.message}
                      onChange={set("message")}
                      rows={4}
                      placeholder="Tell us about your event, dates, and what matters most."
                    />
                  </label>

                  {submitError && <div className="mk-formerr">{submitError}</div>}

                  <div className="mk-field-full">
                    <button className="mk-btn mk-btn-gold mk-submit" type="submit" disabled={submitting}>
                      {submitting ? "Sending…" : "Book a demo"}
                      {!submitting && <ArrowRight size={18} />}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mk-footer">
        <div className="wrap mk-footer-in">
          <span className="mk-serif mk-foot-brand">{BRAND}</span>
          <nav className="mk-foot-links">
            <a href="#features">Features</a>
            <a href="#pricing">Pricing</a>
            <a href="#demo">Book a demo</a>
            <a href="/?app=platform">Sign in</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

const Styles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');
    :root{
      --pine:#123C2E; --pine2:#0C2A20; --pineLine:#23604A; --gold:#B9842B; --goldSoft:#E2C282;
      --bone:#F4EFE6; --paper:#FBF8F2; --ink:#1B1915; --inkSoft:#5C564C; --line:#DCD2C0; --ok:#2E7D5B;
    }
    html{scroll-behavior:smooth;}
    .mk{font-family:'Hanken Grotesk',ui-sans-serif,system-ui,sans-serif;color:var(--ink);background:var(--bone);min-height:100vh;-webkit-font-smoothing:antialiased;}
    .mk *{box-sizing:border-box;}
    .mk-serif{font-family:'Fraunces',Georgia,serif;}
    .wrap{max-width:1080px;margin:0 auto;padding:0 22px;}
    .mk a{color:inherit;text-decoration:none;}

    /* Top bar */
    .mk-topbar{position:sticky;top:0;z-index:20;background:rgba(12,42,32,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--pineLine);}
    .mk-topbar-in{display:flex;align-items:center;justify-content:space-between;height:60px;}
    .mk-brand{color:var(--bone);font-size:20px;font-weight:600;letter-spacing:-.01em;}
    .mk-topnav{display:flex;align-items:center;gap:26px;}
    .mk-topnav a{color:#CBDAD1;font-weight:600;font-size:14.5px;transition:.15s;}
    .mk-topnav a:hover{color:#fff;}
    .mk-topnav-cta{background:var(--gold);color:#1b1407 !important;padding:9px 16px;border-radius:999px;}
    .mk-topnav-cta:hover{background:var(--goldSoft);}

    /* Hero */
    .mk-hero{position:relative;overflow:hidden;color:var(--bone);
      background:radial-gradient(120% 90% at 12% 0%,var(--pineLine) 0%,transparent 55%),radial-gradient(120% 120% at 100% 0%,var(--pine2) 0%,transparent 60%),linear-gradient(160deg,var(--pine),var(--pine2));}
    .mk-grain{position:absolute;inset:0;opacity:.35;pointer-events:none;mix-blend-mode:overlay;
      background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.4'/%3E%3C/svg%3E");}
    .mk-hero-in{position:relative;z-index:2;padding:84px 0 88px;}
    .mk-eyebrow{font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--goldSoft);font-weight:600;}
    .mk-hero h1{font-size:clamp(38px,6.4vw,72px);line-height:1.0;margin:16px 0 0;font-weight:600;letter-spacing:-.02em;max-width:14ch;}
    .mk-hero-sub{max-width:620px;margin:22px 0 0;color:#D9E5DE;font-size:19px;line-height:1.5;}
    .mk-hero-cta{margin-top:34px;display:flex;flex-wrap:wrap;gap:14px;}
    .mk-diffs{margin-top:34px;display:flex;flex-wrap:wrap;gap:10px 20px;}
    .mk-diff{display:inline-flex;align-items:center;gap:7px;color:#CFE0D7;font-size:14px;font-weight:600;}
    .mk-diff svg{color:var(--goldSoft);}

    /* Buttons */
    .mk-btn{display:inline-flex;align-items:center;gap:9px;font-family:inherit;font-weight:700;font-size:16px;padding:15px 26px;border-radius:999px;cursor:pointer;border:1.5px solid transparent;transition:.18s;}
    .mk-btn-gold{background:var(--gold);color:#1b1407;}
    .mk-btn-gold:hover{background:var(--goldSoft);}
    .mk-btn-ghost{background:transparent;color:var(--bone);border-color:rgba(226,194,130,.45);}
    .mk-btn-ghost:hover{border-color:var(--goldSoft);background:rgba(226,194,130,.08);}
    .mk-btn-pine{background:var(--pine);color:#fff;}
    .mk-btn-pine:hover{background:var(--pine2);}

    /* Sections */
    .mk-section{padding:78px 0;}
    .mk-section-alt{background:var(--paper);border-top:1px solid var(--line);border-bottom:1px solid var(--line);}
    .mk-sec-head{max-width:640px;margin:0 auto 44px;text-align:center;}
    .mk-kicker{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);font-weight:700;}
    .mk-sec-title{font-size:clamp(28px,4vw,42px);font-weight:600;letter-spacing:-.015em;line-height:1.08;margin:10px 0 0;}
    .mk-sec-lead{margin:16px 0 0;color:var(--inkSoft);font-size:17px;line-height:1.55;}

    /* Feature grid */
    .mk-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;}
    .mk-card{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:26px 24px;transition:.18s;}
    .mk-card:hover{border-color:var(--goldSoft);box-shadow:0 12px 30px -18px rgba(18,60,46,.4);transform:translateY(-2px);}
    .mk-card-ic{width:50px;height:50px;border-radius:13px;background:var(--pine);color:var(--goldSoft);display:grid;place-items:center;}
    .mk-card-t{font-size:20px;font-weight:600;margin:18px 0 0;letter-spacing:-.01em;}
    .mk-card-b{margin:9px 0 0;color:var(--inkSoft);font-size:15px;line-height:1.55;}

    /* Who strip */
    .mk-whostrip{background:var(--pine);color:var(--bone);}
    .mk-who-in{padding:30px 22px;display:flex;flex-wrap:wrap;align-items:center;gap:16px 34px;}
    .mk-who-label{font-size:16px;font-weight:600;color:var(--goldSoft);}
    .mk-who-items{display:flex;flex-wrap:wrap;gap:14px 30px;}
    .mk-who{display:inline-flex;align-items:center;gap:9px;font-weight:600;font-size:15.5px;color:#DCE8E1;}
    .mk-who svg{color:var(--goldSoft);}

    /* Steps */
    .mk-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;}
    .mk-step{background:var(--bone);border:1px solid var(--line);border-radius:18px;padding:28px 24px;}
    .mk-step-n{width:46px;height:46px;border-radius:50%;background:var(--pine);color:var(--goldSoft);display:grid;place-items:center;font-size:22px;font-weight:600;}
    .mk-step-t{font-size:20px;font-weight:600;margin:16px 0 0;}
    .mk-step-b{margin:8px 0 0;color:var(--inkSoft);font-size:15px;line-height:1.55;}

    /* Pricing */
    .mk-price{display:grid;grid-template-columns:1.3fr 1fr;gap:40px;align-items:center;background:var(--paper);border:1px solid var(--line);border-radius:24px;padding:44px;}
    .mk-price-copy .mk-btn{margin-top:24px;}
    .mk-price-list{list-style:none;margin:0;padding:0;display:grid;gap:14px;}
    .mk-price-list li{display:flex;align-items:center;gap:11px;font-weight:600;font-size:15.5px;color:var(--ink);}
    .mk-price-list svg{color:var(--ok);flex-shrink:0;}

    /* Demo form */
    .mk-section-demo{background:var(--pine2);color:var(--bone);}
    .mk-demo-wrap{display:flex;justify-content:center;}
    .mk-demo-card{background:var(--paper);color:var(--ink);border:1px solid var(--line);border-radius:24px;padding:40px;max-width:560px;width:100%;box-shadow:0 30px 70px -40px rgba(0,0,0,.6);}
    .mk-demo-title{font-size:30px;font-weight:600;margin:10px 0 0;letter-spacing:-.015em;}
    .mk-demo-lead{margin:8px 0 26px;color:var(--inkSoft);font-size:16px;}
    .mk-form{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
    .mk-field{display:flex;flex-direction:column;gap:6px;}
    .mk-field-full{grid-column:1 / -1;}
    .mk-field > span{font-size:13px;font-weight:600;color:var(--ink);}
    .mk-inp{font-family:inherit;font-size:14.5px;padding:12px 13px;border:1.5px solid var(--line);border-radius:10px;background:#fff;color:var(--ink);outline:none;transition:.15s;width:100%;}
    .mk-inp:focus{border-color:var(--pine);box-shadow:0 0 0 3px rgba(18,60,46,.1);}
    .mk-inp-err{border-color:#B4472D;}
    .mk-textarea{resize:vertical;min-height:96px;}
    .mk-err{font-size:12.5px;color:#B4472D;font-style:normal;font-weight:600;}
    .mk-formerr{grid-column:1 / -1;background:#FBEAE5;border:1px solid #E5B3A5;color:#8A3520;border-radius:10px;padding:11px 14px;font-size:14px;font-weight:600;}
    .mk-submit{width:100%;justify-content:center;margin-top:4px;}
    .mk-submit:disabled{opacity:.65;cursor:default;}

    /* Thanks state */
    .mk-thanks{text-align:center;padding:20px 8px;}
    .mk-thanks-ic{width:64px;height:64px;border-radius:50%;background:var(--ok);color:#fff;display:grid;place-items:center;margin:0 auto 18px;}
    .mk-thanks h2{font-size:30px;font-weight:600;margin:0;}
    .mk-thanks p{margin:12px 0 0;color:var(--inkSoft);font-size:16px;line-height:1.5;}

    /* Footer */
    .mk-footer{background:var(--pine);color:var(--bone);padding:26px 0;}
    .mk-footer-in{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;}
    .mk-foot-brand{font-size:18px;font-weight:600;}
    .mk-foot-links{display:flex;flex-wrap:wrap;gap:22px;}
    .mk-foot-links a{color:#CBDAD1;font-weight:600;font-size:14px;transition:.15s;}
    .mk-foot-links a:hover{color:#fff;}

    @media (max-width:900px){
      .mk-grid{grid-template-columns:repeat(2,1fr);}
      .mk-steps{grid-template-columns:1fr;}
      .mk-price{grid-template-columns:1fr;gap:28px;padding:32px;}
    }
    @media (max-width:640px){
      .mk-topnav{gap:16px;}
      .mk-topnav a:not(.mk-topnav-cta){display:none;}
      .mk-hero-in{padding:60px 0 64px;}
      .mk-grid{grid-template-columns:1fr;}
      .mk-form{grid-template-columns:1fr;}
      .mk-demo-card{padding:28px 22px;}
      .mk-section{padding:56px 0;}
    }
  `}</style>
);
