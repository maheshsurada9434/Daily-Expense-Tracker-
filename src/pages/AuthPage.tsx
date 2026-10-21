import { useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { LineChart, ShieldCheck } from 'lucide-react'
import type { ZodTypeAny } from 'zod'
import { supabase, friendlyError } from '../lib/supabase'
import { signInSchema, signUpSchema } from '../lib/schemas'
import { Field } from '../components/ui'

type Mode = 'signin' | 'signup' | 'reset'
type Values = { email: string; password: string }

const redirectTo = () => window.location.origin + window.location.pathname

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('signin')
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [fails, setFails] = useState(0)
  const [lockedUntil, setLockedUntil] = useState(0)

  const schema = mode === 'signup' ? signUpSchema : mode === 'reset' ? signUpSchema.pick({ email: true }) : signInSchema
  const { register, handleSubmit, formState: { errors }, reset } = useForm<Values>({ resolver: zodResolver(schema as ZodTypeAny) as unknown as Resolver<Values> })

  const switchMode = (m: Mode) => { setMode(m); setMsg(null); reset() }

  async function onSubmit(v: Values) {
    if (Date.now() < lockedUntil) { setMsg({ kind: 'error', text: 'Too many attempts. Please wait a moment and try again.' }); return }
    setBusy(true); setMsg(null)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: v.email.trim(), password: v.password })
        if (error) {
          const n = fails + 1
          setFails(n)
          if (n >= 5) { setLockedUntil(Date.now() + 30_000); setFails(0) }
          throw new Error(/Invalid login/i.test(error.message) ? 'Incorrect email or password.' : /not confirmed/i.test(error.message) ? 'Please confirm your email first. Check your inbox.' : friendlyError(error))
        }
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email: v.email.trim(), password: v.password, options: { emailRedirectTo: redirectTo() } })
        if (error) throw new Error(friendlyError(error))
        setMsg(data.session ? null : { kind: 'ok', text: 'Account created. Check your email for a confirmation link, then sign in.' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(v.email.trim(), { redirectTo: redirectTo() })
        if (error) throw new Error(friendlyError(error))
        setMsg({ kind: 'ok', text: 'If an account exists for that email, a reset link is on its way.' })
      }
    } catch (e) {
      setMsg({ kind: 'error', text: (e as Error).message })
    } finally { setBusy(false) }
  }

  const title = mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : 'Reset your password'

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 p-5 md:grid-cols-2">
      <section className="hidden md:block">
        <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-on-primary"><LineChart className="h-6 w-6" aria-hidden="true" /></div>
        <h1 className="text-4xl font-semibold tracking-tight">Know where every rupee goes.</h1>
        <p className="mt-3 max-w-md text-sub">Track income and spending, plan budgets, save toward goals and never miss a bill. Your records are private to your account.</p>
        <p className="mt-6 flex items-center gap-2 text-sm text-sub"><ShieldCheck className="h-4 w-4 text-income" aria-hidden="true" /> Row-level security: only you can read your data. No bank logins are ever asked for.</p>
      </section>

      <section className="card fade-up p-6">
        <div className="mb-5 flex items-center gap-3 md:hidden">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-on-primary"><LineChart className="h-5 w-5" aria-hidden="true" /></div>
          <span className="font-semibold">Daily Expense Tracker</span>
        </div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <form onSubmit={handleSubmit(onSubmit)} className="mt-4 space-y-4" noValidate>
          <Field label="Email" error={errors.email?.message}>
            <input className="input" type="email" autoComplete="email" inputMode="email" aria-invalid={!!errors.email} {...register('email')} />
          </Field>
          {mode !== 'reset' && (
            <Field label="Password" error={errors.password?.message} hint={mode === 'signup' ? 'At least 8 characters.' : undefined}>
              <input className="input" type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} aria-invalid={!!errors.password} {...register('password')} />
            </Field>
          )}
          {msg && <p role={msg.kind === 'error' ? 'alert' : 'status'} className={msg.kind === 'error' ? 'text-sm font-medium text-expense' : 'text-sm font-medium text-income'}>{msg.text}</p>}
          <button className="btn btn-primary w-full" disabled={busy}>{busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}</button>
        </form>
        <div className="mt-4 flex flex-wrap justify-between gap-2 text-sm">
          {mode === 'signin' ? (
            <>
              <button className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => switchMode('signup')}>Create an account</button>
              <button className="text-sub underline-offset-2 hover:underline" onClick={() => switchMode('reset')}>Forgot password?</button>
            </>
          ) : (
            <button className="font-medium text-primary underline-offset-2 hover:underline" onClick={() => switchMode('signin')}>Back to sign in</button>
          )}
        </div>
      </section>
    </main>
  )
}
