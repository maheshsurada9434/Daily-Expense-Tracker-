-- Daily Expense Tracker: schema, constraints, Row Level Security, server-side functions.
-- Money is stored as integer minor units (paise/cents) in BIGINT. Never floats.
-- Dates are plain DATE values (no time zone shifting); timestamps are timestamptz.

-- ───────────── helpers ─────────────
create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end $$;

-- ───────────── profile + preferences ─────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  currency text not null default 'INR' check (currency in ('INR','USD','EUR','GBP','AED','SGD','AUD','CAD','JPY')),
  timezone text not null default 'Asia/Kolkata' check (char_length(timezone) <= 64),
  theme text not null default 'system' check (theme in ('light','dark','system')),
  fy_start_month smallint not null default 4 check (fy_start_month between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function public.prefs_guard() returns trigger language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Unknown time zone: %', new.timezone;
  end if;
  return new;
end $$;
create trigger prefs_guard_t before insert or update on public.user_preferences
  for each row execute function public.prefs_guard();

-- ───────────── accounts and categories ─────────────
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null default 'bank' check (kind in ('cash','bank','card','wallet','other')),
  opening_balance bigint not null default 0 check (abs(opening_balance) <= 1000000000000),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, name)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  kind text not null check (kind in ('income','expense')),
  color text not null default '#64748b' check (color ~ '^#[0-9a-fA-F]{6}$'),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, kind, name)
);

-- ───────────── transactions ─────────────
-- type 'refund' reduces the expense total (it is NOT income). See README "Financial rules".
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('income','expense','refund')),
  amount bigint not null check (amount > 0 and amount <= 1000000000000),
  txn_date date not null check (txn_date between date '1970-01-01' and date '2100-12-31'),
  account_id uuid not null,
  category_id uuid,
  payment_method text not null default 'other' check (payment_method in ('cash','upi','card','netbanking','cheque','other')),
  description text not null default '' check (char_length(description) <= 500),
  tags text[] not null default '{}' check (cardinality(tags) <= 10),
  import_hash text check (char_length(import_hash) <= 128),
  recurring_rule_id uuid,
  recurring_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id)
);
create unique index transactions_import_uq on public.transactions (user_id, import_hash) where import_hash is not null;
create unique index transactions_recurring_uq on public.transactions (recurring_rule_id, recurring_date) where recurring_rule_id is not null;
create index transactions_user_date_idx on public.transactions (user_id, txn_date desc);
create index transactions_account_idx on public.transactions (user_id, account_id);
create index transactions_category_idx on public.transactions (user_id, category_id);
create index transactions_created_idx on public.transactions (user_id, created_at);

-- Server-side guard: category kind must match the type, and a per-user hourly insert limit.
create function public.txn_guard() returns trigger language plpgsql set search_path = '' as $$
declare k text;
begin
  if new.category_id is not null then
    select kind into k from public.categories where id = new.category_id and user_id = new.user_id;
    if k is null or (new.type = 'income' and k <> 'income') or (new.type <> 'income' and k <> 'expense') then
      raise exception 'Category does not match the transaction type';
    end if;
  end if;
  if tg_op = 'INSERT' and (select count(*) from public.transactions
        where user_id = new.user_id and created_at > now() - interval '1 hour') >= 3000 then
    raise exception 'Too many transactions added in the last hour. Please try again later.';
  end if;
  return new;
end $$;
create trigger txn_guard_t before insert or update on public.transactions
  for each row execute function public.txn_guard();

-- ───────────── transfers (never counted as income or expense) ─────────────
create table public.transfers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  from_account_id uuid not null,
  to_account_id uuid not null,
  amount bigint not null check (amount > 0 and amount <= 1000000000000),
  transfer_date date not null check (transfer_date between date '1970-01-01' and date '2100-12-31'),
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (from_account_id <> to_account_id),
  foreign key (from_account_id, user_id) references public.accounts (id, user_id),
  foreign key (to_account_id, user_id) references public.accounts (id, user_id)
);
create index transfers_user_date_idx on public.transfers (user_id, transfer_date desc);

