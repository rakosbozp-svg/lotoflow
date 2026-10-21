import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CalendarCheck, CheckCircle, Pencil, Send, ShieldCheck, ShieldHalf } from 'lucide-react'
import { useApp, useCtx } from '../lib/store'
import { PROCEDURE_STATUS_TITLE, RESTORATION_SEQUENCE, REVIEW_TITLE, ZERO_ENERGY_CHECKS, fmtDate, procedureReviewState } from '../lib/rules'
import { approveProcedure, performReview, submitProcedure } from '../lib/api'
import { Badge, Banner, Button, Card, Divider, Empty, ErrorBox, KV, SafetyNotice, SectionHeader, TopBar, useAction } from '../components/ui'
import { procTone } from '../components/rows'
import PointCard from '../components/PointCard'

function Numbered({ n, title, detail }: { n: number; title: string; detail?: string }) {
  return (
    <div className="row-top">
      <span className="tile sm tone-accent" style={{ borderRadius: '50%', width: 28, height: 28, fontWeight: 700, fontSize: 14 }}>{n}</span>
      <div className="grow"><div className="title small">{title}</div>{detail && <div className="small muted pre">{detail}</div>}</div>
    </div>
  )
}

export default function ProcedureView() {
  const { id } = useParams()
  const app = useApp()
  const ctx = useCtx()
  const navigate = useNavigate()
  const act = useAction()
  const [info, setInfo] = useState<string | null>(null)
  const [reviewNote, setReviewNote] = useState('')
  const [reviewing, setReviewing] = useState(false)
  const p = app.procedures.find((x) => x.id === id)
  if (!p) return <div className="page"><TopBar title="LOTO postup" /><Empty title="Postup nenalezen" /></div>
  const e = app.equipment.find((x) => x.id === p.equipment_id)
  const review = procedureReviewState(p)
  const role = app.profile!.role

  const go = (fn: () => Promise<void>, message: string) => act.run(async () => {
    setInfo(null)
    await fn()
    await app.refresh()
    setInfo(message)
  })

  return (
    <div className="page">
      <TopBar title="LOTO postup" />
      <Card>
        <div className="h3">{p.name}</div>
        {e && <div className="small muted">{e.name} · {e.code}</div>}
        <div className="wrap">
          <Badge text={PROCEDURE_STATUS_TITLE[p.status]} tone={procTone(p.status)} />
          <Badge text={`rev. ${p.revision}`} />
          {review && <Badge text={REVIEW_TITLE[review]} tone={review === 'overdue' ? 'danger' : review === 'dueSoon' ? 'warning' : 'neutral'} />}
        </div>
        <Divider />
        <KV k="Autor" v={p.author_name} />
        <KV k="Schválil" v={p.approver_name} />
        <KV k="Schváleno dne" v={p.approved_at ? fmtDate(p.approved_at) : ''} />
        <KV k="Poslední revize" v={p.last_reviewed_at ? `${fmtDate(p.last_reviewed_at)} · ${p.last_reviewed_by}` : ''} />
        <KV k="Příští revize" v={p.next_review_date ? fmtDate(p.next_review_date) : ''} />
      </Card>
      <ErrorBox message={act.error} />
      {info && <Banner title={info} tone="success" />}
      {p.status === 'needsRevision' && <Banner title="Postup vyžaduje revizi" text="Od schválení se změnily zdroje energie zařízení. Před zahájením LOTO se zobrazí varování; HSE musí postup aktualizovat a znovu schválit." />}
      {p.status === 'draft' && <Banner title="Rozpracovaná revize" text="Tato revize zatím není schválena. Podle neschváleného postupu nelze LOTO zahájit." tone="neutral" />}
      {p.status === 'pendingApproval' && <Banner title="Čeká na schválení" text="Revize je odeslána ke schválení HSE / BOZP administrátorovi." tone="accent" />}
      {review === 'overdue' && <Banner title="Revize je po termínu" text="Dokud nebude revize provedena, nelze podle tohoto postupu zahájit LOTO." tone="danger" />}

      {role === 'hse' && (p.status === 'draft' || p.status === 'needsRevision') && (
        <Button disabled={act.busy} onClick={() => go(() => submitProcedure(ctx, p, e), 'Postup byl odeslán ke schválení.')}><Send size={18} /> Odeslat ke schválení</Button>
      )}
      {role === 'hse' && (p.status === 'pendingApproval' || p.status === 'draft') && (
        <Button variant="success" disabled={act.busy} onClick={() => go(() => approveProcedure(ctx, p, e, app.procedures), 'Postup je schválen a naplánována příští revize.')}><CheckCircle size={18} /> Schválit postup</Button>
      )}
      {role === 'hse' && e && <Button variant="secondary" onClick={() => navigate(`/admin/procedure/${e.id}`)}><Pencil size={18} /> Upravit LOTO postup</Button>}
      {role !== 'worker' && p.status === 'approved' && (reviewing ? (
        <Card>
          <div className="small muted">Revizí potvrzujete, že postup odpovídá skutečnému stavu zařízení. Zapíše se revizor a nový termín příští revize.</div>
          <input className="input" placeholder="Zjištění z revize (volitelné)" value={reviewNote} onChange={(ev) => setReviewNote(ev.target.value)} />
          <div className="btn-row">
            <Button variant="secondary" onClick={() => setReviewing(false)}>Zrušit</Button>
            <Button disabled={act.busy} onClick={() => go(async () => { await performReview(ctx, p, e, reviewNote); setReviewing(false) }, 'Revize byla zapsána.')}>Potvrdit revizi</Button>
          </div>
        </Card>
      ) : <Button variant="secondary" onClick={() => setReviewing(true)}><CalendarCheck size={18} /> Provést revizi</Button>)}

      <SectionHeader title="Osobní ochranné prostředky" trailing={p.ppe.length} />
      <Card>
        {p.ppe.length === 0 && <span className="muted">Nejsou uvedeny žádné OOP</span>}
        {p.ppe.map((x, i) => <div key={i} className="row small"><ShieldHalf size={18} color="var(--accent)" />{x}</div>)}
      </Card>

      <SectionHeader title="Přípravné kroky" trailing={p.preparation.length} />
      <Card>{p.preparation.map((s, i) => <Numbered key={i} n={i + 1} title={s.title} detail={s.detail} />)}</Card>

      <SectionHeader title="Izolační body" trailing={p.points.length} />
      {p.points.map((pt, i) => <PointCard key={pt.id} point={pt} machineCode={e?.code ?? ''} index={i + 1} />)}

      <SectionHeader title="Ověření nulového energetického stavu" />
      <Card>{ZERO_ENERGY_CHECKS.map((c) => <div key={c} className="row small"><ShieldCheck size={18} color="var(--success)" />{c}</div>)}</Card>

      <SectionHeader title="Sekvence obnovení" />
      <Card>
        {RESTORATION_SEQUENCE.map((s, i) => (
          <Numbered key={i} n={i + 1} title={s.title} detail={i === 6 && p.restoration.length ? p.restoration.join(' → ') : undefined} />
        ))}
      </Card>

      <SectionHeader title="Historie revizí" />
      <Card>
        {[...p.revisions].reverse().map((r) => (
          <div key={r.revision}><div className="title small">rev. {r.revision} · {r.summary}</div><div className="small muted">{fmtDate(r.at)} · {r.by}</div></div>
        ))}
      </Card>
      <SafetyNotice />
    </div>
  )
}
