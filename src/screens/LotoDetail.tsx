import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeftRight, ArrowRightCircle, CheckCircle, Flag, FileText, Lock, LockOpen, Power, RotateCcw, ShieldCheck, UserPlus, Wrench,
} from 'lucide-react'
import { useApp, useCtx } from '../lib/store'
import { LOTO_STATUS_TITLE, ROLE_TITLE, fmtDateTime, fmtDuration, fmtTime, lockNumber, LOCK_REMOVAL_INDEX } from '../lib/rules'
import { activeParticipants, beginRestoration, joinLoto, lockoutSteps, restorationSteps } from '../lib/api'
import type { LotoStep, TimelineEntry } from '../lib/types'
import { Avatar, Badge, Banner, Button, Card, Divider, Empty, EnergyIcon, ErrorBox, KV, Photo, SafetyNotice, SectionHeader, Tile, TopBar, useAction, type Tone } from '../components/ui'
import { lotoTone } from '../components/rows'

const TL: Record<string, { tone: Tone; icon: React.ReactNode }> = {
  started: { tone: 'danger', icon: <Lock size={14} /> },
  isolated: { tone: 'danger', icon: <Power size={14} /> },
  locked: { tone: 'danger', icon: <Lock size={14} /> },
  verified: { tone: 'success', icon: <ShieldCheck size={14} /> },
  workAuthorized: { tone: 'success', icon: <Wrench size={14} /> },
  participant: { tone: 'accent', icon: <UserPlus size={14} /> },
  handover: { tone: 'accent', icon: <ArrowLeftRight size={14} /> },
  restoration: { tone: 'accent', icon: <RotateCcw size={14} /> },
  lockRemoved: { tone: 'neutral', icon: <LockOpen size={14} /> },
  closed: { tone: 'success', icon: <Flag size={14} /> },
}

