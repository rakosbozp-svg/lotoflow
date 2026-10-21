import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { useApp, useCtx } from '../lib/store'
import { PROCEDURE_STATUS_TITLE, currentProcedure, lockNumber, plural, preflight } from '../lib/rules'
import { startLoto } from '../lib/api'
import { Banner, Button, Card, Divider, Empty, ErrorBox, KV, SafetyNotice, TopBar, useAction } from '../components/ui'

export default function StartLoto() {
  const { id } = useParams()
  const app = useApp()
  const ctx = useCtx()
  const navigate = useNavigate()
  const [reason, setReason] = useState('')
  const [ack, setAck] = useState(false)
  const act = useAction()
  const e = app.equipment.find((x) => x.id === id)
  if (!e) return <div className="page"><TopBar title="Zahájit LOTO" /><Empty title="Zařízení nenalezeno" /></div>
  const p = currentProcedure(app.procedures, e.id)
  const pf = preflight(e, app.procedures, app.lotos, app.defects)
  const canStart = pf.blockers.length === 0 && !pf.open

  const start = () => act.run(async () => {
    if (pf.warnings.length && !ack) throw new Error('Potvrďte, že jste se seznámili s upozorněními.')
    const loto = await startLoto(ctx, e, app.procedures, reason)
    await app.refresh()
    navigate(`/loto/${loto.id}/guide`, { replace: true })
  })

  return (
    <div className="page">
      <TopBar title="Zahájit LOTO" />
      <Card>
        <div className="h3">{e.name}</div>
        <div className="small mono muted">{e.code}</div>
        {p && (
          <>
            <Divider />
            <KV k="Postup" v={p.name} />
            <KV k="Revize" v={p.revision} />
            <KV k="Stav" v={PROCEDURE_STATUS_TITLE[p.status]} />
            <KV k="Kroky" v={`${plural(p.preparation.length, 'přípravný krok', 'přípravné kroky', 'přípravných kroků')}, ${plural(p.points.length, 'izolační bod', 'izolační body', 'izolačních bodů')}`} />
          </>
        )}
      </Card>
      {pf.open && (
        <>
          <Banner title="Na zařízení už běží LOTO" text={`Odpovídá ${pf.open.responsible_name}. Připojte se k probíhajícímu LOTO se svým osobním zámkem.`} tone="danger" />
          <Button onClick={() => navigate(`/loto/${pf.open!.id}`)}>Otevřít probíhající LOTO</Button>
        </>
      )}
      {pf.blockers.map((b) => <Banner key={b} title="Zahájení je zablokováno" text={b} tone="danger" />)}
      {pf.warnings.map((w) => <Banner key={w} title="Upozornění" text={w} tone="warning" />)}
      {canStart && (
        <>
          <div className="field">
            <label htmlFor="reason">Důvod odstavení</label>
            <textarea id="reason" className="input" placeholder="Např. výměna lopatek míchadla" value={reason} onChange={(ev) => setReason(ev.target.value)} />
          </div>
          <Card>
            <KV k="Provádí" v={app.profile!.full_name} />
            <KV k="Osobní zámek" v={lockNumber(app.profile!)} mono />
          </Card>
          {pf.warnings.length > 0 && (
            <label className="check card" style={{ padding: '6px 14px' }}>
              <input type="checkbox" checked={ack} onChange={(ev) => setAck(ev.target.checked)} />
              Upozornění jsem si přečetl(a) a beru je na vědomí
            </label>
          )}
          <ErrorBox message={act.error} />
          <Button variant="danger" disabled={act.busy || !reason.trim() || (pf.warnings.length > 0 && !ack)} onClick={start}><Lock size={20} /> Zahájit LOTO</Button>
          {!reason.trim() && <div className="tiny">Pro zahájení vyplňte důvod odstavení.</div>}
        </>
      )}
      <SafetyNotice />
    </div>
  )
}
