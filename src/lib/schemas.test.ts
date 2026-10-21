import { describe, expect, it } from 'vitest'
import { accountSchema, budgetSchema, recurringSchema, signUpSchema, transactionSchema, transferSchema } from './schemas'

const tx = { type: 'expense', amount: '250.50', date: '2026-10-05', accountId: 'a', categoryId: '', paymentMethod: 'upi', description: 'Tea', tags: 'a, b' }

describe('form schemas', () => {
  it('accepts a valid transaction', () => expect(transactionSchema.safeParse(tx).success).toBe(true))
  it('rejects zero, negative or garbage amounts and impossible dates', () => {
    for (const amount of ['0', '-5', 'abc', '']) expect(transactionSchema.safeParse({ ...tx, amount }).success).toBe(false)
    expect(transactionSchema.safeParse({ ...tx, date: '2026-02-30' }).success).toBe(false)
  })
  it('limits tags and description', () => {
    expect(transactionSchema.safeParse({ ...tx, tags: Array.from({ length: 11 }, (_, i) => `t${i}`).join(',') }).success).toBe(false)
    expect(transactionSchema.safeParse({ ...tx, description: 'x'.repeat(501) }).success).toBe(false)
  })
  it('transfers need two different accounts', () => {
    expect(transferSchema.safeParse({ fromAccountId: 'a', toAccountId: 'a', amount: '10', date: '2026-10-05', note: '' }).success).toBe(false)
    expect(transferSchema.safeParse({ fromAccountId: 'a', toAccountId: 'b', amount: '10', date: '2026-10-05', note: '' }).success).toBe(true)
  })
  it('accounts allow a negative opening balance (credit cards)', () => {
    expect(accountSchema.safeParse({ name: 'Card', kind: 'card', opening: '-1,500.25' }).success).toBe(true)
    expect(accountSchema.safeParse({ name: '', kind: 'card', opening: '' }).success).toBe(false)
  })
  it('budget warning threshold is 1 to 100', () => {
    expect(budgetSchema.safeParse({ categoryId: 'c', amount: '100', warnPct: '80' }).success).toBe(true)
    expect(budgetSchema.safeParse({ categoryId: 'c', amount: '100', warnPct: '0' }).success).toBe(false)
    expect(budgetSchema.safeParse({ categoryId: 'c', amount: '100', warnPct: '101' }).success).toBe(false)
  })
  it('recurring end date cannot precede the start date', () => {
    const r = { type: 'expense', amount: '10', accountId: 'a', categoryId: '', description: 'Rent', frequency: 'monthly', startDate: '2026-10-05', endDate: '2026-10-01', isBill: false, remindDays: '3' }
    expect(recurringSchema.safeParse(r).success).toBe(false)
    expect(recurringSchema.safeParse({ ...r, endDate: '' }).success).toBe(true)
  })
  it('passwords need 8 characters', () => {
    expect(signUpSchema.safeParse({ email: 'a@b.co', password: '1234567' }).success).toBe(false)
    expect(signUpSchema.safeParse({ email: 'a@b.co', password: '12345678' }).success).toBe(true)
  })
})
