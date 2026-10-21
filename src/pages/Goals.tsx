import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { Archive, ArchiveRestore, History, Pencil, Plus, Target, Trash2 } from 'lucide-react'
import { useData } from '../data/DataContext'
import { api } from '../data/api'
import { contributionSchema, goalSchema } from '../lib/schemas'
import { goalProgress } from '../lib/finance'
import { formatPct, minorToDecimal } from '../lib/money'
import type { GoalRec } from '../data/types'
import { Badge, EmptyState, Field, Modal, PageHeader, ProgressBar, cx, useAction, useConfirm } from '../components/ui'

export default function Goals() {
  const { goals, contribs, today, fmt, reload } = useData()
  const confirm = useConfirm()
  const { run } = useAction()
  const [edit, setEdit] = useState<GoalRec | 'new' | null>(null)
  const [add, setAdd] = useState<GoalRec | null>(null)
  const [hist, setHist] = useState<GoalRec | null>(null)
  const [showArchived, setShowArchived] = useState(false)
  const visible = goals.filter((g) => showArchived || !g.archived)

  return (
    <>
      <PageHeader title="Savings goals" subtitle="Progress comes from the contributions you record" actions={
        <>
          {goals.some((g) => g.archived) && <button className="btn btn-ghost" onClick={() => setShowArchived(!showArchived)}>{showArchived ? 'Hide archived' : 'Show archived'}</button>}
          <button className="btn btn-primary" onClick={() => setEdit('new')}><Plus className="h-4 w-4" aria-hidden="true" /> New goal</button>
        </>
      } />
      {visible.length === 0 ? (
        <div className="card"><EmptyState icon={<Target className="h-6 w-6" />} title="No goals yet" body="Create a goal for an emergency fund, a trip or a gadget, then log contributions as you save." action={<button className="btn btn-primary" onClick={() => setEdit('new')}><Plus className="h-4 w-4" /> New goal</button>} /></div>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {visible.map((g) => {
            const p = goalProgress({ id: g.id, targetAmount: g.targetAmount, targetDate: g.targetDate }, contribs, today)
            return (
              <li key={g.id} className={cx('card fade-up p-4', g.archived && 'opacity-60')}>
                <div className="mb-3 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{g.name} {p.done && <Badge tone="income">Reached</Badge>} {g.archived && <Badge>Archived</Badge>}</p>
                    <p className="text-xs text-sub">{g.targetDate ? `Target ${g.targetDate}${p.daysLeft !== null ? (p.daysLeft >= 0 ? ` · ${p.daysLeft} days left` : ' · past due') : ''}` : 'No target date'}</p>
                  </div>
                  <button className="icon-btn !h-9 !w-9" onClick={() => setEdit(g)} aria-label={`Edit ${g.name}`}><Pencil className="h-4 w-4" /></button>
                  <button className="icon-btn !h-9 !w-9" onClick={() => run(async () => { await api.setGoalArchived(g.id, !g.archived); await reload('goals') })} aria-label={g.archived ? `Restore ${g.name}` : `Archive ${g.name}`}>{g.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</button>
                  <button className="icon-btn !h-9 !w-9" aria-label={`Delete ${g.name}`} onClick={async () => { if (await confirm({ title: `Delete "${g.name}"?`, body: 'Its contribution history is deleted too.', confirmText: 'Delete', danger: true })) await run(async () => { await api.deleteGoal(g.id); await reload('goals', 'contribs') }, 'Goal deleted') }}><Trash2 className="h-4 w-4" /></button>
                </div>
                <ProgressBar pct={p.pctBps / 100} tone={p.done ? 'income' : 'primary'} label={`${g.name} progress`} />
                <div className="mt-2 flex justify-between text-sm"><span className="tabular font-semibold">{fmt(p.saved)} <span className="font-normal text-sub">of {fmt(g.targetAmount)}</span></span><span className="tabular text-sub">{formatPct(p.pctBps)}</span></div>
                {!p.done && p.perMonthNeeded !== null && <p className="mt-1 text-xs text-sub">Save about {fmt(p.perMonthNeeded, { decimals: false })} a month to get there in time.</p>}
                <div className="mt-3 flex gap-2">
                  <button className="btn btn-primary min-h-[40px] flex-1" onClick={() => setAdd(g)} disabled={g.archived}><Plus className="h-4 w-4" aria-hidden="true" /> Add money</button>
                  <button className="btn btn-ghost min-h-[40px]" onClick={() => setHist(g)}><History className="h-4 w-4" aria-hidden="true" /> History</button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <GoalDialog target={edit} onClose={() => setEdit(null)} />
      <ContributionDialog goal={add} onClose={() => setAdd(null)} />
      <HistoryDialog goal={hist} onClose={() => setHist(null)} />
    </>
  )
}

function GoalDialog({ target, onClose }: { target: GoalRec | 'new' | null; onClose: () => void }) {
  const { reload } = useData()
  const { busy, run } = useAction()
  const editing = target && target !== 'new' ? target : null
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof goalSchema>>({ resolver: zodResolver(goalSchema) })
  useEffect(() => { if (target) reset(editing ? { name: editing.name, targetAmount: minorToDecimal(editing.targetAmount), targetDate: editing.targetDate ?? '' } : { name: '', targetAmount: '', targetDate: '' }) }, [target, editing, reset])
  const submit = handleSubmit(async (v) => { if (await run(async () => { await api.saveGoal(v, editing?.id); await reload('goals') }, 'Goal saved')) onClose() })
  return (
    <Modal open={!!target} onClose={onClose} title={editing ? 'Edit goal' : 'New goal'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name" error={errors.name?.message}><input className="input" autoFocus maxLength={80} placeholder="Emergency fund" {...register('name')} /></Field>
        <Field label="Target amount" error={errors.targetAmount?.message}><input className="input tabular" inputMode="decimal" placeholder="0.00" {...register('targetAmount')} /></Field>
        <Field label="Target date (optional)" error={errors.targetDate?.message}><input className="input" type="date" {...register('targetDate')} /></Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save goal'}</button></div>
      </form>
    </Modal>
  )
}

function ContributionDialog({ goal, onClose }: { goal: GoalRec | null; onClose: () => void }) {
  const { reload, today } = useData()
  const { busy, run } = useAction()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof contributionSchema>>({ resolver: zodResolver(contributionSchema) })
  useEffect(() => { if (goal) reset({ amount: '', date: today, note: '' }) }, [goal, today, reset])
  const submit = handleSubmit(async (v) => { if (goal && await run(async () => { await api.addContribution(goal.id, v); await reload('contribs') }, 'Contribution added')) onClose() })
  return (
    <Modal open={!!goal} onClose={onClose} title={`Add money to ${goal?.name ?? ''}`}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Amount" error={errors.amount?.message}><input className="input tabular" inputMode="decimal" placeholder="0.00" autoFocus {...register('amount')} /></Field>
        <Field label="Date" error={errors.date?.message}><input className="input" type="date" {...register('date')} /></Field>
        <Field label="Note" error={errors.note?.message}><input className="input" maxLength={300} {...register('note')} /></Field>
        <p className="text-xs text-sub">Contributions are a record of what you set aside. They do not change your account balances or spending.</p>
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Add'}</button></div>
      </form>
    </Modal>
  )
}

function HistoryDialog({ goal, onClose }: { goal: GoalRec | null; onClose: () => void }) {
  const { contribs, fmt, reload } = useData()
  const { run } = useAction()
  const confirm = useConfirm()
  const list = contribs.filter((c) => c.goalId === goal?.id).sort((a, b) => (a.date < b.date ? 1 : -1))
  return (
    <Modal open={!!goal} onClose={onClose} title={`${goal?.name ?? ''} · contributions`}>
      {list.length === 0 ? <p className="py-6 text-center text-sm text-sub">No contributions yet.</p> : (
        <ul className="divide-y divide-border">
          {list.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1"><p className="tabular text-sm font-medium">{c.date}</p>{c.note && <p className="truncate text-xs text-sub">{c.note}</p>}</div>
              <p className="tabular font-semibold text-income">+{fmt(c.amount)}</p>
              <button className="icon-btn" aria-label={`Delete contribution of ${fmt(c.amount)}`} onClick={async () => { if (await confirm({ title: 'Remove this contribution?', confirmText: 'Remove', danger: true })) await run(async () => { await api.deleteContribution(c.id); await reload('contribs') }, 'Removed') }}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