export function Timeline({ entries }: { entries: TimelineEntry[] }) {
  return (
    <div className="timeline">
      {entries.map((t, i) => {
        const s = TL[t.kind] ?? { tone: 'neutral' as Tone, icon: <CheckCircle size={14} /> }
        return (
          <div key={i} className="tl-item">
            <div className="tl-rail"><span className={`tl-dot tone-${s.tone}`}>{s.icon}</span>{i < entries.length - 1 && <span className="tl-line" />}</div>
            <div className="tl-body">
              <div className="title small">{t.title}</div>
              {t.detail && <div className="small muted">{t.detail}</div>}
              <div className="tiny">{fmtTime(t.at)} · {t.actor}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function LotoDetail() {
  const { id } = useParams()
  const app = useApp()
  const ctx = useCtx()
  const navigate = useNavigate()
  const act = useAction()
  const [joining, setJoining] = useState(false)
  const [lock, setLock] = useState(() => lockNumber(app.profile!))
  const [confirmRestore, setConfirmRestore] = useState(false)
  const l = app.lotos.find((x) => x.id === id)
  if (!l) return <div className="page"><TopBar title="LOTO" /><Empty title="LOTO nenalezeno" /></div>
  const me = app.profile!
  const lead = l.responsible_id === me.id || me.role !== 'worker'
  const isParticipant = activeParticipants(l).some((p) => p.user_id === me.id)
  const isolations = lockoutSteps(l).filter((s) => s.kind === 'isolation')
  const released = l.status === 'closed' || restorationSteps(l)[LOCK_REMOVAL_INDEX]?.done
  const done = lockoutSteps(l).filter((s) => s.done).length

  const pointRow = (iso: LotoStep) => {
    const lockStep = l.steps.find((s) => s.kind === 'lockout' && s.point_id === iso.point_id)
    const locked = !!lockStep?.done
    const tone: Tone = released ? 'neutral' : locked ? 'danger' : iso.done ? 'warning' : 'neutral'
    const status = released ? 'Uvolněn' : locked ? 'Uzamčen' : iso.done ? 'Izolován' : 'Čeká'
    return (
      <div key={iso.id} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
        <div className="row">
          <Tile icon={iso.energy ? <EnergyIcon type={iso.energy} /> : <Power size={18} />} tone={tone} small />
          <div className="grow">
            <div className="title small">{iso.point_code} · {iso.point_name}</div>
            <div className="small muted mono">{[lockStep?.lock, iso.qr ? 'QR ✓' : null].filter(Boolean).join(' · ')}</div>
          </div>
          <Badge text={status} tone={tone} />
        </div>
        {(lockStep?.photo_path || iso.photo_path) && <Photo path={lockStep?.photo_path ?? iso.photo_path} height={110} />}
      </div>
    )
  }

  return (
    <div className="page">
      <TopBar title={l.equipment_code} right={<button className="icon-btn" aria-label="PDF záznam" onClick={() => navigate(`/loto/${l.id}/report`)}><FileText size={20} /></button>} />
      <Card>
        <div className="row-top">
          <div className="grow"><div className="h3">{l.equipment_name}</div><div className="small muted">{l.equipment_code} · {l.procedure_name} · rev. {l.procedure_revision}</div></div>
          <Badge text={LOTO_STATUS_TITLE[l.status]} tone={lotoTone(l.status)} />
        </div>
        <Divider />
        <KV k="Důvod odstavení" v={l.reason} />
        <KV k="Zahájeno" v={`${fmtDateTime(l.started_at)} · ${l.started_by_name}`} />
        <KV k="Odpovídá" v={l.responsible_name} />
        {l.status === 'isolating' && <KV k="Postup" v={`Hotovo ${done} z ${lockoutSteps(l).length} kroků`} />}
        <KV k="Doba trvání" v={fmtDuration(l.started_at, l.closed_at)} />
      </Card>
      <ErrorBox message={act.error} />

      {l.status === 'isolating' && lead && <Button variant="danger" onClick={() => navigate(`/loto/${l.id}/guide`)}><ArrowRightCircle size={20} /> Pokračovat v průvodci izolací</Button>}
      {l.status === 'active' && (
        <>
          <Banner title="Práce povolena" text="Zařízení je izolováno a uzamčeno. Před zahájením práce připojte svůj osobní zámek." tone="danger" />
          {!isParticipant && (joining ? (
            <Card>
              <div className="small muted">Každý, kdo na zařízení pracuje, musí připojit vlastní osobní zámek. Zámek sejmete až při řízené obnově.</div>
              <input className="input mono" value={lock} onChange={(e) => setLock(e.target.value.toUpperCase())} />
              <div className="btn-row">
                <Button variant="secondary" onClick={() => setJoining(false)}>Zrušit</Button>
                <Button variant="danger" disabled={act.busy} onClick={() => act.run(async () => { await joinLoto(ctx, l.id, lock); setJoining(false); await app.refresh() })}>Připojit</Button>
              </div>
            </Card>
          ) : <Button variant="danger" onClick={() => setJoining(true)}><UserPlus size={20} /> Připojit se se zámkem</Button>)}
          {lead && (confirmRestore ? (
            <Card>
              <div className="title">Zahájit řízenou obnovu?</div>
              <div className="small muted">Obnova proběhne v devíti potvrzovaných krocích. Zahajte ji až po dokončení všech prací.</div>
              <div className="btn-row">
                <Button variant="secondary" onClick={() => setConfirmRestore(false)}>Zrušit</Button>
                <Button disabled={act.busy} onClick={() => act.run(async () => { await beginRestoration(ctx, l.id, app.procedures); await app.refresh(); navigate(`/loto/${l.id}/restore`) })}>Zahájit obnovu</Button>
              </div>
            </Card>
          ) : <Button onClick={() => setConfirmRestore(true)}><RotateCcw size={20} /> Zahájit obnovu</Button>)}
        </>
      )}
      {l.status === 'restoring' && lead && <Button onClick={() => navigate(`/loto/${l.id}/restore`)}><RotateCcw size={20} /> Pokračovat v obnově</Button>}
      {l.status !== 'closed' && lead && <Button variant="secondary" onClick={() => navigate(`/loto/${l.id}/handover`)}><ArrowLeftRight size={20} /> Předání směny</Button>}
      <Button variant="secondary" onClick={() => navigate(`/loto/${l.id}/report`)}><FileText size={20} /> Vytvořit PDF záznam LOTO</Button>

      {l.status === 'closed' && (
        <Card>
          <div className="row"><Tile icon={<Flag size={20} />} tone="success" /><div><div className="title">LOTO ukončeno</div><div className="small muted">Zařízení bylo řízeně vráceno do provozu.</div></div></div>
          <Divider />
          <KV k="Zahájeno" v={`${fmtDateTime(l.started_at)} · ${l.started_by_name}`} />
          <KV k="Ukončeno" v={`${fmtDateTime(l.closed_at)} · ${l.closed_by_name ?? ''}`} />
          <KV k="Doba trvání" v={fmtDuration(l.started_at, l.closed_at)} />
        </Card>
      )}

      <SectionHeader title="Stav izolačních bodů" />
      <Card tight>{isolations.length ? isolations.map(pointRow) : <Empty title="Bez izolačních bodů" />}</Card>

      <SectionHeader title="Účastníci a osobní zámky" trailing={activeParticipants(l).length} />
      <Card tight>
        {l.participants.map((p) => (
          <div key={p.user_id + p.joined_at} className="list-row" style={{ cursor: 'default' }}>
            <Avatar name={p.name} tone={p.removed_at ? 'neutral' : 'danger'} />
            <div className="grow"><div className="title small">{p.name}</div><div className="small muted">{ROLE_TITLE[p.role]} · {p.personal_number}</div></div>
            <div style={{ textAlign: 'right' }}>
              <div className="mono small" style={{ fontWeight: 600, color: p.removed_at ? 'var(--text2)' : 'var(--danger)' }}>{p.removed_at ? '🔓' : '🔒'} {p.lock}</div>
              <div className="tiny">{p.removed_at ? `sejmut ${fmtTime(p.removed_at)}` : `od ${fmtTime(p.joined_at)}`}</div>
            </div>
          </div>
        ))}
      </Card>

      <SectionHeader title="Časová osa" />
      <Card><Timeline entries={l.timeline} /></Card>
      <SafetyNotice />
    </div>
  )
}
