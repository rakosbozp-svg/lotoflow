import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, Lock, QrCode, ShieldCheck, X } from 'lucide-react'
import { useApp, useCtx } from '../lib/store'
import { ZERO_ENERGY_CHECKS, lockNumber, pointQR, fmtTime } from '../lib/rules'
import { confirmStep, lockoutSteps, nextLockout, uploadPhoto, verifyPoint, verifyZeroEnergy } from '../lib/api'
import type { Loto } from '../lib/types'
import { Badge, Banner, Button, Card, Empty, ErrorBox, PhotoInput, SafetyNotice, SectionHeader, useAction } from '../components/ui'
import PointCard from '../components/PointCard'
import QrScanner from '../components/QrScanner'

const KIND_TITLE = { preparation: 'Příprava', isolation: 'Izolace', lockout: 'Uzamčení', restoration: 'Obnova' } as const

export function GuideBanner({ loto, blue, label }: { loto: Loto; blue?: boolean; label?: string }) {
  const navigate = useNavigate()
  return (
    <div className={`guide-banner ${blue ? 'blue' : ''}`}>
      <Lock size={22} />
      <div className="grow">
        <div className="title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{loto.equipment_name} · {loto.equipment_code}</div>
        <div className="small" style={{ opacity: 0.9 }}>{label ?? loto.procedure_name} · rev. {loto.procedure_revision}</div>
      </div>
      <button className="close" aria-label="Přerušit a pokračovat později" onClick={() => navigate(`/loto/${loto.id}`)}><X /></button>
    </div>
  )
}

