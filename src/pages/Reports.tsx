import { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { useData } from '../data/DataContext'
import { CashFlowLine, TrendChart, monthLabel, monthLong } from '../components/Charts'
import { Field, PageHeader, cx } from '../components/ui'
import { addMonths, monthEnd, monthStart, ymd, type Range } from '../lib/dates'
import { monthlyTrend, periodTotals, spendingByCategory, type Tx } from '../lib/finance'
import { formatPct, minorToDecimal, ratioBps } from '../lib/money'
import { toCsv } from '../lib/csv'
import { download } from '../lib/download'

type Mode = 'month' | 'fy' | 'year'

export default function Reports() {
  const { transactions, prefs, today, fmt, category } = useData()
  const [mode, setMode] = useState<Mode>('month')
  const [month, setMonth] = useState(today.slice(0, 7))
  const curYear = Number(today.slice(0, 4))
  const fyNow = Number(today.slice(5, 7)) >= prefs.fyStartMonth ? curYear : curYear - 1
  const [fy, setFy] = useState(fyNow)
  const [year, setYear] = useState(curYear)

  const firstYear = Math.min(curYear, ...transactions.map((t) => Number(t.date.slice(0, 4))))
  const years = Array.from({ length: curYear - firstYear + 1 }, (_, i) => curYear - i)
  const fyLabel = (y: number) => (prefs.fyStartMonth === 1 ? String(y) : `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`)

  const { range, prev, title } = useMemo(() => {
    let r: Range, p: Range, t: string
    if (mode === 'month') {
      const s = `${month}-01`
      r = { from: s, to: monthEnd(s) }
      const ps = addMonths(s, -1)
      p = { from: ps, to: monthEnd(ps) }
      t = monthLong(s)
    } else if (mode === 'fy') {
      const s = ymd(fy, prefs.fyStartMonth, 1)
      r = { from: s, to: monthEnd(addMonths(s, 11)) }
      const ps = ymd(fy - 1, prefs.fyStartMonth, 1)
      p = { from: ps, to: monthEnd(addMonths(ps, 11)) }
      t = fyLabel(fy)
    } else {
      r = { from: ymd(year, 1, 1), to: ymd(year, 12, 31) }
      p = { from: ymd(year - 1, 1, 1), to: ymd(year - 1, 12, 31) }
      t = String(year)
    }
    return { range: r, prev: p, title: t }
  }, [mode, month, fy, year, prefs.fyStartMonth]) // eslint-disable-line react-hooks/exhaustive-deps

  const totals = periodTotals(transactions, range)
  const before = periodTotals(transactions, prev)
  const spanMonths = mode === 'month' ? 6 : 12
  const trendTo = mode === 'month' ? range.to : range.to > monthEnd(today) ? monthEnd(today) : range.to
  const trend = useMemo(() => monthlyTrend(transactions, { from: mode === 'month' ? addMonths(trendTo, -(spanMonths - 1)) : range.from, to: trendTo }), [transactions, range.from, trendTo, mode, spanMonths])
  const cumulative = useMemo(() => { let run = 0; return trend.map((r) => ({ name: monthLabel(r.month), balance: (run += r.net) })) }, [trend])

  const expenseRows = spendingByCategory(transactions, range)
  const expenseTotal = expenseRows.reduce((a, r) => a + r.amount, 0)
  const incomeRows = useMemo(() => {
    const m = new Map<string | null, number>()
    for (const t of transactions as Tx[]) if (t.type === 'income' && t.date >= range.from && t.date <= range.to) m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + t.amount)
    return [...m].map(([categoryId, amount]) => ({ categoryId, amount })).sort((a, b) => b.amount - a.amount)
  }, [transactions, range.from, range.to])
  const incomeTotal = incomeRows.reduce((a, r) => a + r.amount, 0)

  const delta = (now: number, was: number) => (was === 0 ? '—' : `${now >= was ? '+' : ''}${formatPct(ratioBps(now - was, Math.abs(was)) ?? null)}`)

  function exportCsv() {
    const rows: (string | number)[][] = [
      [`Report: ${title}`], [`Period`, range.from, range.to], [],
      ['Income', minorToDecimal(totals.income)], ['Expenses (net of refunds)', minorToDecimal(totals.expenses)], ['Net savings', minorToDecimal(totals.net)], ['Savings rate', formatPct(totals.savingsRateBps)], [],
      ['Month', 'Income', 'Expenses', 'Net', 'Savings rate'], ...trend.map((r) => [r.month.slice(0, 7), minorToDecimal(r.income), minorToDecimal(r.expenses), minorToDecimal(r.net), formatPct(r.savingsRateBps)]), [],
      ['Expense category', 'Amount', 'Share'], ...expenseRows.map((r) => [category(r.categoryId)?.name ?? 'Uncategorised', minorToDecimal(r.amount), formatPct(ratioBps(r.amount, expenseTotal))]), [],
      ['Income category', 'Amount', 'Share'], ...incomeRows.map((r) => [category(r.categoryId)?.name ?? 'Uncategorised', minorToDecimal(r.amount), formatPct(ratioBps(r.amount, incomeTotal))]),
    ]
    download(`report-${title.replace(/\s+/g, '-')}.csv`, toCsv(rows), 'text/csv')
  }

  const monthOptions = (() => { const out: string[] = []; for (let m = monthStart(today); out.length < 60; m = addMonths(m, -1)) out.push(m.slice(0, 7)); return out })()

  return (
    <>
      <PageHeader title="Reports" subtitle={`${title} · ${range.from} to ${range.to}`} actions={
        <>
          <button className="btn btn-ghost no-print" onClick={exportCsv}><Download className="h-4 w-4" aria-hidden="true" /> CSV</button>
          <button className="btn btn-ghost no-print" onClick={() => window.print()}><Printer className="h-4 w-4" aria-hidden="true" /> Print / PDF</button>
        </>
      } />

      <div className="card no-print mb-4 flex flex-wrap items-end gap-3 p-4">
        <div role="radiogroup" aria-label="Report type" className="inline-flex rounded-lg bg-muted p-1">
          {([['month', 'Monthly'], ['fy', 'Financial year'], ['year', 'Calendar year']] as [Mode, string][]).map(([k, l]) => (
            <button key={k} role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={cx('min-h-[40px] rounded-md px-3 text-sm font-semibold transition-colors', mode === k ? 'bg-card text-fg shadow-card' : 'text-sub hover:text-fg')}>{l}</button>
          ))}
        </div>
        {mode === 'month' && <Field label="Month"><select className="input" value={month} onChange={(e) => setMonth(e.target.value)}>{monthOptions.map((m) => <option key={m} value={m}>{monthLong(`${m}-01`)}</option>)}</select></Field>}
        {mode === 'fy' && <Field label="Financial year"><select className="input" value={fy} onChange={(e) => setFy(Number(e.target.value))}>{[...years, firstYear - 1].filter((y, i, a) => a.indexOf(y) === i && y <= fyNow).map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}</select></Field>}
        {mode === 'year' && <Field label="Year"><select className="input" value={year} onChange={(e) => setYear(Number(e.target.value))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></Field>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { l: 'Income', v: fmt(totals.income), d: delta(totals.income, before.income), c: 'text-income' },
          { l: 'Expenses', v: fmt(totals.expenses), d: delta(totals.expenses, before.expenses), c: 'text-expense' },
          { l: 'Net savings', v: fmt(totals.net, { sign: true }), d: delta(totals.net, before.net), c: totals.net >= 0 ? 'text-income' : 'text-expense' },
          { l: 'Savings rate', v: formatPct(totals.savingsRateBps), d: totals.savingsRateBps === null ? 'No income' : undefined, c: '' },
        ].map((s) => (
          <div key={s.l} className="card p-4"><p className="text-sm text-sub">{s.l}</p><p className={cx('tabular mt-1 truncate text-2xl font-semibold', s.c)}>{s.v}</p>{s.d && <p className="mt-1 text-xs text-sub">{s.d === '—' || s.d === 'No income' ? s.d : `${s.d} vs previous ${mode === 'month' ? 'month' : 'year'}`}</p>}</div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card p-4" aria-labelledby="r-trend"><h2 id="r-trend" className="mb-3 font-semibold">Income vs expenses</h2><TrendChart rows={trend} /></section>
        <section className="card p-4" aria-labelledby="r-cash"><h2 id="r-cash" className="mb-3 font-semibold">Cash-flow trend (cumulative net)</h2><CashFlowLine rows={cumulative} /></section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {([['Expenses by category', expenseRows, expenseTotal], ['Income by category', incomeRows, incomeTotal]] as const).map(([h, rows, total]) => (
          <section key={h} className="card overflow-hidden" aria-label={h}>
            <h2 className="border-b border-border p-4 font-semibold">{h}</h2>
            {rows.length === 0 ? <p className="p-4 text-sm text-sub">Nothing recorded.</p> : (
              <table className="w-full text-sm">
                <thead className="bg-muted text-left text-xs text-sub"><tr><th className="p-3">Category</th><th className="p-3 text-right">Amount</th><th className="p-3 text-right">Share</th></tr></thead>
                <tbody>
                  {rows.map((r) => <tr key={r.categoryId ?? 'none'} className="border-t border-border"><td className="p-3"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: category(r.categoryId)?.color ?? '#64748b' }} aria-hidden="true" />{category(r.categoryId)?.name ?? 'Uncategorised'}</td><td className="tabular p-3 text-right">{fmt(r.amount)}</td><td className="tabular p-3 text-right text-sub">{formatPct(ratioBps(r.amount, total))}</td></tr>)}
                  <tr className="border-t border-border font-semibold"><td className="p-3">Total</td><td className="tabular p-3 text-right">{fmt(total)}</td><td /></tr>
                </tbody>
              </table>
            )}
          </section>
        ))}
      </div>

      {mode !== 'month' && (
        <section className="card mt-4 overflow-x-auto" aria-label="Monthly summary">
          <h2 className="border-b border-border p-4 font-semibold">Month by month</h2>
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="bg-muted text-left text-xs text-sub"><tr><th className="p-3">Month</th><th className="p-3 text-right">Income</th><th className="p-3 text-right">Expenses</th><th className="p-3 text-right">Net</th><th className="p-3 text-right">Savings rate</th></tr></thead>
            <tbody>{trend.map((r) => <tr key={r.month} className="border-t border-border"><td className="p-3">{monthLong(r.month)}</td><td className="tabular p-3 text-right">{fmt(r.income)}</td><td className="tabular p-3 text-right">{fmt(r.expenses)}</td><td className={cx('tabular p-3 text-right', r.net < 0 && 'text-expense')}>{fmt(r.net)}</td><td className="tabular p-3 text-right text-sub">{formatPct(r.savingsRateBps)}</td></tr>)}</tbody>
          </table>
        </section>
      )}
      <p className="mt-4 text-xs text-sub">Expenses are net of refunds. Transfers between your accounts are not included.</p>
    </>
  )
}
