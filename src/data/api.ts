// Every write goes through here. Ownership (user_id) is never sent: the database fills it from the signed-in session
// and Row Level Security rejects anything else.
import { friendlyError, supabase } from '../lib/supabase'
import { parseMoney } from '../lib/money'
import { parseTags } from '../lib/schemas'
import type { z } from 'zod'
import type { accountSchema, budgetSchema, categorySchema, contributionSchema, goalSchema, recurringSchema, settingsSchema, transactionSchema, transferSchema } from '../lib/schemas'
import { nextOccurrence } from '../lib/dates'
import type { ImportRow } from '../lib/csv'

async function run<T>(p: PromiseLike<{ data: T; error: unknown }>): Promise<T> {
  const { data, error } = await p
  if (error) throw new Error(friendlyError(error))
  return data
}
const ok = async (p: PromiseLike<{ error: unknown }>) => { const { error } = await p; if (error) throw new Error(friendlyError(error)) }
const nn = (s: string) => (s === '' ? null : s)
const amt = (s: string) => parseMoney(s) as number // already validated by the zod schema
const signed = (s: string) => { const t = s.trim().replace(/,/g, ''); if (t === '') return 0; const neg = t.startsWith('-'); return (neg ? -1 : 1) * amt(neg ? t.slice(1) : t) }

