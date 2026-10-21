// Form validation (Zod). The database repeats the important checks (amount > 0, date range, ownership) as the trusted boundary.
import { z } from 'zod'
import { CURRENCIES, parseMoney } from './money'
import { isValidDate } from './dates'

const money = z.string().trim().refine((v) => { const m = parseMoney(v); return m !== null && m > 0 }, 'Enter a valid amount, for example 1,250.50')
const date = z.string().refine(isValidDate, 'Enter a valid date')
const optDate = z.string().refine((v) => v === '' || isValidDate(v), 'Enter a valid date')
const id = z.string().min(1, 'Choose one')
const methods = ['cash', 'upi', 'card', 'netbanking', 'cheque', 'other'] as const
const tagsText = z.string().max(200).refine((v) => v.split(',').map((t) => t.trim()).filter(Boolean).length <= 10, 'At most 10 tags')

export const transactionSchema = z.object({
  type: z.enum(['income', 'expense', 'refund']),
  amount: money,
  date,
  accountId: id,
  categoryId: z.string(),
  paymentMethod: z.enum(methods),
  description: z.string().trim().max(500, 'At most 500 characters'),
  tags: tagsText,
})

export const transferSchema = z.object({ fromAccountId: id, toAccountId: id, amount: money, date, note: z.string().trim().max(300) })
  .refine((v) => v.fromAccountId !== v.toAccountId, { path: ['toAccountId'], message: 'Choose a different account' })

export const accountSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60),
  kind: z.enum(['cash', 'bank', 'card', 'wallet', 'other']),
  opening: z.string().trim().refine((v) => v === '' || /^-?[\d,]+(\.\d{1,2})?$/.test(v), 'Enter a valid amount'),
})

export const categorySchema = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(60),
  kind: z.enum(['income', 'expense']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Pick a colour'),
})

export const budgetSchema = z.object({
  categoryId: id,
  amount: money,
  warnPct: z.string().refine((v) => /^\d+$/.test(v) && +v >= 1 && +v <= 100, 'Enter 1 to 100'),
})

export const goalSchema = z.object({ name: z.string().trim().min(1, 'Enter a name').max(80), targetAmount: money, targetDate: optDate })
export const contributionSchema = z.object({ amount: money, date, note: z.string().trim().max(300) })

export const recurringSchema = z.object({
  type: z.enum(['income', 'expense']),
  amount: money,
  accountId: id,
  categoryId: z.string(),
  description: z.string().trim().min(1, 'Enter a description').max(200),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  startDate: date,
  endDate: optDate,
  isBill: z.boolean(),
  remindDays: z.string().refine((v) => /^\d+$/.test(v) && +v <= 60, 'Enter 0 to 60'),
}).refine((v) => v.endDate === '' || v.endDate >= v.startDate, { path: ['endDate'], message: 'End date is before the start date' })

const validZone = (tz: string) => { try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true } catch { return false } }
export const settingsSchema = z.object({
  displayName: z.string().trim().max(80),
  currency: z.enum(CURRENCIES),
  timezone: z.string().refine(validZone, 'Unknown time zone'),
  theme: z.enum(['light', 'dark', 'system']),
  fyStartMonth: z.string().refine((v) => /^\d+$/.test(v) && +v >= 1 && +v <= 12),
})

export const signInSchema = z.object({ email: z.string().trim().email('Enter a valid email'), password: z.string().min(1, 'Enter your password') })
export const signUpSchema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(8, 'At least 8 characters').max(72),
})

export const parseTags = (s: string) => [...new Set(s.split(',').map((t) => t.trim()).filter(Boolean))].slice(0, 10)
