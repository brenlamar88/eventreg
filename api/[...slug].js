// api/[...slug].js — the API router.
// ---------------------------------------------------------------------------
// Every /api/<route> is served by this ONE serverless function; the real
// handlers live in api/_lib/ (Vercel ignores underscore-prefixed paths, so
// they don't become functions themselves). Why: Vercel's Hobby plan caps a
// deployment at 12 serverless functions — the platform grew past that and
// deploys started failing silently behind a stale production build. Two
// functions total (this router + stripe-webhook) never hit the limit again,
// on any plan.
//
// api/stripe-webhook.js stays a standalone function on purpose: Stripe
// signature verification reads the raw request stream, and isolating it
// keeps that path untouched by anything here.
//
// Adding a route = add the handler in _lib and one line in ROUTES.
// ---------------------------------------------------------------------------
import createCheckoutSession from "./_lib/create-checkout-session.js";
import eventConfig from "./_lib/event-config.js";
import eventLogo from "./_lib/event-logo.js";
import googleWallet from "./_lib/google-wallet.js";
import lotCheckout from "./_lib/lot-checkout.js";
import lots from "./_lib/lots.js";
import registrants from "./_lib/registrants.js";
import scan from "./_lib/scan.js";
import scanBatch from "./_lib/scan-batch.js";
import settings from "./_lib/settings.js";
import sponsorLogo from "./_lib/sponsor-logo.js";
import sponsorPackages from "./_lib/sponsor-packages.js";
import sponsors from "./_lib/sponsors.js";
import ticket from "./_lib/ticket.js";
import walletPass from "./_lib/wallet-pass.js";

const ROUTES = {
  "create-checkout-session": createCheckoutSession,
  "event-config": eventConfig,
  "event-logo": eventLogo,
  "google-wallet": googleWallet,
  "lot-checkout": lotCheckout,
  lots,
  registrants,
  scan,
  "scan-batch": scanBatch,
  settings,
  "sponsor-logo": sponsorLogo,
  "sponsor-packages": sponsorPackages,
  sponsors,
  ticket,
  "wallet-pass": walletPass,
};

export default async function handler(req, res) {
  const slug = req.query?.slug;
  const parts = Array.isArray(slug) ? slug : slug ? [slug] : [];
  const route = ROUTES[parts[0]];
  if (!route || parts.length !== 1) return res.status(404).json({ error: "Not found" });
  return route(req, res);
}
