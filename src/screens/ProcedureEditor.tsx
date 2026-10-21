import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useApp, useCtx } from '../lib/store'
import { ENERGY_TITLE, ENERGY_TYPES, currentProcedure, uid } from '../lib/rules'
import { saveProcedure, uploadPhoto, type ProcedureDraft } from '../lib/api'
import type { EnergyType, IsolationPoint } from '../lib/types'
import { Button, Card, Empty, ErrorBox, Photo, PhotoInput, SectionHeader, TopBar, useAction } from '../components/ui'

function move<T>(list: T[], i: number, d: number): T[] {
  const j = i + d
  if (j < 0 || j >= list.length) return list
  const copy = [...list]
  ;[copy[i], copy[j]] = [copy[j], copy[i]]
  return copy
}

function Reorder({ onUp, onDown, onDelete }: { onUp: () => void; onDown: () => void; onDelete: () => void }) {
  return (
    <div className="row" style={{ gap: 4 }}>
      <button className="icon-btn" style={{ width: 40, height: 40 }} aria-label="Posunout nahoru" onClick={onUp}><ArrowUp size={18} /></button>
      <button className="icon-btn" style={{ width: 40, height: 40 }} aria-label="Posunout dolů" onClick={onDown}><ArrowDown size={18} /></button>
      <button className="icon-btn" style={{ width: 40, height: 40 }} aria-label="Odebrat" onClick={onDelete}><Trash2 size={18} color="var(--danger)" /></button>
    </div>
  )
}