-- ───────────── budgets ─────────────
create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id uuid not null,
  month date not null check (extract(day from month) = 1),
  amount bigint not null check (amount > 0 and amount <= 1000000000000),
  warn_pct smallint not null default 80 check (warn_pct between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, month),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete cascade
);

-- ───────────── savings goals ─────────────
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  target_amount bigint not null check (target_amount > 0 and target_amount <= 1000000000000),
  target_date date check (target_date between date '1970-01-01' and date '2100-12-31'),
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.goal_contributions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id uuid not null,
  amount bigint not null check (amount > 0 and amount <= 1000000000000),
  contributed_on date not null check (contributed_on between date '1970-01-01' and date '2100-12-31'),
  note text not null default '' check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  foreign key (goal_id, user_id) references public.savings_goals (id, user_id) on delete cascade
);
create index goal_contrib_idx on public.goal_contributions (user_id, goal_id);

-- ───────────── recurring rules and bills ─────────────
create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  type text not null check (type in ('income','expense')),
  amount bigint not null check (amount > 0 and amount <= 1000000000000),
  account_id uuid not null,
  category_id uuid,
  payment_method text not null default 'other' check (payment_method in ('cash','upi','card','netbanking','cheque','other')),
  description text not null default '' check (char_length(description) <= 200),
  frequency text not null check (frequency in ('daily','weekly','monthly','yearly')),
  start_date date not null check (start_date between date '1970-01-01' and date '2100-12-31'),
  end_date date check (end_date >= start_date),
  next_date date not null,
  is_bill boolean not null default false,   -- bills are not auto-posted; the user marks them paid
  remind_days smallint not null default 3 check (remind_days between 0 and 60),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (account_id, user_id) references public.accounts (id, user_id),
  foreign key (category_id, user_id) references public.categories (id, user_id) on delete set null (category_id)
);
create index recurring_due_idx on public.recurring_rules (user_id, active, next_date);

alter table public.transactions
  add foreign key (recurring_rule_id) references public.recurring_rules (id) on delete set null (recurring_rule_id);

-- ───────────── updated_at triggers ─────────────
do $$ declare t text; begin
  foreach t in array array['profiles','user_preferences','accounts','categories','transactions','transfers','budgets','savings_goals','recurring_rules'] loop
    execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', t || '_upd', t);
  end loop;
end $$;

-- ───────────── Row Level Security: owner only, signed-in users only ─────────────
do $$ declare t text; begin
  foreach t in array array['accounts','categories','transactions','transfers','budgets','savings_goals','goal_contributions','recurring_rules'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('create policy %I on public.%I for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t || '_own', t);
  end loop;
end $$;

alter table public.profiles enable row level security;
revoke all on public.profiles from anon;
create policy profiles_own on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

alter table public.user_preferences enable row level security;
revoke all on public.user_preferences from anon;
create policy prefs_own on public.user_preferences for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- ───────────── new user: profile, preferences, starter categories and a Cash account ─────────────
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name) values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'name', ''), 80), ''));
  insert into public.user_preferences (user_id) values (new.id);
  insert into public.accounts (user_id, name, kind) values (new.id, 'Cash', 'cash');
  insert into public.categories (user_id, name, kind, color)
  select new.id, c.name, c.kind, c.color from (values
    ('Food & Dining','expense','#ef4444'),('Groceries','expense','#f97316'),('Transport','expense','#eab308'),
    ('Rent','expense','#8b5cf6'),('Bills & Utilities','expense','#06b6d4'),('Shopping','expense','#ec4899'),
    ('Health','expense','#10b981'),('Entertainment','expense','#6366f1'),('Education','expense','#0ea5e9'),
    ('Travel','expense','#14b8a6'),('Other expense','expense','#64748b'),
    ('Salary','income','#16a34a'),('Business','income','#22c55e'),('Interest','income','#84cc16'),
    ('Gift','income','#a3e635'),('Other income','income','#4ade80')
  ) as c(name, kind, color);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ───────────── recurring engine ─────────────
