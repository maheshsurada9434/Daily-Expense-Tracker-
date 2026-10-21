// Financial rules (see README "Financial rules"). All amounts are integer minor units.
//
//  Balance of an account = opening balance + income + refunds - expenses + incoming transfers - outgoing transfers
//  Income        = sum of 'income' transactions
//  Expenses      = sum of 'expense' transactions minus 'refund' transactions (a refund is NOT income)
//  Net savings   = income - expenses
//  Savings rate  = net savings / income, shown as "—" when income is zero (or less)
//  Transfers move money between accounts and are never counted as income or expenses.
import { type Range, inRange, monthKey, monthsBetween, diffDays, monthStart, monthEnd } from './dates'
import { ratioBps, sum } from './money'

export type TxType = 'income' | 'expense' | 'refund'
export type Tx = { id: string; type: TxType; amount: number; date: string; accountId: string; categoryId: string | null }
export type Transfer = { id: string; fromAccountId: string; toAccountId: string; amount: number; date: string }
export type AccountLite = { id: string; openingBalance: number; archived?: boolean }

export type Totals = { income: number; expenses: number; refunds: number; net: number; savingsRateBps: number | null }

export type Filter = Range & { accountIds?: string[] | null }

const accountOk = (id: string, ids?: string[] | null) => !ids || ids.length === 0 || ids.includes(id)

export function periodTotals(txs: Tx[], f: Filter): Totals {
  let income = 0, expense = 0, refunds = 0
  for (const t of txs) {
    if (!inRange(t.date, f) || !accountOk(t.accountId, f.accountIds)) continue
    if (t.type === 'income') income += t.amount
    else if (t.type === 'expense') expense += t.amount
    else refunds += t.amount
  }
  const expenses = expense - refunds
  const net = income - expenses
  return { income, expenses, refunds, net, savingsRateBps: ratioBps(net, income) }
}

/** Balance of one account on `asOf` (inclusive). Without asOf: all recorded activity. */
export function accountBalance(a: AccountLite, txs: Tx[], transfers: Transfer[], asOf?: string): number {
  const upTo = (d: string) => !asOf || d <= asOf
  let b = a.openingBalance
  for (const t of txs) {
    if (t.accountId !== a.id || !upTo(t.date)) continue
    b += t.type === 'expense' ? -t.amount : t.amount
  }
  for (const x of transfers) {
    if (!upTo(x.date)) continue
    if (x.toAccountId === a.id) b += x.amount
    if (x.fromAccountId === a.id) b -= x.amount
  }
  return b
}

/** Total balance over the selected accounts (default: every account that is not archived). */
export function totalBalance(accounts: AccountLite[], txs: Tx[], transfers: Transfer[], ids?: string[] | null, asOf?: string): number {
  const chosen = accounts.filter((a) => (ids && ids.length ? ids.includes(a.id) : !a.archived))
  return sum(chosen.map((a) => accountBalance(a, txs, transfers, asOf)))
}

/** Net expense per category (refunds subtract). null = uncategorised. Largest first. */
export function spendingByCategory(txs: Tx[], f: Filter): { categoryId: string | null; amount: number }[] {
  const m = new Map<string | null, number>()
  for (const t of txs) {
    if (t.type === 'income' || !inRange(t.date, f) || !accountOk(t.accountId, f.accountIds)) continue
    m.set(t.categoryId, (m.get(t.categoryId) ?? 0) + (t.type === 'expense' ? t.amount : -t.amount))
  }
  return [...m].map(([categoryId, amount]) => ({ categoryId, amount })).filter((x) => x.amount > 0).sort((a, b) => b.amount - a.amount)
}

export type MonthRow = { month: string; income: number; expenses: number; net: number; savingsRateBps: number | null }

/** One row per calendar month in the range (months with no activity included, so charts have no gaps). */
export function monthlyTrend(txs: Tx[], f: Filter): MonthRow[] {
  return monthsBetween(f.from, f.to).map((month) => {
    const t = periodTotals(txs, { from: month < f.from ? f.from : month, to: monthEnd(month) > f.to ? f.to : monthEnd(month), accountIds: f.accountIds })
    return { month, income: t.income, expenses: t.expenses, net: t.net, savingsRateBps: t.savingsRateBps }
  })
}

export type BudgetStatus = 'ok' | 'warn' | 'over'
export type Budget = { id: string; categoryId: string; month: string; amount: number; warnPct: number }
export type BudgetProgress = { spent: number; remaining: number; pctBps: number; status: BudgetStatus }

export function budgetProgress(b: Budget, txs: Tx[], accountIds?: string[] | null): BudgetProgress {
  const from = monthStart(b.month)
  const to = monthEnd(from)
  let spent = 0
  for (const t of txs) {
    if (t.categoryId !== b.categoryId || t.type === 'income' || !inRange(t.date, { from, to }) || !accountOk(t.accountId, accountIds)) continue
    spent += t.type === 'expense' ? t.amount : -t.amount
  }
  spent = Math.max(0, spent)
  const pctBps = ratioBps(spent, b.amount) ?? 0
  const status: BudgetStatus = spent > b.amount ? 'over' : pctBps >= b.warnPct * 100 ? 'warn' : 'ok'
  return { spent, remaining: b.amount - spent, pctBps, status }
}

export type Goal = { id: string; targetAmount: number; targetDate: string | null }
export type Contribution = { goalId: string; amount: number }
export type GoalProgress = { saved: number; remaining: number; pctBps: number; done: boolean; perMonthNeeded: number | null; daysLeft: number | null }

export function goalProgress(g: Goal, contributions: Contribution[], today: string): GoalProgress {
  const saved = sum(contributions.filter((c) => c.goalId === g.id).map((c) => c.amount))
  const remaining = Math.max(0, g.targetAmount - saved)
  const daysLeft = g.targetDate ? diffDays(today, g.targetDate) : null
  let perMonthNeeded: number | null = null
  if (remaining > 0 && daysLeft !== null && daysLeft > 0) perMonthNeeded = Math.ceil(remaining / Math.max(1, Math.ceil(daysLeft / 30)))
  return { saved, remaining, pctBps: Math.min(10000, ratioBps(saved, g.targetAmount) ?? 0), done: saved >= g.targetAmount, perMonthNeeded, daysLeft }
}

export { monthKey }
