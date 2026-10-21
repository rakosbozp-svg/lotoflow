import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarClock, CalendarX, BadgeCheck, LockKeyhole, MessageSquareWarning } from 'lucide-react'
import { useApp } from '../lib/store'
import type { Defect, Equipment, Loto, Procedure, Profile } from '../lib/types'
import {
  LOTO_STATUS_TITLE, PROCEDURE_STATUS_TITLE, REVIEW_TITLE, SEVERITY_RANK, SEVERITY_TITLE, daysUntil, fmtDate, fmtDateTime,
  plural, procedureReviewState,
} from '../lib/rules'
import { Badge, Card, Chevron, Empty, SectionHeader, Tile, type Tone } from '../components/ui'
import { procTone } from '../components/rows'

export type TaskKind = 'overdueReview' | 'incompleteLoto' | 'openDefect' | 'needsRevision' | 'pendingApproval' | 'dueSoonReview'
const ORDER: TaskKind[] = ['overdueReview', 'incompleteLoto', 'openDefect', 'needsRevision', 'pendingApproval', 'dueSoonReview']
const GROUP: Record<TaskKind, string> = {
  overdueReview: 'Revize po termínu',
  incompleteLoto: 'Nedokončené LOTO',
  openDefect: 'Závažné závady',
  needsRevision: 'Postupy k aktualizaci',
  pendingApproval: 'Čeká na schválení',
  dueSoonReview: 'Blíží se termín revize',
}
const TONE: Record<TaskKind, Tone> = {
  overdueReview: 'danger', incompleteLoto: 'warning', openDefect: 'danger', needsRevision: 'warning', pendingApproval: 'accent', dueSoonReview: 'warning',
}
const ICON: Record<TaskKind, ReactNode> = {
  overdueReview: <CalendarX size={20} />, incompleteLoto: <LockKeyhole size={20} />, openDefect: <MessageSquareWarning size={20} />,
  needsRevision: <AlertTriangle size={20} />, pendingApproval: <BadgeCheck size={20} />, dueSoonReview: <CalendarClock size={20} />,
}

export interface TaskItem { id: string; kind: TaskKind; title: string; subtitle: string; due?: string | null; to: string }

interface Source { profile: Profile | null; scopedEquipment: Equipment[]; procedures: Procedure[]; scopedLotos: Loto[]; defects: Defect[] }

export function openTasks(s: Source): TaskItem[] {
  const role = s.profile?.role
  const lead = role === 'supervisor' || role === 'hse'
  const items: TaskItem[] = []
  const ids = new Set(s.scopedEquipment.map((e) => e.id))
  const byId = new Map(s.scopedEquipment.map((e) => [e.id, e]))
  for (const p of s.procedures.filter((p) => ids.has(p.equipment_id) && p.status !== 'archived')) {
    const e = byId.get(p.equipment_id)!
    const sub = `${e.name} · ${e.code}`
    if (p.status === 'pendingApproval' && role === 'hse') items.push({ id: `a-${p.id}`, kind: 'pendingApproval', title: `Schválit: ${p.name}`, subtitle: sub, to: `/procedure/${p.id}` })
    if ((p.status === 'needsRevision' || p.status === 'draft') && lead) items.push({ id: `r-${p.id}`, kind: 'needsRevision', title: `${PROCEDURE_STATUS_TITLE[p.status]}: ${p.name}`, subtitle: sub, to: `/procedure/${p.id}` })
    const rs = procedureReviewState(p)
    if (lead && rs && rs !== 'onTime') items.push({ id: `v-${p.id}`, kind: rs === 'overdue' ? 'overdueReview' : 'dueSoonReview', title: `Revize postupu: ${p.name}`, subtitle: sub, due: p.next_review_date, to: `/procedure/${p.id}` })
  }
  if (lead) {
    for (const d of s.defects.filter((d) => ids.has(d.equipment_id) && !d.resolved_at && SEVERITY_RANK[d.severity] >= 2)) {
      const e = byId.get(d.equipment_id)!
      items.push({ id: `d-${d.id}`, kind: 'openDefect', title: `${SEVERITY_TITLE[d.severity]} závada: ${d.title}`, subtitle: `${e.name} · ${e.code}`, to: `/equipment/${e.id}` })
    }
  }
  for (const l of s.scopedLotos.filter((l) => l.status === 'isolating' || l.status === 'restoring')) {
    items.push({ id: `l-${l.id}`, kind: 'incompleteLoto', title: `${LOTO_STATUS_TITLE[l.status]}: ${l.equipment_name}`, subtitle: `Zahájil(a) ${l.started_by_name}, ${fmtDateTime(l.started_at)}`, to: `/loto/${l.id}` })
  }
  return items.sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind) || (a.due ?? '9').localeCompare(b.due ?? '9'))
}

