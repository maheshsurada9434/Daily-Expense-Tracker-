import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, Download, Pencil, Plus, Search, Trash2, Upload, ReceiptText } from 'lucide-react'
import { useData } from '../data/DataContext'
import { api } from '../data/api'
import { useActions } from '../components/Layout'
import ImportDialog from '../components/ImportDialog'
import DateFilter, { type PresetValue } from '../components/DateFilter'
import { METHOD_LABEL } from '../components/TransactionDialog'
import { Badge, EmptyState, Field, PageHeader, cx, useAction, useConfirm } from '../components/ui'
import { presetRange } from '../lib/dates'
import { transactionsToCsv } from '../lib/csv'
import { download } from '../lib/download'
import type { Transaction } from '../data/types'

const PAGE = 20
type SortKey = 'date' | 'amount'

export default function Transactions() {
  const { transactions, accounts, categories, prefs, today, fmt, accountName, category, reload } = useData()
  const { addTransaction, editTransaction } = useActions()
  const confirm = useConfirm()
  const { run } = useAction()

  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [cat, setCat] = useState('all')
  const [acc, setAcc] = useState('all')
  const [preset, setPreset] = useState<PresetValue>('all')
  const [custom, setCustom] = useState({ from: today.slice(0, 7) + '-01', to: today })
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 })
  const [page, setPage] = useState(0)
  const [importing, setImporting] = useState(false)

  const range = preset === 'custom' ? custom : presetRange(preset, today, prefs.fyStartMonth)

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const list = transactions.filter((t) => {
      if (t.date < range.from || t.date > range.to) return false
      if (type !== 'all' && t.type !== type) return false
      if (cat !== 'all' && (cat === 'none' ? t.categoryId !== null : t.categoryId !== cat)) return false
      if (acc !== 'all' && t.accountId !== acc) return false
      if (!needle) return true
      const hay = `${t.description} ${category(t.categoryId)?.name ?? ''} ${accountName(t.accountId)} ${t.tags.join(' ')} ${(t.amount / 100).toFixed(2)}`.toLowerCase()
      return hay.includes(needle)
    })
    return list.sort((a, b) => (sort.key === 'date' ? (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) : a.amount - b.amount) * sort.dir || (a.id < b.id ? 1 : -1))
  }, [transactions, q, type, cat, acc, range.from, range.to, sort]) // eslint-disable-line react-hooks/exhaustive-deps

  const pages = Math.max(1, Math.ceil(rows.length / PAGE))
  const cur = Math.min(page, pages - 1)
  const slice = rows.slice(cur * PAGE, cur * PAGE + PAGE)

  const setF = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0) }
  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: -1 }))

  async function remove(t: Transaction) {
    if (!(await confirm({ title: 'Delete this transaction?', body: `${fmt(t.amount)} on ${t.date}. This cannot be undone.`, confirmText: 'Delete', danger: true }))) return
    await run(async () => { await api.deleteTransaction(t.id); await reload('transactions') }, 'Transaction deleted')
  }

  function exportCsv() {
    const csv = transactionsToCsv(rows.map((t) => ({ date: t.date, type: t.type, amount: t.amount, category: category(t.categoryId)?.name ?? '', account: accountName(t.accountId), paymentMethod: t.paymentMethod, description: t.description, tags: t.tags })))
    download(`transactions-${today}.csv`, csv, 'text/csv')
  }

  const SortIcon = ({ k }: { k: SortKey }) => (sort.key === k ? (sort.dir === 1 ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />) : null)

  return (
    <>
      <PageHeader title="Transactions" subtitle={`${rows.length} found`} actions={
        <>
          <button className="btn btn-ghost" onClick={() => setImporting(true)}><Upload className="h-4 w-4" aria-hidden="true" /> Import</button>
          <button className="btn btn-ghost" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4" aria-hidden="true" /> Export</button>
          <button className="btn btn-primary" onClick={addTransaction}><Plus className="h-4 w-4" aria-hidden="true" /> Add</button>
        </>
      } />

      <div className="card mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Search" className="sm:col-span-2">
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sub" aria-hidden="true" />
            <input className="input pl-9" type="search" placeholder="Description, category, tag, amount" value={q} onChange={(e) => setF(setQ)(e.target.value)} />
          </span>
        </Field>
        <Field label="Type">
          <select className="input" value={type} onChange={(e) => setF(setType)(e.target.value)}>
            <option value="all">All types</option><option value="expense">Expense</option><option value="income">Income</option><option value="refund">Refund</option>
          </select>
        </Field>
        <Field label="Category">
          <select className="input" value={cat} onChange={(e) => setF(setCat)(e.target.value)}>
            <option value="all">All categories</option><option value="none">Uncategorised</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Account">
          <select className="input" value={acc} onChange={(e) => setF(setAcc)(e.target.value)}>
            <option value="all">All accounts</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <DateFilter preset={preset} onPreset={setF(setPreset)} custom={custom} onCustom={setF(setCustom)} />
        <Field label="Sort by">
          <select className="input" value={`${sort.key}:${sort.dir}`} onChange={(e) => { const [k, d] = e.target.value.split(':'); setSort({ key: k as SortKey, dir: Number(d) as 1 | -1 }) }}>
            <option value="date:-1">Newest first</option><option value="date:1">Oldest first</option><option value="amount:-1">Largest amount</option><option value="amount:1">Smallest amount</option>
          </select>
        </Field>
      </div>

      <div className="card overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState icon={<ReceiptText className="h-6 w-6" />} title={transactions.length ? 'No matching transactions' : 'No transactions yet'} body={transactions.length ? 'Try a different search or widen the date range.' : 'Add one, or import a CSV file.'} action={!transactions.length ? <button className="btn btn-primary" onClick={addTransaction}><Plus className="h-4 w-4" /> Add transaction</button> : undefined} />
        ) : (
          <>
            {/* table on larger screens */}
            <table className="hidden w-full text-left text-sm md:table">
              <thead className="bg-muted text-xs text-sub">
                <tr>
                  <th className="p-3"><button className="inline-flex items-center gap-1 font-semibold" onClick={() => toggleSort('date')}>Date <SortIcon k="date" /></button></th>
                  <th className="p-3">Details</th><th className="p-3">Account</th>
                  <th className="p-3 text-right"><button className="inline-flex items-center gap-1 font-semibold" onClick={() => toggleSort('amount')}>Amount <SortIcon k="amount" /></button></th>
                  <th className="w-24 p-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {slice.map((t) => {
                  const c = category(t.categoryId)
                  return (
                    <tr key={t.id} className="border-t border-border">
                      <td className="tabular whitespace-nowrap p-3">{t.date}</td>
                      <td className="max-w-xs p-3">
                        <p className="truncate font-medium">{t.description || c?.name || 'Uncategorised'}</p>
                        <p className="flex flex-wrap items-center gap-1 text-xs text-sub">
                          {c && <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden="true" />{c.name}</span>}
                          <span>· {METHOD_LABEL[t.paymentMethod]}</span>{t.tags.map((g) => <Badge key={g}>{g}</Badge>)}
                        </p>
                      </td>
                      <td className="p-3">{accountName(t.accountId)}</td>
                      <td className={cx('tabular whitespace-nowrap p-3 text-right font-semibold', t.type === 'expense' ? 'text-expense' : 'text-income')}>{t.type === 'expense' ? '-' : '+'}{fmt(t.amount)}{t.type === 'refund' && <span className="ml-1"><Badge tone="warn">Refund</Badge></span>}</td>
                      <td className="p-1 text-right whitespace-nowrap">
                        <button className="icon-btn" onClick={() => editTransaction(t)} aria-label={`Edit transaction of ${fmt(t.amount)} on ${t.date}`}><Pencil className="h-4 w-4" /></button>
                        <button className="icon-btn" onClick={() => remove(t)} aria-label={`Delete transaction of ${fmt(t.amount)} on ${t.date}`}><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {/* cards on phones */}
            <ul className="divide-y divide-border md:hidden">
              {slice.map((t) => {
                const c = category(t.categoryId)
                return (
                  <li key={t.id} className="flex items-center gap-3 p-3">
                    <span className="h-10 w-1 shrink-0 rounded-full" style={{ background: c?.color ?? '#64748b' }} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.description || c?.name || 'Uncategorised'}</p>
                      <p className="truncate text-xs text-sub">{t.date} · {accountName(t.accountId)}{c ? ` · ${c.name}` : ''}</p>
                    </div>
                    <p className={cx('tabular text-sm font-semibold', t.type === 'expense' ? 'text-expense' : 'text-income')}>{t.type === 'expense' ? '-' : '+'}{fmt(t.amount)}</p>
                    <div className="flex">
                      <button className="icon-btn !h-10 !w-10" onClick={() => editTransaction(t)} aria-label={`Edit transaction of ${fmt(t.amount)} on ${t.date}`}><Pencil className="h-4 w-4" /></button>
                      <button className="icon-btn !h-10 !w-10" onClick={() => remove(t)} aria-label={`Delete transaction of ${fmt(t.amount)} on ${t.date}`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="flex items-center justify-between gap-2 border-t border-border p-3 text-sm">
              <span className="text-sub">Page {cur + 1} of {pages}</span>
              <div className="flex gap-2">
                <button className="btn btn-ghost min-h-[40px]" disabled={cur === 0} onClick={() => setPage(cur - 1)}>Previous</button>
                <button className="btn btn-ghost min-h-[40px]" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}>Next</button>
              </div>
            </div>
          </>
        )}
      </div>
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
    </>
  )
}
