// Dates are plain "YYYY-MM-DD" strings (no time zone shifting). "Today" is computed in the user's chosen time zone.
// Ranges are inclusive on both ends, so month boundaries are exact: 1st to last day.

export type Range = { from: string; to: string }

const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

export function parts(s: string): { y: number; m: number; d: number } {
  return { y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)), d: Number(s.slice(8, 10)) }
}

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()

export function isValidDate(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const { y, m, d } = parts(s)
  return y >= 1970 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m)
}

/** Today's date in the given IANA time zone. */
export function todayIn(tz: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
  } catch {
    return now.toISOString().slice(0, 10)
  }
}

export const monthKey = (s: string) => s.slice(0, 7)
export const monthStart = (s: string) => `${s.slice(0, 7)}-01`
export function monthEnd(s: string): string {
  const { y, m } = parts(s)
  return ymd(y, m, daysInMonth(y, m))
}

export function addMonths(s: string, n: number): string {
  const { y, m } = parts(s)
  const t = y * 12 + (m - 1) + n
  return ymd(Math.floor(t / 12), (t % 12) + 1, 1)
}

export function addDays(s: string, n: number): string {
  const { y, m, d } = parts(s)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

export const diffDays = (a: string, b: string) => {
  const A = parts(a), B = parts(b)
  return Math.round((Date.UTC(B.y, B.m - 1, B.d) - Date.UTC(A.y, A.m - 1, A.d)) / 86400000)
}

export const inRange = (date: string, r: Range) => date >= r.from && date <= r.to

/** Every "YYYY-MM-01" from the month of `from` to the month of `to`. */
export function monthsBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let m = monthStart(from); m <= to && out.length < 600; m = addMonths(m, 1)) out.push(m)
  return out
}

export type PresetId = 'this-month' | 'last-month' | 'last-3-months' | 'this-fy' | 'last-fy' | 'this-year' | 'all'

export function presetRange(id: PresetId, today: string, fyStartMonth = 4): Range {
  const { y, m } = parts(today)
  switch (id) {
    case 'this-month': return { from: monthStart(today), to: monthEnd(today) }
    case 'last-month': { const p = addMonths(today, -1); return { from: p, to: monthEnd(p) } }
    case 'last-3-months': return { from: addMonths(today, -2), to: monthEnd(today) }
    case 'this-year': return { from: ymd(y, 1, 1), to: ymd(y, 12, 31) }
    case 'this-fy':
    case 'last-fy': {
      const startYear = (m >= fyStartMonth ? y : y - 1) - (id === 'last-fy' ? 1 : 0)
      const from = ymd(startYear, fyStartMonth, 1)
      return { from, to: monthEnd(addMonths(from, 11)) }
    }
    case 'all': return { from: '1970-01-01', to: '2100-12-31' }
  }
}

export const PRESET_LABELS: Record<PresetId, string> = {
  'this-month': 'This month', 'last-month': 'Last month', 'last-3-months': 'Last 3 months',
  'this-fy': 'This financial year', 'last-fy': 'Last financial year', 'this-year': 'This calendar year', all: 'All time',
}

/** Day-first (Indian) and ISO date text -> "YYYY-MM-DD" or null. Rejects impossible dates such as 31/02/2026. */
export function parseDateInput(raw: string): string | null {
  const s = raw.trim()
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s)
  let y: number, mo: number, d: number
  if (m) { y = +m[1]; mo = +m[2]; d = +m[3] }
  else if ((m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s))) { d = +m[1]; mo = +m[2]; y = +m[3] }
  else return null
  const out = ymd(y, mo, d)
  return isValidDate(out) && daysInMonth(y, mo) >= d ? out : null
}

export type Frequency = 'daily' | 'weekly' | 'monthly' | 'yearly'

/** Same rule as the database function public.next_occurrence (month-end days clamp, the anchor day comes back). */
export function nextOccurrence(d: string, freq: Frequency, anchor: string): string {
  if (freq === 'daily') return addDays(d, 1)
  if (freq === 'weekly') return addDays(d, 7)
  const a = parts(anchor)
  const { y } = parts(d)
  if (freq === 'monthly') {
    const next = addMonths(d, 1)
    const p = parts(next)
    return ymd(p.y, p.m, Math.min(a.d, daysInMonth(p.y, p.m)))
  }
  return ymd(y + 1, a.m, Math.min(a.d, daysInMonth(y + 1, a.m)))
}
