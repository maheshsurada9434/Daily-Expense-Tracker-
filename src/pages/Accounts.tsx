import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { Archive, ArchiveRestore, ArrowRightLeft, Landmark, Pencil, Plus, Trash2 } from 'lucide-react'
import { useData } from '../data/DataContext'
import { api } from '../data/api'
import { accountSchema, categorySchema, transferSchema } from '../lib/schemas'
import { accountBalance } from '../lib/finance'
import { minorToDecimal } from '../lib/money'
import type { Account, Category, TransferRec } from '../data/types'
import { Badge, EmptyState, Field, Modal, PageHeader, cx, useAction, useConfirm } from '../components/ui'

type Tab = 'accounts' | 'categories' | 'transfers'
const KINDS = { cash: 'Cash', bank: 'Bank account', card: 'Credit card', wallet: 'Wallet', other: 'Other' } as const
const PALETTE = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899', '#64748b']

export default function Accounts() {
  const [tab, setTab] = useState<Tab>('accounts')
  const tabs: [Tab, string][] = [['accounts', 'Accounts'], ['categories', 'Categories'], ['transfers', 'Transfers']]
  return (
    <>
      <PageHeader title="Accounts & categories" subtitle="Where your money lives and how you group it" />
      <div role="tablist" aria-label="Sections" className="mb-4 inline-flex rounded-lg bg-muted p-1">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" id={`tab-${k}`} aria-selected={tab === k} aria-controls={`panel-${k}`} onClick={() => setTab(k)} className={cx('min-h-[40px] rounded-md px-4 text-sm font-semibold transition-colors', tab === k ? 'bg-card text-fg shadow-card' : 'text-sub hover:text-fg')}>{l}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'accounts' ? <AccountsPanel /> : tab === 'categories' ? <CategoriesPanel /> : <TransfersPanel />}
      </div>
    </>
  )
}

