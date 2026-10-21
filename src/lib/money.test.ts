import { describe, expect, it } from 'vitest'
import { formatMoney, formatPct, minorToDecimal, parseMoney, ratioBps, sum } from './money'

describe('parseMoney', () => {
  it('parses to integer minor units without float error', () => {
    expect(parseMoney('0.1')).toBe(10)
    expect(parseMoney('0.07')).toBe(7)
    expect(parseMoney('1,23,456.78')).toBe(12345678)
    expect(parseMoney('₹ 500')).toBe(50000)
    expect(parseMoney('19.99')).toBe(1999)
    expect(parseMoney('1.005')).toBeNull()
  })
  it('rejects bad input', () => {
    for (const bad of ['', 'abc', '-5', '1.2.3', '12e3', '10000000000.01']) expect(parseMoney(bad)).toBeNull()
  })
})

describe('formatMoney', () => {
  it('uses Indian digit grouping for INR', () => {
    expect(formatMoney(12345678)).toBe('₹1,23,456.78')
    expect(formatMoney(100000000)).toBe('₹10,00,000.00')
    expect(formatMoney(99999)).toBe('₹999.99')
    expect(formatMoney(0)).toBe('₹0.00')
    expect(formatMoney(-150050)).toBe('-₹1,500.50')
    expect(formatMoney(12345678, 'INR', { decimals: false })).toBe('₹1,23,456')
  })
  it('uses thousands grouping for other currencies', () => {
    expect(formatMoney(123456789, 'USD')).toBe('$1,234,567.89')
  })
  it('round-trips through minorToDecimal', () => {
    expect(minorToDecimal(5)).toBe('0.05')
    expect(parseMoney(minorToDecimal(123456))).toBe(123456)
  })
})

describe('ratioBps and sums', () => {
  it('rounds half away from zero', () => {
    expect(ratioBps(1, 3)).toBe(3333)
    expect(ratioBps(2, 3)).toBe(6667)
    expect(ratioBps(-1, 3)).toBe(-3333)
    expect(ratioBps(1, 8)).toBe(1250)
    expect(ratioBps(5, 0)).toBeNull()
    expect(ratioBps(5, -10)).toBeNull()
  })
  it('formats percentages', () => {
    expect(formatPct(3333)).toBe('33.3%')
    expect(formatPct(5000)).toBe('50%')
    expect(formatPct(null)).toBe('—')
  })
  it('adds exactly and guards overflow', () => {
    expect(sum(Array(10).fill(10))).toBe(100)
    expect(() => sum([Number.MAX_SAFE_INTEGER, 10])).toThrow()
  })
})
