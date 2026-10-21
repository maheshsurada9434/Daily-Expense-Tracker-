-- Row Level Security, cross-user isolation and server-rule tests.
-- Run in the Supabase SQL editor (or via the MCP execute_sql tool). Everything happens in one DO block that ends
-- with an exception, so nothing is ever committed. Success looks like:  ERROR: ALL CHECKS PASSED (rolled back)
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid();
  acc_a uuid; cat_a uuid; cat_inc_a uuid; acc_b uuid; acc_a2 uuid;
  tx uuid; n int; ok boolean; rule uuid; checks int := 0;
begin
  insert into auth.users (id, email, aud, role) values (a, 'a@test.local', 'authenticated', 'authenticated'), (b, 'b@test.local', 'authenticated', 'authenticated');

  -- sign-up trigger created defaults for both
  select count(*) into n from public.accounts where user_id in (a, b); assert n = 2, 'default Cash accounts'; checks := checks + 1;
  select count(*) into n from public.categories where user_id = a; assert n = 16, 'default categories'; checks := checks + 1;
  select id into acc_a from public.accounts where user_id = a;
  select id into acc_b from public.accounts where user_id = b;
  select id into cat_a from public.categories where user_id = a and kind = 'expense' limit 1;
  select id into cat_inc_a from public.categories where user_id = a and kind = 'income' limit 1;

  -- act as user A
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  assert auth.uid() = a, 'auth.uid() is A'; checks := checks + 1;

  insert into public.accounts (name, kind, opening_balance) values ('Bank', 'bank', 100000) returning id into acc_a2;
  insert into public.transactions (type, amount, txn_date, account_id, category_id, import_hash)
    values ('expense', 25050, date '2026-10-01', acc_a, cat_a, 'h1') returning id into tx;
  assert (select user_id from public.transactions where id = tx) = a, 'user_id defaults to auth.uid()'; checks := checks + 1;

  -- server-side validation
  ok := false; begin insert into public.transactions (type, amount, txn_date, account_id) values ('expense', 0, date '2026-10-01', acc_a); exception when check_violation then ok := true; end;
  assert ok, 'zero amount rejected'; checks := checks + 1;
  ok := false; begin insert into public.transactions (type, amount, txn_date, account_id) values ('expense', -5, date '2026-10-01', acc_a); exception when check_violation then ok := true; end;
  assert ok, 'negative amount rejected'; checks := checks + 1;
  ok := false; begin insert into public.transactions (type, amount, txn_date, account_id) values ('expense', 5, date '3000-01-01', acc_a); exception when check_violation then ok := true; end;
  assert ok, 'absurd date rejected'; checks := checks + 1;
  ok := false; begin insert into public.transactions (type, amount, txn_date, account_id, category_id) values ('expense', 5, date '2026-10-01', acc_a, cat_inc_a); exception when raise_exception then ok := true; end;
  assert ok, 'income category on an expense rejected'; checks := checks + 1;
  ok := false; begin insert into public.transactions (type, amount, txn_date, account_id, import_hash) values ('expense', 5, date '2026-10-01', acc_a, 'h1'); exception when unique_violation then ok := true; end;
  assert ok, 'duplicate import hash rejected'; checks := checks + 1;
  ok := false; begin insert into public.transfers (from_account_id, to_account_id, amount, transfer_date) values (acc_a, acc_a, 100, date '2026-10-01'); exception when check_violation then ok := true; end;
  assert ok, 'transfer to same account rejected'; checks := checks + 1;
  insert into public.transfers (from_account_id, to_account_id, amount, transfer_date) values (acc_a, acc_a2, 100, date '2026-10-01');

  -- recurring: monthly rule on the 31st, posted up to today, and idempotent
  insert into public.recurring_rules (type, amount, account_id, frequency, start_date, next_date, description)
    values ('expense', 9900, acc_a, 'monthly', date '2026-07-31', date '2026-07-31', 'Rent') returning id into rule;
  perform public.run_my_recurring(); perform public.run_my_recurring();
  select count(*) into n from public.transactions where recurring_rule_id = rule; assert n >= 2, 'recurring posted';
  select count(*) into n from (select recurring_date from public.transactions where recurring_rule_id = rule group by 1 having count(*) > 1) d;
  assert n = 0, 'recurring never duplicates'; checks := checks + 2;
  assert exists (select 1 from public.transactions where recurring_rule_id = rule and txn_date = date '2026-09-30'), 'month-end clamp (30 Sep)'; checks := checks + 1;
  assert public.next_occurrence(date '2026-02-28', 'monthly', date '2026-01-31') = date '2026-03-31', 'anchor day restored'; checks := checks + 1;
  assert public.next_occurrence(date '2027-02-28', 'yearly', date '2024-02-29') = date '2028-02-29', 'leap year anchor'; checks := checks + 1;

  -- bills are not auto-posted; paying posts once and moves the due date
  insert into public.recurring_rules (type, amount, account_id, frequency, start_date, next_date, is_bill, description)
    values ('expense', 5000, acc_a, 'monthly', date '2026-10-05', date '2026-10-05', true, 'Electricity') returning id into rule;
  perform public.run_my_recurring();
  select count(*) into n from public.transactions where recurring_rule_id = rule; assert n = 0, 'bill not auto-posted'; checks := checks + 1;
  perform public.pay_bill(rule);
  select count(*) into n from public.transactions where recurring_rule_id = rule; assert n = 1, 'bill paid once'; checks := checks + 1;
  assert (select next_date from public.recurring_rules where id = rule) = date '2026-11-05', 'bill moved to next month'; checks := checks + 1;

  -- act as user B: cannot see or touch A's data
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select count(*) into n from public.transactions; assert n = 0, 'B sees none of A''s transactions'; checks := checks + 1;
  select count(*) into n from public.accounts where id in (acc_a, acc_a2); assert n = 0, 'B cannot see A''s accounts'; checks := checks + 1;
  update public.transactions set amount = 1 where id = tx; get diagnostics n = row_count;
  assert n = 0, 'B cannot update A''s transaction'; checks := checks + 1;
  ok := false; begin insert into public.transactions (user_id, type, amount, txn_date, account_id) values (a, 'expense', 5, date '2026-10-01', acc_a); exception when insufficient_privilege then ok := true; end;
  assert ok, 'B cannot insert rows owned by A'; checks := checks + 1;
  ok := false; begin insert into public.transactions (type, amount, txn_date, account_id) values ('expense', 5, date '2026-10-01', acc_a); exception when foreign_key_violation then ok := true; end;
  assert ok, 'B cannot attach a transaction to A''s account'; checks := checks + 1;
  ok := false; begin perform public.pay_bill(rule); exception when raise_exception then ok := true; end;
  assert ok, 'B cannot pay A''s bill'; checks := checks + 1;
  update public.user_preferences set currency = 'USD' where user_id = a; get diagnostics n = row_count;
  assert n = 0, 'B cannot change A''s preferences'; checks := checks + 1;

  -- signed-out (anon) role has no access at all
  reset role; set local role anon;
  ok := false; begin perform 1 from public.transactions; exception when insufficient_privilege then ok := true; end;
  assert ok, 'anon cannot read transactions'; checks := checks + 1;
  ok := false; begin perform public.run_my_recurring(); exception when insufficient_privilege then ok := true; end;
  assert ok, 'anon cannot call run_my_recurring'; checks := checks + 1;
  reset role;

  raise exception 'ALL CHECKS PASSED (% checks, rolled back)', checks;
end $$;
