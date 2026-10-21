import { useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { transactionSchema } from '../lib/schemas'
import { minorToDecimal } from '../lib/money'
import { api } from '../data/api'
import { useData } from '../data/DataContext'
import type { Transaction } from '../data/types'
import { Field, Modal, useAction } from './ui'

type Values = z.infer<typeof transactionSchema>

export const METHOD_LABEL: Record<string, string> = { cash: 'Cash', upi: 'UPI', card: 'Card', netbanking: 'Net banking', cheque: 'Cheque', other: 'Other' }

export default function TransactionDialog({ open, onClose, editing }: { open: boolean; onClose: () => void; editing: Transaction | null }) {
  const { accounts, categories, reload, today } = useData()
  const { busy, run } = useAction()
  const activeAccounts = accounts.filter((a) => !a.archived || a.id === editing?.accountId)

  const defaults = useMemo<Values>(() => editing
    ? { type: editing.type, amount: minorToDecimal(editing.amount), date: editing.date, accountId: editing.accountId, categoryId: editing.categoryId ?? '', paymentMethod: editing.paymentMethod, description: editing.description, tags: editing.tags.join(', ') }
    : { type: 'expense', amount: '', date: today, accountId: activeAccounts[0]?.id ?? '', categoryId: '', paymentMethod: 'upi', description: '', tags: '' },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [editing, open])

  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<Values>({ resolver: zodResolver(transactionSchema), defaultValues: defaults })
  // keepFieldsRef writes the values into the inputs now; without it, typing before the next render is dropped.
  useEffect(() => { if (open) reset(defaults, { keepFieldsRef: true }) }, [open, defaults, reset])

  const type = watch('type')
  const cats = categories.filter((c) => (type === 'income' ? c.kind === 'income' : c.kind === 'expense') && (!c.archived || c.id === editing?.categoryId))
  const categoryId = watch('categoryId')
  useEffect(() => { if (categoryId && !cats.some((c) => c.id === categoryId)) setValue('categoryId', '') }, [type, categoryId, cats, setValue])

  const submit = handleSubmit(async (v) => {
    const ok = await run(async () => { await api.saveTransaction(v, editing?.id); await reload('transactions') }, editing ? 'Transaction updated' : 'Transaction added')
    if (ok) onClose()
  })

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit transaction' : 'Add transaction'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div role="radiogroup" aria-label="Transaction type" className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
          {(['expense', 'income', 'refund'] as const).map((t) => (
            <label key={t} className="relative">
              <input type="radio" value={t} className="peer sr-only" {...register('type')} />
              <span className="flex min-h-[40px] items-center justify-center rounded-md text-sm font-semibold capitalize text-sub transition-colors peer-checked:bg-card peer-checked:text-fg peer-checked:shadow-card peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-primary">{t}</span>
            </label>
          ))}
        </div>
        {type === 'refund' && <p className="text-xs text-sub">A refund reduces your spending in its category. It is not counted as income.</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" error={errors.amount?.message}>
            <input className="input tabular" inputMode="decimal" placeholder="0.00" autoFocus aria-invalid={!!errors.amount} {...register('amount')} />
          </Field>
          <Field label="Date" error={errors.date?.message}>
            <input className="input" type="date" min="1970-01-01" max="2100-12-31" aria-invalid={!!errors.date} {...register('date')} />
          </Field>
          <Field label="Account" error={errors.accountId?.message}>
            <select className="input" aria-invalid={!!errors.accountId} {...register('accountId')}>
              {activeAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
          <Field label="Category">
            <select className="input" {...register('categoryId')}>
              <option value="">Uncategorised</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Payment method">
            <select className="input" {...register('paymentMethod')}>
              {Object.entries(METHOD_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Tags" hint="Comma separated, up to 10" error={errors.tags?.message}>
            <input className="input" placeholder="trip, work" {...register('tags')} />
          </Field>
        </div>
        <Field label="Notes" error={errors.description?.message}>
          <textarea className="input min-h-[72px] py-2" rows={2} maxLength={500} {...register('description')} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Add transaction'}</button>
        </div>
      </form>
    </Modal>
  )
}