function dueText(due: string): string {
  const d = daysUntil(due)
  if (d < 0) return `Termín ${fmtDate(due)} – ${plural(-d, 'den', 'dny', 'dní')} po termínu`
  if (d === 0) return 'Termín dnes'
  return `Termín ${fmtDate(due)} – za ${plural(d, 'den', 'dny', 'dní')}`
}

export function TaskRow({ t }: { t: TaskItem }) {
  return (
    <Link to={t.to} className="list-row">
      <Tile icon={ICON[t.kind]} tone={TONE[t.kind]} small />
      <div className="grow">
        <div className="title small">{t.title}</div>
        <div className="small muted">{t.subtitle}</div>
        {t.due && <div className="small" style={{ color: `var(--${TONE[t.kind] === 'danger' ? 'danger' : 'warning'})` }}>{dueText(t.due)}</div>}
      </div>
      <Chevron />
    </Link>
  )
}

export default function Tasks() {
  const app = useApp()
  const items = openTasks(app)
  const overdue = items.filter((t) => t.kind === 'overdueReview').length
  const soon = items.filter((t) => t.kind === 'dueSoonReview').length
  const lead = app.profile?.role !== 'worker'
  const reviewable = app.procedures
    .filter((p) => app.scopedEquipment.some((e) => e.id === p.equipment_id) && (p.status === 'approved' || p.status === 'needsRevision'))
    .sort((a, b) => (a.next_review_date ?? '').localeCompare(b.next_review_date ?? ''))
  return (
    <div className="page">
      <div className="topbar"><h1>Úkoly</h1></div>
      <div className="btn-row">
        {[['Po termínu', overdue, 'danger'], ['Blíží se termín', soon, 'warning'], ['Ostatní', items.length - overdue - soon, 'accent']].map(([label, n, tone]) => (
          <div key={label as string} className="card" style={{ padding: 12, gap: 2 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: (n as number) > 0 ? `var(--${tone})` : 'var(--text3)' }}>{n as number}</div>
            <div className="small muted">{label as string}</div>
          </div>
        ))}
      </div>
      <div className="tiny">{app.contextLine}</div>
      {items.length === 0 && <Card><Empty title="Žádné úkoly" text="Revize jsou v termínu a vše je dokončeno." /></Card>}
      {ORDER.filter((k) => items.some((t) => t.kind === k)).map((k) => (
        <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SectionHeader title={GROUP[k]} trailing={items.filter((t) => t.kind === k).length} />
          <Card tight>{items.filter((t) => t.kind === k).map((t) => <TaskRow key={t.id} t={t} />)}</Card>
        </div>
      ))}
      {lead && (
        <>
          <SectionHeader title="Revize postupů" trailing={reviewable.length} />
          <Card tight>
            {reviewable.map((p) => {
              const rs = procedureReviewState(p)
              return (
                <Link key={p.id} to={`/procedure/${p.id}`} className="list-row">
                  <div className="grow">
                    <div className="title small">{p.name}</div>
                    <div className="small muted">Příští revize: {fmtDate(p.next_review_date)}</div>
                  </div>
                  {rs && <Badge text={REVIEW_TITLE[rs]} tone={rs === 'overdue' ? 'danger' : rs === 'dueSoon' ? 'warning' : 'neutral'} />}
                  {p.status !== 'approved' && <Badge text={PROCEDURE_STATUS_TITLE[p.status]} tone={procTone(p.status)} />}
                  <Chevron />
                </Link>
              )
            })}
            {reviewable.length === 0 && <Empty title="Žádné schválené postupy" />}
          </Card>
        </>
      )}
    </div>
  )
}
