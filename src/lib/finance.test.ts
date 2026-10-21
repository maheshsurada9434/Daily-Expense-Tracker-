import { describe, expect, it } from 'vitest'
import { type Budget, type Tx, type Transfer, accountBalance, budgetProgress, goalProgress, monthlyTrend, periodTotals, spendingByCategory, totalBalance } from './finance'

const tx = (id: string, type: Tx['type'], amount: number, date: string, accountId = 'cash', categoryId: string | null = null): Tx => ({ id, type, amount, date, accountId, categoryId })
const accounts = [{ id: 'cash', openingBalance: 100000 }, { id: 'bank', openingBalance: 500000 }]

describe('period totals', () => {
  const txs = [
    tx('1', 'income', 5000000, '2026-10-01', 'bank'),
    tx('2', 'expense', 120050, '2026-10-05', 'cash', 'food'),
    tx('3', 'expense', 80000, '2026-10-31', 'bank', 'food'),
    tx('4', 'refund', 20000, '2026-10-06', 'cash', 'food'),
    tx('5', 'expense', 99999, '2026-11-01', 'cash', 'food'), // next month
    tx('6', 'expense', 11111, '2026-09-30', 'cash', 'food'), // previous month
  ]
  const oct = { from: '2026-10-01', to: '2026-10-31' }
  it('income, expenses (net of refunds) and net savings', () => {
    const t = periodTotals(txs, oct)
    expect(t.income).toBe(5000000)
    expect(t.refunds).toBe(20000)
    expect(t.expenses).toBe(120050 + 80000 - 20000)
    expect(t.net).toBe(5000000 - 180050)
    expect(t.savingsRateBps).toBe(9640) // 96.40%
  })
  it('includes both boundary days and excludes the days just outside', () => {
    expect(periodTotals(txs, oct).expenses).toBe(180050)
    expect(periodTotals(txs, { from: '2026-11-01', to: '2026-11-30' }).expenses).toBe(99999)
  })
  it('respects the account filter', () => {
    expect(periodTotals(txs, { ...oct, accountIds: ['cash'] }).income).toBe(0)
    expect(periodTotals(txs, { ...oct, accountIds: ['bank'] }).expenses).toBe(80000)
  })
  it('handles zero and negative income without dividing by zero', () => {
    expect(periodTotals([tx('a', 'expense', 100, '2026-10-02')], oct).savingsRateBps).toBeNull()
    expect(periodTotals([], oct)).toEqual({ income: 0, expenses: 0, refunds: 0, net: 0, savingsRateBps: null })
  })
  it('allows a negative savings rate when spending exceeds income', () => {
    const t = periodTotals([tx('a', 'income', 1000, '2026-10-02'), tx('b', 'expense', 1500, '2026-10-03')], oct)
    expect(t.net).toBe(-500)
    expect(t.savingsRateBps).toBe(-5000)
  })
})

describe('transfers never count as income or expense', () => {
  const transfers: Transfer[] = [{ id: 't1', fromAccountId: 'bank', toAccountId: 'cash', amount: 200000, date: '2026-10-10' }]
  const txs = [tx('1', 'income', 300000, '2026-10-02', 'bank'), tx('2', 'expense', 50000, '2026-10-03', 'cash')]
  it('moves balance between accounts only', () => {
    expect(accountBalance(accounts[1], txs, transfers)).toBe(500000 + 300000 - 200000)
    expect(accountBalance(accounts[0], txs, transfers)).toBe(100000 - 50000 + 200000)
  })
  it('keeps the total balance unchanged by the transfer', () => {
    const without = totalBalance(accounts, txs, [])
    expect(totalBalance(accounts, txs, transfers)).toBe(without)
    expect(without).toBe(600000 + 300000 - 50000 + 0)
  })
  it('leaves income and expense totals untouched', () => {
    const t = periodTotals(txs, { from: '2026-10-01', to: '2026-10-31' })
    expect(t.income).toBe(300000)
    expect(t.expenses).toBe(50000)
  })
  it('supports a balance as of a past date', () => {
    expect(accountBalance(accounts[1], txs, transfers, '2026-10-05')).toBe(800000)
    expect(accountBalance(accounts[1], txs, transfers, '2026-10-10')).toBe(600000)
  })
  it('refunds add money back to the account', () => {
    expect(accountBalance(accounts[0], [tx('r', 'refund', 1000, '2026-10-01')], [])).toBe(101000)
  })
  it('excludes archived accounts from the default total only', () => {
    const list = [{ id: 'a', openingBalance: 100 }, { id: 'old', openingBalance: 900, archived: true }]
    expect(totalBalance(list, [], [])).toBe(100)
    expect(totalBalance(list, [], [], ['old'])).toBe(900)
  })
})

