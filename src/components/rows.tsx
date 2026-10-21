import { Link } from 'react-router-dom'
import { Lock, Pause, Play, Users, Clock } from 'lucide-react'
import type { Defect, Equipment, Loto, Procedure } from '../lib/types'
import {
  EQUIPMENT_STATE_TITLE, LOTO_STATUS_TITLE, PROCEDURE_STATUS_TITLE, SEVERITY_TITLE, type EquipmentState, currentProcedure,
  equipmentState, fmtDateTime, openDefects,
} from '../lib/rules'
import { activeParticipants, lockoutSteps } from '../lib/api'
import { Badge, Card, Chevron, Divider, Tile, type Tone } from './ui'

export const stateTone = (s: EquipmentState): Tone => (s === 'lotoActive' ? 'danger' : s === 'outOfService' ? 'warning' : 'neutral')
export const lotoTone = (s: Loto['status']): Tone => ({ isolating: 'warning', active: 'danger', restoring: 'accent', closed: 'neutral' } as const)[s]
export const procTone = (s: Procedure['status']): Tone => ({ draft: 'neutral', pendingApproval: 'accent', approved: 'success', needsRevision: 'warning', archived: 'neutral' } as const)[s]
export const sevTone = (s: Defect['severity']): Tone => ({ note: 'neutral', minor: 'accent', major: 'warning', critical: 'danger' } as const)[s]

export function StateIcon({ state, size = 22 }: { state: EquipmentState; size?: number }) {
  if (state === 'lotoActive') return <Lock size={size} />
  if (state === 'outOfService') return <Pause size={size} />
  return <Play size={size} />
}

export function EquipmentRow({ e, lotos, procedures, defects }: { e: Equipment; lotos: Loto[]; procedures: Procedure[]; defects: Defect[] }) {
  const state = equipmentState(e, lotos)
  const p = currentProcedure(procedures, e.id)
  const top = openDefects(defects, e.id).find((d) => d.severity !== 'note')
  return (
    <Link to={`/equipment/${e.id}`} className="list-row">
      <Tile icon={<StateIcon state={state} />} tone={state === 'running' ? 'accent' : stateTone(state)} />
      <div className="grow">
        <div className="title">{e.name}</div>
        <div className="small muted mono">{e.code}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <Badge text={EQUIPMENT_STATE_TITLE[state]} tone={stateTone(state)} />
        {!p && <Badge text="Bez postupu" tone="warning" />}
        {p && p.status !== 'approved' && <Badge text={PROCEDURE_STATUS_TITLE[p.status]} tone={procTone(p.status)} />}
        {top && <Badge text={SEVERITY_TITLE[top.severity]} tone={sevTone(top.severity)} />}
      </div>
      <Chevron />
    </Link>
  )
}

export function LotoCard({ l }: { l: Loto }) {
  const steps = lockoutSteps(l)
  const done = steps.filter((s) => s.done).length
  return (
    <Link to={`/loto/${l.id}`} style={{ color: 'inherit' }}>
      <Card>
        <div className="row-top">
          <Tile icon={<Lock size={20} />} tone={lotoTone(l.status)} />
          <div className="grow">
            <div className="title">{l.equipment_name}</div>
            <div className="small muted">{l.equipment_code} · {l.procedure_name} · rev. {l.procedure_revision}</div>
          </div>
          <Badge text={LOTO_STATUS_TITLE[l.status]} tone={lotoTone(l.status)} />
        </div>
        <Divider />
        <div className="row small muted">
          <span className="row" style={{ gap: 4 }}><Clock size={14} />{fmtDateTime(l.started_at)}</span>
          <span className="grow" />
          <span className="row" style={{ gap: 4 }}><Users size={14} />{activeParticipants(l).length}</span>
        </div>
        {l.status === 'isolating' && (
          <>
            <div className="progress"><div style={{ width: `${(done / Math.max(steps.length, 1)) * 100}%`, background: 'var(--warning)' }} /></div>
            <div className="small muted">Hotovo {done} z {steps.length} kroků</div>
          </>
        )}
        <div className="small muted">Odpovídá: {l.responsible_name}</div>
      </Card>
    </Link>
  )
}
