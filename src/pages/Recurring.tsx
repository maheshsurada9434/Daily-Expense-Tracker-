import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { CalendarClock, CheckCircle2, Pause, Pencil, Play, Plus, SkipForward, Trash2 } from 'lucide-react'
import { useData } from '../data/DataContext'
import { api } from '../data/api'
import { recurringSchema } from '../lib/schemas'
import { addDays, diffDays } from '../lib/dates'
import { minorToDecimal } from '../lib/money'
import type { RuleRec } from '../data/types'
import { Badge, EmptyState, Field, Modal, PageHeader, cx, useAction, useConfirm } from '../components/ui'

const FREQ = { daily: 'Every day', weekly: 'Every week', monthly: 'Every month', yearly: 'Every year' } as const

export default function Recurring() {
  const { rules, today, fmt, accountName, category, reload } = useData()
  const confirm = useConfirm()
  const { run } = useAction()
  const [edit, setEdit] = useState<RuleRec | 'new' | null>(null)

  const bills = rules.filter((r) => r.isBill && r.active).sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1))
  const due = bills.filter((b) => b.nextDate <= addDays(today, b.remindDays))
  const all = [...rules].sort((a, b) => (a.nextDate < b.nextDate ? -1 : 1))

  const dueLabel = (r: RuleRec) => {
    const d = diffDays(today, r.nextDate)
    return d < 0 ? `Overdue by ${-d} day${d === -1 ? '' : 's'}` : d === 0 ? 'Due today' : `Due in ${d} day${d === 1 ? '' : 's'}`
  }

  return (
    <>
      <PageHeader title="Bills & recurring" subtitle="Repeating income and expenses, and bills you need to pay" actions={<button className="btn btn-primary" onClick={() => setEdit('new')}><Plus className="h-4 w-4" aria-hidden="true" /> Add</button>} />

      <p className="mb-4 rounded-lg border border-border bg-muted/50 p-3 text-sm text-sub">
        <strong className="text-fg">Recurring</strong> items are posted automatically on their dates (the server checks daily, and also when you open the app). <strong className="text-fg">Bills</strong> are not posted until you tap Mark paid. Reminders appear here and on the dashboard.
      </p>

      {due.length > 0 && (
        <section className="mb-6" aria-labelledby="h-due">
          <h2 id="h-due" className="mb-2 font-semibold">Needs attention</h2>
          <ul className="space-y-2">
            {due.map((b) => {
              const overdue = b.nextDate < today
              return (
                <li key={b.id} className={cx('card flex flex-wrap items-center gap-3 p-3', overdue && 'border-expense/50')}>
                  <CalendarClock className={cx('h-5 w-5 shrink-0', overdue ? 'text-expense' : 'text-warn')} aria-hidden="true" />
                  <div className="min-w-0 flex-1"><p className="truncate font-medium">{b.description}</p><p className={cx('text-xs', overdue ? 'font-semibold text-expense' : 'text-sub')}>{dueLabel(b)} · {b.nextDate}</p></div>
                  <p className="tabular font-semibold">{fmt(b.amount)}</p>
                  <button className="btn btn-primary min-h-[40px]" onClick={() => run(async () => { await api.payBill(b.id); await reload('rules', 'transactions') }, 'Bill marked as paid')}><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Mark paid</button>
                  <button className="btn btn-ghost min-h-[40px]" aria-label={`Skip ${b.description} this time`} onClick={async () => { if (await confirm({ title: 'Skip this bill?', body: `${b.description} on ${b.nextDate} will not be recorded. The next due date moves forward.`, confirmText: 'Skip' })) await run(async () => { await api.skipBill(b.id, b.nextDate, b.frequency, b.startDate); await reload('rules') }, 'Skipped') }}><SkipForward className="h-4 w-4" aria-hidden="true" /> Skip</button>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="h-all">
        <h2 id="h-all" className="mb-2 font-semibold">All rules</h2>
        <div className="card divide-y divide-border">
          {all.length === 0 && <EmptyState icon={<CalendarClock className="h-6 w-6" />} title="Nothing scheduled" body="Add rent, a salary, a subscription or an EMI so it is recorded on time." action={<button className="btn btn-primary" onClick={() => setEdit('new')}><Plus className="h-4 w-4" /> Add</button>} />}
          {all.map((r) => (
            <div key={r.id} className={cx('flex flex-wrap items-center gap-3 p-4', !r.active && 'opacity-60')}>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{r.description} {r.isBill ? <Badge tone="warn">Bill</Badge> : <Badge>Auto</Badge>} {!r.active && <Badge>Paused</Badge>}</p>
                <p className="truncate text-xs text-sub">{FREQ[r.frequency]} · {accountName(r.accountId)}{category(r.categoryId) ? ` · ${category(r.categoryId)?.name}` : ''} · {r.active ? `next ${r.nextDate}` : 'not scheduled'}</p>
              </div>
              <p className={cx('tabular font-semibold', r.type === 'income' ? 'text-income' : 'text-expense')}>{r.type === 'income' ? '+' : '-'}{fmt(r.amount)}</p>
              <div className="flex">
                <button className="icon-btn" onClick={() => setEdit(r)} aria-label={`Edit ${r.description}`}><Pencil className="h-4 w-4" /></button>
                <button className="icon-btn" onClick={() => run(async () => { await api.setRuleActive(r.id, !r.active); await reload('rules') }, r.active ? 'Paused' : 'Resumed')} aria-label={r.active ? `Pause ${r.description}` : `Resume ${r.description}`}>{r.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</button>
                <button className="icon-btn" aria-label={`Delete ${r.description}`} onClick={async () => { if (await confirm({ title: `Delete "${r.description}"?`, body: 'Transactions already created from it are kept.', confirmText: 'Delete', danger: true })) await run(async () => { await api.deleteRule(r.id); await reload('rules', 'transactions') }, 'Deleted') }}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <RuleDialog target={edit} onClose={() => setEdit(null)} />
    </>
  )
}

function RuleDialog({ target, onClose }: { target: RuleRec | 'new' | null; onClose: () => void }) {
  const { accounts, categories, today, reload } = useData()
  const { busy, run } = useAction()
  const editing = target && target !== 'new' ? target : null
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<z.infer<typeof recurringSchema>>({ resolver: zodResolver(recurringSchema) })
  useEffect(() => {
    if (!target) return
    reset(editing
      ? { type: editing.type, amount: minorToDecimal(editing.amount), accountId: editing.accountId, categoryId: editing.categoryId ?? '', description: editing.description, frequency: editing.frequency, startDate: editing.startDate, endDate: editing.endDate ?? '', isBill: editing.isBill, remindDays: String(editing.remindDays) }
      : { type: 'expense', amount: '', accountId: accounts.find((a) => !a.archived)?.id ?? '', categoryId: '', description: '', frequency: 'monthly', startDate: today, endDate: '', isBill: false, remindDays: '3' })
  }, [target]) // eslint-disable-line react-hooks/exhaustive-deps
  const type = watch('type')
  const isBill = watch('isBill')
  const cats = categories.filter((c) => c.kind === type && !c.archived)

  const submit = handleSubmit(async (v) => {
    const restart = !!editing && v.startDate !== editing.startDate
    if (await run(async () => { await api.saveRule(v, editing?.id, restart); await reload('rules', 'transactions') }, 'Saved')) onClose()
  })
  return (
    <Modal open={!!target} onClose={onClose} title={editing ? 'Edit recurring item' : 'Add recurring item or bill'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Description" error={errors.description?.message} className="sm:col-span-2"><input className="input" autoFocus maxLength={200} placeholder="Rent, Netflix, Salary…" {...register('description')} /></Field>
          <Field label="Type"><select className="input" {...register('type')}><option value="expense">Expense</option><option value="income">Income</option></select></Field>
          <Field label="Amount" error={errors.amount?.message}><input className="input tabular" inputMode="decimal" placeholder="0.00" {...register('amount')} /></Field>
          <Field label="Account" error={errors.accountId?.message}><select className="input" {...register('accountId')}>{accounts.filter((a) => !a.archived || a.id === editing?.accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Category"><select className="input" {...register('categoryId')}><option value="">Uncategorised</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
          <Field label="Repeats"><select className="input" {...register('frequency')}>{Object.entries(FREQ).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label={editing ? 'Start date (changing it restarts the schedule)' : 'First date'} error={errors.startDate?.message}><input className="input" type="date" {...register('startDate')} /></Field>
          <Field label="End date (optional)" error={errors.endDate?.message}><input className="input" type="date" {...register('endDate')} /></Field>
          {isBill && <Field label="Remind me (days before)" error={errors.remindDays?.message}><input className="input tabular" inputMode="numeric" {...register('remindDays')} /></Field>}
        </div>
        <label className="flex min-h-[44px] items-start gap-3 rounded-lg border border-border p-3 text-sm">
          <input type="checkbox" className="mt-1 h-4 w-4" {...register('isBill')} />
          <span><strong>This is a bill I pay manually.</strong><br /><span className="text-sub">It shows as due and waits for Mark paid instead of being recorded automatically.</span></span>
        </label>
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  )
}
