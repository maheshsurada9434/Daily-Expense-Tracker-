import { createContext, useContext, useState, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
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
  cx('flex min-h-[44px] items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-200', isActive ? 'bg-primary/10 text-primary' : 'text-sub hover:bg-muted hover:text-fg')

export default function Layout({ children }: { children: ReactNode }) {
  const { loading, error, reload, profile, session } = useData()
  const [dialog, setDialog] = useState<{ open: boolean; editing: Transaction | null }>({ open: false, editing: null })
  const [more, setMore] = useState(false)
  const actions: Actions = {
    addTransaction: () => setDialog({ open: true, editing: null }),
    editTransaction: (t) => setDialog({ open: true, editing: t }),
  }
  const name = profile.displayName || session.user.email || 'You'

  return (
    <ActionsCtx.Provider value={actions}>
      <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
        {/* desktop sidebar */}
        <aside className="sticky top-0 hidden h-screen flex-col border-r border-border bg-card p-4 lg:flex">
          <div className="mb-6 flex items-center gap-3 px-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-on-primary"><PiggyBank className="h-5 w-5" aria-hidden="true" /></div>
            <div className="min-w-0"><p className="font-semibold leading-tight">Expense Tracker</p><p className="truncate text-xs text-sub">{name}</p></div>
          </div>
          <button className="btn btn-primary mb-4 w-full" onClick={actions.addTransaction}><Plus className="h-4 w-4" aria-hidden="true" /> Add transaction</button>
          <nav aria-label="Main" className="flex flex-1 flex-col gap-1">
            {[...MAIN, ...MORE].map((n) => <NavLink key={n.to} to={n.to} end={n.to === '/'} className={linkCls}><n.icon className="h-5 w-5" aria-hidden="true" />{n.label}</NavLink>)}
          </nav>
        </aside>

        <div className="min-w-0">
          {/* mobile top bar */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-card/95 px-4 backdrop-blur lg:hidden">
            <div className="flex items-center gap-2 font-semibold"><PiggyBank className="h-5 w-5 text-primary" aria-hidden="true" /> Expense Tracker</div>
            <button className="btn btn-primary min-h-[40px] px-3" onClick={actions.addTransaction} aria-label="Add transaction"><Plus className="h-4 w-4" aria-hidden="true" /> Add</button>
          </header>

          <main className="mx-auto w-full max-w-6xl p-4 pb-28 lg:p-8 lg:pb-10">
            {error && <div className="mb-4"><ErrorBanner message={error} onRetry={() => reload('accounts', 'categories', 'transactions', 'transfers', 'budgets', 'goals', 'contribs', 'rules', 'prefs')} /></div>}
            {loading ? <div className="space-y-4"><Skeleton className="h-8 w-48" /><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="h-72" /></div> : children}
          </main>

          {/* mobile bottom navigation (5 items) */}
          <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
            {MAIN.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx('flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium', isActive ? 'text-primary' : 'text-sub')}>
                <n.icon className="h-5 w-5" aria-hidden="true" />{n.label}
              </NavLink>
            ))}
            <button className="flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-sub" onClick={() => setMore(true)} aria-haspopup="dialog">
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
