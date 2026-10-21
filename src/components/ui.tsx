import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ')

/* ───────── layout bits ───────── */
/** Eases a number from its previous value to `target`; shows the final value at once if motion is reduced. */
export function useCountUp(target: number, ms = 700) {
  const [v, setV] = useState(target)
  const from = useRef(target)
  useEffect(() => {
    if (from.current === target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) { from.current = target; setV(target); return }
    const start = from.current, t0 = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / ms)
      setV(Math.round(start + (target - start) * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(tick); else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); from.current = target }
  }, [target, ms])
  return v
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="text-sm text-sub">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden="true" />
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <div className="glass mb-1 flex h-14 w-14 animate-[float_6s_ease-in-out_infinite] items-center justify-center rounded-2xl text-primary">{icon}</div>
      <p className="font-semibold">{title}</p>
      {body && <p className="max-w-sm text-sm text-sub">{body}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-expense/40 bg-expense/10 p-3 text-sm backdrop-blur-md">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-expense" aria-hidden="true" />
      <p className="flex-1">{message}</p>
      {onRetry && <button className="font-semibold underline" onClick={onRetry}>Retry</button>}
    </div>
  )
}

export function ProgressBar({ pct, tone = 'primary', label }: { pct: number; tone?: 'primary' | 'warn' | 'expense' | 'income'; label: string }) {
  const color = { primary: 'bg-gradient-to-r from-primary to-violet', warn: 'bg-warn', expense: 'bg-expense', income: 'bg-income' }[tone]
  const v = Math.max(0, Math.min(100, pct))
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(v)} className="h-2.5 w-full overflow-hidden rounded-full bg-fg/10">
      <div className={cx('relative h-full overflow-hidden rounded-full transition-[width] duration-700 ease-out', color)} style={{ width: `${v}%` }}><span className="bar-shine absolute inset-0" aria-hidden="true" /></div>
    </div>
  )
}

export function Badge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'income' | 'expense' | 'warn' }) {
  const t = { muted: 'bg-muted text-sub', income: 'bg-income/15 text-income', expense: 'bg-expense/15 text-expense', warn: 'bg-warn/15 text-warn' }[tone]
  return <span className={cx('inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold', t)}>{children}</span>
}

/* ───────── form bits ───────── */
export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-sub">{hint}</span>}
      {error && <span role="alert" className="mt-1 block text-xs font-medium text-expense">{error}</span>}
    </label>
  )
}

/* ───────── modal (native <dialog>: focus trap, Escape and backdrop handled by the browser) ───────── */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose() }}
      className={cx('m-auto w-[calc(100%-1.5rem)] glass-strong rounded-[1.75rem] p-0', wide ? 'max-w-3xl' : 'max-w-lg')}
    >
      {open && (
        <div className="fade-up max-h-[88vh] overflow-y-auto p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <h2 id="modal-title" className="text-lg font-semibold">{title}</h2>
            <button type="button" className="icon-btn -mr-2 -mt-2" onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

/* ───────── toasts ───────── */
type ToastItem = { id: number; kind: 'ok' | 'error' | 'info'; text: string }
const ToastCtx = createContext<{ ok: (t: string) => void; error: (t: string) => void; info: (t: string) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((kind: ToastItem['kind'], text: string) => {
    const id = Date.now() + Math.random()
    setItems((s) => [...s.slice(-3), { id, kind, text }])
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 3500)
  }, [])
  const api = useRef({ ok: (t: string) => push('ok', t), error: (t: string) => push('error', t), info: (t: string) => push('info', t) })
  return (
    <ToastCtx.Provider value={api.current}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-3 lg:bottom-6" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className="fade-up pointer-events-auto flex max-w-md items-start gap-2 glass-strong rounded-2xl px-4 py-3 text-sm">
            {t.kind === 'ok' ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-income" aria-hidden="true" /> : t.kind === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-expense" aria-hidden="true" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
            <span>{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export function useToast() {
  const v = useContext(ToastCtx)
  if (!v) throw new Error('ToastProvider missing')
  return v
}

/* ───────── confirmation dialog ───────── */
type ConfirmOpts = { title: string; body?: string; confirmText?: string; danger?: boolean }
const ConfirmCtx = createContext<((o: ConfirmOpts) => Promise<boolean>) | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOpts & { resolve: (v: boolean) => void }) | null>(null)
  const ask = useCallback((o: ConfirmOpts) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), [])
  const close = (v: boolean) => { state?.resolve(v); setState(null) }
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title ?? ''}>
        {state?.body && <p className="mb-5 text-sm text-sub">{state.body}</p>}
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => close(false)}>Cancel</button>
          <button className={cx('btn', state?.danger ? 'btn-danger' : 'btn-primary')} onClick={() => close(true)} autoFocus>{state?.confirmText ?? 'Confirm'}</button>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  )
}
export function useConfirm() {
  const v = useContext(ConfirmCtx)
  if (!v) throw new Error('ConfirmProvider missing')
  return v
}

/** Runs an async action with a busy flag and an error toast. */
export function useAction() {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const run = useCallback(async (fn: () => Promise<unknown>, success?: string): Promise<boolean> => {
    setBusy(true)
    try { await fn(); if (success) toast.ok(success); return true }
    catch (e) { toast.error((e as Error).message); return false }
    finally { setBusy(false) }
  }, [toast])
  return { busy, run }
}
