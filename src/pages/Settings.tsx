import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { z } from 'zod'
import { Download, LogOut, ShieldAlert } from 'lucide-react'
import { useData } from '../data/DataContext'
import { api } from '../data/api'
import { supabase } from '../lib/supabase'
import { settingsSchema, signUpSchema } from '../lib/schemas'
import { CURRENCIES } from '../lib/money'
import { transactionsToCsv } from '../lib/csv'
import { download } from '../lib/download'
import { Field, Modal, PageHeader, useAction, useConfirm, useToast } from '../components/ui'

const zones = (() => {
  try { return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf('timeZone') } catch { return ['Asia/Kolkata', 'UTC'] }
})()
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export default function Settings() {
  const { prefs, profile, session, transactions, accountName, category, today, reload } = useData()
  const { busy, run } = useAction()
  const toast = useToast()
  const confirm = useConfirm()
  const { register, handleSubmit, reset, formState: { errors, isDirty } } = useForm<z.infer<typeof settingsSchema>>({ resolver: zodResolver(settingsSchema) })
  useEffect(() => { reset({ displayName: profile.displayName, currency: prefs.currency, timezone: prefs.timezone, theme: prefs.theme, fyStartMonth: String(prefs.fyStartMonth) }, { keepFieldsRef: true }) }, [prefs, profile, reset])
  const tzList = zones.includes(prefs.timezone) ? zones : [prefs.timezone, ...zones]

  const save = handleSubmit((v) => run(async () => { await api.saveSettings(v); await reload('prefs') }, 'Settings saved'))

  const { register: regPw, handleSubmit: pwSubmit, reset: pwReset, formState: { errors: pwErrors } } = useForm<{ password: string }>({ resolver: zodResolver(signUpSchema.pick({ password: true })) })
  const changePw = pwSubmit(({ password }) => run(async () => { const { error } = await supabase.auth.updateUser({ password }); if (error) throw error; pwReset() }, 'Password updated'))

  const [del, setDel] = useState(false)
  const [typed, setTyped] = useState('')

  async function exportJson() {
    await run(async () => { const all = await api.exportEverything(); download(`expense-tracker-backup-${today}.json`, JSON.stringify(all, null, 2), 'application/json') }, 'Backup downloaded')
  }
  function exportCsv() {
    download(`transactions-${today}.csv`, transactionsToCsv(transactions.map((t) => ({ date: t.date, type: t.type, amount: t.amount, category: category(t.categoryId)?.name ?? '', account: accountName(t.accountId), paymentMethod: t.paymentMethod, description: t.description, tags: t.tags }))), 'text/csv')
    toast.ok('CSV downloaded')
  }

  return (
    <>
      <PageHeader title="Settings" subtitle={session.user.email ?? ''} />
      <div className="grid gap-4 lg:grid-cols-2">
        <form onSubmit={save} className="card space-y-4 p-4 lg:col-span-2" noValidate>
          <h2 className="font-semibold">Profile & preferences</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Display name" error={errors.displayName?.message}><input className="input" maxLength={80} {...register('displayName')} /></Field>
            <Field label="Currency" hint="Amounts are shown in this currency. Existing amounts are not converted."><select className="input" {...register('currency')}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></Field>
            <Field label="Time zone" hint="Decides what counts as “today” and when recurring items post." error={errors.timezone?.message}><select className="input" {...register('timezone')}>{tzList.map((z) => <option key={z}>{z}</option>)}</select></Field>
            <Field label="Theme"><select className="input" {...register('theme')}><option value="system">Match my device</option><option value="light">Light</option><option value="dark">Dark</option></select></Field>
            <Field label="Financial year starts in"><select className="input" {...register('fyStartMonth')}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
          </div>
          <button className="btn btn-primary" disabled={busy || !isDirty}>{busy ? 'Saving…' : 'Save settings'}</button>
        </form>

        <section className="card space-y-3 p-4" aria-labelledby="s-data">
          <h2 id="s-data" className="font-semibold">Your data</h2>
          <p className="text-sm text-sub">Download a full backup of everything in your account (JSON), or just your transactions as a spreadsheet-friendly CSV. Keep backups somewhere safe.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost" onClick={exportJson} disabled={busy}><Download className="h-4 w-4" aria-hidden="true" /> Full backup (JSON)</button>
            <button className="btn btn-ghost" onClick={exportCsv} disabled={!transactions.length}><Download className="h-4 w-4" aria-hidden="true" /> Transactions (CSV)</button>
          </div>
        </section>

        <section className="card space-y-3 p-4" aria-labelledby="s-sess">
          <h2 id="s-sess" className="font-semibold">Sessions</h2>
          <p className="text-sm text-sub">Signed in as <strong className="text-fg">{session.user.email}</strong>{session.user.last_sign_in_at ? ` since ${new Date(session.user.last_sign_in_at).toLocaleString()}` : ''}.</p>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-ghost" onClick={() => supabase.auth.signOut()}><LogOut className="h-4 w-4" aria-hidden="true" /> Sign out</button>
            <button className="btn btn-ghost" onClick={async () => { if (await confirm({ title: 'Sign out other devices?', body: 'Every other browser or phone signed in to this account will be signed out. This device stays signed in.', confirmText: 'Sign them out' })) await run(async () => { const { error } = await supabase.auth.signOut({ scope: 'others' }); if (error) throw error }, 'Other devices signed out') }}>Sign out other devices</button>
            <button className="btn btn-ghost" onClick={async () => { if (await confirm({ title: 'Sign out everywhere?', body: 'You will be signed out on all devices, including this one.', confirmText: 'Sign out everywhere' })) await supabase.auth.signOut({ scope: 'global' }) }}>Sign out everywhere</button>
          </div>
        </section>

        <form onSubmit={changePw} className="card space-y-3 p-4" noValidate>
          <h2 className="font-semibold">Change password</h2>
          <Field label="New password" hint="At least 8 characters." error={pwErrors.password?.message}><input className="input" type="password" autoComplete="new-password" {...regPw('password')} /></Field>
          <button className="btn btn-ghost" disabled={busy}>Update password</button>
        </form>

        <section className="card space-y-3 border-expense/40 p-4" aria-labelledby="s-del">
          <h2 id="s-del" className="flex items-center gap-2 font-semibold text-expense"><ShieldAlert className="h-4 w-4" aria-hidden="true" /> Delete account</h2>
          <p className="text-sm text-sub">Permanently deletes your account and every record in it. This cannot be undone. Download a backup first.</p>
          <button className="btn btn-danger" onClick={() => { setTyped(''); setDel(true) }}>Delete my account…</button>
        </section>
      </div>

      <Modal open={del} onClose={() => setDel(false)} title="Delete your account?">
        <p className="mb-3 text-sm text-sub">All accounts, transactions, budgets, goals and settings will be erased immediately. Type <strong className="text-fg">DELETE</strong> to confirm.</p>
        <input className="input mb-4" value={typed} onChange={(e) => setTyped(e.target.value)} aria-label="Type DELETE to confirm" autoComplete="off" />
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => setDel(false)}>Cancel</button>
          <button className="btn btn-danger" disabled={typed !== 'DELETE' || busy} onClick={() => run(async () => { await api.deleteAccountForever() })}>{busy ? 'Deleting…' : 'Delete everything'}</button>
        </div>
      </Modal>
    </>
  )
}