export default function Guide() {
  const { id } = useParams()
  const app = useApp()
  const ctx = useCtx()
  const navigate = useNavigate()
  const act = useAction()
  const loto = app.lotos.find((l) => l.id === id)
  const step = loto ? nextLockout(loto) : undefined
  const [lock, setLock] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [qr, setQr] = useState<{ ok: boolean; message: string } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [checks, setChecks] = useState<string[]>([])

  useEffect(() => {
    setLock(lockNumber(app.profile!))
    setPhoto(null)
    setQr(step?.qr ? { ok: true, message: `QR kód bodu ${step.point_code} ověřen` } : null)
    setScanning(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step?.id])

  if (!loto) return <div className="page"><Empty title="LOTO nenalezeno" /></div>
  const steps = lockoutSteps(loto)
  const number = steps.filter((s) => s.done).length + 1
  const procedure = app.procedures.find((p) => p.id === loto.procedure_id)
  const point = procedure?.points.find((p) => p.id === step?.point_id)

  const confirm = () => act.run(async () => {
    if (!step) return
    const path = photo ? await uploadPhoto(ctx, photo) : undefined
    await confirmStep(ctx, loto.id, step.id, { lock, photoPath: path })
    await app.refresh()
    window.scrollTo({ top: 0 })
  })

  const canConfirm = step && (qr === null || qr.ok) && (step.kind !== 'lockout' || (lock.trim() && photo))

  return (
    <div className="page-full">
      <GuideBanner loto={loto} />
      <div className="page" style={{ paddingTop: 16 }}>
        {loto.status === 'isolating' && step && (
          <>
            <div className="small muted" style={{ fontWeight: 600 }}>Krok {number} z {steps.length}</div>
            <div className="progress"><div style={{ width: `${((number - 1) / steps.length) * 100}%` }} /></div>
            <div><Badge text={KIND_TITLE[step.kind]} tone={step.kind === 'preparation' ? 'accent' : 'danger'} /></div>
            <h2 className="h2">{step.title}</h2>
            {step.instruction && <div className="pre" style={{ fontSize: 19 }}>{step.instruction}</div>}
            {point && <PointCard point={point} machineCode={loto.equipment_code} />}

            {step.kind === 'isolation' && (
              <>
                {qr && <Banner title={qr.ok ? qr.message : 'Nesprávný bod – krok je zablokován'} text={qr.ok ? null : qr.message} tone={qr.ok ? 'success' : 'danger'} />}
                {scanning ? (
                  <Card>
                    <QrScanner
                      hint={`Naskenujte QR štítek bodu ${step.point_code} – ${step.point_name}.`}
                      demoCodes={[pointQR(loto.equipment_code, step.point_code ?? ''), ...(procedure?.points ?? []).filter((p) => p.code !== step.point_code).map((p) => pointQR(loto.equipment_code, p.code)), 'LOTOPOINT:LIS-002:Q01', 'NEZNAMY-KOD-123']}
                      onCode={async (raw) => {
                        const r = await verifyPoint(ctx, loto.id, step.id, raw)
                        setQr(r)
                        if (r.ok) { setScanning(false); await app.refresh() }
                        return r.ok ? { ok: true } : { ok: false, message: r.message }
                      }}
                    />
                    <Button variant="secondary" onClick={() => setScanning(false)}>Zavřít skener</Button>
                  </Card>
                ) : (
                  <Button variant="secondary" onClick={() => setScanning(true)}><QrCode size={18} /> Ověřit bod QR kódem</Button>
                )}
                <SectionHeader title="Fotografie izolace (volitelné)" />
                <PhotoInput file={photo} onChange={setPhoto} />
              </>
            )}

            {step.kind === 'lockout' && (
              <>
                <SectionHeader title="Osobní zámek" />
                <input className="input mono" style={{ fontSize: 20, fontWeight: 600 }} value={lock} onChange={(e) => setLock(e.target.value.toUpperCase())} placeholder="Číslo zámku, např. JN-417" />
                <div className="tiny">Váš osobní zámek: {lockNumber(app.profile!)} ({app.profile!.full_name})</div>
                <SectionHeader title="Fotografie uzamčení (povinné)" />
                <PhotoInput file={photo} onChange={setPhoto} required />
              </>
            )}

            <ErrorBox message={act.error} />
            <Button variant={step.kind === 'preparation' ? 'primary' : 'danger'} disabled={!canConfirm || act.busy} onClick={confirm}>
              {step.kind === 'lockout' ? <Lock size={20} /> : <Check size={20} />}
              {act.busy ? 'Ukládám…' : step.kind === 'lockout' ? 'Potvrdit uzamčení' : step.kind === 'isolation' ? 'Potvrdit izolaci' : 'Potvrdit krok'}
            </Button>
            {step.kind === 'lockout' && !canConfirm && <div className="tiny">Pro potvrzení uzamčení je nutné číslo osobního zámku a fotografie.</div>}
          </>
        )}

        {loto.status === 'isolating' && !step && (
          <>
            <div><Badge text="TRY / TEST" tone="success" /></div>
            <h2 className="h2">Ověření nulového energetického stavu</h2>
            <div className="muted">Než povolíte práci, ověřte na zařízení, že žádná energie nemůže způsobit pohyb, výboj ani únik. Po ověření vraťte ovládací prvky do polohy VYP.</div>
            <Card tight>
              {ZERO_ENERGY_CHECKS.map((c) => (
                <label key={c} className="check">
                  <input type="checkbox" checked={checks.includes(c)} onChange={(e) => setChecks(e.target.checked ? [...checks, c] : checks.filter((x) => x !== c))} />
                  <span style={{ fontWeight: 500 }}>{c}</span>
                </label>
              ))}
            </Card>
            <ErrorBox message={act.error} />
            <Button variant="success" disabled={checks.length < ZERO_ENERGY_CHECKS.length || act.busy} onClick={() => act.run(async () => { await verifyZeroEnergy(ctx, loto.id, checks); await app.refresh() })}>
              <ShieldCheck size={20} /> Potvrdit nulový stav a povolit práci
            </Button>
          </>
        )}

        {loto.status === 'active' && (
          <>
            <div className="center" style={{ padding: '16px 0' }}>
              <ShieldCheck size={64} color="var(--danger)" />
              <h2 className="h2">LOTO aktivní – práce povolena</h2>
              <p className="muted">Všechny body jsou izolovány a uzamčeny a nulový energetický stav je ověřen. Každý, kdo na zařízení pracuje, musí mít připojen svůj osobní zámek.</p>
            </div>
            {loto.zero_verified_at && <Banner title={`Nulový energetický stav ověřen v ${fmtTime(loto.zero_verified_at)}`} text={loto.zero_verified_by} tone="success" />}
            <Button onClick={() => navigate(`/loto/${loto.id}`, { replace: true })}><Check size={20} /> Hotovo</Button>
          </>
        )}

        {(loto.status === 'restoring' || loto.status === 'closed') && (
          <Button onClick={() => navigate(`/loto/${loto.id}`, { replace: true })}>Zpět na detail LOTO</Button>
        )}
        <SafetyNotice />
      </div>
    </div>
  )
}
