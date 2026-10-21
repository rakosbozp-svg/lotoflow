import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus, Trash2 } from 'lucide-react'
import { useApp, useCtx } from '../lib/store'
import { ENERGY_TITLE, ENERGY_TYPES, currentProcedure, energySignature } from '../lib/rules'
import { saveEquipment, type EquipmentDraft } from '../lib/api'
import type { EnergyType } from '../lib/types'
import { Banner, Button, Card, Empty, ErrorBox, SectionHeader, TopBar, useAction } from '../components/ui'

export default function EquipmentEditor() {
  const { id } = useParams()
  const app = useApp()
  const ctx = useCtx()
  const navigate = useNavigate()
  const act = useAction()
  const existing = id === 'new' ? null : app.equipment.find((e) => e.id === id) ?? null
  const [d, setD] = useState<EquipmentDraft>(() => existing ? {
    name: existing.name, code: existing.code, manufacturer: existing.manufacturer, equipment_type: existing.equipment_type,
    asset_number: existing.asset_number, site_id: existing.site_id, workplace_id: existing.workplace_id,
    out_of_service: existing.out_of_service, energy_sources: existing.energy_sources.map((s) => ({ ...s })),
  } : {
    name: '', code: '', manufacturer: '', equipment_type: '', asset_number: '', site_id: app.siteId ?? app.profile?.site_id ?? app.sites[0]?.id ?? null,
    workplace_id: null, out_of_service: false, energy_sources: [],
  })
  if (app.profile?.role !== 'hse') return <div className="page"><TopBar title="Zařízení" /><Empty title="K této akci nemáte oprávnění" /></div>
  if (id !== 'new' && !existing) return <div className="page"><TopBar title="Zařízení" /><Empty title="Zařízení nenalezeno" /></div>

  const set = <K extends keyof EquipmentDraft>(k: K, v: EquipmentDraft[K]) => setD({ ...d, [k]: v })
  const p = existing ? currentProcedure(app.procedures, existing.id) : undefined
  const energyChanged = existing && energySignature(existing.energy_sources) !== energySignature(d.energy_sources)
  const affectsApproval = energyChanged && p && (p.status === 'approved' || p.status === 'pendingApproval')
  const text = (label: string, k: 'name' | 'code' | 'manufacturer' | 'equipment_type' | 'asset_number', mono = false) => (
    <div className="field"><label>{label}</label><input className={`input ${mono ? 'mono' : ''}`} value={d[k]} onChange={(e) => set(k, k === 'code' ? e.target.value.toUpperCase() : e.target.value)} /></div>
  )

  return (
    <div className="page">
      <TopBar title={existing ? 'Upravit zařízení' : 'Nové zařízení'} />
      <Card>
        {text('Název', 'name')}{text('Kód (např. MIX-004)', 'code', true)}{text('Výrobce', 'manufacturer')}{text('Typ', 'equipment_type')}{text('Inventární číslo', 'asset_number', true)}
        <label className="check"><input type="checkbox" checked={d.out_of_service} onChange={(e) => set('out_of_service', e.target.checked)} /> Mimo provoz</label>
      </Card>
      <SectionHeader title="Umístění" />
      <Card>
        <div className="field"><label>Závod</label>
          <select className="input" value={d.site_id ?? ''} onChange={(e) => setD({ ...d, site_id: e.target.value || null, workplace_id: null })}>
            <option value="">Vyberte</option>{app.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Pracoviště</label>
          <select className="input" value={d.workplace_id ?? ''} onChange={(e) => set('workplace_id', e.target.value || null)}>
            <option value="">Žádné</option>{app.workplaces.filter((w) => w.site_id === d.site_id).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
      </Card>
      <SectionHeader title="Zdroje nebezpečné energie" />
      {d.energy_sources.map((s, i) => (
        <Card key={i}>
          <div className="row">
            <select className="input" value={s.type} onChange={(e) => set('energy_sources', d.energy_sources.map((x, j) => j === i ? { ...x, type: e.target.value as EnergyType } : x))}>
              {ENERGY_TYPES.map((t) => <option key={t} value={t}>{ENERGY_TITLE[t]}</option>)}
            </select>
            <button className="icon-btn" aria-label="Odebrat" onClick={() => set('energy_sources', d.energy_sources.filter((_, j) => j !== i))}><Trash2 size={18} color="var(--danger)" /></button>
          </div>
          <input className="input" placeholder="Parametry (např. 400 V AC, 6 bar)" value={s.magnitude} onChange={(e) => set('energy_sources', d.energy_sources.map((x, j) => j === i ? { ...x, magnitude: e.target.value } : x))} />
          <input className="input" placeholder="Poznámka" value={s.note} onChange={(e) => set('energy_sources', d.energy_sources.map((x, j) => j === i ? { ...x, note: e.target.value } : x))} />
        </Card>
      ))}
      <Button variant="secondary" onClick={() => set('energy_sources', [...d.energy_sources, { type: 'electrical', magnitude: '', note: '' }])}><Plus size={18} /> Přidat zdroj energie</Button>
      {affectsApproval && <Banner title="Změna zdrojů energie převede schválený postup do stavu Vyžaduje revizi." />}
      <ErrorBox message={act.error} />
      <Button disabled={act.busy} onClick={() => act.run(async () => {
        const saved = await saveEquipment(ctx, existing, d, app.procedures)
        await app.refresh()
        navigate(`/equipment/${saved.id}`, { replace: true })
      })}>{act.busy ? 'Ukládám…' : 'Uložit'}</Button>
    </div>
  )
}
