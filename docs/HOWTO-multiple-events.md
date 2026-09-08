# How to run multiple events on one deployment

Your platform serves **many events from one site**. Each event has its own
branding, pricing, roster, sponsors, auction, and (optionally) its own door
passcode. This is how you add and manage them today.

## The one idea to remember

**An event is identified by a short URL slug** (e.g. `boil85`,
`dsc-austin-2026`). You put that slug in the URL to work with that event:

| URL | What it opens |
|---|---|
| `yoursite.com/` | The **default** event's registration page |
| `yoursite.com/?event=dsc-austin-2026` | That event's registration page |
| `yoursite.com/?app=setup` | Event Setup (the admin screen) |
| `yoursite.com/?app=setup&event=dsc-austin-2026` | Setup for that specific event |
| `yoursite.com/?event=dsc-austin-2026&station=scan` | The scan station for that event |
| `yoursite.com/?event=dsc-austin-2026&station=register` | The self-serve registration kiosk for that event |

The **default event needs no `?event=` parameter** — that keeps your main
link clean. Everything else you share with `?event=<slug>`.

## Adding a new event (2 minutes)

1. Go to **`/?app=setup`** and connect with your **master passcode**
   (your `ORGANIZER_PASSCODE` — it works for every event).
2. In the **Events** card, under **"Create a new event,"** enter:
   - **URL slug** — lowercase, letters/numbers/dashes, e.g. `cca-corpus-2026`.
     This becomes the event's link. Pick it carefully; it's the address.
   - **Event name** — e.g. "CCA Corpus Christi Banquet".
   - **Year**.
3. Click **Create.** You're taken straight to that event's setup.
4. Fill in its **branding** (name, tagline, logo, colors), **ticket price**,
   and **donation presets**, then **Save**. Empty fields fall back to the
   built-in defaults, so you can do just the essentials and refine later.

## Switching between events

On `/?app=setup`, use the **"Editing event"** dropdown in the Events card to
jump between events. Each event's settings load independently.

## Giving an event to a chapter's staff

1. On that event in Event Setup, set an **Organizer passcode for this event**
   and give it to their door team. It unlocks **only that event's** roster,
   door, sponsors, and auction — nothing else. (Your master passcode still
   works everywhere.)
2. Share their door links:
   - Check-in scanner: `/?event=<slug>&station=scan`
   - Walk-in registration kiosk: `/?event=<slug>&station=register`
   Put each iPad on one link, open it once while online, then pin it with
   iOS **Guided Access**.
3. Share the public registration link: `/?event=<slug>`.

## Making a different event the default

In the Events card, select the event and click **"Make this the default
event."** Its registration page then answers your bare domain (`yoursite.com/`
with no parameter). Exactly one event is the default at a time.

## Setup order for a brand-new deployment

Run these once in the Supabase SQL editor, in order (all are safe to re-run):

`phase-0-bootstrap` → `phase-a` → `phase-b` → `phase-c` → `phase-d` →
`phase-e` → `phase-f`

Then set the Vercel env vars (see the top of this README's deploy section)
and open `/?app=setup` to create your events.

---

> **Heads up on scale:** today all events live under *your* single account
> and share one master passcode + one Stripe account. If you're selling this
> as a SaaS where each **client organization** manages their own events,
> logs in separately, and gets paid into their own bank account, that's a
> **multi-tenant** layer on top of this — see `docs/MULTI-TENANT-PLAN.md`.
