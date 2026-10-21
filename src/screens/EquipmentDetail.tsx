import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRightCircle, FileText, History, Lock, MessageSquareWarning, Pencil, FilePlus } from 'lucide-react'
import { useApp, useCtx } from '../lib/store'
import {
  ENERGY_TITLE, EQUIPMENT_STATE_TITLE, LOTO_STATUS_TITLE, PROCEDURE_STATUS_TITLE, REVIEW_TITLE, SEVERITY_TITLE, currentProcedure,
  equipmentState, fmtDate, fmtDateTime, fmtTime, openDefects, procedureReviewState,
} from '../lib/rules'
import type { Defect, Severity } from '../lib/types'
import { reportDefect, resolveDefect, uploadPhoto } from '../lib/api'
import {
  Badge, Banner, Button, Card, Divider, Empty, EnergyIcon, ErrorBox, KV, Photo, PhotoInput, SafetyNotice, SectionHeader, Tile, TopBar, useAction,
} from '../components/ui'
import { StateIcon, procTone, sevTone } from '../components/rows'
import PointCard from '../components/PointCard'

export function rememberRecent(id: string) {
  try {
    const list: string[] = JSON.parse(localStorage.getItem('lotoflow.recent') ?? '[]')
    localStorage.setItem('lotoflow.recent', JSON.stringify([id, ...list.filter((x) => x !== id)].slice(0, 10)))
  } catch { /* nevadí */ }
}

