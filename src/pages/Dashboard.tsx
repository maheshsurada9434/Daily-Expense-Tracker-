import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, CalendarClock, PiggyBank, Plus, Scale, TrendingUp, Wallet } from 'lucide-react'
import { useData } from '../data/DataContext'
import { useActions } from '../components/Layout'
import { Badge, EmptyState, Field, PageHeader, ProgressBar, cx } from '../components/ui'
import DateFilter, { type PresetValue } from '../components/DateFilter'
import { CategoryDonut, TrendChart, monthLong, type Slice } from '../components/Charts'
import { addDays, addMonths, monthEnd, monthStart, presetRange } from '../lib/dates'
import { budgetProgress, monthlyTrend, periodTotals, spendingByCategory, totalBalance } from '../lib/finance'
import { formatPct } from '../lib/money'

function Stat({ label, value, icon, tone, sub }: { label: string; value: string; icon: React.ReactNode; tone?: 'income' | 'expense'; sub?: string }) {
  return (
    <div className="card fade-up p-4">
      <div className="flex items-center justify-between text-sm text-sub"><span>{label}</span><span aria-hidden="true">{icon}</span></div>
      <p className={cx('tabular mt-2 truncate text-2xl font-semibold', tone === 'income' && 'text-income', tone === 'expense' && 'text-expense')}>{value}</p>
      {sub && <p className="mt-1 text-xs text-sub">{sub}</p>}
    </div>
  )
}