create function public.next_occurrence(d date, freq text, anchor date) returns date
language sql immutable set search_path = '' as $$
  select case freq
    when 'daily' then d + 1
    when 'weekly' then d + 7
    when 'monthly' then
      (date_trunc('month', d) + interval '1 month')::date
      + (least(extract(day from anchor)::int,
               extract(day from (date_trunc('month', d) + interval '2 month' - interval '1 day'))::int) - 1)
    when 'yearly' then
      make_date(extract(year from d)::int + 1, extract(month from anchor)::int,
        least(extract(day from anchor)::int,
              extract(day from (make_date(extract(year from d)::int + 1, extract(month from anchor)::int, 1)
                                + interval '1 month' - interval '1 day'))::int))
  end $$;

-- Posts every due, non-bill occurrence up to "today" in the user's time zone. Safe to run repeatedly:
-- the unique index on (recurring_rule_id, recurring_date) prevents duplicates.
create function public._gen_recurring(p_user uuid) returns int language plpgsql security definer set search_path = '' as $$
declare r record; tz text; today date; d date; i int; n int := 0;
begin
  if p_user is null then return 0; end if;
  select coalesce((select timezone from public.user_preferences where user_id = p_user), 'Asia/Kolkata') into tz;
  today := (now() at time zone tz)::date;
  for r in select * from public.recurring_rules
           where user_id = p_user and active and not is_bill and next_date <= today for update loop
    d := r.next_date; i := 0;
    while d <= today and (r.end_date is null or d <= r.end_date) and i < 400 loop
      insert into public.transactions (user_id, type, amount, txn_date, account_id, category_id, payment_method, description, recurring_rule_id, recurring_date)
      values (r.user_id, r.type, r.amount, d, r.account_id, r.category_id, r.payment_method, r.description, r.id, d)
      on conflict do nothing;
      n := n + 1; d := public.next_occurrence(d, r.frequency, r.start_date); i := i + 1;
    end loop;
    update public.recurring_rules
       set next_date = d, active = case when r.end_date is not null and d > r.end_date then false else active end
     where id = r.id;
  end loop;
  return n;
end $$;

create function public.run_my_recurring() returns int language sql security definer set search_path = '' as $$
  select public._gen_recurring((select auth.uid()))
$$;

create function public._gen_recurring_all() returns void language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  for u in select distinct user_id from public.recurring_rules where active and not is_bill and next_date <= current_date + 1 loop
    perform public._gen_recurring(u);
  end loop;
end $$;

-- Marks a bill paid: posts the expense dated today and moves the bill to its next due date.
-- SECURITY INVOKER: row level security decides which bills the caller may touch.
create function public.pay_bill(p_rule uuid) returns void language plpgsql set search_path = '' as $$
declare r public.recurring_rules; tz text; today date; nxt date;
begin
  select * into r from public.recurring_rules where id = p_rule and is_bill and active for update;
  if not found then raise exception 'Bill not found'; end if;
  select coalesce((select timezone from public.user_preferences where user_id = r.user_id), 'Asia/Kolkata') into tz;
  today := (now() at time zone tz)::date;
  insert into public.transactions (user_id, type, amount, txn_date, account_id, category_id, payment_method, description, recurring_rule_id, recurring_date)
  values (r.user_id, r.type, r.amount, today, r.account_id, r.category_id, r.payment_method, r.description, r.id, r.next_date);
  nxt := public.next_occurrence(r.next_date, r.frequency, r.start_date);
  update public.recurring_rules
     set next_date = nxt, active = not (r.end_date is not null and nxt > r.end_date)
   where id = r.id;
end $$;

revoke execute on function public._gen_recurring(uuid), public._gen_recurring_all() from public, anon, authenticated;
revoke execute on function public.run_my_recurring(), public.pay_bill(uuid) from public, anon;
grant execute on function public.run_my_recurring(), public.pay_bill(uuid) to authenticated;

-- Daily server-side run (00:30 UTC) so recurring items post even if the app is not opened.
create extension if not exists pg_cron;
select cron.schedule('expense-tracker-recurring', '30 0 * * *', $$select public._gen_recurring_all()$$);
