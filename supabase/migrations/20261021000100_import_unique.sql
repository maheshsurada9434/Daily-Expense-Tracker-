-- CSV import upserts with ON CONFLICT (user_id, import_hash). PostgREST needs a plain unique constraint for that
-- (a partial index does not match). NULL hashes never collide, so manual transactions are unaffected.
-- Note: the earlier partial index transactions_import_uq is now redundant; dropping it is optional.
alter table public.transactions add constraint transactions_import_key unique (user_id, import_hash);
-- drop index if exists public.transactions_import_uq;