export default function Dashboard() {
  const { transactions, transfers, accounts, categories, budgets, rules, prefs, today, fmt, accountName, category } = useData()
  const { addTransaction, editTransaction } = useActions()
  const [preset, setPreset] = useState<PresetValue>('this-month')
  const [custom, setCustom] = useState({ from: monthStart(today), to: monthEnd(today) })
  const [acc, setAcc] = useState('all')

  const range = preset === 'custom' ? custom : presetRange(preset, today, prefs.fyStartMonth)
  const accountIds = acc === 'all' ? null : [acc]
  const filter = { ...range, accountIds }

  const totals = useMemo(() => periodTotals(transactions, filter), [transactions, range.from, range.to, acc]) // eslint-disable-line react-hooks/exhaustive-deps
  const balance = totalBalance(accounts, transactions, transfers, accountIds, range.to < today ? range.to : today)

  const trend = useMemo(() => {
    const spanMonths = (Number(range.to.slice(0, 4)) * 12 + Number(range.to.slice(5, 7))) - (Number(range.from.slice(0, 4)) * 12 + Number(range.from.slice(5, 7)))
    const to = range.to > monthEnd(today) ? monthEnd(today) : range.to
    const from = spanMonths < 1 ? addMonths(to, -5) : range.from < addMonths(to, -23) ? addMonths(to, -23) : range.from
    return monthlyTrend(transactions, { from, to, accountIds })
  }, [transactions, range.from, range.to, acc, today]) // eslint-disable-line react-hooks/exhaustive-deps

  const slices = useMemo<Slice[]>(() => {
    const rows = spendingByCategory(transactions, filter)
    const top = rows.slice(0, 6).map((r) => ({ name: category(r.categoryId)?.name ?? 'Uncategorised', value: r.amount, color: category(r.categoryId)?.color ?? '#64748b' }))
    const rest = rows.slice(6).reduce((a, r) => a + r.amount, 0)
    return rest > 0 ? [...top, { name: 'Other categories', value: rest, color: '#94a3b8' }] : top
  }, [transactions, categories, range.from, range.to, acc]) // eslint-disable-line react-hooks/exhaustive-deps

  const budgetMonth = monthStart(range.to > today ? today : range.to)
  const monthBudgets = budgets.filter((b) => b.month === budgetMonth).map((b) => ({ b, p: budgetProgress(b, transactions, accountIds) })).sort((a, b) => b.p.pctBps - a.p.pctBps).slice(0, 5)

  const recent = useMemo(() => transactions.filter((t) => t.date >= range.from && t.date <= range.to && (!accountIds || accountIds.includes(t.accountId))).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 8), [transactions, range.from, range.to, acc]) // eslint-disable-line react-hooks/exhaustive-deps

  const dueBills = rules.filter((r) => r.isBill && r.active && r.nextDate <= addDays(today, r.remindDays))

  if (transactions.length === 0) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <div className="card"><EmptyState icon={<PiggyBank className="h-6 w-6" />} title="Add your first transaction" body="Your balance, trends and budgets appear here once you record income or spending." action={<button className="btn btn-primary" onClick={addTransaction}><Plus className="h-4 w-4" /> Add transaction</button>} /></div>
      </>
    )
  }

  return (
    <>
      <PageHeader title="Dashboard" subtitle={`${range.from} to ${range.to}`} />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <DateFilter preset={preset} onPreset={setPreset} custom={custom} onCustom={setCustom} />
        <Field label="Account">
          <select className="input" value={acc} onChange={(e) => setAcc(e.target.value)}>
            <option value="all">All accounts</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.archived ? ' (archived)' : ''}</option>)}
          </select>
        </Field>
      </div>

      {dueBills.length > 0 && (
        <Link to="/recurring" className="mb-4 flex items-center gap-3 rounded-lg border border-warn/40 bg-warn/10 p-3 text-sm">
          <CalendarClock className="h-5 w-5 shrink-0 text-warn" aria-hidden="true" />
          <span className="flex-1"><strong>{dueBills.length} bill{dueBills.length > 1 ? 's' : ''}</strong> due soon or overdue: {dueBills.slice(0, 3).map((b) => b.description).join(', ')}</span>
          <span className="font-semibold text-primary">Review</span>
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Total balance" value={fmt(balance)} icon={<Scale className="h-4 w-4" />} sub={acc === 'all' ? 'All active accounts' : accountName(acc)} />
        <Stat label="Income" value={fmt(totals.income)} icon={<ArrowDownLeft className="h-4 w-4 text-income" />} tone="income" />
        <Stat label="Expenses" value={fmt(totals.expenses)} icon={<ArrowUpRight className="h-4 w-4 text-expense" />} tone="expense" sub={totals.refunds ? `After ${fmt(totals.refunds)} refunds` : undefined} />
        <Stat label="Net cash flow" value={fmt(totals.net, { sign: true })} icon={<TrendingUp className="h-4 w-4" />} tone={totals.net >= 0 ? 'income' : 'expense'} />
        <Stat label="Savings rate" value={formatPct(totals.savingsRateBps)} icon={<Wallet className="h-4 w-4" />} sub={totals.savingsRateBps === null ? 'Needs income in this period' : undefined} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <section className="card p-4 lg:col-span-3" aria-labelledby="h-trend">
          <h2 id="h-trend" className="mb-3 font-semibold">Monthly trend</h2>
          <TrendChart rows={trend} />
        </section>
        <section className="card p-4 lg:col-span-2" aria-labelledby="h-cat">
          <h2 id="h-cat" className="mb-3 font-semibold">Spending by category</h2>
          {slices.length ? <CategoryDonut slices={slices} /> : <p className="py-10 text-center text-sm text-sub">No spending in this period.</p>}
        </section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-4" aria-labelledby="h-bud">
          <div className="mb-3 flex items-center justify-between"><h2 id="h-bud" className="font-semibold">Budgets · {monthLong(budgetMonth)}</h2><Link to="/budgets" className="text-sm font-semibold text-primary">Manage</Link></div>
          {monthBudgets.length === 0 ? <p className="py-6 text-center text-sm text-sub">No budgets for this month yet.</p> : (
            <ul className="space-y-4">
              {monthBudgets.map(({ b, p }) => (
                <li key={b.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate font-medium">{category(b.categoryId)?.name ?? 'Category'}</span>
                    <span className="tabular shrink-0 text-sub">{fmt(p.spent, { decimals: false })} / {fmt(b.amount, { decimals: false })}</span>
                  </div>
                  <ProgressBar pct={p.pctBps / 100} tone={p.status === 'over' ? 'expense' : p.status === 'warn' ? 'warn' : 'primary'} label={`${category(b.categoryId)?.name ?? 'Budget'} used`} />
                  {p.status !== 'ok' && <p className="mt-1 text-xs font-medium text-warn">{p.status === 'over' ? `Over budget by ${fmt(-p.remaining)}` : `${formatPct(p.pctBps)} used`}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4" aria-labelledby="h-recent">
          <div className="mb-3 flex items-center justify-between"><h2 id="h-recent" className="font-semibold">Recent transactions</h2><Link to="/transactions" className="text-sm font-semibold text-primary">View all</Link></div>
          {recent.length === 0 ? <p className="py-6 text-center text-sm text-sub">Nothing in this period.</p> : (
            <ul className="divide-y divide-border">
              {recent.map((t) => {
                const c = category(t.categoryId)
                return (
                  <li key={t.id}>
                    <button className="flex min-h-[52px] w-full items-center gap-3 py-2 text-left" onClick={() => editTransaction(t)} aria-label={`Edit ${t.description || c?.name || t.type}`}>
                      <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: c?.color ?? '#64748b' }} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{t.description || c?.name || 'Uncategorised'}</span>
                        <span className="block truncate text-xs text-sub">{t.date} · {accountName(t.accountId)}{c ? ` · ${c.name}` : ''}</span>
                      </span>
                      {t.type === 'refund' && <Badge tone="warn">Refund</Badge>}
                      <span className={cx('tabular shrink-0 text-sm font-semibold', t.type === 'expense' ? 'text-expense' : 'text-income')}>{t.type === 'expense' ? '-' : '+'}{fmt(t.amount)}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