export default function ProcedureEditor() {
  const { equipmentId } = useParams()
  const app = useApp()
  const ctx = useCtx()
  const navigate = useNavigate()
  const act = useAction()
  const e = app.equipment.find((x) => x.id === equipmentId)
  const existing = e ? currentProcedure(app.procedures, e.id) ?? null : null
  const [d, setD] = useState<ProcedureDraft>(() => existing ? {
    name: existing.name, review_interval_months: existing.review_interval_months, ppe: [...existing.ppe],
    preparation: existing.preparation.map((s) => ({ ...s })), points: existing.points.map((p) => ({ ...p })), restoration: [...existing.restoration],
  } : {
    name: e ? `LOTO postup – ${e.name}` : '', review_interval_months: 12, ppe: [], preparation: [],
    points: (e?.energy_sources ?? []).map((s, i) => ({ id: uid(), code: `P${String(i + 1).padStart(2, '0')}`, name: '', energy: s.type, location: '', method: '', lock: '', verification: '', photo_path: null })),
    restoration: [],
  })
  const [summary, setSummary] = useState('')
  const [photos, setPhotos] = useState<Record<string, File | null>>({})
  const [newPPE, setNewPPE] = useState('')
  if (app.profile?.role !== 'hse') return <div className="page"><TopBar title="LOTO postup" /><Empty title="K této akci nemáte oprávnění" /></div>
  if (!e) return <div className="page"><TopBar title="LOTO postup" /><Empty title="Zařízení nenalezeno" /></div>

  const setPoint = (i: number, patch: Partial<IsolationPoint>) => setD({ ...d, points: d.points.map((p, j) => j === i ? { ...p, ...patch } : p) })

  const save = () => act.run(async () => {
    const points = await Promise.all(d.points.map(async (p) => photos[p.id] ? { ...p, photo_path: await uploadPhoto(ctx, photos[p.id]!) } : p))
    const saved = await saveProcedure(ctx, existing, e, { ...d, points }, summary)
    await app.refresh()
    navigate(`/procedure/${saved.id}`, { replace: true })
  })

  return (
    <div className="page">
      <TopBar title={existing ? 'Upravit LOTO postup' : 'Vytvořit LOTO postup'} />
      <Card>
        <div className="field"><label>Název postupu</label><input className="input" value={d.name} onChange={(ev) => setD({ ...d, name: ev.target.value })} /></div>
        <div className="field"><label>Interval revize (měsíce)</label><input className="input" type="number" min={1} max={36} value={d.review_interval_months} onChange={(ev) => setD({ ...d, review_interval_months: Number(ev.target.value) || 12 })} /></div>
        {existing && <div className="tiny">Aktuální revize {existing.revision}. Uložením vznikne revize {existing.revision + 1}, kterou je nutné znovu schválit.</div>}
      </Card>

      <SectionHeader title="Osobní ochranné prostředky" />
      <Card>
        {d.ppe.map((x, i) => (
          <div key={i} className="row"><span className="grow">{x}</span><Reorder onUp={() => setD({ ...d, ppe: move(d.ppe, i, -1) })} onDown={() => setD({ ...d, ppe: move(d.ppe, i, 1) })} onDelete={() => setD({ ...d, ppe: d.ppe.filter((_, j) => j !== i) })} /></div>
        ))}
        <div className="row">
          <input className="input" placeholder="Nový ochranný prostředek" value={newPPE} onChange={(ev) => setNewPPE(ev.target.value)} />
          <button className="icon-btn" aria-label="Přidat" disabled={!newPPE.trim()} onClick={() => { setD({ ...d, ppe: [...d.ppe, newPPE.trim()] }); setNewPPE('') }}><Plus /></button>
        </div>
      </Card>

      <SectionHeader title="Přípravné kroky" />
      {d.preparation.map((s, i) => (
        <Card key={i}>
          <div className="row"><b className="grow">Krok {i + 1}</b><Reorder onUp={() => setD({ ...d, preparation: move(d.preparation, i, -1) })} onDown={() => setD({ ...d, preparation: move(d.preparation, i, 1) })} onDelete={() => setD({ ...d, preparation: d.preparation.filter((_, j) => j !== i) })} /></div>
          <input className="input" placeholder="Název kroku" value={s.title} onChange={(ev) => setD({ ...d, preparation: d.preparation.map((x, j) => j === i ? { ...x, title: ev.target.value } : x) })} />
          <textarea className="input" placeholder="Podrobný pokyn" value={s.detail} onChange={(ev) => setD({ ...d, preparation: d.preparation.map((x, j) => j === i ? { ...x, detail: ev.target.value } : x) })} />
        </Card>
      ))}
      <Button variant="secondary" onClick={() => setD({ ...d, preparation: [...d.preparation, { title: '', detail: '' }] })}><Plus size={18} /> Přidat přípravný krok</Button>

      <SectionHeader title="Izolační body" />
      <div className="tiny">Pořadí bodů určuje pořadí izolace v průvodci.</div>
      {d.points.map((p, i) => (
        <Card key={p.id}>
          <div className="row"><b className="grow">Bod {i + 1}</b><Reorder onUp={() => setD({ ...d, points: move(d.points, i, -1) })} onDown={() => setD({ ...d, points: move(d.points, i, 1) })} onDelete={() => setD({ ...d, points: d.points.filter((_, j) => j !== i) })} /></div>
          <div className="btn-row">
            <input className="input mono" placeholder="Kód (Q01)" value={p.code} onChange={(ev) => setPoint(i, { code: ev.target.value.toUpperCase() })} />
            <select className="input" value={p.energy} onChange={(ev) => setPoint(i, { energy: ev.target.value as EnergyType })}>
              {ENERGY_TYPES.map((t) => <option key={t} value={t}>{ENERGY_TITLE[t]}</option>)}
            </select>
          </div>
          <input className="input" placeholder="Název bodu" value={p.name} onChange={(ev) => setPoint(i, { name: ev.target.value })} />
          <input className="input" placeholder="Umístění" value={p.location} onChange={(ev) => setPoint(i, { location: ev.target.value })} />
          <input className="input" placeholder="Metoda izolace" value={p.method} onChange={(ev) => setPoint(i, { method: ev.target.value })} />
          <input className="input" placeholder="Požadovaný zámek" value={p.lock} onChange={(ev) => setPoint(i, { lock: ev.target.value })} />
          <input className="input" placeholder="Ověření" value={p.verification} onChange={(ev) => setPoint(i, { verification: ev.target.value })} />
          <div className="tiny">Referenční fotografie</div>
          {p.photo_path && !photos[p.id] && <Photo path={p.photo_path} height={120} />}
          <PhotoInput file={photos[p.id] ?? null} onChange={(f) => setPhotos({ ...photos, [p.id]: f })} />
        </Card>
      ))}
      <Button variant="secondary" onClick={() => setD({ ...d, points: [...d.points, { id: uid(), code: `P${String(d.points.length + 1).padStart(2, '0')}`, name: '', energy: 'electrical', location: '', method: '', lock: '', verification: '', photo_path: null }] })}><Plus size={18} /> Přidat izolační bod</Button>

      <SectionHeader title="Specifické kroky obnovení" />
      {d.restoration.map((s, i) => (
        <div key={i} className="row">
          <input className="input" value={s} onChange={(ev) => setD({ ...d, restoration: d.restoration.map((x, j) => j === i ? ev.target.value : x) })} />
          <Reorder onUp={() => setD({ ...d, restoration: move(d.restoration, i, -1) })} onDown={() => setD({ ...d, restoration: move(d.restoration, i, 1) })} onDelete={() => setD({ ...d, restoration: d.restoration.filter((_, j) => j !== i) })} />
        </div>
      ))}
      <Button variant="secondary" onClick={() => setD({ ...d, restoration: [...d.restoration, ''] })}><Plus size={18} /> Přidat krok obnovení</Button>

      <SectionHeader title="Popis změny" />
      <input className="input" placeholder="Co se v této revizi změnilo" value={summary} onChange={(ev) => setSummary(ev.target.value)} />
      <div className="tiny">Každá uložená změna vytvoří novou revizi postupu.</div>
      <ErrorBox message={act.error} />
      <Button disabled={act.busy} onClick={save}>{act.busy ? 'Ukládám…' : 'Uložit'}</Button>
    </div>
  )
}
