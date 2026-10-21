import { createContext, useContext, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ArrowLeftRight, BarChart3, CalendarClock, LayoutDashboard, Landmark, MoreHorizontal, PiggyBank, Plus, Settings as Cog, Target, Wallet } from 'lucide-react'
import TransactionDialog from './TransactionDialog'
import { ErrorBanner, Modal, Skeleton, cx } from './ui'
import { useData } from '../data/DataContext'
import type { Transaction } from '../data/types'

const MAIN = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/budgets', label: 'Budgets', icon: Wallet },
  { to: '/goals', label: 'Goals', icon: Target },
]
const MORE = [
  { to: '/accounts', label: 'Accounts & categories', icon: Landmark },
  { to: '/recurring', label: 'Bills & recurring', icon: CalendarClock },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/settings', label: 'Settings', icon: Cog },
]

type Actions = { addTransaction: () => void; editTransaction: (t: Transaction) => void }
const ActionsCtx = createContext<Actions | null>(null)
export const useActions = () => {
  const v = useContext(ActionsCtx)
  if (!v) throw new Error('Layout missing')
  return v
}

const linkCls = ({ isActive }: { isActive: boolean }) =>
  cx('group flex min-h-[44px] items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition-all duration-300', isActive ? 'glass text-primary' : 'text-sub hover:translate-x-1 hover:bg-primary/5 hover:text-fg')

export default function Layout({ children }: { children: ReactNode }) {
  const { loading, error, reload, profile, session } = useData()
  const [dialog, setDialog] = useState<{ open: boolean; editing: Transaction | null }>({ open: false, editing: null })
  const [more, setMore] = useState(false)
  const actions: Actions = {
    addTransaction: () => setDialog({ open: true, editing: null }),
    editTransaction: (t) => setDialog({ open: true, editing: t }),
  }
  const { pathname } = useLocation()
  const navIdx = (() => { const i = MAIN.findIndex((n) => (n.to === '/' ? pathname === '/' : pathname.startsWith(n.to))); return i < 0 ? 4 : i })()
  const name = profile.displayName || session.user.email || 'You'

  return (
    <ActionsCtx.Provider value={actions}>
      <div className="min-h-screen lg:grid lg:grid-cols-[288px_1fr]">
        {/* desktop sidebar */}
        <aside className="glass sticky top-4 m-4 mr-0 hidden h-[calc(100vh-2rem)] flex-col rounded-[1.75rem] p-4 lg:flex">
          <div className="mb-6 flex items-center gap-3 px-2">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-[#4f46e5] via-[#7c3aed] to-[#c026d3] text-white shadow-lg shadow-primary/30 ring-1 ring-white/40"><PiggyBank className="h-5 w-5" aria-hidden="true" /></div>
            <div className="min-w-0"><p className="font-extrabold leading-tight">Expense Tracker</p><p className="truncate text-xs text-sub">{name}</p></div>
          </div>
          <button className="btn btn-primary mb-4 w-full" onClick={actions.addTransaction}><Plus className="h-4 w-4" aria-hidden="true" /> Add transaction</button>
          <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
            {[...MAIN, ...MORE].map((n) => <NavLink key={n.to} to={n.to} end={n.to === '/'} className={linkCls}><n.icon className="h-5 w-5" aria-hidden="true" />{n.label}</NavLink>)}
          </nav>
        </aside>

        <div className="min-w-0">
          {/* mobile top bar */}
          <header className="sticky top-3 z-30 flex h-14 items-center justify-between glass mx-3 mt-3 rounded-2xl px-4 lg:hidden">
            <div className="flex items-center gap-2 font-extrabold"><span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-[#4f46e5] via-[#7c3aed] to-[#c026d3] text-white"><PiggyBank className="h-4 w-4" aria-hidden="true" /></span> Expense Tracker</div>
            <button className="btn btn-primary min-h-[40px] px-3" onClick={actions.addTransaction} aria-label="Add transaction"><Plus className="h-4 w-4" aria-hidden="true" /> Add</button>
          </header>

          <main className="mx-auto w-full max-w-6xl p-4 pb-32 lg:p-8 lg:pb-10">
            {error && <div className="mb-4"><ErrorBanner message={error} onRetry={() => reload('accounts', 'categories', 'transactions', 'transfers', 'budgets', 'goals', 'contribs', 'rules', 'prefs')} /></div>}
            <div key={pathname} className="page-in">{loading ? <div className="space-y-4"><Skeleton className="h-8 w-48" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-72" /></div> : children}</div>
          </main>

          {/* mobile bottom navigation (5 items) */}
          <nav aria-label="Main" className="glass fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 grid grid-cols-5 rounded-[1.6rem] p-1 lg:hidden">
            <span className="liquid-pill pointer-events-none absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/5)]" style={{ transform: `translateX(${navIdx * 100}%)` }} aria-hidden="true"><span className="block h-full rounded-[1.25rem] bg-gradient-to-br from-primary/20 to-violet/20 shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] ring-1 ring-white/50 dark:ring-white/15" /></span>
            {MAIN.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx('relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors duration-300 [&>svg]:transition-transform [&>svg]:duration-500', isActive ? 'text-primary [&>svg]:-translate-y-0.5 [&>svg]:scale-110' : 'text-sub')}>
                <n.icon className="h-5 w-5" aria-hidden="true" />{n.label}
              </NavLink>
            ))}
            <button className={cx('relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-semibold', navIdx === 4 ? 'text-primary' : 'text-sub')} onClick={() => setMore(true)} aria-haspopup="dialog">
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />More
            </button>
          </nav>
        </div>
      </div>

      <Modal open={more} onClose={() => setMore(false)} title="More">
        <nav aria-label="More pages" className="grid gap-1">
          {MORE.map((n) => <NavLink key={n.to} to={n.to} onClick={() => setMore(false)} className={linkCls}><n.icon className="h-5 w-5" aria-hidden="true" />{n.label}</NavLink>)}
        </nav>
      </Modal>

      <TransactionDialog open={dialog.open} editing={dialog.editing} onClose={() => setDialog({ open: false, editing: null })} />
    </ActionsCtx.Provider>
  )
}
