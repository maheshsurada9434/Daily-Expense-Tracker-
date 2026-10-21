import { Bar, CartesianGrid, ComposedChart, Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from 'recharts'
import { useData } from '../data/DataContext'
import type { MonthRow } from '../lib/finance'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`
export const monthLong = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`

// Chart colours come from the CSS variables so they follow light/dark. Colour is never the only cue:
// the series are also named in the legend, tooltips and the data table below each chart.
const C = { income: 'rgb(var(--income))', expense: 'rgb(var(--expense))', net: 'rgb(var(--primary))', grid: 'rgb(var(--border))', axis: 'rgb(var(--sub))' }

const compact = (minor: number) => {
  const v = Math.abs(minor / 100)
  const s = v >= 1e7 ? `${+(v / 1e7).toFixed(1)}Cr` : v >= 1e5 ? `${+(v / 1e5).toFixed(1)}L` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}k` : String(Math.round(v))
  return (minor < 0 ? '-' : '') + s
}

export function TrendChart({ rows }: { rows: MonthRow[] }) {
  const { fmt } = useData()
  const data = rows.map((r) => ({ name: monthLabel(r.month), Income: r.income, Expenses: r.expenses, Net: r.net }))
  return (
    <>
      <div className="h-64 w-full" role="img" aria-label="Monthly income, expenses and net cash flow">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="name" tick={{ fill: C.axis, fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: C.axis, fontSize: 12 }} tickLine={false} axisLine={false} width={52} tickFormatter={compact} />
            <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar dataKey="Income" fill={C.income} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Bar dataKey="Expenses" fill={C.expense} radius={[4, 4, 0, 0]} maxBarSize={28} />
            <Line dataKey="Net" stroke={C.net} strokeWidth={2} dot={{ r: 3 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Monthly income, expenses and net</caption>
        <thead><tr><th>Month</th><th>Income</th><th>Expenses</th><th>Net</th></tr></thead>
        <tbody>{data.map((d) => <tr key={d.name}><td>{d.name}</td><td>{fmt(d.Income)}</td><td>{fmt(d.Expenses)}</td><td>{fmt(d.Net)}</td></tr>)}</tbody>
      </table>
    </>
  )
}

export type Slice = { name: string; value: number; color: string }

export function CategoryDonut({ slices }: { slices: Slice[] }) {
  const { fmt } = useData()
  const total = slices.reduce((a, s) => a + s.value, 0)
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-48 w-48 shrink-0" role="img" aria-label="Spending by category">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={slices} dataKey="value" nameKey="name" innerRadius={52} outerRadius={84} paddingAngle={2} stroke="none">
              {slices.map((s) => <Cell key={s.name} fill={s.color} />)}
            </Pie>
            <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 8 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2 text-sm">
        {slices.map((s) => (
          <li key={s.name} className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{s.name}</span>
            <span className="tabular text-sub">{total ? Math.round((s.value / total) * 100) : 0}%</span>
            <span className="tabular w-24 text-right font-medium">{fmt(s.value, { decimals: false })}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CashFlowLine({ rows }: { rows: { name: string; balance: number }[] }) {
  const { fmt } = useData()
  return (
    <div className="h-56 w-full" role="img" aria-label="Cumulative net cash flow">
      <ResponsiveContainer>
        <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: C.axis, fontSize: 12 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: C.axis, fontSize: 12 }} tickLine={false} axisLine={false} width={52} tickFormatter={compact} />
          <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: 'rgb(var(--card))', border: '1px solid rgb(var(--border))', borderRadius: 8 }} />
          <Line dataKey="balance" name="Cumulative net" stroke={C.net} strokeWidth={2} dot={{ r: 3 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
