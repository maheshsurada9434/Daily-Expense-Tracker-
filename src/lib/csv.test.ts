import { describe, expect, it } from 'vitest'
import { markDuplicates, parseCsv, planImport, toCsv, transactionsToCsv } from './csv'

const ctx = {
  accounts: [{ id: 'a1', name: 'Cash' }, { id: 'a2', name: 'HDFC' }],
  categories: [{ id: 'c1', name: 'Food', kind: 'expense' as const }, { id: 'c2', name: 'Salary', kind: 'income' as const }],
}

describe('csv parser', () => {
  it('handles quotes, commas, newlines and BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","he said ""hi"""\n"line\nbreak",z\n')).toEqual([['a', 'b'], ['x, y', 'he said "hi"'], ['line\nbreak', 'z']])
  })
  it('skips blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n')).toEqual([['a', 'b'], ['1', '2']])
  })
  it('escapes on export and blocks spreadsheet formulas', () => {
    expect(toCsv([['=SUM(A1)', 'a,b', 'q"q', 5]])).toBe('\'=SUM(A1),"a,b","q""q",5\r\n')
  })
})

describe('import validation', () => {
  const head = 'Date,Type,Amount,Category,Account,Description\n'
  it('accepts good rows and resolves names', () => {
    const p = planImport(head + '05/10/2026,expense,"1,250.50",food,hdfc,Lunch\n01/10/2026,income,50000,Salary,Cash,Pay', ctx)
    expect(p.issues).toEqual([])
    expect(p.rows[0]).toMatchObject({ date: '2026-10-05', amount: 125050, accountId: 'a2', categoryId: 'c1' })
    expect(p.rows[1]).toMatchObject({ type: 'income', amount: 5000000, categoryId: 'c2' })
  })
  it('reports each bad row with its line number', () => {
    const p = planImport(head + '31/02/2026,expense,10,Food,Cash,x\n05/10/2026,gift,10,Food,Cash,x\n05/10/2026,expense,-5,Food,Cash,x\n05/10/2026,expense,5,Food,Bank?,x\n05/10/2026,expense,5.001,Food,Cash,x', ctx)
    expect(p.rows).toHaveLength(0)
    expect(p.issues.map((i) => i.line)).toEqual([2, 3, 4, 5, 6])
  })
  it('lists categories that will be created', () => {
    const p = planImport(head + '05/10/2026,expense,10,Pets,Cash,x', ctx)
    expect(p.newCategories).toEqual([{ name: 'Pets', kind: 'expense' }])
    expect(p.rows[0].categoryId).toBeNull()
  })
  it('requires the core columns and caps the size', () => {
    expect(planImport('Date,Amount\n1,2', ctx).issues[0].message).toMatch(/type/)
    expect(planImport('', ctx).issues).toHaveLength(1)
  })
  it('exports then re-imports to the same rows', () => {
    const csv = transactionsToCsv([{ date: '2026-10-05', type: 'expense', amount: 125050, category: 'Food', account: 'Cash', paymentMethod: 'upi', description: 'Lunch, with team', tags: ['work', 'team'] }])
    const p = planImport(csv, ctx)
    expect(p.issues).toEqual([])
    expect(p.rows[0]).toMatchObject({ amount: 125050, description: 'Lunch, with team', paymentMethod: 'upi', tags: ['work', 'team'] })
  })
})

describe('duplicate detection', () => {
  const rows = planImport('date,type,amount,account,description\n05/10/2026,expense,50,Cash,Tea\n05/10/2026,expense,50,Cash,Tea\n06/10/2026,expense,50,Cash,Tea', ctx).rows
  it('keeps two identical rows in one file distinct', async () => {
    const m = await markDuplicates(rows, new Set())
    expect(new Set(m.map((r) => r.hash)).size).toBe(3)
    expect(m.every((r) => !r.duplicate)).toBe(true)
  })
  it('flags every row on a second import of the same file', async () => {
    const first = await markDuplicates(rows, new Set())
    const second = await markDuplicates(rows, new Set(first.map((r) => r.hash)))
    expect(second.every((r) => r.duplicate)).toBe(true)
  })
  it('only flags the genuinely new row when the file grew', async () => {
    const first = await markDuplicates(rows.slice(0, 2), new Set())
    const again = await markDuplicates(rows, new Set(first.map((r) => r.hash)))
    expect(again.map((r) => r.duplicate)).toEqual([true, true, false])
  })
})
