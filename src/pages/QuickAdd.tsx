// Full-screen quick add: note → amount → category → saved. Opened from iPhone Back Tap via a Shortcut that opens #/quick.
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Check, X } from 'lucide-react'
import { useData } from '../data/DataContext'
import { api } from '../data/api'
import { parseMoney } from '../lib/money'
import { transactionSchema } from '../lib/schemas'
import { cx, useCountUp } from '../components/ui'

const QUESTIONS = ['What did you spend on?', 'How much was it?', 'Which category?']

/** Per-word blur-in heading (a CSS port of React Bits' BlurText). Re-keyed per step so it replays. */
function BlurWords({ text }: { text: string }) {
  return (
    <h1 aria-label={text} className="text-[clamp(2.25rem,9vw,4.5rem)] font-extrabold leading-[1.02] tracking-[-0.035em] [text-wrap:balance]">
      {text.split(' ').map((w, i) => (
        <span key={i} aria-hidden="true" className="blur-word inline-block" style={{ animationDelay: `${i * 90}ms` }}>{w}&nbsp;</span>
      ))}
    </h1>
  )
}

function Saved({ amount, label, onAgain }: { amount: number; label: string; onAgain: () => void }) {
  const { fmt } = useData()
  const shown = useCountUp(amount, 900)
  return (
    <div className="page-in flex flex-1 flex-col items-center justify-center text-center">
      <svg viewBox="0 0 96 96" className="spring-check h-28 w-28" aria-hidden="true">
        <circle cx="48" cy="48" r="44" className="fill-income/15 stroke-income" strokeWidth="3" />
        <path d="M30 49 l12 12 l24 -26" fill="none" className="stroke-income" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="tabular mt-6 text-5xl font-extrabold tracking-tight" aria-label={fmt(amount)}>{fmt(shown)}</p>
      <p className="mt-2 text-sub" role="status">Saved under {label}</p>
      <div className="mt-10 flex w-full max-w-xs flex-col gap-3">
        <button className="btn btn-primary h-14 rounded-full text-base" onClick={onAgain} autoFocus>Add another</button>
        <Link className="btn btn-ghost h-14 rounded-full text-base" to="/">Open dashboard</Link>
      </div>
    </div>
  )
}

