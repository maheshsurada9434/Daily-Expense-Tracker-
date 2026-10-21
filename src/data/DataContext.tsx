import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { friendlyError, supabase } from '../lib/supabase'
import { todayIn } from '../lib/dates'
import { formatMoney, type Currency } from '../lib/money'
import {
  type Account, type BudgetRec, type Category, type ContributionRec, type GoalRec, type Prefs, type Profile, type RuleRec, type Transaction, type TransferRec,
  mapAccount, mapBudget, mapCategory, mapContribution, mapGoal, mapRule, mapTransfer, mapTx,
} from './types'

export type TableName = 'accounts' | 'categories' | 'transactions' | 'transfers' | 'budgets' | 'goals' | 'contribs' | 'rules' | 'prefs'

export type DataState = {
  loading: boolean
  error: string | null
  accounts: Account[]; categories: Category[]; transactions: Transaction[]; transfers: TransferRec[]
  budgets: BudgetRec[]; goals: GoalRec[]; contribs: ContributionRec[]; rules: RuleRec[]
  prefs: Prefs; profile: Profile
  today: string
  fmt: (minor: number, o?: { decimals?: boolean; sign?: boolean }) => string
  reload: (...t: TableName[]) => Promise<void>
  accountName: (id: string) => string
  category: (id: string | null) => Category | undefined
  session: Session
}

const DEFAULT_PREFS: Prefs = { currency: 'INR', timezone: 'Asia/Kolkata', theme: 'system', fyStartMonth: 4 }
const Ctx = createContext<DataState | null>(null)

/** Reads every row of a table in 1000-row pages (the API's default cap). */
async function fetchAll<T>(table: string, order: string, map: (r: Record<string, unknown>) => T): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select('*').order(order, { ascending: true }).order('id').range(from, from + 999)
    if (error) throw error
    out.push(...(data as Record<string, unknown>[]).map(map))
    if (!data || data.length < 1000) return out
  }
}

export function DataProvider({ session, children }: { session: Session; children: ReactNode }) {
  const [state, setState] = useState({
    loading: true, error: null as string | null,
    accounts: [] as Account[], categories: [] as Category[], transactions: [] as Transaction[], transfers: [] as TransferRec[],
    budgets: [] as BudgetRec[], goals: [] as GoalRec[], contribs: [] as ContributionRec[], rules: [] as RuleRec[],
    prefs: DEFAULT_PREFS, profile: { displayName: '' } as Profile,
  })
  const [tick, setTick] = useState(0) // re-evaluate "today" when the tab regains focus
  const aliveRef = useRef(true)

  const load = useCallback(async (tables: TableName[]) => {
    const want = (t: TableName) => tables.includes(t)
    try {
      const jobs: Promise<Partial<typeof state>>[] = []
      if (want('accounts')) jobs.push(fetchAll('accounts', 'created_at', mapAccount).then((accounts) => ({ accounts })))
      if (want('categories')) jobs.push(fetchAll('categories', 'name', mapCategory).then((categories) => ({ categories })))
      if (want('transactions')) jobs.push(fetchAll('transactions', 'txn_date', mapTx).then((transactions) => ({ transactions })))
      if (want('transfers')) jobs.push(fetchAll('transfers', 'transfer_date', mapTransfer).then((transfers) => ({ transfers })))
      if (want('budgets')) jobs.push(fetchAll('budgets', 'month', mapBudget).then((budgets) => ({ budgets })))
      if (want('goals')) jobs.push(fetchAll('savings_goals', 'created_at', mapGoal).then((goals) => ({ goals })))
      if (want('contribs')) jobs.push(fetchAll('goal_contributions', 'contributed_on', mapContribution).then((contribs) => ({ contribs })))
      if (want('rules')) jobs.push(fetchAll('recurring_rules', 'next_date', mapRule).then((rules) => ({ rules })))
      if (want('prefs')) {
        jobs.push((async () => {
          const [p, pr] = await Promise.all([
            supabase.from('user_preferences').select('*').maybeSingle(),
            supabase.from('profiles').select('*').maybeSingle(),
          ])
          if (p.error) throw p.error
          if (pr.error) throw pr.error
          return {
            prefs: p.data ? { currency: p.data.currency as Currency, timezone: p.data.timezone, theme: p.data.theme, fyStartMonth: p.data.fy_start_month } : DEFAULT_PREFS,
            profile: { displayName: pr.data?.display_name ?? '' },
          }
        })())
      }
      const parts = await Promise.all(jobs)
      if (aliveRef.current) setState((s) => Object.assign({}, s, ...parts, { loading: false, error: null }))
    } catch (e) {
      if (aliveRef.current) setState((s) => ({ ...s, loading: false, error: friendlyError(e) }))
    }
  }, [])

  useEffect(() => {
    aliveRef.current = true
    ;(async () => {
      // Post any recurring items that are due (also done daily on the server), then read everything.
      await supabase.rpc('run_my_recurring')
      await load(['accounts', 'categories', 'transactions', 'transfers', 'budgets', 'goals', 'contribs', 'rules', 'prefs'])
    })()
    const onFocus = () => setTick((t) => t + 1)
    window.addEventListener('focus', onFocus)
    return () => { aliveRef.current = false; window.removeEventListener('focus', onFocus) }
  }, [load])

  const reload = useCallback((...t: TableName[]) => load(t), [load])

  const value = useMemo<DataState>(() => {
    const { currency, timezone } = state.prefs
    const accIdx = new Map(state.accounts.map((a) => [a.id, a]))
    const catIdx = new Map(state.categories.map((c) => [c.id, c]))
    return {
      ...state,
      today: todayIn(timezone),
      fmt: (m, o) => formatMoney(m, currency, o),
      reload,
      accountName: (id) => accIdx.get(id)?.name ?? 'Unknown',
      category: (id) => (id ? catIdx.get(id) : undefined),
      session,
    }
    // tick forces a fresh "today" after the tab was idle across midnight
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, reload, session, tick])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData(): DataState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useData must be used inside DataProvider')
  return v
}
