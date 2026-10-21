# Daily Expense Tracker

A personal finance tracker: income, expenses, transfers, budgets, savings goals, bills and recurring items, reports and CSV import/export. Each person signs in and sees only their own data; the database enforces that, not just the screen.

**Stack:** React 18 + TypeScript, Vite, Tailwind CSS, Recharts, React Hook Form + Zod, Supabase (Auth + PostgreSQL + one Edge Function). Hash routing, so it deploys to GitHub Pages or any static host.

## Features

| Area | What it does |
|---|---|
| Dashboard | Total balance, income, expenses, net cash flow, savings rate, monthly trend, spending by category, budget progress, recent transactions, bills due. Everything is computed from saved records and the chosen period and account. |
| Transactions | Create, edit, delete. Income / expense / refund, amount, date, category, account, payment method, notes, tags. Search, sort, pagination, date/category/account/type filters, CSV export, CSV import with preview and duplicate detection. |
| Accounts & categories | Cash, bank, card, wallet accounts with opening balances; custom categories with colours; archive instead of delete when there is history. Transfers between accounts are recorded separately and never counted as income or expense. |
| Budgets | Monthly limit per expense category, spent / remaining / % used, a warning threshold per budget, copy from last month. |
| Savings goals | Target amount and date, contribution history, progress and "save about X a month" from the contributions you record. |
| Bills & recurring | Recurring income/expenses post automatically (server-side). Bills wait for **Mark paid** (or **Skip**), with reminders on the dashboard. |
| Reports | Monthly, financial-year and calendar-year summaries, previous-period comparison, category breakdowns, income vs expenses, cumulative cash flow, CSV export, print / save as PDF. |
| Settings | Profile, currency, time zone, theme (light / dark / system), financial-year start, full JSON backup, transactions CSV, session management (sign out / other devices / everywhere), change password, delete account. |

Indian digit grouping (₹12,34,567.89) is used for INR. Other supported currencies use thousands grouping.

## Financial rules

All money is stored as **integer minor units** (paise/cents) in `BIGINT`. No floating point is used for totals. (JPY is shown with 2 decimals for consistency.)

* **Balance** of an account = opening balance + income + refunds − expenses + incoming transfers − outgoing transfers.
* **Income** = sum of `income` transactions.
* **Expenses** = sum of `expense` transactions **minus** `refund` transactions. A **refund is not income**: it reduces spending in its category (and therefore budgets), and it adds money back to the account.
* **Net savings** = income − expenses. **Savings rate** = net / income, shown as "—" when income is zero. It can be negative when spending exceeds income.
* **Transfers** change which account holds the money, never income or expenses. A transfer between two selected accounts cancels out of the total balance.
* **Dates** are plain `YYYY-MM-DD` values (no time-zone shifting). "Today" and "this month" are computed in the time zone chosen in Settings (default Asia/Kolkata). Ranges include both end dates, so month boundaries are exact.
* **Recurring dates** keep the original day (a rule starting on the 31st posts on the 28th/29th/30th in short months, then returns to the 31st).
* **Total balance** on the dashboard covers non-archived accounts unless one account is selected.
* **Goal contributions** are a record of money set aside; they do not change account balances or spending.

## Security model

* **Row Level Security on every table**, owner-only, `authenticated` role only. The `anon` role has no access to any finance table.
* `user_id` is filled in by the database from the signed-in session. The client never sends it, and a row can only reference accounts/categories/goals owned by the same user (composite foreign keys).
* Server-side checks (not just forms): amount > 0 and ≤ 10¹² minor units, date range 1970–2100, category kind must match the transaction type, text length limits, unique CSV import fingerprint, unique recurring occurrence, at most 3,000 new transactions per user per hour.
* Only the public anon / publishable key is in the browser. The service-role key exists only inside the `delete-account` Edge Function, where Supabase injects it.
* Passwords are handled by Supabase Auth (hashed, rate-limited). The sign-in form also pauses for 30 seconds after 5 failed attempts.
* CSV export neutralises spreadsheet formulas (`=`, `+`, `-`, `@`). CSV import is capped at 1 MB / 2,000 rows and validated row by row before anything is saved.
* No bank credentials are collected and no bank sync is claimed. Everything is entered or imported manually.

## Project layout

```
src/lib/        money, dates, finance rules, CSV, Zod schemas   (pure code, unit tested)
src/data/       Supabase data context + write API
src/components/ layout, dialogs, charts, UI primitives
src/pages/      Dashboard, Transactions, Accounts, Budgets, Goals, Recurring, Reports, Settings, Auth
supabase/migrations/  schema, constraints, RLS, recurring engine
supabase/tests/rls.sql  isolation + server-rule tests (rolled back)
supabase/functions/delete-account/  account deletion
e2e/            Playwright critical-flow and responsive tests (mocked backend)
```

## Setup

1. **Create a Supabase project** (free tier is fine).
2. **Run the migrations** in order, in the SQL editor (or with the Supabase CLI):
   * `supabase/migrations/20261021000000_init.sql`
   * `supabase/migrations/20261021000100_import_unique.sql`

   The first enables the `pg_cron` extension and schedules the daily recurring run (00:30 UTC).