describe('category spending and trends', () => {
  const txs = [
    tx('1', 'expense', 3000, '2026-10-02', 'cash', 'food'), tx('2', 'expense', 7000, '2026-10-03', 'cash', 'rent'),
    tx('3', 'refund', 1000, '2026-10-04', 'cash', 'food'), tx('4', 'expense', 500, '2026-10-05', 'cash', null),
    tx('5', 'income', 90000, '2026-10-05', 'cash', 'salary'),
  ]
  it('ranks net spending per category and ignores income', () => {
    expect(spendingByCategory(txs, { from: '2026-10-01', to: '2026-10-31' })).toEqual([
      { categoryId: 'rent', amount: 7000 }, { categoryId: 'food', amount: 2000 }, { categoryId: null, amount: 500 },
    ])
  })
  it('builds one row per month, including empty months', () => {
    const rows = monthlyTrend([tx('a', 'income', 100, '2026-01-10'), tx('b', 'expense', 40, '2026-03-31')], { from: '2026-01-01', to: '2026-03-31' })
    expect(rows.map((r) => r.month)).toEqual(['2026-01-01', '2026-02-01', '2026-03-01'])
    expect(rows.map((r) => r.net)).toEqual([100, 0, -40])
  })
})

describe('budgets', () => {
  const b: Budget = { id: 'b', categoryId: 'food', month: '2026-10-01', amount: 10000, warnPct: 80 }
  const base = [tx('1', 'expense', 5000, '2026-10-02', 'cash', 'food')]
  it('shows spent, remaining and percent', () => {
    expect(budgetProgress(b, base)).toEqual({ spent: 5000, remaining: 5000, pctBps: 5000, status: 'ok' })
  })
  it('warns at the threshold and flags over-budget', () => {
    expect(budgetProgress(b, [...base, tx('2', 'expense', 3000, '2026-10-03', 'cash', 'food')]).status).toBe('warn')
    const over = budgetProgress(b, [...base, tx('2', 'expense', 6000, '2026-10-30', 'cash', 'food')])
    expect(over.status).toBe('over')
    expect(over.remaining).toBe(-1000)
  })
  it('counts refunds against spend, ignores other months and categories', () => {
    const t = [...base, tx('r', 'refund', 2000, '2026-10-04', 'cash', 'food'), tx('x', 'expense', 9999, '2026-09-30', 'cash', 'food'), tx('y', 'expense', 9999, '2026-10-04', 'cash', 'rent')]
    expect(budgetProgress(b, t).spent).toBe(3000)
  })
  it('exactly at the limit is not over', () => {
    expect(budgetProgress(b, [tx('1', 'expense', 10000, '2026-10-02', 'cash', 'food')]).status).toBe('warn')
  })
})

describe('savings goals', () => {
  const g = { id: 'g', targetAmount: 100000, targetDate: '2027-01-01' }
  it('sums contributions for that goal only', () => {
    const p = goalProgress(g, [{ goalId: 'g', amount: 25000 }, { goalId: 'g', amount: 25000 }, { goalId: 'other', amount: 99999 }], '2026-10-01')
    expect(p.saved).toBe(50000)
    expect(p.pctBps).toBe(5000)
    expect(p.remaining).toBe(50000)
    expect(p.done).toBe(false)
    expect(p.perMonthNeeded).toBe(Math.ceil(50000 / Math.ceil(92 / 30)))
  })
  it('marks completion and caps the bar at 100%', () => {
    const p = goalProgress(g, [{ goalId: 'g', amount: 150000 }], '2026-10-01')
    expect(p.done).toBe(true)
    expect(p.pctBps).toBe(10000)
    expect(p.perMonthNeeded).toBeNull()
  })
})
