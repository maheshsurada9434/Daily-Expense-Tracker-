// CSV import/export. Import is validated row by row and previewed before anything is saved.
import { parseDateInput } from './dates'
import { MAX_MINOR, minorToDecimal, parseMoney } from './money'
import type { TxType } from './finance'

export const MAX_IMPORT_ROWS = 2000
export const MAX_IMPORT_BYTES = 1_000_000

/** RFC 4180 style parser: quoted fields, escaped quotes, CRLF/LF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', q = false
  const src = text.replace(/^\uFEFF/, '')
  for (let i = 0; i < src.length; i++) {
    const c = src[i]
    if (q) {
      if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++ } else q = false } else cell += c
    } else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x.trim() !== '')) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim() !== '')) rows.push(row)
  return rows
}

/** Spreadsheet formula injection guard: cells starting with = + - @ are prefixed with an apostrophe. */
const safe = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v)
const esc = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
export const toCsv = (rows: (string | number)[][]): string =>
  rows.map((r) => r.map((c) => esc(typeof c === 'number' ? String(c) : safe(c))).join(',')).join('\r\n') + '\r\n'

export const EXPORT_HEADER = ['date', 'type', 'amount', 'category', 'account', 'payment_method', 'description', 'tags']

export type ExportTx = { date: string; type: TxType; amount: number; category: string; account: string; paymentMethod: string; description: string; tags: string[] }
export const transactionsToCsv = (txs: ExportTx[]) =>
  toCsv([EXPORT_HEADER, ...txs.map((t) => [t.date, t.type, minorToDecimal(t.amount), t.category, t.account, t.paymentMethod, t.description, t.tags.join(';')])])

// ───────────── import ─────────────
export type ImportRow = {
  line: number; date: string; type: TxType; amount: number; accountId: string; accountName: string
  categoryName: string; categoryId: string | null; paymentMethod: string; description: string; tags: string[]
}
export type RowIssue = { line: number; message: string }
export type ImportPlan = {
  rows: ImportRow[]; issues: RowIssue[]; newCategories: { name: string; kind: 'income' | 'expense' }[]
}

const ALIAS: Record<string, string> = {
  date: 'date', 'txn date': 'date', 'transaction date': 'date',
  type: 'type', amount: 'amount', category: 'category', account: 'account',
  'payment method': 'payment_method', payment_method: 'payment_method', method: 'payment_method', mode: 'payment_method',
  description: 'description', notes: 'description', note: 'description', narration: 'description', tags: 'tags',
}
const METHODS = ['cash', 'upi', 'card', 'netbanking', 'cheque', 'other']

export function planImport(
  text: string,
  ctx: { accounts: { id: string; name: string }[]; categories: { id: string; name: string; kind: 'income' | 'expense' }[] },
): ImportPlan {
  const issues: RowIssue[] = []
  if (text.length > MAX_IMPORT_BYTES) return { rows: [], issues: [{ line: 0, message: 'File is larger than 1 MB.' }], newCategories: [] }
  const table = parseCsv(text)
  if (table.length < 2) return { rows: [], issues: [{ line: 0, message: 'The file needs a header row and at least one data row.' }], newCategories: [] }
  const header = table[0].map((h) => ALIAS[h.trim().toLowerCase().replace(/\s+/g, ' ')] ?? '')
  for (const need of ['date', 'type', 'amount']) {
    if (!header.includes(need)) return { rows: [], issues: [{ line: 1, message: `Missing required column: ${need}` }], newCategories: [] }
  }
  if (table.length - 1 > MAX_IMPORT_ROWS) return { rows: [], issues: [{ line: 0, message: `At most ${MAX_IMPORT_ROWS} rows per file.` }], newCategories: [] }
  const col = (r: string[], k: string) => (r[header.indexOf(k)] ?? '').trim()
  const accIdx = new Map(ctx.accounts.map((a) => [a.name.toLowerCase(), a]))
  const catIdx = new Map(ctx.categories.map((c) => [`${c.kind}:${c.name.toLowerCase()}`, c]))
  const defaultAcc = ctx.accounts.length === 1 ? ctx.accounts[0] : undefined
  const rows: ImportRow[] = []
  const newCats = new Map<string, { name: string; kind: 'income' | 'expense' }>()

  table.slice(1).forEach((r, i) => {
    const line = i + 2
    const bad = (message: string) => issues.push({ line, message })
    const date = parseDateInput(col(r, 'date'))
    if (!date) return bad(`Invalid date "${col(r, 'date')}" (use DD/MM/YYYY or YYYY-MM-DD)`)
    const type = col(r, 'type').toLowerCase() as TxType
    if (!['income', 'expense', 'refund'].includes(type)) return bad(`Type must be income, expense or refund, not "${col(r, 'type')}"`)
    const amount = parseMoney(col(r, 'amount'))
    if (amount === null || amount <= 0 || amount > MAX_MINOR) return bad(`Invalid amount "${col(r, 'amount')}" (positive, at most 2 decimals)`)
    const accName = col(r, 'account')
    const acc = accName ? accIdx.get(accName.toLowerCase()) : defaultAcc
    if (!acc) return bad(accName ? `Unknown account "${accName}". Create it first.` : 'Account is required')
    const catName = col(r, 'category')
    const kind = type === 'income' ? 'income' : 'expense'
    let categoryId: string | null = null
    if (catName) {
      const hit = catIdx.get(`${kind}:${catName.toLowerCase()}`)
      if (hit) categoryId = hit.id
      else newCats.set(`${kind}:${catName.toLowerCase()}`, { name: catName.slice(0, 60), kind })
    }
    const method = col(r, 'payment_method').toLowerCase()
    rows.push({
      line, date, type, amount, accountId: acc.id, accountName: acc.name, categoryName: catName, categoryId,
      paymentMethod: METHODS.includes(method) ? method : 'other',
      description: col(r, 'description').slice(0, 500),
      tags: col(r, 'tags').split(/[;|]/).map((t) => t.trim()).filter(Boolean).slice(0, 10),
    })
  })
  return { rows, issues, newCategories: [...newCats.values()] }
}

/** Stable fingerprint of a row, so importing the same file twice never doubles the data. */
type Hashable = Pick<ImportRow, 'date' | 'type' | 'amount' | 'accountId' | 'description'>
const base = (r: Hashable) => [r.date, r.type, r.amount, r.accountId, r.description.trim().toLowerCase().replace(/\s+/g, ' ')].join('|')

export async function rowHash(r: Hashable, occurrence: number): Promise<string> {
  const key = `${base(r)}|${occurrence}`
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Adds hashes (the nth identical row in a file gets occurrence n) and flags rows already present as duplicates. */
export async function markDuplicates(rows: ImportRow[], existing: Set<string>): Promise<(ImportRow & { hash: string; duplicate: boolean })[]> {
  const seen = new Map<string, number>()
  const out: (ImportRow & { hash: string; duplicate: boolean })[] = []
  for (const r of rows) {
    const k = base(r)
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    const hash = await rowHash(r, n)
    out.push({ ...r, hash, duplicate: existing.has(hash) })
  }
  return out
}
