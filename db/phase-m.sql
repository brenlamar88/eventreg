-- db/phase-m.sql — Silent-auction MOBILE BIDDING (proxy bids + anti-sniping)
-- ---------------------------------------------------------------------------
-- Run once in the Supabase SQL editor, AFTER db/phase-0-bootstrap.sql. Safe to
-- re-run (idempotent).
--
-- Extends the existing `lots` ledger with live-bidding fields and adds a `bids`
-- table plus an ATOMIC place_bid() function. Bidding correctness (no two
-- phones can race the same item) lives in the function, which locks the lot
-- row (SELECT … FOR UPDATE) and runs the eBay-style proxy algorithm:
--
--   • Each bidder submits a MAX they're willing to pay. The system bids on
--     their behalf only as high as needed to stay in front.
--   • A challenger who can't beat the leader's max only pushes the price up;
--     the leader keeps winning. A challenger who exceeds it takes the lead at
--     one increment over the old max.
--   • Anti-sniping: a bid inside the final window pushes the close time out,
--     so nobody wins by bidding at the buzzer.
--
-- Bidders are identified by their registrant BIDDER NUMBER (semi-anonymous to
-- the crowd — the standard silent-auction model).
-- ---------------------------------------------------------------------------

-- 1. Live-bidding fields on each lot -----------------------------------------
alter table lots add column if not exists bidding_open    boolean not null default false;
alter table lots add column if not exists starting_bid    numeric not null default 0;
alter table lots add column if not exists min_increment   numeric not null default 10;
alter table lots add column if not exists bid_close_at     timestamptz;
alter table lots add column if not exists bid_extend_secs  int not null default 120;  -- anti-snipe window
alter table lots add column if not exists current_bid      numeric;                    -- cached live price
alter table lots add column if not exists high_bidder_no   text;                       -- leader's bidder #
alter table lots add column if not exists high_bidder_name text;
alter table lots add column if not exists bid_count        int not null default 0;
alter table lots add column if not exists image_url        text;

