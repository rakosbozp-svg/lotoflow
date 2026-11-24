// Jednostránková karta LOTO postupu k vyvěšení u zařízení (tisk A4 na výšku).
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { Printer } from 'lucide-react'
import { useApp, useCtx } from '../lib/store'
import { ENERGY_TITLE, RESTORATION_SEQUENCE, codeColor, fmtDate, isLockable, machineQR, zeroChecksFor } from '../lib/rules'
import { audit, photoUrl } from '../lib/api'
import { Banner, Button, Empty, TopBar } from '../components/ui'

function usePhotoUrls(paths: (string | null | undefined)[]) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const key = paths.filter(Boolean).join('|')
  useEffect(() => {
    let alive = true
    const list = paths.filter((x): x is string => !!x)
    Promise.all(list.map(async (p) => [p, await photoUrl(p)] as const))
      .then((pairs) => alive && setUrls(Object.fromEntries(pairs.filter(([, u]) => !!u)) as Record<string, string>))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return urls
}

export default function ProcedureCard() {
  const { id } = useParams()
  const app = useApp()
  const ctx = useCtx()
  const p = app.procedures.find((x) => x.id === id)
  const e = p ? app.equipment.find((x) => x.id === p.equipment_id) : undefined
  const [qr, setQr] = useState<string | null>(null)
  const urls = usePhotoUrls([p?.overview_photo_path, ...(p?.points ?? []).map((pt) => pt.photo_path)])

  useEffect(() => {
    if (!e) return
    QRCode.toDataURL(machineQR(e.code), { margin: 0, width: 300, errorCorrectionLevel: 'M' }).then(setQr)
  }, [e])

  if (!p || !e) return <div className="page"><TopBar title="Karta LOTO postupu" /><Empty title="Postup nenalezen" /></div>

  const place = [app.sites.find((s) => s.id === e.site_id)?.name, app.workplaces.find((w) => w.id === e.workplace_id)?.name].filter(Boolean).join(', ')
  const lockable = p.points.filter(isLockable)
  const useBox = lockable.length > 1
  const elements = [...new Set(lockable.map((pt) => pt.lock.trim()).filter(Boolean))]
  const prvky = [
    useBox ? `${lockable.length} terénní zámky (žluté) + LOTO box` : null,
    ...elements,
    'osobní zámek (červený) každá osoba',
  ].filter(Boolean).join(' · ')
  const warnings = p.preparation.filter((s) => s.warning)
  const before = p.preparation.filter((s) => !s.warning)
  const release = p.restoration.length ? p.restoration : RESTORATION_SEQUENCE.map((s) => s.text)
  const approved = p.status === 'approved'

  const print = async () => {
    await audit(ctx, 'cardPrinted', `Vytištěna karta LOTO postupu – ${e.name} (rev. ${p.revision})`, { equipment: e, procedureId: p.id })
    setTimeout(() => window.print(), 200)
  }

  return (
    <>
      <div className="page no-print">
        <TopBar title="Karta k zařízení" />
        {!approved && <Banner tone="warning" title="Postup není schválen" text="Karta je označena jako návrh a nesmí být vyvěšena u zařízení." />}
        <div className="tiny">Jednostránková karta A4 na výšku k vyvěšení u zařízení. V tiskovém dialogu zvolte tiskárnu nebo „Uložit jako PDF“, měřítko 100 %. Kartu vyvěste v provedení odolném proti poškození.</div>
        <Button onClick={print}><Printer size={20} /> Vytisknout kartu</Button>
      </div>

      <div className="lk-sheet">
        {!approved && <div className="lk-draft">NÁVRH – NESCHVÁLENO – NEVYVĚŠOVAT</div>}
        <header className="lk-head">
          <div>
            <div className="lk-kicker">{ctx.company.name}</div>
            <div className="lk-title">LOTO POSTUP ZAŘÍZENÍ</div>
            <div className="lk-sub">zajištění proti neočekávanému spuštění</div>
          </div>
          <div className="lk-ids">
            <div>Č. postupu: <b>{e.code}</b></div>
            <div>Inv. č.: <b>{e.asset_number || '—'}</b></div>
          </div>
          {qr && <img className="lk-qr" src={qr} alt={machineQR(e.code)} />}
        </header>

        <section className="lk-meta">
          <div className="lk-name">{e.name}</div>
          <div className="lk-place">{place || '—'}</div>
          <div className="lk-meta-row">
            <span>Revize / datum: <b>{p.revision} / {fmtDate(p.approved_at ?? p.updated_at)}</b></span>
            <span>Zpracoval: <b>{p.author_name || '—'}</b></span>
            <span>Schválil: <b>{p.approver_name || '—'}</b></span>
          </div>
        </section>

        <section className="lk-overview">
          <div className="lk-count">
            <div className="lk-count-n">{lockable.length}</div>
            <div className="lk-count-t">{lockable.length === 1 ? 'uzamykací bod' : lockable.length >= 2 && lockable.length <= 4 ? 'uzamykací body' : 'uzamykacích bodů'}</div>
            <div className="lk-prvky"><b>LOTO prvky:</b> {prvky}</div>
            <div className="lk-codes">
              {p.points.map((pt) => {
                const c = codeColor(pt.code, pt.energy)
                return <span key={pt.id} className="lk-chip" style={{ background: c.bg, color: c.fg }}>{pt.code}</span>
              })}
            </div>
          </div>
          <div className="lk-photo">
            {p.overview_photo_path && urls[p.overview_photo_path]
              ? <img src={urls[p.overview_photo_path]} alt="Přehled zařízení s izolačními body" />
              : <span>Přehledová fotografie nebo nákres s vyznačenými body</span>}
          </div>
        </section>

        {warnings.length > 0 && (
          <section className="lk-warn">
            <div className="lk-warn-h">⚠ UPOZORNĚNÍ</div>
            {warnings.map((s, i) => <div key={i}>• <b>{s.title}</b>{s.detail ? ` – ${s.detail}` : ''}</div>)}
          </section>
        )}
        {before.length > 0 && (
          <section className="lk-before"><b>Před zajištěním:</b> {before.map((s) => (s.detail ? `${s.title} – ${s.detail}` : s.title).replace(/[.\s]+$/, '')).join('; ')}.</section>
        )}

        <table className="lk-table">
          <thead>
            <tr><th>#</th><th>Kód</th><th>Energie</th><th>Izolační bod – umístění</th><th>Způsob izolace</th><th>LOTO prvek</th><th>Detail</th></tr>
          </thead>
          <tbody>
            {p.points.map((pt, i) => {
              const c = codeColor(pt.code, pt.energy)
              return (
                <tr key={pt.id}>
                  <td className="lk-c">{i + 1}</td>
                  <td className="lk-c"><span className="lk-chip" style={{ background: c.bg, color: c.fg }}>{pt.code}</span></td>
                  <td>{ENERGY_TITLE[pt.energy]}</td>
                  <td><b>{pt.name}</b>{pt.location && <div>{pt.location}</div>}</td>
                  <td>{pt.method}{pt.verification && <div className="lk-ver">Ověření: {pt.verification}</div>}</td>
                  <td>{isLockable(pt) ? `${pt.lock || 'LOTO prvek'} + ${useBox ? 'terénní' : 'osobní'} zámek` : (pt.lock || 'bez zámku')}</td>
                  <td className="lk-thumb">{pt.photo_path && urls[pt.photo_path] ? <img src={urls[pt.photo_path]} alt={`Bod ${pt.code}`} /> : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <section className="lk-zero">
          <div className="lk-zero-h">✔ OVĚŘENÍ NULOVÉHO STAVU – bez ověření se nezačíná</div>
          <ol>{zeroChecksFor(p).map((c) => <li key={c}>{c}</li>)}</ol>
        </section>

        <section className="lk-release">
          <div className="lk-release-h">UVOLNĚNÍ ZAŘÍZENÍ DO PROVOZU</div>
          <ol>{release.map((t, i) => <li key={i}>{t}</li>)}</ol>
        </section>

        {p.ppe.length > 0 && <section className="lk-ppe"><b>OOPP:</b> {p.ppe.join(', ')}</section>}

        <footer className="lk-foot">
          {useBox ? 'Klíče od terénních zámků patří do LOTO boxu · ' : ''}Každá osoba se na zařízení zajišťuje vlastním osobním zámkem s visačkou · Cizí zámek nikdy neodstraňuj
        </footer>
      </div>
    </>
  )
}
