// Money is always an integer number of minor units (paise/cents). No floating point in totals.
// 1 unit = 100 minor units for every supported currency (JPY included, shown with 2 decimals).

export const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'SGD', 'AUD', 'CAD', 'JPY'] as const
export type Currency = (typeof CURRENCIES)[number]

const SYMBOL: Record<Currency, string> = { INR: '₹', USD: '$', EUR: '€', GBP: '£', AED: 'AED ', SGD: 'S$', AUD: 'A$', CAD: 'C$', JPY: '¥' }
export const MAX_MINOR = 1_000_000_000_000 // matches the database CHECK constraint

/** "1,23,456.78", "₹ 500", "500.5" -> minor units. Returns null if invalid, negative, zero-only garbage or too large. */
export function parseMoney(input: string): number | null {
  const s = input.replace(/[₹$€£,\s]|rs\.?|inr/gi, '')
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null
  const [whole, frac = ''] = s.split('.')
  const minor = Number(whole) * 100 + Number(frac.padEnd(2, '0'))
  return Number.isSafeInteger(minor) && minor <= MAX_MINOR ? minor : null
}

function group(digits: string, indian: boolean): string {
  if (!indian || digits.length <= 3) return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  const last3 = digits.slice(-3)
  return digits.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3
}

/** 12345678 (paise) -> "₹1,23,456.78". Indian digit grouping for INR, thousands grouping otherwise. */
export function formatMoney(minor: number, currency: Currency = 'INR', opts: { decimals?: boolean; sign?: boolean } = {}): string {
  const neg = minor < 0
  const abs = Math.abs(Math.trunc(minor))
  const whole = group(String(Math.floor(abs / 100)), currency === 'INR')
  const frac = String(abs % 100).padStart(2, '0')
  const body = opts.decimals === false ? whole : `${whole}.${frac}`
  return `${neg ? '-' : opts.sign ? '+' : ''}${SYMBOL[currency]}${body}`
}

/** Plain decimal text for forms and CSV: 12345 -> "123.45". */
export function minorToDecimal(minor: number): string {
  const abs = Math.abs(minor)
  return `${minor < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

/** num/den as basis points (1% = 100), rounded half away from zero. null when den <= 0. Uses BigInt: no float error. */
export function ratioBps(num: number, den: number): number | null {
  if (den <= 0) return null
  const n = BigInt(num) * 10000n
  const d = BigInt(den)
  const q = n / d
  const r = n % d
  const abs = (x: bigint) => (x < 0n ? -x : x)
  return Number(abs(r) * 2n >= d ? q + (n < 0n ? -1n : 1n) : q)
}

export const formatPct = (bps: number | null) => (bps === null ? '—' : `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`)

/** Sum with an overflow guard; totals stay exact because every term is an integer. */
export function sum(values: number[]): number {
  let t = 0
  for (const v of values) t += v
  if (!Number.isSafeInteger(t)) throw new RangeError('Total too large')
  return t
}