export default function QuickAdd() {
  const { loading, accounts, categories, transactions, today, prefs, reload } = useData()
  const [step, setStep] = useState(0)
  const [note, setNote] = useState('')
  const [amount, setAmount] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ amount: number; label: string } | null>(null)
  const noteRef = useRef<HTMLInputElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)

  // Most-used expense categories first; account and payment method follow the last expense you entered.
  const cats = useMemo(() => {
    const n = new Map<string, number>()
    for (const t of transactions) if (t.categoryId) n.set(t.categoryId, (n.get(t.categoryId) ?? 0) + 1)
    return categories.filter((c) => c.kind === 'expense' && !c.archived).sort((a, b) => (n.get(b.id) ?? 0) - (n.get(a.id) ?? 0) || a.name.localeCompare(b.name))
  }, [categories, transactions])
  const last = useMemo(() => [...transactions].reverse().find((t) => t.type === 'expense' && accounts.some((a) => a.id === t.accountId && !a.archived)), [transactions, accounts])
  const account = last ? accounts.find((a) => a.id === last.accountId) : accounts.find((a) => !a.archived)
  const symbol = useMemo(() => new Intl.NumberFormat('en-IN', { style: 'currency', currency: prefs.currency }).formatToParts(0).find((p) => p.type === 'currency')?.value ?? '', [prefs.currency])

  // Focus inside the tap handler itself so the iPhone keyboard stays open between steps.
  const toAmount = () => { setErr(''); setStep(1); amountRef.current?.focus({ preventScroll: true }) }
  const toCategory = () => {
    const m = parseMoney(amount)
    if (m === null || m <= 0) { setErr('Enter an amount, like 250 or 1,250.50'); return }
    setErr(''); amountRef.current?.blur(); setStep(2)
  }
  const back = () => { setErr(''); const s = Math.max(0, step - 1); setStep(s); (s === 0 ? noteRef : amountRef).current?.focus({ preventScroll: true }) }
  const again = () => { setSaved(null); setNote(''); setAmount(''); setStep(0); setTimeout(() => noteRef.current?.focus(), 0) }

  async function save(categoryId: string, label: string) {
    if (!account || busy) return
    const v = { type: 'expense' as const, amount, date: today, accountId: account.id, categoryId, paymentMethod: last?.paymentMethod ?? 'upi', description: note.trim(), tags: '' }
    const parsed = transactionSchema.safeParse(v)
    if (!parsed.success) { setErr(parsed.error.issues[0].message); return }
    setBusy(categoryId); setErr('')
    try {
      await api.saveTransaction(parsed.data)
      setSaved({ amount: parseMoney(amount) as number, label })
      void reload('transactions')
    } catch (e) { setErr((e as Error).message) }
    finally { setBusy(null) }
  }

  const panel = (i: number) => cx('absolute inset-0 flex flex-col transition-[transform,opacity] duration-500 ease-[cubic-bezier(.22,1,.36,1)]',
    i === step ? 'translate-x-0 opacity-100' : i < step ? '-translate-x-10 opacity-0 pointer-events-none' : 'translate-x-10 opacity-0 pointer-events-none')

  return (
    <main className="mx-auto flex h-[100vh] h-[100dvh] max-w-xl flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <Link to="/" className="icon-btn glass" aria-label="Close quick add"><X className="h-5 w-5" aria-hidden="true" /></Link>
        {!saved && (
          <ol className="flex items-center gap-2" aria-label={`Step ${step + 1} of 3`}>
            {QUESTIONS.map((_, i) => (
              <li key={i} className={cx('h-2 rounded-full transition-all duration-500 ease-[cubic-bezier(.22,1,.36,1)]', i === step ? 'w-8 bg-gradient-to-r from-primary to-violet' : i < step ? 'w-2 bg-primary' : 'w-2 bg-fg/15')} />
            ))}
          </ol>
        )}
        <span className="w-11" aria-hidden="true" />
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center"><div className="skeleton h-10 w-56" /></div>
      ) : !account ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <p className="text-lg font-bold">Add an account first</p>
          <p className="text-sub">Quick add saves to your most recently used account.</p>
          <Link className="btn btn-primary rounded-full" to="/accounts">Add an account</Link>
        </div>
      ) : saved ? (
        <Saved amount={saved.amount} label={saved.label} onAgain={again} />
      ) : (
        <div className="relative mt-8 flex-1">
          {/* 1. Note */}
          <form className={panel(0)} aria-hidden={step !== 0} onSubmit={(e) => { e.preventDefault(); toAmount() }}>
            {step === 0 && <BlurWords text={QUESTIONS[0]} />}
            <label htmlFor="qa-note" className="sr-only">Note</label>
            <input id="qa-note" ref={noteRef} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} autoFocus enterKeyHint="next" autoComplete="off" tabIndex={step === 0 ? 0 : -1}
              placeholder="Lunch with Riya" className="mt-8 w-full border-0 border-b-2 border-fg/15 bg-transparent pb-3 text-2xl font-semibold outline-none transition-colors placeholder:text-sub/50 focus:border-primary" />
            <button className="btn btn-primary mt-10 h-14 rounded-full text-base" type="submit">{note.trim() ? 'Next' : 'Skip note'}<ArrowRight className="h-5 w-5" aria-hidden="true" /></button>
          </form>

          {/* 2. Amount */}
          <form className={panel(1)} aria-hidden={step !== 1} onSubmit={(e) => { e.preventDefault(); toCategory() }}>
            {step === 1 && <BlurWords text={QUESTIONS[1]} />}
            {note.trim() && <p className="mt-3 truncate text-sub">{note.trim()}</p>}
            <label htmlFor="qa-amount" className="sr-only">Amount</label>
            <div className="mt-8 flex items-baseline gap-2 border-b-2 border-fg/15 pb-2 focus-within:border-primary">
              <span className="text-4xl font-bold text-sub" aria-hidden="true">{symbol}</span>
              <input id="qa-amount" ref={amountRef} value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ''))} inputMode="decimal" enterKeyHint="next" autoComplete="off" tabIndex={step === 1 ? 0 : -1}
                placeholder="0" aria-invalid={!!err} className="tabular w-full min-w-0 border-0 bg-transparent text-[clamp(3.5rem,16vw,6rem)] font-extrabold leading-none tracking-[-0.04em] outline-none placeholder:text-fg/20" />
            </div>
            <p className="mt-3 min-h-[1.5rem] text-sm text-expense" role="alert">{step === 1 ? err : ''}</p>
            <div className="mt-6 flex gap-3">
              <button type="button" className="btn btn-ghost h-14 rounded-full px-6" onClick={back}>Back</button>
              <button className="btn btn-primary h-14 flex-1 rounded-full text-base" type="submit">Next<ArrowRight className="h-5 w-5" aria-hidden="true" /></button>
            </div>
          </form>

          {/* 3. Category: tapping one saves */}
          <section className={panel(2)} aria-hidden={step !== 2}>
            {step === 2 && <BlurWords text={QUESTIONS[2]} />}
            <p className="tabular mt-3 text-sub">{symbol}{amount}{note.trim() ? ` · ${note.trim()}` : ''}</p>
            <div className="-mx-1 mt-6 flex-1 overflow-y-auto px-1 pb-4">
              {cats.length ? (
                <div className="grid grid-cols-2 gap-3">
                  {cats.map((c, i) => (
                    <button key={c.id} type="button" disabled={!!busy || step !== 2} tabIndex={step === 2 ? 0 : -1} onClick={() => save(c.id, c.name)}
                      className={cx('glass-strong chip-in flex min-h-[64px] items-center gap-3 rounded-2xl px-4 text-left font-semibold transition-transform duration-200 active:scale-[0.96]', busy === c.id && 'ring-2 ring-primary')}
                      style={{ animationDelay: step === 2 ? `${120 + i * 35}ms` : '0ms' }}>
                      <span className="h-3.5 w-3.5 shrink-0 rounded-full" style={{ background: c.color }} aria-hidden="true" />
                      <span className="min-w-0 truncate">{c.name}</span>
                      {busy === c.id && <Check className="ml-auto h-4 w-4 animate-pulse text-primary" aria-hidden="true" />}
                    </button>
                  ))}
                  <button type="button" disabled={!!busy || step !== 2} tabIndex={step === 2 ? 0 : -1} onClick={() => save('', 'Uncategorised')}
                    className="chip-in flex min-h-[64px] items-center rounded-2xl border border-dashed border-fg/25 bg-card/40 px-4 text-left font-semibold text-sub" style={{ animationDelay: step === 2 ? `${120 + cats.length * 35}ms` : '0ms' }}>
                    No category
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn-primary w-full rounded-full" onClick={() => save('', 'Uncategorised')} disabled={!!busy}>Save without category</button>
              )}
            </div>
            <p className="min-h-[1.5rem] text-sm text-expense" role="alert">{step === 2 ? err : ''}</p>
            <button type="button" className="btn btn-ghost h-12 rounded-full" onClick={back} disabled={!!busy}>Back</button>
          </section>
        </div>
      )}
    </main>
  )
}