export default function EquipmentDetail() {
  const { id } = useParams()
  const app = useApp()
  const navigate = useNavigate()
  const e = app.equipment.find((x) => x.id === id)
  useEffect(() => { if (id) rememberRecent(id) }, [id])
  if (!e) return <div className="page"><TopBar title="Zařízení" /><Empty title="Zařízení nenalezeno" /></div>

  const state = equipmentState(e, app.lotos)
  const open = app.lotos.find((l) => l.equipment_id === e.id && l.status !== 'closed')
  const p = currentProcedure(app.procedures, e.id)
  const review = procedureReviewState(p)
  const defects = openDefects(app.defects, e.id)
  const top = defects[0]
  const site = app.sites.find((s) => s.id === e.site_id)
  const wp = app.workplaces.find((w) => w.id === e.workplace_id)
  const isHSE = app.profile?.role === 'hse'
  const history = app.lotos.filter((l) => l.equipment_id === e.id)

  return (
    <div className="page">
      <TopBar title={e.code} right={isHSE ? <Link to={`/admin/equipment/${e.id}`} className="icon-btn" aria-label="Upravit zařízení"><Pencil size={20} /></Link> : undefined} />
      <div>
        <div className="small mono muted">{e.code}</div>
        <h2 className="h2">{e.name}</h2>
      </div>
      <div className={`state ${state}`}>
        <StateIcon state={state} size={30} />
        <div>
          <div className="s-title">{EQUIPMENT_STATE_TITLE[state]}</div>
          <div className="small" style={{ opacity: 0.9 }}>
            {open ? `${LOTO_STATUS_TITLE[open.status]} od ${fmtTime(open.started_at)} · odpovídá ${open.responsible_name}` : state === 'outOfService' ? 'Zařízení je evidováno mimo provoz' : 'Zařízení není uzamčeno'}
          </div>
        </div>
      </div>
      {top && (top.severity === 'major' || top.severity === 'critical') && (
        <Banner title={`Nevyřešené závady: ${defects.filter((d) => d.severity !== 'note').length}`} text={top.title} tone={sevTone(top.severity)} />
      )}

      {open ? (
        <>
          <Button variant="danger" onClick={() => navigate(`/loto/${open.id}`)}><Lock size={20} /> Otevřít aktivní LOTO</Button>
          {open.status === 'isolating' && open.responsible_id === app.profile?.id && (
            <Button variant="secondary" onClick={() => navigate(`/loto/${open.id}/guide`)}><ArrowRightCircle size={20} /> Pokračovat v průvodci</Button>
          )}
        </>
      ) : (
        <Button variant="danger" onClick={() => navigate(`/equipment/${e.id}/start`)}><Lock size={20} /> Zahájit LOTO</Button>
      )}
      <div className="btn-row">
        {p && <Button variant="secondary" small onClick={() => navigate(`/procedure/${p.id}`)}><FileText size={18} /> Postup</Button>}
        <Button variant="secondary" small onClick={() => document.getElementById('history')?.scrollIntoView({ behavior: 'smooth' })}><History size={18} /> Historie</Button>
      </div>

      <SectionHeader title="Údaje o zařízení" />
      <Card>
        <KV k="Kód" v={e.code} mono />
        <KV k="Výrobce" v={e.manufacturer} />
        <KV k="Typ" v={e.equipment_type} />
        <KV k="Inventární číslo" v={e.asset_number} mono />
        <KV k="Závod" v={site?.name} />
        <KV k="Pracoviště" v={wp?.name} />
      </Card>

      <SectionHeader title="Zdroje nebezpečné energie" trailing={e.energy_sources.length} />
      <Card>
        {e.energy_sources.length === 0 && <Empty title="Nejsou evidovány žádné zdroje energie" />}
        {e.energy_sources.map((s, i) => (
          <div key={i} className="row">
            <Tile icon={<EnergyIcon type={s.type} />} tone="danger" small />
            <div><div className="title small">{ENERGY_TITLE[s.type]}</div><div className="small muted">{[s.magnitude, s.note].filter(Boolean).join(' · ')}</div></div>
          </div>
        ))}
      </Card>

      <DefectsSection equipmentId={e.id} />

      <SectionHeader title="LOTO postup" />
      {p ? (
        <Link to={`/procedure/${p.id}`} style={{ color: 'inherit' }}>
          <Card>
            <div className="title">{p.name}</div>
            <div className="small muted">Revize {p.revision} · upraveno {fmtDate(p.updated_at)}</div>
            <div className="wrap">
              <Badge text={PROCEDURE_STATUS_TITLE[p.status]} tone={procTone(p.status)} />
              {review && <Badge text={REVIEW_TITLE[review]} tone={review === 'overdue' ? 'danger' : review === 'dueSoon' ? 'warning' : 'neutral'} />}
            </div>
            {p.approver_name && <div className="small muted">Schválil(a) {p.approver_name}, {fmtDate(p.approved_at)}</div>}
            {p.next_review_date && <div className="small muted">Příští revize: {fmtDate(p.next_review_date)}</div>}
          </Card>
        </Link>
      ) : (
        <Card>
          <Empty title="Bez postupu" text="LOTO nelze zahájit, dokud HSE postup nevytvoří a neschválí." />
          {isHSE && <Button variant="secondary" onClick={() => navigate(`/admin/procedure/${e.id}`)}><FilePlus size={18} /> Vytvořit LOTO postup</Button>}
        </Card>
      )}

      {p && p.points.length > 0 && (
        <>
          <SectionHeader title="Izolační body" trailing={p.points.length} />
          {p.points.map((pt) => <PointCard key={pt.id} point={pt} machineCode={e.code} compact />)}
        </>
      )}

      <div id="history" />
      <SectionHeader title="Historie LOTO" trailing={history.length} />
      <Card tight>
        {history.length === 0 && <Empty title="Na zařízení zatím neproběhlo žádné LOTO" />}
        {history.map((l) => (
          <Link key={l.id} to={`/loto/${l.id}`} className="list-row">
            <div className="grow"><div className="title small">{fmtDateTime(l.started_at)} · {l.started_by_name}</div><div className="small muted">{l.reason}</div></div>
            <Badge text={LOTO_STATUS_TITLE[l.status]} tone={l.status === 'closed' ? 'neutral' : 'danger'} />
          </Link>
        ))}
      </Card>
      <SafetyNotice />
    </div>
  )
}