3. **Deploy the Edge Function** `delete-account` (JWT verification **on**): `supabase functions deploy delete-account`, or paste `supabase/functions/delete-account/index.ts` in the dashboard.
4. **Authentication → URL Configuration:** set **Site URL** and add a **Redirect URL** for where the app is hosted, e.g. `https://YOUR-USER.github.io/Daily-Expense-Tracker-/` and `http://localhost:5173/`. Email confirmation and password-reset links return there. Supabase's built-in email sender is rate limited; use your own SMTP for real use.
5. **Environment:** copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (the publishable/anon key). Never put a service-role key in a `VITE_` variable.
6. `npm install`, then `npm run dev`. Commit the generated `package-lock.json` so installs are reproducible.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run typecheck` | TypeScript (strict) |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (money, dates, finance rules, CSV, schemas) |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run e2e` | Playwright tests against the preview build (`npx playwright install chromium` once) |

To re-run the database tests, paste `supabase/tests/rls.sql` into the SQL editor. It ends with an intentional error, `ALL CHECKS PASSED (… rolled back)`, so nothing is saved.

## Deployment (GitHub Pages)

`.github/workflows/ci.yml` runs install, typecheck, lint, unit tests, build and the Playwright tests on every push, then deploys `dist/` to GitHub Pages from `main`.

1. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions** (one time).
2. The workflow already builds with this project's public URL and publishable key. To use another Supabase project, set repository **variables** `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Settings → Secrets and variables → Actions → Variables).
3. Add the Pages URL to Supabase Redirect URLs (setup step 4).

Any static host works too: `npm run build` and upload `dist/`.

## Recurring items, bills and reminders

* Recurring (non-bill) rules are posted by a database function. It runs **daily via `pg_cron`** on Supabase and also every time you open the app. Missed days are back-filled (up to 400 per rule per run) and can never create duplicates.
* Bills are **not** auto-posted. They appear on the dashboard and the Bills page from *N days before* the due date, until you tap **Mark paid** (posts the expense dated today) or **Skip**.
* **Email / SMS / push reminders are not implemented.** They would need an external service (for example a Supabase Edge Function on a schedule plus an email provider such as Resend). Reminders here are in-app only.

## Backup and restore

* **Settings → Full backup (JSON)** downloads every table you own. **Transactions (CSV)** can be re-imported (duplicates are skipped) from **Transactions → Import**.
* Supabase projects also have their own database backups (paid plans) and `pg_dump` access; use them for server-side backups.
* The JSON backup is for safekeeping; there is no one-click JSON restore. Restore transactions via CSV import, and recreate accounts/budgets/goals from the backup file.

## Testing: what was actually run

* **Unit tests (Vitest/Bun): 57 tests.** Money parsing and Indian formatting, rounding, month boundaries and leap years, time-zone "today", financial-year presets, recurring-date rule, income/expense/refund totals, savings rate with zero/negative income, transfer accounting, budgets, goals, CSV parsing, validation, duplicate detection, formula-injection escaping, form schemas.
* **Database tests: 27 checks on the live Supabase project** (`supabase/tests/rls.sql`): sign-up defaults, per-user isolation (read, update, insert-as-other-user, attach to another user's account, pay another user's bill, change another user's preferences), `anon` has no access, amount/date/category/duplicate/transfer rules, recurring posts once with month-end clamping, bills are not auto-posted.
* **CI (GitHub Actions):** typecheck, lint, unit tests, production build and the Playwright tests pass on `main`.
* **Playwright tests use a mocked backend**: sign-in validation, adding a transaction, invalid-amount rejection, every page renders, and no horizontal scrolling at phone (390 px), tablet (820 px) and desktop (1366 px) widths.

## Known limitations

* No automated test signs in against the real Supabase Auth. The mocked UI tests and the SQL tests cover the two halves; a manual smoke test with a real account is still recommended after setup.
* Email/SMS reminders are not built (see above). No bank sync, no multi-currency conversion (changing the currency changes the symbol only), no shared/household accounts.
* All of a user's transactions are loaded in the browser (fine for personal use; tens of thousands of rows are OK, very large histories would need server-side paging).
* The Dashboard trend shows at most 24 months. "Sign out other devices" depends on Supabase session scopes.
* The old partial index `transactions_import_uq` is redundant after migration 2 and can be dropped.
* `package-lock.json` is not committed yet (it is generated by the first `npm install`).

## Manual configuration checklist

- [ ] Run both migrations on your Supabase project
- [ ] Deploy the `delete-account` Edge Function (JWT verification on)
- [ ] Set Auth Site URL and Redirect URLs
- [ ] (Recommended) configure custom SMTP in Supabase Auth
- [ ] Settings → Pages → Source: GitHub Actions
- [ ] `npm install` locally and commit `package-lock.json`
- [ ] Sign up, add an account, a transaction and a budget as a smoke test
