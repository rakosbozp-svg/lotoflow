import { useEffect, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { sb } from '../lib/supabase'
import { useApp } from '../lib/store'
import type { AuditEvent } from '../lib/types'
import { fmtDateTime, matches, plural } from '../lib/rules'
import { Card, Empty, Spinner, TopBar } from '../components/ui'

export const ACTION_TITLE: Record<string, string> = {
  lotoStarted: 'LOTO zahájeno', stepConfirmed: 'Krok potvrzen', pointIsolated: 'Bod izolován', lockApplied: 'Zámek připojen',
  qrVerified: 'QR ověřen', qrMismatch: 'Nesprávný QR kód', zeroEnergyVerified: 'Nulový stav ověřen', participantJoined: 'Účastník připojen',
  shiftHandover: 'Předání směny', restorationStep: 'Krok obnovy', lockRemoved: 'Zámek odstraněn', lotoClosed: 'LOTO ukončeno',
  procedureCreated: 'Postup vytvořen', procedureEdited: 'Postup upraven', procedureSubmitted: 'Odesláno ke schválení',
  procedureApproved: 'Postup schválen', procedureApprovalBlocked: 'Schválení zablokováno', procedureNeedsRevision: 'Postup vyžaduje revizi',
  reviewCompleted: 'Revize provedena', equipmentCreated: 'Zařízení přidáno', equipmentEdited: 'Zařízení upraveno',
  energySourcesChanged: 'Změna zdrojů energie', reportExported: 'PDF záznam vytvořen', labelsPrinted: 'QR štítky vytvořeny',
  organizationEdited: 'Organizace upravena', userEdited: 'Osoba upravena', userDeactivated: 'Osoba deaktivována',
  demoSeeded: 'Demo data', defectReported: 'Závada zapsána', defectResolved: 'Závada vyřešena',
}

export default function AuditLog() {
  const app = useApp()
  const [events, setEvents] = useState<AuditEvent[] | null>(null)
  const [text, setText] = useState('')
  const [actor, setActor] = useState('')
  const [machine, setMachine] = useState('')
  const [action, setAction] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  useEffect(() => {
    let q = sb.from('audit_events').select('*').order('at', { ascending: false }).limit(500)
    if (from) q = q.gte('at', new Date(from).toISOString())
    if (to) { const end = new Date(to); end.setDate(end.getDate() + 1); q = q.lt('at', end.toISOString()) }
    q.then(({ data }) => setEvents((data ?? []) as AuditEvent[]))
  }, [from, to])

  const visibleLotos = new Set(app.scopedLotos.map((l) => l.id))
  const worker = app.profile?.role === 'worker'
  const list = (events ?? []).filter((e) => {
    if (app.siteId && e.site_id && e.site_id !== app.siteId) return false
    if (worker && !(e.loto_id ? visibleLotos.has(e.loto_id) : e.actor_id === app.profile?.id)) return false
    if (actor && e.actor_name !== actor) return false
    if (machine && e.equipment_code !== machine) return false
    if (action && e.action !== action) return false
    return matches([e.summary, e.detail, e.actor_name, e.equipment_code, e.equipment_name, ACTION_TITLE[e.action]], text)
  })
  const actors = [...new Set((events ?? []).map((e) => e.actor_name))].sort()

  return (
    <div className="page">
      <TopBar title="Auditní stopa" />
      <div className="tiny">Auditní události jsou neměnné – lze je pouze přidávat.</div>
      <input className="input" type="search" placeholder="Hledat v auditu" value={text} onChange={(e) => setText(e.target.value)} />
      <div className="btn-row">
        <select className="input" value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Uživatel">
          <option value="">Uživatel: vše</option>{actors.map((a) => <option key={a}>{a}</option>)}
        </select>
        <select className="input" value={machine} onChange={(e) => setMachine(e.target.value)} aria-label="Stroj">
          <option value="">Stroj: vše</option>{app.scopedEquipment.map((e) => <option key={e.id} value={e.code}>{e.code}</option>)}
        </select>
      </div>
      <select className="input" value={action} onChange={(e) => setAction(e.target.value)} aria-label="Typ akce">
        <option value="">Typ akce: vše</option>{Object.entries(ACTION_TITLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <div className="btn-row">
        <div className="field"><label>Od data</label><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div className="field"><label>Do data</label><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>
      <div className="section-header"><span>{plural(list.length, 'událost', 'události', 'událostí')}</span></div>
      {events === null ? <Spinner /> : (
        <Card tight>
          {list.length === 0 && <Empty icon={<ClipboardList size={28} color="var(--text3)" />} title="Žádné auditní události" text="Upravte filtry nebo hledaný text." />}
          {list.map((e) => (
            <div key={e.id} className="list-row" style={{ cursor: 'default', alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="tiny" style={{ fontWeight: 600, color: 'var(--accent)' }}>{ACTION_TITLE[e.action] ?? e.action}</div>
                <div className="title small">{e.summary}</div>
                {e.detail && <div className="small muted">{e.detail}</div>}
                <div className="tiny">{fmtDateTime(e.at)} · {e.actor_name}{e.equipment_code ? ` · ${e.equipment_code}` : ''}</div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}
