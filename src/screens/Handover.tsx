import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeftRight } from 'lucide-react'
import { useApp, useCtx } from '../lib/store'
import { HANDOVER_CHECKS, LOTO_STATUS_TITLE, ROLE_TITLE, lockNumber } from '../lib/rules'
import { activeParticipants, handover } from '../lib/api'
import { Button, Card, Empty, ErrorBox, KV, SectionHeader, TopBar, useAction } from '../components/ui'

export default function Handover() {
  const { id } = useParams()
  const app = useApp()
  const ctx = useCtx()
  const navigate = useNavigate()
  const act = useAction()
  const [checks, setChecks] = useState<string[]>([])
  const [receiver, setReceiver] = useState('')
  const [note, setNote] = useState('')
  const l = app.lotos.find((x) => x.id === id)
  if (!l) return <div className="page"><TopBar title="Předání směny" /><Empty title="LOTO nenalezeno" /></div>
  const candidates = app.members.filter((m) => m.is_active && m.id !== l.responsible_id)
  const chosen = candidates.find((m) => m.id === receiver)

  return (
    <div className="page">
      <TopBar title="Předání směny" />
      <Card>
        <KV k="Předává" v={l.responsible_name} />
        <KV k="Zařízení" v={`${l.equipment_name} · ${l.equipment_code}`} />
        <KV k="Stav" v={LOTO_STATUS_TITLE[l.status]} />
      </Card>
      <SectionHeader title="Kontrolní seznam" />
      <Card tight>
        {HANDOVER_CHECKS.map((c) => (
          <label key={c} className="check">
            <input type="checkbox" checked={checks.includes(c)} onChange={(e) => setChecks(e.target.checked ? [...checks, c] : checks.filter((x) => x !== c))} />
            <span>{c}</span>
          </label>
        ))}
      </Card>
      <div className="tiny">Předání je možné až po potvrzení všech bodů.</div>
      <div className="field">
        <label htmlFor="rcv">Přebírající osoba</label>
        <select id="rcv" className="input" value={receiver} onChange={(e) => setReceiver(e.target.value)}>
          <option value="">Vyberte osobu</option>
          {candidates.map((m) => <option key={m.id} value={m.id}>{m.full_name} · {ROLE_TITLE[m.role]}</option>)}
        </select>
        {chosen && <span className="tiny">{activeParticipants(l).some((p) => p.user_id === chosen.id) ? 'Přebírající osoba už má na zařízení svůj zámek.' : `Přebírající osoba bude zapsána se zámkem ${lockNumber(chosen)}.`}</span>}
      </div>
      <div className="field">
        <label htmlFor="note">Poznámka k předání</label>
        <textarea id="note" className="input" placeholder="Stav prací, upozornění…" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <ErrorBox message={act.error} />
      <Button disabled={!chosen || checks.length < HANDOVER_CHECKS.length || act.busy} onClick={() => act.run(async () => {
        await handover(ctx, l.id, chosen!, checks, note)
        await app.refresh()
        navigate(`/loto/${l.id}`, { replace: true })
      })}><ArrowLeftRight size={20} /> Předat směnu</Button>
    </div>
  )
}
