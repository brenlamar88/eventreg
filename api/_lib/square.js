// api/_lib/square.js
// ---------------------------------------------------------------------------
// Thin Square REST helper. We talk to Square over plain fetch (no SDK) to keep
// the bundle small and dodge the Square Node SDK's BigInt-money / client-shape
// churn between major versions. One access token, one location, one API
// version — all from env so the version can be bumped without a code change.
//
// Env:
//   SQUARE_ACCESS_TOKEN   — the app's access token (sandbox OR production)
//   SQUARE_ENVIRONMENT    — "sandbox" (default) or "production"; picks the host
//   SQUARE_LOCATION_ID    — the seller location that receives the payment
//   SQUARE_VERSION        — optional; the Square-Version date header
// ---------------------------------------------------------------------------

const VERSION = process.env.SQUARE_VERSION || "2025-01-23";

// connect.squareupsandbox.com for testing, connect.squareup.com for real money.
export function squareBase() {
  return (process.env.SQUARE_ENVIRONMENT || "sandbox").toLowerCase() === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

// Authenticated JSON call to the Square Connect API. Returns { ok, status, body }.
export async function squareFetch(path, { method = "GET", body } = {}) {
  const r = await fetch(`${squareBase()}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "Square-Version": VERSION,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await r.json(); } catch { /* empty / non-JSON body */ }
  return { ok: r.ok, status: r.status, body: json };
}
