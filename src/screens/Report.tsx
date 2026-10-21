import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { sb } from '../lib/supabase'
import { useApp, useCtx } from '../lib/store'
import type { AuditEvent } from '../lib/types'
import { ENERGY_TITLE, LOTO_STATUS_TITLE, SAFETY_NOTICE, fmtDate, fmtDateTime, fmtDuration } from '../lib/rules'
import { audit, lockoutSteps, photoUrl, restorationSteps } from '../lib/api'
import { Button, Empty, TopBar } from '../components/ui'
import { ACTION_TITLE } from './AuditLog'

function Img({ path, label }: { path?: string | null; label: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { if (path) photoUrl(path).then(setUrl) }, [path])
  if (!path) return <div style={{ fontSize: '9pt', color: '#666' }}>{label}: Bez fotografie</div>
  return <div><div style={{ fontSize: '9pt', color: '#666' }}>{label}</div>{url && <img src={url} alt={label} style={{ maxHeight: 150, maxWidth: '60%', borderRadius: 6 }} />}</div>
}

/** PDF záznam LOTO – vytváří se tiskem stránky („Uložit jako PDF“). */
export default function Report() {
  const { id } = useParams()
  const app = useApp()
  const ctx = useCtx()
  const [events, setEvents] = useState<AuditEvent[]>([])
  const l = app.lotos.find((x) => x.id === id)
  useEffect(() => {
    if (id) sb.from('audit_events').select('*').eq('loto_id', id).order('at').then(({ data }) => setEvents((data ?? []) as AuditEvent[]))
  }, [id])
  if (!l) return <div className="page"><TopBar title="PDF záznam" /><Empty title="LOTO nenalezeno" /></div>
  const e = app.equipment.find((x) => x.id === l.equipment_id)
  const procedure = app.procedures.find((p) => p.id === l.procedure_id)
  const isolations = lockoutSteps(l).filter((s) => s.kind === 'isolation')
  const row = (k: string, v: React.ReactNode) => <tr><td>{k}</td><td>{v || '—'}</td></tr>

  const print = async () => {
    await audit(ctx, 'reportExported', `Vytvořen PDF záznam LOTO – ${l.equipment_name}`, { loto: l })
    window.print()
  }

  return (
    <div className="page">
      <div className="no-print" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <TopBar title="PDF záznam LOTO" />
        <Button onClick={print}><Printer size={20} /> Uložit jako PDF / tisk</Button>
        <div className="tiny">Na iPhonu: v tiskovém dialogu roztáhněte náhled dvěma prsty a pak Sdílet → Uložit do Souborů.</div>
      </div>
      <div className="card report" style={{ background: '#fff', color: '#000' }}>
        <div style={{ fontSize: '9pt', fontWeight: 700, color: '#777' }}>LOTOFLOW</div>
        <div style={{ fontSize: '20pt', fontWeight: 800 }}>Záznam o provedení LOTO</div>
        <div style={{ fontSize: '13pt' }}>{l.equipment_name} · {l.equipment_code}</div>
        <div style={{ fontSize: '8pt', color: '#555' }}>{SAFETY_NOTICE}</div>

        <h2>Identifikace</h2>
        <table><tbody>
          {row('Zařízení', l.equipment_name)}{row('Kód', l.equipment_code)}
          {e && row('Výrobce / typ', `${e.manufacturer} ${e.equipment_type}`)}{e && row('Inventární číslo', e.asset_number)}
          {row('Firma', app.company?.name)}{row('Důvod odstavení', l.reason)}{row('Stav', LOTO_STATUS_TITLE[l.status])}
          {row('Zahájeno', `${fmtDateTime(l.started_at)} · ${l.started_by_name}`)}
          {l.closed_at && row('Ukončeno', `${fmtDateTime(l.closed_at)} · ${l.closed_by_name ?? ''}`)}
          {row('Doba trvání', fmtDuration(l.started_at, l.closed_at))}
        </tbody></table>

        <h2>Revize a schválení postupu</h2>
        <table><tbody>
          {row('Postup', l.procedure_name)}{row('Revize', l.procedure_revision)}
          {row('Schválil', l.procedure_approved_by)}{row('Schváleno dne', l.procedure_approved_at ? fmtDate(l.procedure_approved_at) : '')}
        </tbody></table>

        <h2>Izolační body a zámky</h2>
        {isolations.map((iso) => {
          const lock = l.steps.find((s) => s.kind === 'lockout' && s.point_id === iso.point_id)
          const ref = procedure?.points.find((p) => p.id === iso.point_id)
          return (
            <div key={iso.id} style={{ breakInside: 'avoid', marginBottom: 10 }}>
              <b>{iso.point_code} – {iso.point_name}</b>
              <table><tbody>
                {row('Typ energie', iso.energy ? ENERGY_TITLE[iso.energy] : '')}
                {row('Izolováno', iso.done ? `${fmtDateTime(iso.at)} · ${iso.by}` : 'Neprovedeno')}
                {row('QR ověření', iso.qr ? 'Ověřeno naskenováním' : 'Neskenováno')}
                {row('Zámek', lock?.lock)}
                {row('Uzamčeno', lock?.done ? `${fmtDateTime(lock.at)} · ${lock.by}` : 'Neprovedeno')}
              </tbody></table>
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                <Img path={ref?.photo_path} label="Referenční fotografie" />
                <Img path={lock?.photo_path} label="Fotografie uzamčení" />
              </div>
            </div>
          )
        })}

        <h2>Účastníci</h2>
        <table><tbody>
          {l.participants.map((p) => row(`${p.name} (${p.personal_number})`, `Zámek ${p.lock} · připojen ${fmtDateTime(p.joined_at)} · ${p.removed_at ? `sejmut ${fmtDateTime(p.removed_at)}` : 'zámek stále na zařízení'}`))}
        </tbody></table>

        <h2>TRY / TEST – ověření nulového stavu</h2>
        {l.zero_verified_at ? (
          <table><tbody>{row('Ověřeno', `${fmtDateTime(l.zero_verified_at)} · ${l.zero_verified_by}`)}{l.zero_checks.map((c) => row('✓', c))}</tbody></table>
        ) : <div>Neprovedeno</div>}

        <h2>Časová osa</h2>
        <table><tbody>{l.timeline.map((t) => row(fmtDateTime(t.at), [t.title, t.detail, t.actor].filter(Boolean).join(' · ')))}</tbody></table>

        <h2>Obnova</h2>
        {restorationSteps(l).length === 0 ? <div>Neprovedeno</div> : (
          <table><tbody>{restorationSteps(l).map((s, i) => row(`${i + 1}. ${s.title}`, s.done ? `${fmtDateTime(s.at)} · ${s.by}` : 'Neprovedeno'))}</tbody></table>
        )}

        <h2>Auditní události</h2>
        <table><tbody>{events.map((ev) => row(fmtDateTime(ev.at), `${ACTION_TITLE[ev.action] ?? ev.action}: ${ev.summary} · ${ev.actor_name}`))}</tbody></table>

        <div style={{ fontSize: '8pt', color: '#777', marginTop: 16 }}>Vygeneroval(a) {app.profile?.full_name}, {fmtDateTime(new Date().toISOString())}. Dokument je výpisem z evidence LOTOFLOW.</div>
      </div>
    </div>
  )
}
