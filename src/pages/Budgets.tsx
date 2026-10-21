import { useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { ChevronLeft, ChevronRight, Copy, Pencil, PiggyBank, Plus, Trash2 } from 'lucide-react'
import { useData } from '../data/DataContext'
import { api } from '../data/api'
import { budgetSchema } from '../lib/schemas'
import { addMonths, monthStart } from '../lib/dates'
import { budgetProgress } from '../lib/finance'
import { formatPct, minorToDecimal } from '../lib/money'
import { monthLong } from '../components/Charts'
import type { BudgetRec } from '../data/types'
import { Badge, EmptyState, Field, Modal, PageHeader, ProgressBar, useAction, useConfirm } from '../components/ui'

export default function Budgets() {
  const { budgets, categories, transactions, today, fmt, category, reload } = useData()
  const confirm = useConfirm()
  const { run } = useAction()
  const [month, setMonth] = useState(monthStart(today))
  const [edit, setEdit] = useState<BudgetRec | 'new' | null>(null)

  const list = useMemo(() => budgets.filter((b) => b.month === month).map((b) => ({ b, p: budgetProgress(b, transactions) })).sort((a, b) => b.p.pctBps - a.p.pctBps), [budgets, transactions, month])
  const totalBudget = list.reduce((a, x) => a + x.b.amount, 0)
  const totalSpent = list.reduce((a, x) => a + x.p.spent, 0)
  const prevMonth = addMonths(month, -1)
  const prevBudgets = budgets.filter((b) => b.month === prevMonth)
  const free = categories.filter((c) => c.kind === 'expense' && !c.archived && !list.some((x) => x.b.categoryId === c.id))

  return (
    <>
      <PageHeader title="Budgets" subtitle="Monthly spending limits by category" actions={<button className="btn btn-primary" onClick={() => setEdit('new')} disabled={free.length === 0}><Plus className="h-4 w-4" aria-hidden="true" /> Add budget</button>} />

      <div className="card mb-4 flex items-center justify-between p-2">
        <button className="icon-btn" onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></button>
        <div className="text-center"><p className="font-semibold">{monthLong(month)}</p>{month !== monthStart(today) && <button className="text-xs font-semibold text-primary" onClick={() => setMonth(monthStart(today))}>Back to this month</button>}</div>
        <button className="icon-btn" onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"><ChevronRight className="h-5 w-5" /></button>
      </div>

      {list.length > 0 && (
        <div className="card mb-4 p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2"><span className="text-sm text-sub">Total across {list.length} budget{list.length > 1 ? 's' : ''}</span><span className="tabular font-semibold">{fmt(totalSpent)} of {fmt(totalBudget)}</span></div>
          <ProgressBar pct={totalBudget ? (totalSpent / totalBudget) * 100 : 0} tone={totalSpent > totalBudget ? 'expense' : 'primary'} label="Total budget used" />
        </div>
      )}

      {list.length === 0 ? (
        <div className="card">
          <EmptyState icon={<PiggyBank className="h-6 w-6" />} title="No budgets for this month" body="Set a limit for a category to see how much you have left." action={
            <div className="flex flex-wrap justify-center gap-2">
              <button className="btn btn-primary" onClick={() => setEdit('new')}><Plus className="h-4 w-4" /> Add budget</button>
              {prevBudgets.length > 0 && <button className="btn btn-ghost" onClick={() => run(async () => { await api.copyBudgets(prevBudgets, month); await reload('budgets') }, 'Copied from last month')}><Copy className="h-4 w-4" /> Copy last month</button>}
            </div>
          } />
        </div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {list.map(({ b, p }) => {
            const c = category(b.categoryId)
            return (
              <li key={b.id} className="card fade-up p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c?.color ?? '#64748b' }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-medium">{c?.name ?? 'Category'}</span>
                  {p.status === 'over' && <Badge tone="expense">Over budget</Badge>}
                  {p.status === 'warn' && <Badge tone="warn">Near limit</Badge>}
                  <button className="icon-btn !h-9 !w-9" onClick={() => setEdit(b)} aria-label={`Edit ${c?.name} budget`}><Pencil className="h-4 w-4" /></button>
                  <button className="icon-btn !h-9 !w-9" aria-label={`Delete ${c?.name} budget`} onClick={async () => { if (await confirm({ title: 'Delete this budget?', confirmText: 'Delete', danger: true })) await run(async () => { await api.deleteBudget(b.id); await reload('budgets') }, 'Budget deleted') }}><Trash2 className="h-4 w-4" /></button>
                </div>
                <ProgressBar pct={p.pctBps / 100} tone={p.status === 'over' ? 'expense' : p.status === 'warn' ? 'warn' : 'primary'} label={`${c?.name} budget used`} />
                <div className="mt-2 flex justify-between text-sm">
                  <span className="tabular">{fmt(p.spent)} spent <span className="text-sub">({formatPct(p.pctBps)})</span></span>
                  <span className={p.remaining < 0 ? 'tabular font-semibold text-expense' : 'tabular text-sub'}>{p.remaining < 0 ? `${fmt(-p.remaining)} over` : `${fmt(p.remaining)} left`}</span>
                </div>
                <p className="mt-1 text-xs text-sub">Limit {fmt(b.amount)} · warns at {b.warnPct}%</p>
              </li>
            )
          })}
        </ul>
      )}
      {list.length > 0 && prevBudgets.length > 0 && (
        <button className="btn btn-ghost mt-4" onClick={() => run(async () => { await api.copyBudgets(prevBudgets, month); await reload('budgets') }, 'Copied missing budgets from last month')}><Copy className="h-4 w-4" aria-hidden="true" /> Copy missing from last month</button>
      )}
      <BudgetDialog target={edit} month={month} free={free.map((c) => ({ id: c.id, name: c.name }))} onClose={() => setEdit(null)} />
    </>
  )
}

function BudgetDialog({ target, month, free, onClose }: { target: BudgetRec | 'new' | null; month: string; free: { id: string; name: string }[]; onClose: () => void }) {
  const { reload, category } = useData()
  const { busy, run } = useAction()
  const editing = target && target !== 'new' ? target : null
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof budgetSchema>>({ resolver: zodResolver(budgetSchema) })
  useEffect(() => { if (target) reset(editing ? { categoryId: editing.categoryId, amount: minorToDecimal(editing.amount), warnPct: String(editing.warnPct) } : { categoryId: free[0]?.id ?? '', amount: '', warnPct: '80' }, { keepFieldsRef: true }) }, [target]) // eslint-disable-line react-hooks/exhaustive-deps
  const submit = handleSubmit(async (v) => { if (await run(async () => { await api.saveBudget(v, month, editing?.id); await reload('budgets') }, 'Budget saved')) onClose() })
  return (
    <Modal open={!!target} onClose={onClose} title={editing ? 'Edit budget' : `New budget · ${monthLong(month)}`}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Category" error={errors.categoryId?.message}>
          {editing ? <input className="input" value={category(editing.categoryId)?.name ?? ''} disabled readOnly /> : <select className="input" {...register('categoryId')}>{free.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
        </Field>
        <Field label="Monthly limit" error={errors.amount?.message}><input className="input tabular" inputMode="decimal" placeholder="0.00" autoFocus {...register('amount')} /></Field>
        <Field label="Warn me at (% used)" hint="You get a warning badge once spending reaches this share of the limit." error={errors.warnPct?.message}><input className="input tabular" inputMode="numeric" {...register('warnPct')} /></Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save budget'}</button></div>
      </form>
    </Modal>
  )
}
