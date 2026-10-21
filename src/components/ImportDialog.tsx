import { useState } from 'react'
import { FileUp } from 'lucide-react'
import { useData } from '../data/DataContext'
import { api } from '../data/api'
import { MAX_IMPORT_BYTES, markDuplicates, planImport, type ImportPlan, type ImportRow } from '../lib/csv'
import { Badge, Modal, useAction, useToast } from './ui'

type Preview = { plan: ImportPlan; rows: (ImportRow & { hash: string; duplicate: boolean })[] }

/** Choose a CSV, see exactly what will happen (new / duplicate / invalid rows), then confirm. Nothing is saved before that. */
export default function ImportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { accounts, categories, transactions, reload, fmt } = useData()
  const { busy, run } = useAction()
  const toast = useToast()
  const [preview, setPreview] = useState<Preview | null>(null)
  const [fileName, setFileName] = useState('')

  const close = () => { setPreview(null); setFileName(''); onClose() }

  async function onFile(f: File | undefined) {
    if (!f) return
    if (f.size > MAX_IMPORT_BYTES) { toast.error('That file is larger than 1 MB.'); return }
    setFileName(f.name)
    const text = await f.text()
    const plan = planImport(text, { accounts: accounts.filter((a) => !a.archived), categories: categories.filter((c) => !c.archived) })
    const existing = new Set(transactions.map((t) => t.importHash).filter((h): h is string => !!h))
    setPreview({ plan, rows: await markDuplicates(plan.rows, existing) })
  }

  const fresh = preview?.rows.filter((r) => !r.duplicate) ?? []
  const dupes = (preview?.rows.length ?? 0) - fresh.length

  async function confirm() {
    if (!preview) return
    const ok = await run(async () => {
      const ids = await api.createCategories(preview.plan.newCategories)
      const added = await api.importTransactions(fresh, ids)
      await reload('transactions', 'categories')
      toast.ok(`Imported ${added} transaction${added === 1 ? '' : 's'}`)
    })
    if (ok) close()
  }

  return (
    <Modal open={open} onClose={close} title="Import transactions from CSV" wide>
      <div className="space-y-4 text-sm">
        <p className="text-sub">Columns: <code>date, type, amount, category, account, payment_method, description, tags</code>. Dates can be DD/MM/YYYY or YYYY-MM-DD. Type is income, expense or refund. Accounts must already exist. Up to 2,000 rows.</p>
        <label className="btn btn-ghost w-full cursor-pointer sm:w-auto">
          <FileUp className="h-4 w-4" aria-hidden="true" /> {fileName || 'Choose a CSV file'}
          <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = '' }} />
        </label>

        {preview && (
          <>
            <div className="flex flex-wrap gap-2" role="status">
              <Badge tone="income">{fresh.length} new</Badge>
              <Badge tone="warn">{dupes} already imported</Badge>
              <Badge tone={preview.plan.issues.length ? 'expense' : 'muted'}>{preview.plan.issues.length} with problems</Badge>
            </div>
            {preview.plan.newCategories.length > 0 && <p className="text-sub">New categories to create: {preview.plan.newCategories.map((c) => c.name).join(', ')}</p>}
            {preview.plan.issues.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded-lg border border-expense/40 bg-expense/10 p-3">
                <p className="mb-1 font-semibold">These rows will be skipped:</p>
                <ul className="space-y-0.5">{preview.plan.issues.slice(0, 50).map((i, k) => <li key={k}>{i.line ? `Line ${i.line}: ` : ''}{i.message}</li>)}</ul>
              </div>
            )}
            {preview.rows.length > 0 && (
              <div className="max-h-64 overflow-auto rounded-lg border border-border">
                <table className="w-full text-left">
                  <thead className="sticky top-0 bg-muted text-xs text-sub"><tr><th className="p-2">Date</th><th className="p-2">Type</th><th className="p-2 text-right">Amount</th><th className="p-2">Account</th><th className="p-2">Description</th><th className="p-2">Status</th></tr></thead>
                  <tbody>
                    {preview.rows.slice(0, 100).map((r) => (
                      <tr key={r.hash} className="border-t border-border">
                        <td className="p-2 tabular">{r.date}</td><td className="p-2 capitalize">{r.type}</td><td className="tabular p-2 text-right">{fmt(r.amount)}</td>
                        <td className="p-2">{r.accountName}</td><td className="max-w-[12rem] truncate p-2">{r.description}</td>
                        <td className="p-2">{r.duplicate ? <Badge tone="warn">Duplicate</Badge> : <Badge tone="income">New</Badge>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.rows.length > 100 && <p className="p-2 text-xs text-sub">Showing the first 100 of {preview.rows.length} rows.</p>}
              </div>
            )}
          </>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={close}>Cancel</button>
          <button className="btn btn-primary" disabled={busy || fresh.length === 0} onClick={confirm}>{busy ? 'Importing…' : `Import ${fresh.length} transaction${fresh.length === 1 ? '' : 's'}`}</button>
        </div>
      </div>
    </Modal>
  )
}
