import type { Currency } from '../lib/money'
import type { Frequency } from '../lib/dates'
import type { TxType } from '../lib/finance'

export type AccountKind = 'cash' | 'bank' | 'card' | 'wallet' | 'other'
export type Method = 'cash' | 'upi' | 'card' | 'netbanking' | 'cheque' | 'other'

export type Account = { id: string; name: string; kind: AccountKind; openingBalance: number; archived: boolean }
export type Category = { id: string; name: string; kind: 'income' | 'expense'; color: string; archived: boolean }
export type Transaction = {
  id: string; type: TxType; amount: number; date: string; accountId: string; categoryId: string | null
  paymentMethod: Method; description: string; tags: string[]; importHash: string | null; recurringRuleId: string | null
}
export type TransferRec = { id: string; fromAccountId: string; toAccountId: string; amount: number; date: string; note: string }
export type BudgetRec = { id: string; categoryId: string; month: string; amount: number; warnPct: number }
export type GoalRec = { id: string; name: string; targetAmount: number; targetDate: string | null; archived: boolean }
export type ContributionRec = { id: string; goalId: string; amount: number; date: string; note: string }
export type RuleRec = {
  id: string; type: 'income' | 'expense'; amount: number; accountId: string; categoryId: string | null; paymentMethod: Method
  description: string; frequency: Frequency; startDate: string; endDate: string | null; nextDate: string; isBill: boolean
  remindDays: number; active: boolean
}
export type Prefs = { currency: Currency; timezone: string; theme: 'light' | 'dark' | 'system'; fyStartMonth: number }
export type Profile = { displayName: string }

/* eslint-disable @typescript-eslint/no-explicit-any */
type R = Record<string, any>
export const mapAccount = (r: R): Account => ({ id: r.id, name: r.name, kind: r.kind, openingBalance: Number(r.opening_balance), archived: r.archived })
export const mapCategory = (r: R): Category => ({ id: r.id, name: r.name, kind: r.kind, color: r.color, archived: r.archived })
export const mapTx = (r: R): Transaction => ({
  id: r.id, type: r.type, amount: Number(r.amount), date: r.txn_date, accountId: r.account_id, categoryId: r.category_id,
  paymentMethod: r.payment_method, description: r.description ?? '', tags: r.tags ?? [], importHash: r.import_hash, recurringRuleId: r.recurring_rule_id,
})
export const mapTransfer = (r: R): TransferRec => ({ id: r.id, fromAccountId: r.from_account_id, toAccountId: r.to_account_id, amount: Number(r.amount), date: r.transfer_date, note: r.note ?? '' })
export const mapBudget = (r: R): BudgetRec => ({ id: r.id, categoryId: r.category_id, month: r.month, amount: Number(r.amount), warnPct: r.warn_pct })
export const mapGoal = (r: R): GoalRec => ({ id: r.id, name: r.name, targetAmount: Number(r.target_amount), targetDate: r.target_date, archived: r.archived })
export const mapContribution = (r: R): ContributionRec => ({ id: r.id, goalId: r.goal_id, amount: Number(r.amount), date: r.contributed_on, note: r.note ?? '' })
export const mapRule = (r: R): RuleRec => ({
  id: r.id, type: r.type, amount: Number(r.amount), accountId: r.account_id, categoryId: r.category_id, paymentMethod: r.payment_method,
  description: r.description ?? '', frequency: r.frequency, startDate: r.start_date, endDate: r.end_date, nextDate: r.next_date,
  isBill: r.is_bill, remindDays: r.remind_days, active: r.active,
})
