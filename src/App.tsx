import { lazy, Suspense, useEffect, useState } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import type { Session } from '@supabase/supabase-js'
import { isConfigured, supabase } from './lib/supabase'
import { ConfirmProvider, Skeleton, ToastProvider } from './components/ui'
import { DataProvider, useData } from './data/DataContext'
import AuthPage from './pages/AuthPage'
import Layout from './components/Layout'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Transactions = lazy(() => import('./pages/Transactions'))
const Accounts = lazy(() => import('./pages/Accounts'))
const Budgets = lazy(() => import('./pages/Budgets'))
const Goals = lazy(() => import('./pages/Goals'))
const Recurring = lazy(() => import('./pages/Recurring'))
const Reports = lazy(() => import('./pages/Reports'))
const Settings = lazy(() => import('./pages/Settings'))

function ThemeSync() {
  const { prefs } = useData()
  useEffect(() => {
    const apply = () => {
      const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    try { localStorage.setItem('det-theme', prefs.theme) } catch { /* private mode: theme still applies for this visit */ }
    const mq = matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [prefs.theme])
  return null
}

function PageFallback() {
  return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-32 w-full" /><Skeleton className="h-64 w-full" /></div>
}

function Authed({ session }: { session: Session }) {
  return (
    <DataProvider session={session}>
      <ThemeSync />
      <Layout>
        <Suspense fallback={<PageFallback />}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/accounts" element={<Accounts />} />
            <Route path="/budgets" element={<Budgets />} />
            <Route path="/goals" element={<Goals />} />
            <Route path="/recurring" element={<Recurring />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Layout>
    </DataProvider>
  )
}

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)

  useEffect(() => {
    if (!isConfigured) return
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((e, s) => {
      setSession(s)
      if (e === 'PASSWORD_RECOVERY') window.location.hash = '#/settings' // the reset link signs the user in; let them pick a new password
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (!isConfigured) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-3 p-6">
        <h1 className="text-2xl font-semibold">Supabase is not configured</h1>
        <p className="text-sub">Create <code className="rounded bg-muted px-1">.env.local</code> from <code className="rounded bg-muted px-1">.env.example</code>, set <code className="rounded bg-muted px-1">VITE_SUPABASE_URL</code> and <code className="rounded bg-muted px-1">VITE_SUPABASE_ANON_KEY</code>, then restart. See the README.</p>
      </main>
    )
  }
  if (session === undefined) return <div className="p-6"><Skeleton className="mx-auto mt-24 h-10 w-64" /></div>

  return (
    <ToastProvider>
      <ConfirmProvider>{session ? <Authed session={session} /> : <AuthPage />}</ConfirmProvider>
    </ToastProvider>
  )
}
