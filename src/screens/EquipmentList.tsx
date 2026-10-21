import { useState } from 'react'
import { useApp } from '../lib/store'
import { currentProcedure, equipmentState, matches, openDefects, plural, procedureReviewState } from '../lib/rules'
import { Card, Empty } from '../components/ui'
import { EquipmentRow } from '../components/rows'

type StateFilter = 'all' | 'running' | 'lotoActive' | 'outOfService' | 'attention'
const FILTERS: [StateFilter, string][] = [['all', 'Vše'], ['running', 'Provoz'], ['lotoActive', 'LOTO aktivní'], ['outOfService', 'Mimo provoz'], ['attention', 'Vyžaduje pozornost']]

export default function EquipmentList() {
  const app = useApp()
  const [text, setText] = useState('')
  const [workplace, setWorkplace] = useState<string | null>(null)
  const [state, setState] = useState<StateFilter>('all')
  const workplaces = app.workplaces.filter((w) => !app.siteId || w.site_id === app.siteId)

  const items = app.scopedEquipment.filter((e) => {
    if (workplace && e.workplace_id !== workplace) return false
    const wpName = app.workplaces.find((w) => w.id === e.workplace_id)?.name
    if (!matches([e.name, e.code, e.manufacturer, e.equipment_type, e.asset_number, wpName], text)) return false
    if (state === 'all') return true
    if (state === 'attention') {
      const p = currentProcedure(app.procedures, e.id)
      const severe = openDefects(app.defects, e.id).some((d) => d.severity === 'major' || d.severity === 'critical')
      return !p || p.status !== 'approved' || procedureReviewState(p) !== 'onTime' || severe
    }
    return equipmentState(e, app.lotos) === state
  })

  return (
    <div className="page">
      <div className="topbar"><h1>Zařízení</h1></div>
      <input className="input" type="search" placeholder="Název, kód, výrobce…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Hledat zařízení" />
      {workplaces.length > 0 && (
        <div className="chips">
          <button className={`chip ${!workplace ? 'on' : ''}`} onClick={() => setWorkplace(null)}>Všechna pracoviště</button>
          {workplaces.map((w) => <button key={w.id} className={`chip ${workplace === w.id ? 'on' : ''}`} onClick={() => setWorkplace(workplace === w.id ? null : w.id)}>{w.name}</button>)}
        </div>
      )}
      <div className="chips">
        {FILTERS.map(([k, label]) => <button key={k} className={`chip ${state === k ? 'on' : ''}`} onClick={() => setState(k)}>{label}</button>)}
      </div>
      <div className="tiny">{app.contextLine}</div>
      <Card tight>
        {items.length === 0 && <Empty title="Žádné zařízení neodpovídá filtru" text="Zkuste změnit hledaný text, pracoviště nebo stav." />}
        {items.map((e) => <EquipmentRow key={e.id} e={e} lotos={app.lotos} procedures={app.procedures} defects={app.defects} />)}
      </Card>
      <div className="tiny center">{plural(items.length, 'zařízení', 'zařízení', 'zařízení')}</div>
    </div>
  )
}