/* ───────────── accounts ───────────── */
function AccountsPanel() {
  const { accounts, transactions, transfers, fmt, reload } = useData()
  const confirm = useConfirm()
  const { run } = useAction()
  const [edit, setEdit] = useState<Account | 'new' | null>(null)

  async function remove(a: Account) {
    const used = transactions.some((t) => t.accountId === a.id) || transfers.some((t) => t.fromAccountId === a.id || t.toAccountId === a.id)
    if (used) { await run(async () => { throw new Error('This account has transactions or transfers. Archive it instead so your history stays correct.') }); return }
    if (!(await confirm({ title: `Delete "${a.name}"?`, body: 'This cannot be undone.', confirmText: 'Delete', danger: true }))) return
    await run(async () => { await api.deleteAccount(a.id); await reload('accounts') }, 'Account deleted')
  }

  return (
    <>
      <div className="mb-3 flex justify-end"><button className="btn btn-primary" onClick={() => setEdit('new')}><Plus className="h-4 w-4" aria-hidden="true" /> Add account</button></div>
      <div className="card divide-y divide-border">
        {accounts.length === 0 && <EmptyState icon={<Landmark className="h-6 w-6" />} title="No accounts yet" body="Add cash, a bank account or a card to start tracking." />}
        {accounts.map((a) => {
          const bal = accountBalance(a, transactions, transfers)
          return (
            <div key={a.id} className={cx('flex items-center gap-3 p-4', a.archived && 'opacity-60')}>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-sub"><Landmark className="h-5 w-5" aria-hidden="true" /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{a.name} {a.archived && <Badge>Archived</Badge>}</p>
                <p className="text-xs text-sub">{KINDS[a.kind]} · opening {fmt(a.openingBalance)}</p>
              </div>
              <p className={cx('tabular font-semibold', bal < 0 && 'text-expense')}>{fmt(bal)}</p>
              <div className="flex">
                <button className="icon-btn" onClick={() => setEdit(a)} aria-label={`Edit ${a.name}`}><Pencil className="h-4 w-4" /></button>
                <button className="icon-btn" onClick={() => run(async () => { await api.setAccountArchived(a.id, !a.archived); await reload('accounts') }, a.archived ? 'Account restored' : 'Account archived')} aria-label={a.archived ? `Restore ${a.name}` : `Archive ${a.name}`}>{a.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</button>
                <button className="icon-btn" onClick={() => remove(a)} aria-label={`Delete ${a.name}`}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-sub">Balance = opening balance + income + refunds − expenses + incoming transfers − outgoing transfers. A credit card can have a negative balance.</p>
      <AccountDialog target={edit} onClose={() => setEdit(null)} />
    </>
  )
}

function AccountDialog({ target, onClose }: { target: Account | 'new' | null; onClose: () => void }) {
  const { reload } = useData()
  const { busy, run } = useAction()
  const editing = target && target !== 'new' ? target : null
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof accountSchema>>({ resolver: zodResolver(accountSchema) })
  useEffect(() => { if (target) reset(editing ? { name: editing.name, kind: editing.kind, opening: minorToDecimal(editing.openingBalance) } : { name: '', kind: 'bank', opening: '' }, { keepFieldsRef: true }) }, [target, editing, reset])
  const submit = handleSubmit(async (v) => { if (await run(async () => { await api.saveAccount(v, editing?.id); await reload('accounts') }, 'Account saved')) onClose() })
  return (
    <Modal open={!!target} onClose={onClose} title={editing ? 'Edit account' : 'Add account'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name" error={errors.name?.message}><input className="input" autoFocus maxLength={60} placeholder="HDFC Savings" aria-invalid={!!errors.name} {...register('name')} /></Field>
        <Field label="Type"><select className="input" {...register('kind')}>{Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Opening balance" hint="What the account held before you started tracking. Use a minus for money owed." error={errors.opening?.message}><input className="input tabular" inputMode="decimal" placeholder="0.00" {...register('opening')} /></Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  )
}

/* ───────────── categories ───────────── */
function CategoriesPanel() {
  const { categories, transactions, budgets, reload } = useData()
  const confirm = useConfirm()
  const { run } = useAction()
  const [edit, setEdit] = useState<Category | 'new' | null>(null)

  async function remove(c: Category) {
    const used = transactions.filter((t) => t.categoryId === c.id).length
    const b = budgets.filter((x) => x.categoryId === c.id).length
    if (!(await confirm({ title: `Delete "${c.name}"?`, body: `${used} transaction${used === 1 ? '' : 's'} will become Uncategorised${b ? ` and ${b} budget${b === 1 ? '' : 's'} will be removed` : ''}. Archive it instead to keep history tidy.`, confirmText: 'Delete', danger: true }))) return
    await run(async () => { await api.deleteCategory(c.id); await reload('categories', 'transactions', 'budgets') }, 'Category deleted')
  }

  const group = (kind: 'expense' | 'income', title: string) => {
    const list = categories.filter((c) => c.kind === kind)
    return (
      <section className="card" aria-label={title}>
        <h2 className="border-b border-border p-4 font-semibold">{title}</h2>
        {list.length === 0 ? <p className="p-4 text-sm text-sub">None yet.</p> : (
          <ul className="divide-y divide-border">
            {list.map((c) => (
              <li key={c.id} className={cx('flex items-center gap-3 px-4 py-2', c.archived && 'opacity-60')}>
                <span className="h-4 w-4 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{c.name} {c.archived && <Badge>Archived</Badge>}</span>
                <button className="icon-btn" onClick={() => setEdit(c)} aria-label={`Edit ${c.name}`}><Pencil className="h-4 w-4" /></button>
                <button className="icon-btn" onClick={() => run(async () => { await api.setCategoryArchived(c.id, !c.archived); await reload('categories') })} aria-label={c.archived ? `Restore ${c.name}` : `Archive ${c.name}`}>{c.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</button>
                <button className="icon-btn" onClick={() => remove(c)} aria-label={`Delete ${c.name}`}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    )
  }

  return (
    <>
      <div className="mb-3 flex justify-end"><button className="btn btn-primary" onClick={() => setEdit('new')}><Plus className="h-4 w-4" aria-hidden="true" /> Add category</button></div>
      <div className="grid gap-4 lg:grid-cols-2">{group('expense', 'Expense categories')}{group('income', 'Income categories')}</div>
      <CategoryDialog target={edit} onClose={() => setEdit(null)} />
    </>
  )
}

function CategoryDialog({ target, onClose }: { target: Category | 'new' | null; onClose: () => void }) {
  const { reload } = useData()
  const { busy, run } = useAction()
  const editing = target && target !== 'new' ? target : null
  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<z.infer<typeof categorySchema>>({ resolver: zodResolver(categorySchema) })
  useEffect(() => { if (target) reset(editing ? { name: editing.name, kind: editing.kind, color: editing.color } : { name: '', kind: 'expense', color: PALETTE[0] }, { keepFieldsRef: true }) }, [target, editing, reset])
  const color = watch('color')
  const submit = handleSubmit(async (v) => { if (await run(async () => { await api.saveCategory(v, editing?.id); await reload('categories') }, 'Category saved')) onClose() })
  return (
    <Modal open={!!target} onClose={onClose} title={editing ? 'Edit category' : 'Add category'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name" error={errors.name?.message}><input className="input" autoFocus maxLength={60} aria-invalid={!!errors.name} {...register('name')} /></Field>
        <Field label="Kind" hint={editing ? 'The kind cannot be changed after creation.' : undefined}><select className="input" disabled={!!editing} {...register('kind')}><option value="expense">Expense</option><option value="income">Income</option></select></Field>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Colour</legend>
          <div className="flex flex-wrap gap-2">
            {PALETTE.map((c) => (
              <button key={c} type="button" onClick={() => setValue('color', c)} aria-label={`Colour ${c}`} aria-pressed={color === c} className={cx('h-9 w-9 rounded-full border-2', color === c ? 'border-fg' : 'border-transparent')} style={{ background: c }} />
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button></div>
      </form>
    </Modal>
  )
}

/* ───────────── transfers ───────────── */
function TransfersPanel() {
  const { transfers, accounts, accountName, fmt, reload } = useData()
  const confirm = useConfirm()
  const { run } = useAction()
  const [edit, setEdit] = useState<TransferRec | 'new' | null>(null)
  const sorted = [...transfers].sort((a, b) => (a.date < b.date ? 1 : -1))

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-sm text-sub">Moving money between your own accounts. Transfers are never counted as income or expenses.</p>
        <button className="btn btn-primary shrink-0" onClick={() => setEdit('new')} disabled={accounts.filter((a) => !a.archived).length < 2}><Plus className="h-4 w-4" aria-hidden="true" /> New transfer</button>
      </div>
      <div className="card divide-y divide-border">
        {sorted.length === 0 && <EmptyState icon={<ArrowRightLeft className="h-6 w-6" />} title="No transfers yet" body={accounts.length < 2 ? 'Add a second account to record transfers.' : 'For example, cash withdrawn from your bank, or a credit card bill payment.'} />}
        {sorted.map((t) => (
          <div key={t.id} className="flex items-center gap-3 p-4">
            <ArrowRightLeft className="h-5 w-5 shrink-0 text-sub" aria-hidden="true" />
            <div className="min-w-0 flex-1"><p className="truncate font-medium">{accountName(t.fromAccountId)} → {accountName(t.toAccountId)}</p><p className="truncate text-xs text-sub">{t.date}{t.note ? ` · ${t.note}` : ''}</p></div>
            <p className="tabular font-semibold">{fmt(t.amount)}</p>
            <button className="icon-btn" onClick={() => setEdit(t)} aria-label="Edit transfer"><Pencil className="h-4 w-4" /></button>
            <button className="icon-btn" aria-label="Delete transfer" onClick={async () => { if (await confirm({ title: 'Delete this transfer?', body: 'Both account balances will update.', confirmText: 'Delete', danger: true })) await run(async () => { await api.deleteTransfer(t.id); await reload('transfers') }, 'Transfer deleted') }}><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
      <TransferDialog target={edit} onClose={() => setEdit(null)} />
    </>
  )
}

function TransferDialog({ target, onClose }: { target: TransferRec | 'new' | null; onClose: () => void }) {
  const { accounts, today, reload } = useData()
  const { busy, run } = useAction()
  const editing = target && target !== 'new' ? target : null
  const list = accounts.filter((a) => !a.archived || a.id === editing?.fromAccountId || a.id === editing?.toAccountId)
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof transferSchema>>({ resolver: zodResolver(transferSchema) })
  useEffect(() => { if (target) reset(editing ? { fromAccountId: editing.fromAccountId, toAccountId: editing.toAccountId, amount: minorToDecimal(editing.amount), date: editing.date, note: editing.note } : { fromAccountId: list[0]?.id ?? '', toAccountId: list[1]?.id ?? '', amount: '', date: today, note: '' }, { keepFieldsRef: true }) }, [target]) // eslint-disable-line react-hooks/exhaustive-deps
  const submit = handleSubmit(async (v) => { if (await run(async () => { await api.saveTransfer(v, editing?.id); await reload('transfers') }, 'Transfer saved')) onClose() })
  return (
    <Modal open={!!target} onClose={onClose} title={editing ? 'Edit transfer' : 'New transfer'}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From" error={errors.fromAccountId?.message}><select className="input" {...register('fromAccountId')}>{list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="To" error={errors.toAccountId?.message}><select className="input" aria-invalid={!!errors.toAccountId} {...register('toAccountId')}>{list.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
          <Field label="Amount" error={errors.amount?.message}><input className="input tabular" inputMode="decimal" placeholder="0.00" autoFocus {...register('amount')} /></Field>
          <Field label="Date" error={errors.date?.message}><input className="input" type="date" {...register('date')} /></Field>
        </div>
        <Field label="Note" error={errors.note?.message}><input className="input" maxLength={300} {...register('note')} /></Field>
        <div className="flex justify-end gap-2"><button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save transfer'}</button></div>
      </form>
    </Modal>
  )
}

