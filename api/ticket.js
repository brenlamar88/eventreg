// api/ticket.js
// ---------------------------------------------------------------------------
// Public ticket lookup. Two modes, both bearer-secret authenticated (the
// query value itself is the credential — an unguessable 128-bit token or the
// buyer's own Stripe session id):
//
//   GET /api/ticket?session_id=cs_...   → the success page exchanges the
//       Stripe Checkout session id (from the ?session_id= return URL) for the
//       ticket the webhook minted. 404 until the webhook has landed, so the
//       client polls briefly.
//
//   GET /api/ticket?token=...           → the ticket page (/?ticket=<token>)
//       resolves a ticket token to display the ticket.
//
// Returns ONLY what a ticket needs to show — never the full roster row.
// ---------------------------------------------------------------------------

const SB_URL = process.env.SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;

function pub(row) {
  return {
    ticket_token: row.ticket_token,
    name: row.name,
    party: row.party,
    event_id: row.event_id,
    checked_in: !!row.checked_in,
    checked_in_at: row.checked_in_at || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }

  const { session_id, token } = req.query || {};
  if (!session_id && !token) return res.status(400).json({ error: "Missing session_id or token" });

  const select = "select=ticket_token,name,party,event_id,checked_in,checked_in_at";
  const filter = session_id
    ? `stripe_session_id=eq.${encodeURIComponent(session_id)}`
    : `ticket_token=eq.${encodeURIComponent(token)}`;

  try {
    const r = await fetch(`${SB_URL}/rest/v1/registrants?${filter}&${select}&limit=1`, {
      headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` },
    });
    if (!r.ok) throw new Error(`PostgREST ${r.status}: ${await r.text()}`);
    const rows = await r.json();
    if (!rows.length || !rows[0].ticket_token) {
      // Not found yet — for session_id lookups this usually means the webhook
      // hasn't landed; the client treats 404 as "poll again".
      return res.status(404).json({ error: "Ticket not found" });
    }
    return res.status(200).json(pub(rows[0]));
  } catch (err) {
    console.error("ticket lookup error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
