// Critical flows against a MOCKED Supabase (no real backend, no real credentials).
// The mock is a tiny in-memory REST + auth server wired in through Playwright route interception.
import { expect, test, type Page, type Route } from '@playwright/test'

const URL_BASE = 'https://sajrlqjybpsriygphnqb.supabase.co'
const USER = { id: '11111111-1111-1111-1111-111111111111', email: 'me@example.com', aud: 'authenticated', role: 'authenticated', last_sign_in_at: '2026-10-01T00:00:00Z' }

// An unsigned JWT that expires far in the future (the client only decodes it).
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
const TOKEN = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: USER.id, role: 'authenticated', exp: 4102444800 })}.sig`
const SESSION = { access_token: TOKEN, refresh_token: 'r', token_type: 'bearer', expires_in: 3600 * 24 * 365, expires_at: 4102444800, user: USER }

type Row = Record<string, unknown>
const today = new Date().toISOString().slice(0, 10)

function makeDb() {
  const accounts: Row[] = [
    { id: 'a1', name: 'Cash', kind: 'cash', opening_balance: 100000, archived: false, created_at: '2026-01-01' },
    { id: 'a2', name: 'HDFC', kind: 'bank', opening_balance: 500000, archived: false, created_at: '2026-01-02' },
  ]
  const categories: Row[] = [
    { id: 'c1', name: 'Food & Dining', kind: 'expense', color: '#ef4444', archived: false },
    { id: 'c2', name: 'Salary', kind: 'income', color: '#16a34a', archived: false },
  ]
  const tables: Record<string, Row[]> = {
    accounts, categories, transactions: [], transfers: [], budgets: [], savings_goals: [], goal_contributions: [], recurring_rules: [],
    user_preferences: [{ user_id: USER.id, currency: 'INR', timezone: 'Asia/Kolkata', theme: 'light', fy_start_month: 4 }],
    profiles: [{ id: USER.id, display_name: 'Test' }],
  }
  return tables
}

async function mock(page: Page) {
  const db = makeDb()
  await page.route(`${URL_BASE}/**`, async (route: Route) => {
    const req = route.request()
    const u = new URL(req.url())
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } })
    if (u.pathname.startsWith('/auth/v1/user')) return json(USER)
    if (u.pathname.startsWith('/auth/v1/token')) return json(SESSION)
    if (u.pathname.startsWith('/rest/v1/rpc/')) return json(0)
    const m = /^\/rest\/v1\/(\w+)/.exec(u.pathname)
    if (m && db[m[1]]) {
      const rows = db[m[1]]
      if (req.method() === 'GET') {
        const wantsObject = (req.headers()['accept'] ?? '').includes('vnd.pgrst.object')
        return wantsObject ? json(rows[0] ?? null) : json(rows)
      }
      if (req.method() === 'POST') {
        const body = JSON.parse(req.postData() ?? '{}')
        const list = (Array.isArray(body) ? body : [body]).map((r, i) => ({ id: `${m[1]}-${rows.length + i + 1}`, user_id: USER.id, ...r }))
        rows.push(...list)
        return route.fulfill({ status: 201, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(list) })
      }
      if (req.method() === 'DELETE') { const id = u.searchParams.get('id')?.replace('eq.', ''); db[m[1]] = rows.filter((r) => r.id !== id); return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }) }
      if (req.method() === 'PATCH') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } })
    }
    return json({})
  })
}

async function signedIn(page: Page) {
  await mock(page)
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), ['sb-sajrlqjybpsriygphnqb-auth-token', JSON.stringify(SESSION)])
  await page.goto('/')
}

test('signed-out visitors see the sign-in form and validation errors', async ({ page }) => {
  await mock(page)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page.getByText('Enter a valid email')).toBeVisible()
})

test('add a transaction and see it listed', async ({ page }) => {
  await signedIn(page)
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  await page.getByRole('button', { name: /add transaction/i }).first().click()
  await page.getByLabel('Amount').fill('1250.50')
  await expect(page.getByLabel('Amount'), 'right after fill').toHaveValue('1250.50', { timeout: 100 })
  await page.waitForTimeout(800)
  await expect(page.getByLabel('Amount'), 'after 800ms').toHaveValue('1250.50', { timeout: 100 })
  await page.getByLabel('Notes').fill('Team lunch')
  await page.getByRole('button', { name: 'Add transaction' }).last().click()
  await expect(page.getByText('Transaction added')).toBeVisible()
})

test('rejects an invalid amount before saving', async ({ page }) => {
  await signedIn(page)
  await page.getByRole('button', { name: /add transaction/i }).first().click()
  await page.getByLabel('Amount').fill('abc')
  await page.getByRole('button', { name: 'Add transaction' }).last().click()
  await expect(page.getByText(/Enter a valid amount/)).toBeVisible()
})

for (const [name, size] of [['phone', { width: 390, height: 800 }], ['tablet', { width: 820, height: 1000 }], ['desktop', { width: 1366, height: 800 }]] as const) {
  test(`layout has no horizontal scroll on ${name}`, async ({ page }) => {
    await page.setViewportSize(size)
    await signedIn(page)
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    for (const route of ['#/', '#/transactions', '#/budgets', '#/goals', '#/accounts', '#/recurring', '#/reports', '#/settings']) {
      await page.goto(`/${route}`)
      await page.waitForLoadState('networkidle')
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow, `${route} overflows by ${overflow}px`).toBeLessThanOrEqual(1)
    }
    if (size.width < 1024) await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
  })
}

test('every main page renders without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await signedIn(page)
  for (const [route, heading] of [['#/transactions', 'Transactions'], ['#/budgets', 'Budgets'], ['#/goals', 'Savings goals'], ['#/accounts', 'Accounts & categories'], ['#/recurring', 'Bills & recurring'], ['#/reports', 'Reports'], ['#/settings', 'Settings']] as const) {
    await page.goto(`/${route}`)
    await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible()
  }
  expect(errors).toEqual([])
  expect(today).toMatch(/\d{4}-\d{2}-\d{2}/)
})