function DefectsSection({ equipmentId }: { equipmentId: string }) {
  const app = useApp()
  const ctx = useCtx()
  const e = app.equipment.find((x) => x.id === equipmentId)!
  const open = openDefects(app.defects, e.id)
  const resolved = app.defects.filter((d) => d.equipment_id === e.id && d.resolved_at)
  const [adding, setAdding] = useState(false)
  const [showResolved, setShowResolved] = useState(false)
  const [selected, setSelected] = useState<Defect | null>(null)
  const [severity, setSeverity] = useState<Severity>('minor')
  const [title, setTitle] = useState('')
  const [detail, setDetail] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const act = useAction()
  const me = app.profile!
  const canResolve = (d: Defect) => me.role !== 'worker' || (d.severity === 'note' && d.reported_by === me.id)

  const save = () => act.run(async () => {
    const path = photo ? await uploadPhoto(ctx, photo) : null
    await reportDefect(ctx, e, severity, title, detail, path)
    setAdding(false); setTitle(''); setDetail(''); setPhoto(null); setSeverity('minor')
    await app.refresh()
  })
  const resolve = (d: Defect) => act.run(async () => {
    await resolveDefect(ctx, d, e, note)
    setSelected(null); setNote('')
    await app.refresh()
  })

  const row = (d: Defect) => (
    <button key={d.id} className="list-row" onClick={() => setSelected(selected?.id === d.id ? null : d)}>
      <Tile icon={<MessageSquareWarning size={18} />} tone={d.resolved_at ? 'neutral' : sevTone(d.severity)} small />
      <div className="grow"><div className="title small">{d.title}</div><div className="small muted">Zapsal(a) {d.reported_by_name}, {fmtDateTime(d.created_at)}</div></div>
      <Badge text={d.resolved_at ? 'Vyřešeno' : SEVERITY_TITLE[d.severity]} tone={d.resolved_at ? 'success' : sevTone(d.severity)} />
    </button>
  )

  return (
    <>
      <SectionHeader title="Závady a poznámky" trailing={open.length || undefined} />
      <Card tight>
        {open.length === 0 && <Empty title="Žádné nevyřešené závady" text="Zapište cokoli, co může ovlivnit bezpečné odstavení zařízení." />}
        {open.map(row)}
        {resolved.length > 0 && <button className="link-btn" onClick={() => setShowResolved(!showResolved)}>Vyřešené ({resolved.length})</button>}
        {showResolved && resolved.map(row)}
      </Card>
      {selected && (
        <Card>
          <div className="wrap"><Badge text={SEVERITY_TITLE[selected.severity]} tone={sevTone(selected.severity)} />{selected.resolved_at && <Badge text="Vyřešeno" tone="success" />}</div>
          <div className="title">{selected.title}</div>
          {selected.detail && <div className="muted">{selected.detail}</div>}
          {selected.photo_path && <Photo path={selected.photo_path} height={200} />}
          {selected.resolved_at ? (
            <div className="small">Vyřešil(a) {selected.resolved_by_name}, {fmtDateTime(selected.resolved_at)}{selected.resolution_note && ` – ${selected.resolution_note}`}</div>
          ) : canResolve(selected) ? (
            <>
              <input className="input" placeholder="Jak byla závada vyřešena" value={note} onChange={(ev) => setNote(ev.target.value)} />
              <Button variant="success" disabled={act.busy} onClick={() => resolve(selected)}>Označit jako vyřešené</Button>
            </>
          ) : <div className="small muted">Závadu může uzavřít vedoucí údržby nebo HSE administrátor.</div>}
          <ErrorBox message={act.error} />
        </Card>
      )}
      {adding ? (
        <Card>
          <div className="h3">Nová závada</div>
          <div className="chips">
            {(['note', 'minor', 'major', 'critical'] as Severity[]).map((s) => <button key={s} className={`chip ${severity === s ? 'on' : ''}`} onClick={() => setSeverity(s)}>{SEVERITY_TITLE[s]}</button>)}
          </div>
          <div className="tiny">Nevyřešené závady kromě poznámky se zobrazí jako varování před zahájením LOTO.</div>
          <input className="input" placeholder="Co je špatně (např. poškozená visačka u Q01)" value={title} onChange={(ev) => setTitle(ev.target.value)} />
          <textarea className="input" placeholder="Kde, od kdy, jaké riziko…" value={detail} onChange={(ev) => setDetail(ev.target.value)} />
          <PhotoInput file={photo} onChange={setPhoto} />
          <ErrorBox message={act.error} />
          <div className="btn-row">
            <Button variant="secondary" onClick={() => setAdding(false)}>Zrušit</Button>
            <Button disabled={act.busy || !title.trim()} onClick={save}>{act.busy ? 'Ukládám…' : 'Uložit'}</Button>
          </div>
        </Card>
      ) : (
        <Button variant="secondary" onClick={() => setAdding(true)}><MessageSquareWarning size={18} /> Zapsat závadu nebo poznámku</Button>
      )}
      <Divider />
    </>
  )
}
