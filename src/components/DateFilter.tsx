import { PRESET_LABELS, type PresetId, type Range } from '../lib/dates'
import { Field } from './ui'

export type PresetValue = PresetId | 'custom'

/** Preset dropdown plus custom from/to dates. Used on the dashboard and the transactions list. */
export default function DateFilter({ preset, onPreset, custom, onCustom }: { preset: PresetValue; onPreset: (p: PresetValue) => void; custom: Range; onCustom: (r: Range) => void }) {
  return (
    <>
      <Field label="Period">
        <select className="input" value={preset} onChange={(e) => onPreset(e.target.value as PresetValue)}>
          {(Object.keys(PRESET_LABELS) as PresetId[]).map((k) => <option key={k} value={k}>{PRESET_LABELS[k]}</option>)}
          <option value="custom">Custom range</option>
        </select>
      </Field>
      {preset === 'custom' && (
        <>
          <Field label="From"><input className="input" type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && onCustom({ ...custom, from: e.target.value })} /></Field>
          <Field label="To"><input className="input" type="date" value={custom.to} min={custom.from} onChange={(e) => e.target.value && onCustom({ ...custom, to: e.target.value })} /></Field>
        </>
      )}
    </>
  )
}