export const api = {
  saveTransaction: (v: z.infer<typeof transactionSchema>, id?: string) => {
    const row = { type: v.type, amount: amt(v.amount), txn_date: v.date, account_id: v.accountId, category_id: nn(v.categoryId), payment_method: v.paymentMethod, description: v.description, tags: parseTags(v.tags) }
    return ok(id ? supabase.from('transactions').update(row).eq('id', id) : supabase.from('transactions').insert(row))
  },
  deleteTransaction: (id: string) => ok(supabase.from('transactions').delete().eq('id', id)),

  /** Inserts import rows in chunks. Rows whose hash already exists are skipped by the unique index (never duplicated). */
  async importTransactions(rows: (ImportRow & { hash: string })[], catIds: Map<string, string>) {
    let added = 0
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200).map((r) => ({
        type: r.type, amount: r.amount, txn_date: r.date, account_id: r.accountId, payment_method: r.paymentMethod, description: r.description, tags: r.tags,
        category_id: r.categoryId ?? catIds.get(`${r.type === 'income' ? 'income' : 'expense'}:${r.categoryName.toLowerCase()}`) ?? null, import_hash: r.hash,
      }))
      const { data, error } = await supabase.from('transactions').upsert(chunk, { onConflict: 'user_id,import_hash', ignoreDuplicates: true }).select('id')
      if (error) throw new Error(friendlyError(error))
      added += data?.length ?? 0
    }
    return added
  },
  async createCategories(list: { name: string; kind: 'income' | 'expense' }[]) {
    if (!list.length) return new Map<string, string>()
    const data = await run(supabase.from('categories').upsert(list.map((c) => ({ ...c })), { onConflict: 'user_id,kind,name' }).select('id,name,kind'))
    return new Map((data as { id: string; name: string; kind: string }[]).map((c) => [`${c.kind}:${c.name.toLowerCase()}`, c.id]))
  },

  saveAccount: (v: z.infer<typeof accountSchema>, id?: string) => {
    const row = { name: v.name, kind: v.kind, opening_balance: signed(v.opening) }
    return ok(id ? supabase.from('accounts').update(row).eq('id', id) : supabase.from('accounts').insert(row))
  },
  setAccountArchived: (id: string, archived: boolean) => ok(supabase.from('accounts').update({ archived }).eq('id', id)),
  deleteAccount: (id: string) => ok(supabase.from('accounts').delete().eq('id', id)),

  saveCategory: (v: z.infer<typeof categorySchema>, id?: string) =>
    ok(id ? supabase.from('categories').update({ name: v.name, color: v.color }).eq('id', id) : supabase.from('categories').insert({ name: v.name, kind: v.kind, color: v.color })),
  setCategoryArchived: (id: string, archived: boolean) => ok(supabase.from('categories').update({ archived }).eq('id', id)),
  deleteCategory: (id: string) => ok(supabase.from('categories').delete().eq('id', id)),

  saveTransfer: (v: z.infer<typeof transferSchema>, id?: string) => {
    const row = { from_account_id: v.fromAccountId, to_account_id: v.toAccountId, amount: amt(v.amount), transfer_date: v.date, note: v.note }
    return ok(id ? supabase.from('transfers').update(row).eq('id', id) : supabase.from('transfers').insert(row))
  },
  deleteTransfer: (id: string) => ok(supabase.from('transfers').delete().eq('id', id)),

  saveBudget: (v: z.infer<typeof budgetSchema>, month: string, id?: string) => {
    const row = { category_id: v.categoryId, month, amount: amt(v.amount), warn_pct: Number(v.warnPct) }
    return ok(id ? supabase.from('budgets').update(row).eq('id', id) : supabase.from('budgets').insert(row))
  },
  deleteBudget: (id: string) => ok(supabase.from('budgets').delete().eq('id', id)),
  copyBudgets: (rows: { categoryId: string; amount: number; warnPct: number }[], month: string) =>
    ok(supabase.from('budgets').upsert(rows.map((b) => ({ category_id: b.categoryId, month, amount: b.amount, warn_pct: b.warnPct })), { onConflict: 'user_id,category_id,month', ignoreDuplicates: true })),

  saveGoal: (v: z.infer<typeof goalSchema>, id?: string) => {
    const row = { name: v.name, target_amount: amt(v.targetAmount), target_date: nn(v.targetDate) }
    return ok(id ? supabase.from('savings_goals').update(row).eq('id', id) : supabase.from('savings_goals').insert(row))
  },
  setGoalArchived: (id: string, archived: boolean) => ok(supabase.from('savings_goals').update({ archived }).eq('id', id)),
  deleteGoal: (id: string) => ok(supabase.from('savings_goals').delete().eq('id', id)),
  addContribution: (goalId: string, v: z.infer<typeof contributionSchema>) =>
    ok(supabase.from('goal_contributions').insert({ goal_id: goalId, amount: amt(v.amount), contributed_on: v.date, note: v.note })),
  deleteContribution: (id: string) => ok(supabase.from('goal_contributions').delete().eq('id', id)),

  saveRule: (v: z.infer<typeof recurringSchema>, id?: string, restartSchedule = false) => {
    const row = {
      type: v.type, amount: amt(v.amount), account_id: v.accountId, category_id: nn(v.categoryId), description: v.description,
      frequency: v.frequency, start_date: v.startDate, end_date: nn(v.endDate), is_bill: v.isBill, remind_days: Number(v.remindDays),
    }
    // A new rule is first due on its start date. Editing keeps its place in the schedule unless the start date changed.
    return ok(id ? supabase.from('recurring_rules').update(restartSchedule ? { ...row, next_date: v.startDate, active: true } : row).eq('id', id) : supabase.from('recurring_rules').insert({ ...row, next_date: v.startDate }))
  },
  setRuleActive: (id: string, active: boolean) => ok(supabase.from('recurring_rules').update({ active }).eq('id', id)),
  deleteRule: (id: string) => ok(supabase.from('recurring_rules').delete().eq('id', id)),
  payBill: (id: string) => ok(supabase.rpc('pay_bill', { p_rule: id })),
  skipBill: (id: string, due: string, frequency: Parameters<typeof nextOccurrence>[1], start: string) =>
    ok(supabase.from('recurring_rules').update({ next_date: nextOccurrence(due, frequency, start) }).eq('id', id)),

  async saveSettings(v: z.infer<typeof settingsSchema>) {
    await ok(supabase.from('user_preferences').update({ currency: v.currency, timezone: v.timezone, theme: v.theme, fy_start_month: Number(v.fyStartMonth) }).not('user_id', 'is', null))
    await ok(supabase.from('profiles').update({ display_name: nn(v.displayName) }).not('id', 'is', null))
  },

  async exportEverything() {
    const names = ['profiles', 'user_preferences', 'accounts', 'categories', 'transactions', 'transfers', 'budgets', 'savings_goals', 'goal_contributions', 'recurring_rules']
    const out: Record<string, unknown[]> = {}
    for (const n of names) {
      const rows: unknown[] = []
      for (let from = 0; ; from += 1000) {
        const data = await run(supabase.from(n).select('*').range(from, from + 999))
        rows.push(...(data as unknown[]))
        if ((data as unknown[]).length < 1000) break
      }
      out[n] = rows
    }
    return { exported_at: new Date().toISOString(), ...out }
  },

  async deleteAccountForever() {
    const { data, error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } })
    if (error || (data as { error?: string } | null)?.error) throw new Error(friendlyError(error ?? new Error((data as { error: string }).error)))
    await supabase.auth.signOut()
  },
}
