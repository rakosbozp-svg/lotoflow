import { useNavigate, useParams } from 'react-router-dom'
import { Check, Circle, CircleDot, CheckCircle2, Flag, Lock } from 'lucide-react'
import { useApp, useCtx } from '../lib/store'
import { LOCK_REMOVAL_INDEX, RESTORATION_SEQUENCE, fmtDateTime, fmtDuration, fmtTime } from '../lib/rules'
import { activeParticipants, closeLoto, confirmRestoration, nextRestoration, restorationSteps } from '../lib/api'
import { Banner, Button, Card, Divider, Empty, ErrorBox, KV, SafetyNotice, SectionHeader, useAction } from '../components/ui'
import { GuideBanner } from './Guide'

export default function Restoration() {
  const { id } = useParams()
  const app = useApp()
  const ctx = useCtx()
  const navigate = useNavigate()
  const act = useAction()
  const l = app.lotos.find((x) => x.id === id)
  if (!l) return <div className="page"><Empty title="LOTO nenalezeno" /></div>
  const steps = restorationSteps(l)
  const step = nextRestoration(l)
  const index = step ? steps.indexOf(step) : -1

  return (
    <div className="page-full">
      <GuideBanner loto={l} blue label="Řízená obnova" />
      <div className="page" style={{ paddingTop: 16 }}>
        {l.status === 'closed' ? (
          <>
            <div className="center"><Flag size={64} color="var(--success)" /><h2 className="h2">LOTO ukončeno</h2></div>
            <Card>
              <KV k="Zahájeno" v={`${fmtDateTime(l.started_at)} · ${l.started_by_name}`} />
              <KV k="Obnova zahájena" v={fmtDateTime(l.restoration_started_at)} />
              <KV k="Ukončeno" v={`${fmtDateTime(l.closed_at)} · ${l.closed_by_name ?? ''}`} />
              <KV k="Doba trvání" v={fmtDuration(l.started_at, l.closed_at)} />
              <Divider />
              {l.participants.map((p) => <KV key={p.user_id + p.joined_at} k={p.name} v={p.lock} mono />)}
            </Card>
            <Button onClick={() => navigate(`/loto/${l.id}`, { replace: true })}><Check size={20} /> Hotovo</Button>
          </>
        ) : step ? (
          <>
            <div className="small muted" style={{ fontWeight: 600 }}>Krok {index + 1} z {RESTORATION_SEQUENCE.length}</div>
            <div className="progress"><div style={{ width: `${(index / RESTORATION_SEQUENCE.length) * 100}%`, background: 'var(--accent)' }} /></div>
            <h2 className="h2">{step.title}</h2>
            <div className="pre" style={{ fontSize: 19 }}>{step.instruction}</div>
            {index === LOCK_REMOVAL_INDEX && (
              <>
                <Card>
                  <SectionHeader title="Osobní zámky k odstranění" />
                  {activeParticipants(l).map((p) => <div key={p.user_id} className="row"><Lock size={18} color="var(--danger)" /><span className="mono" style={{ fontWeight: 600 }}>{p.lock}</span><span className="grow" /><span className="small">{p.name}</span></div>)}
                </Card>
                <Banner title="Každý pracovník odstraňuje pouze svůj vlastní zámek." />
              </>
            )}
            <ErrorBox message={act.error} />
            <Button disabled={act.busy} onClick={() => act.run(async () => { await confirmRestoration(ctx, l.id, step.id); await app.refresh(); window.scrollTo({ top: 0 }) })}><Check size={20} /> Potvrdit krok</Button>
          </>
        ) : (
          <>
            <Banner title="Všechny kroky obnovy jsou potvrzeny" text="Zařízení je připraveno k předání do provozu. Ukončete LOTO." tone="success" />
            <ErrorBox message={act.error} />
            <Button variant="success" disabled={act.busy} onClick={() => act.run(async () => { await closeLoto(ctx, l.id); await app.refresh() })}><Flag size={20} /> Ukončit LOTO</Button>
          </>
        )}
        <Card>
          <SectionHeader title="Sekvence obnovy" />
          {steps.map((s, i) => (
            <div key={s.id} className="row small" style={{ minHeight: 32 }}>
              {s.done ? <CheckCircle2 size={18} color="var(--success)" /> : s.id === step?.id ? <CircleDot size={18} color="var(--accent)" /> : <Circle size={18} color="var(--text3)" />}
              <span className="grow" style={{ fontWeight: s.id === step?.id ? 600 : 400, color: s.done ? 'var(--text2)' : undefined }}>{i + 1}. {s.title}</span>
              {s.at && <span className="tiny">{fmtTime(s.at)}</span>}
            </div>
          ))}
        </Card>
        <SafetyNotice />
      </div>
    </div>
  )
}
