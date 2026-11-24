import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { useApp, useCtx } from '../lib/store'
import { ENERGY_TITLE, ENERGY_TYPES, currentProcedure, isAutoCode, isLockable, nextPointCode, uid } from '../lib/rules'
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
    overview_photo_path: existing.overview_photo_path ?? null,
  } : {
    name: e ? `LOTO postup – ${e.name}` : '', review_interval_months: 36, ppe: [], preparation: [],
    points: (e?.energy_sources ?? []).reduce<IsolationPoint[]>((acc, s) => [...acc, {
      id: uid(), code: nextPointCode(s.type, acc.map((p) => p.code)), name: '', energy: s.type, location: '', method: '', lock: '', verification: '', photo_path: null,
    }], []),
    restoration: [], overview_photo_path: null,
  })
  const [overview, setOverview] = useState<File | null>(null)
  const [summary, setSummary] = useState('')
  const [photos, setPhotos] = useState<Record<string, File | null>>({})
  const [newPPE, setNewPPE] = useState('')
  if (app.profile?.role !== 'hse') return <div className="page"><TopBar title="LOTO postup" /><Empty title="K této akci nemáte oprávnění" /></div>
  if (!e) return <div className="page"><TopBar title="LOTO postup" /><Empty title="Zařízení nenalezeno" /></div>

  const setPoint = (i: number, patch: Partial<IsolationPoint>) => setD({ ...d, points: d.points.map((p, j) => j === i ? { ...p, ...patch } : p) })
  const setEnergy = (i: number, energy: EnergyType) => {
    const p = d.points[i]
    const others = d.points.filter((_, j) => j !== i).map((x) => x.code)
    setPoint(i, { energy, code: !p.code.trim() || isAutoCode(p.code) ? nextPointCode(energy, others) : p.code })
  }

  const save = () => act.run(async () => {
    const points = await Promise.all(d.points.map(async (p) => photos[p.id] ? { ...p, photo_path: await uploadPhoto(ctx, photos[p.id]!) } : p))
    const overview_photo_path = overview ? await uploadPhoto(ctx, overview) : d.overview_photo_path
    const saved = await saveProcedure(ctx, existing, e, { ...d, points, overview_photo_path }, summary)
    await app.refresh()
    navigate(`/procedure/${saved.id}`, { replace: true })
  })

  return (
    <div className="page">
      <TopBar title={existing ? 'Upravit LOTO postup' : 'Vytvořit LOTO postup'} />
      <Card>
        <div className="field"><label>Název postupu</label><input className="input" value={d.name} onChange={(ev) => setD({ ...d, name: ev.target.value })} /></div>
        <div className="field"><label>Interval revize (měsíce, nejvýše 36)</label><input className="input" type="number" min={1} max={36} value={d.review_interval_months} onChange={(ev) => setD({ ...d, review_interval_months: Math.min(36, Number(ev.target.value) || 36) })} /></div>
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

      <SectionHeader title="Přehledová fotografie nebo nákres" />
      <Card>
        <div className="tiny">Celkový pohled na zařízení, na kterém je vidět poloha všech izolačních bodů a jejich kódy. Tiskne se na kartu k zařízení.</div>
        {d.overview_photo_path && !overview && <Photo path={d.overview_photo_path} height={160} />}
        <PhotoInput file={overview} onChange={setOverview} />
      </Card>

      <SectionHeader title="Upozornění a kroky před zajištěním" />
      <div className="tiny">Označená upozornění se na kartě tisknou v červeném rámečku, ostatní kroky jako „Před zajištěním“.</div>
      {d.preparation.map((s, i) => (
        <Card key={i}>
          <div className="row"><b className="grow">Krok {i + 1}</b><Reorder onUp={() => setD({ ...d, preparation: move(d.preparation, i, -1) })} onDown={() => setD({ ...d, preparation: move(d.preparation, i, 1) })} onDelete={() => setD({ ...d, preparation: d.preparation.filter((_, j) => j !== i) })} /></div>
          <input className="input" placeholder="Název kroku" value={s.title} onChange={(ev) => setD({ ...d, preparation: d.preparation.map((x, j) => j === i ? { ...x, title: ev.target.value } : x) })} />
          <textarea className="input" placeholder="Podrobný pokyn" value={s.detail} onChange={(ev) => setD({ ...d, preparation: d.preparation.map((x, j) => j === i ? { ...x, detail: ev.target.value } : x) })} />
          <label className="check"><input type="checkbox" checked={!!s.warning} onChange={(ev) => setD({ ...d, preparation: d.preparation.map((x, j) => j === i ? { ...x, warning: ev.target.checked } : x) })} /><span>Upozornění na specifické riziko</span></label>
        </Card>
      ))}
      <Button variant="secondary" onClick={() => setD({ ...d, preparation: [...d.preparation, { title: '', detail: '' }] })}><Plus size={18} /> Přidat přípravný krok</Button>

      <SectionHeader title="Izolační body" />
      <div className="tiny">Pořadí bodů určuje pořadí izolace v průvodci i na kartě. Kód = písmeno energie a číslo (E1 elektro, P1 vzduch, H1 hydraulika, W1 voda a média, G1 plyn, M1 mechanické a gravitační zajištění). Při více uzamykacích bodech se body zamykají terénními zámky a klíče jdou do LOTO boxu.</div>
      {d.points.map((p, i) => (
        <Card key={p.id}>
          <div className="row"><b className="grow">Bod {i + 1}</b><Reorder onUp={() => setD({ ...d, points: move(d.points, i, -1) })} onDown={() => setD({ ...d, points: move(d.points, i, 1) })} onDelete={() => setD({ ...d, points: d.points.filter((_, j) => j !== i) })} /></div>
          <div className="btn-row">
            <input className="input mono" placeholder="Kód (E1)" value={p.code} onChange={(ev) => setPoint(i, { code: ev.target.value.toUpperCase() })} />
            <select className="input" value={p.energy} onChange={(ev) => setEnergy(i, ev.target.value as EnergyType)}>
              {ENERGY_TYPES.map((t) => <option key={t} value={t}>{ENERGY_TITLE[t]}</option>)}
            </select>
          </div>
          <input className="input" placeholder="Název bodu (např. Hlavní vypínač v rozvaděči RJ)" value={p.name} onChange={(ev) => setPoint(i, { name: ev.target.value })} />
          <input className="input" placeholder="Umístění" value={p.location} onChange={(ev) => setPoint(i, { location: ev.target.value })} />
          <input className="input" placeholder="Způsob izolace" value={p.method} onChange={(ev) => setPoint(i, { method: ev.target.value })} />
          <label className="check"><input type="checkbox" checked={isLockable(p)} onChange={(ev) => setPoint(i, { lockable: ev.target.checked })} /><span>Bod se uzamyká (odškrtněte např. u odložení břemene nebo odvzdušnění)</span></label>
          <input className="input" placeholder={isLockable(p) ? 'LOTO prvek (např. uzávěr jističe, uzávěr kohoutu)' : 'Zajištění (např. visačka, kontrola)'} value={p.lock} onChange={(ev) => setPoint(i, { lock: ev.target.value })} />
          <input className="input" placeholder="Způsob ověření nulového stavu (např. manometr 0 bar)" value={p.verification} onChange={(ev) => setPoint(i, { verification: ev.target.value })} />
          <div className="tiny">Fotografie bodu (detail ovládacího prvku)</div>
          {p.photo_path && !photos[p.id] && <Photo path={p.photo_path} height={120} />}
          <PhotoInput file={photos[p.id] ?? null} onChange={(f) => setPhotos({ ...photos, [p.id]: f })} />
        </Card>
      ))}
      <Button variant="secondary" onClick={() => setD({ ...d, points: [...d.points, { id: uid(), code: nextPointCode('electrical', d.points.map((x) => x.code)), name: '', energy: 'electrical', location: '', method: '', lock: '', verification: '', photo_path: null }] })}><Plus size={18} /> Přidat izolační bod</Button>

      <SectionHeader title="Uvolnění zařízení do provozu (v pořadí)" />
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