-- 2. Bid history -------------------------------------------------------------
create table if not exists bids (
  id           uuid primary key default gen_random_uuid(),
  lot_id       uuid not null references lots(id) on delete cascade,
  event_id     text,
  bidder_no    text not null,
  bidder_name  text,
  bidder_email text,
  bidder_phone text,
  max_amount   numeric not null,             -- the proxy maximum this bidder authorized
  amount       numeric not null,             -- the live price this bid established
  outbid       boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists bids_lot_idx on bids(lot_id, created_at desc);

alter table bids enable row level security;
-- No direct anon/authenticated table access. All reads happen through the API
-- (service role); all writes go through place_bid() (SECURITY DEFINER).

-- 3. Atomic proxy-bid engine -------------------------------------------------
create or replace function place_bid(
  p_lot_id       uuid,
  p_bidder_no    text,
  p_bidder_name  text,
  p_bidder_email text,
  p_bidder_phone text,
  p_max_amount   numeric
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  L            lots%rowtype;
  v_now        timestamptz := now();
  v_price      numeric;
  v_leader_max numeric;
  v_floor      numeric;
  v_new_close  timestamptz;
begin
  -- Lock the lot so concurrent bids serialize.
  select * into L from lots where id = p_lot_id for update;
  if not found then
    return json_build_object('ok', false, 'error', 'Item not found');
  end if;
  if not L.bidding_open then
    return json_build_object('ok', false, 'error', 'Bidding is not open for this item');
  end if;
  if L.bid_close_at is not null and v_now >= L.bid_close_at then
    return json_build_object('ok', false, 'error', 'Bidding has closed for this item');
  end if;
  if p_max_amount is null or p_max_amount <= 0 then
    return json_build_object('ok', false, 'error', 'Enter a valid maximum bid');
  end if;

  -- Compute the anti-snipe close extension (only ever pushes the time OUT).
  if L.bid_close_at is not null
     and L.bid_close_at - v_now < make_interval(secs => L.bid_extend_secs) then
    v_new_close := v_now + make_interval(secs => L.bid_extend_secs);
  else
    v_new_close := L.bid_close_at;
  end if;

  -- CASE A — first bid on the item.
  if L.bid_count = 0 or L.current_bid is null or L.high_bidder_no is null then
    v_floor := greatest(L.starting_bid, L.min_increment);
    if p_max_amount < v_floor then
      return json_build_object('ok', false, 'error', 'Bid too low', 'min', v_floor);
    end if;
    v_price := v_floor;   -- opening bid sits at the floor, leaving proxy headroom
    insert into bids(lot_id,event_id,bidder_no,bidder_name,bidder_email,bidder_phone,max_amount,amount)
      values (L.id, L.event_year::text, p_bidder_no, p_bidder_name, p_bidder_email, p_bidder_phone, p_max_amount, v_price);
    update lots set current_bid = v_price, high_bidder_no = p_bidder_no, high_bidder_name = p_bidder_name,
                    bid_count = bid_count + 1, bid_close_at = v_new_close
      where id = L.id;
    return json_build_object('ok', true, 'status', 'winning', 'you_are_high', true,
                             'price', v_price, 'close_at', v_new_close);
  end if;

  -- Fetch the standing leader's proxy max.
  select max_amount into v_leader_max from bids
    where lot_id = L.id and bidder_no = L.high_bidder_no order by created_at desc limit 1;
  v_leader_max := coalesce(v_leader_max, L.current_bid);

  -- CASE B — the current leader raises their own max (price unchanged).
  if p_bidder_no = L.high_bidder_no then
    if p_max_amount <= v_leader_max then
      return json_build_object('ok', false, 'error', 'Your new max must be higher than your current max',
                               'your_max', v_leader_max);
    end if;
    insert into bids(lot_id,event_id,bidder_no,bidder_name,bidder_email,bidder_phone,max_amount,amount)
      values (L.id, L.event_year::text, p_bidder_no, p_bidder_name, p_bidder_email, p_bidder_phone, p_max_amount, L.current_bid);
    update lots set bid_count = bid_count + 1, bid_close_at = v_new_close where id = L.id;
    return json_build_object('ok', true, 'status', 'winning', 'you_are_high', true,
                             'price', L.current_bid, 'close_at', v_new_close);
  end if;

  -- CASE C — a challenger. Must clear the current price by one increment.
  if p_max_amount < L.current_bid + L.min_increment then
    return json_build_object('ok', false, 'error', 'Bid too low', 'min', L.current_bid + L.min_increment);
  end if;

  if p_max_amount > v_leader_max then
    -- Challenger takes the lead; price = one increment over the old leader's max (capped at the challenger's max).
    v_price := least(p_max_amount, v_leader_max + L.min_increment);
    insert into bids(lot_id,event_id,bidder_no,bidder_name,bidder_email,bidder_phone,max_amount,amount)
      values (L.id, L.event_year::text, p_bidder_no, p_bidder_name, p_bidder_email, p_bidder_phone, p_max_amount, v_price);
    update bids set outbid = true where lot_id = L.id and bidder_no = L.high_bidder_no and outbid = false;
    update lots set current_bid = v_price, high_bidder_no = p_bidder_no, high_bidder_name = p_bidder_name,
                    bid_count = bid_count + 1, bid_close_at = v_new_close
      where id = L.id;
    return json_build_object('ok', true, 'status', 'winning', 'you_are_high', true,
                             'price', v_price, 'close_at', v_new_close);
  else
    -- Leader holds; price rises to meet the challenge; challenger is outbid immediately.
    v_price := least(v_leader_max, p_max_amount + L.min_increment);
    insert into bids(lot_id,event_id,bidder_no,bidder_name,bidder_email,bidder_phone,max_amount,amount,outbid)
      values (L.id, L.event_year::text, p_bidder_no, p_bidder_name, p_bidder_email, p_bidder_phone, p_max_amount, p_max_amount, true);
    update lots set current_bid = v_price, bid_count = bid_count + 1, bid_close_at = v_new_close where id = L.id;
    return json_build_object('ok', true, 'status', 'outbid', 'you_are_high', false,
                             'price', v_price, 'close_at', v_new_close);
  end if;
end;
$$;

-- 4. Close bidding & push the winner into the settlement ledger ---------------
-- The high bidder becomes the lot's buyer; the live price becomes the sale
-- amount. Idempotent — re-running won't double-apply.
create or replace function finalize_lot(p_lot_id uuid) returns json
language plpgsql security definer set search_path = public
as $$
declare L lots%rowtype;
begin
  select * into L from lots where id = p_lot_id for update;
  if not found then return json_build_object('ok', false, 'error', 'Item not found'); end if;
  update lots
     set bidding_open = false,
         buyer_name = coalesce(nullif(buyer_name, ''), high_bidder_name),
         amount = case when coalesce(amount,0) = 0 then coalesce(current_bid, 0) else amount end
   where id = L.id;
  return json_build_object('ok', true, 'buyer', L.high_bidder_name, 'amount', L.current_bid);
end;
$$;

grant execute on function place_bid(uuid, text, text, text, text, numeric) to anon, authenticated;
grant execute on function finalize_lot(uuid) to anon, authenticated;
