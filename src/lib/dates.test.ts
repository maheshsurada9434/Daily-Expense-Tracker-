import { describe, expect, it } from 'vitest'
import { addDays, addMonths, daysInMonth, diffDays, isValidDate, monthEnd, monthsBetween, nextOccurrence, parseDateInput, presetRange, todayIn } from './dates'

describe('month boundaries', () => {
  it('knows month lengths including leap years', () => {
    expect(daysInMonth(2026, 2)).toBe(28)
    expect(daysInMonth(2028, 2)).toBe(29)
    expect(monthEnd('2026-02-10')).toBe('2026-02-28')
    expect(monthEnd('2026-12-01')).toBe('2026-12-31')
  })
  it('adds months across years', () => {
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-01')
    expect(addMonths('2026-01-31', -1)).toBe('2025-12-01')
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01')
    expect(diffDays('2026-10-01', '2026-10-31')).toBe(30)
  })
  it('lists every month in a range', () => {
    expect(monthsBetween('2026-11-20', '2027-01-05')).toEqual(['2026-11-01', '2026-12-01', '2027-01-01'])
  })
})

describe('presets', () => {
  it('this and last month', () => {
    expect(presetRange('this-month', '2026-03-15')).toEqual({ from: '2026-03-01', to: '2026-03-31' })
    expect(presetRange('last-month', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' })
  })
  it('Indian financial year (April to March)', () => {
    expect(presetRange('this-fy', '2026-02-10', 4)).toEqual({ from: '2025-04-01', to: '2026-03-31' })
    expect(presetRange('this-fy', '2026-04-01', 4)).toEqual({ from: '2026-04-01', to: '2027-03-31' })
    expect(presetRange('last-fy', '2026-10-21', 4)).toEqual({ from: '2025-04-01', to: '2026-03-31' })
  })
})

describe('date input', () => {
  it('validates real calendar dates', () => {
    expect(isValidDate('2026-02-29')).toBe(false)
    expect(isValidDate('2028-02-29')).toBe(true)
    expect(isValidDate('2026-13-01')).toBe(false)
    expect(isValidDate('1960-01-01')).toBe(false)
  })
  it('parses day-first and ISO text', () => {
    expect(parseDateInput('05/03/2026')).toBe('2026-03-05')
    expect(parseDateInput('5-3-2026')).toBe('2026-03-05')
    expect(parseDateInput('2026-03-05')).toBe('2026-03-05')
    expect(parseDateInput('31/02/2026')).toBeNull()
    expect(parseDateInput('hello')).toBeNull()
  })
  it('computes today in a time zone, not UTC', () => {
    const t = new Date('2026-10-20T20:00:00Z') // 01:30 on the 21st in Kolkata
    expect(todayIn('Asia/Kolkata', t)).toBe('2026-10-21')
    expect(todayIn('UTC', t)).toBe('2026-10-20')
  })
})

describe('recurring dates match the database rule', () => {
  it('monthly keeps the anchor day and clamps month ends', () => {
    expect(nextOccurrence('2026-01-31', 'monthly', '2026-01-31')).toBe('2026-02-28')
    expect(nextOccurrence('2026-02-28', 'monthly', '2026-01-31')).toBe('2026-03-31')
    expect(nextOccurrence('2026-08-31', 'monthly', '2026-07-31')).toBe('2026-09-30')
  })
  it('yearly handles 29 February', () => {
    expect(nextOccurrence('2027-02-28', 'yearly', '2024-02-29')).toBe('2028-02-29')
    expect(nextOccurrence('2028-02-29', 'yearly', '2024-02-29')).toBe('2029-02-28')
  })
  it('daily and weekly', () => {
    expect(nextOccurrence('2026-12-31', 'daily', '2026-12-31')).toBe('2027-01-01')
    expect(nextOccurrence('2026-10-01', 'weekly', '2026-10-01')).toBe('2026-10-08')
  })
})
