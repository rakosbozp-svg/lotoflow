import { useEffect, useMemo, useState } from 'react'
import QRCode from 'qrcode'
import { Printer } from 'lucide-react'
import { useApp, useCtx } from '../lib/store'
import { ENERGY_TITLE, currentProcedure, machineQR, pointQR } from '../lib/rules'
import { audit } from '../lib/api'
import { Button, Card, Empty, SectionHeader, TopBar } from '../components/ui'

interface LabelItem { id: string; kind: 'machine' | 'point'; title: string; code: string; subtitle: string; payload: string }

export default function Labels() {
  const app = useApp()
  const ctx = useCtx()
  const [site, setSite] = useState<string>(app.siteId ?? app.sites[0]?.id ?? '')
  const [workplace, setWorkplace] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [images, setImages] = useState<Record<string, string>>({})
  const [printing, setPrinting] = useState(false)

  const items = useMemo<LabelItem[]>(() => {
    const out: LabelItem[] = []
    for (const e of app.equipment.filter((x) => (!site || x.site_id === site) && (!workplace || x.workplace_id === workplace)).sort((a, b) => a.code.localeCompare(b.code))) {
      const place = [app.sites.find((s) => s.id === e.site_id)?.name, app.workplaces.find((w) => w.id === e.workplace_id)?.name].filter(Boolean).join(' · ')
      out.push({ id: `m-${e.id}`, kind: 'machine', title: e.name, code: e.code, subtitle: place, payload: machineQR(e.code) })
      for (const pt of currentProcedure(app.procedures, e.id)?.points ?? []) {
        out.push({ id: `p-${pt.id}`, kind: 'point', title: pt.name, code: `${e.code} · ${pt.code}`, subtitle: ENERGY_TITLE[pt.energy], payload: pointQR(e.code, pt.code) })
      }
    }
    return out
  }, [app.equipment, app.procedures, app.sites, app.workplaces, site, workplace])

  const chosen = items.filter((i) => selected.has(i.id))

  useEffect(() => {
    let alive = true
    Promise.all(chosen.map(async (i) => [i.id, await QRCode.toDataURL(i.payload, { margin: 1, width: 400, errorCorrectionLevel: 'M' })] as const))
      .then((pairs) => alive && setImages(Object.fromEntries(pairs)))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, items])

  const print = async () => {
    setPrinting(true)
    await audit(ctx, 'labelsPrinted', `Vytvořeno PDF s ${chosen.length} QR štítky`)
    setTimeout(() => { window.print(); setPrinting(false) }, 300)
  }
  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  return (
    <>
      <div className="page no-print">
        <TopBar title="Tisk QR štítků" />
        <div className="btn-row">
          <select className="input" value={site} onChange={(e) => { setSite(e.target.value); setWorkplace('') }} aria-label="Závod">
            {app.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select className="input" value={workplace} onChange={(e) => setWorkplace(e.target.value)} aria-label="Pracoviště">
            <option value="">Všechna pracoviště</option>
            {app.workplaces.filter((w) => w.site_id === site).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </div>
        <div className="tiny">Vytvoří arch se štítky 2 × 4 na stránku A4 s ořezovými čarami. V tiskovém dialogu zvolte „Uložit jako PDF“ nebo tiskárnu. Naskenování vytištěného štítku funguje stejně jako demo kód.</div>
        <SectionHeader title={`Vybráno ${chosen.length} z ${items.length}`} trailing={
          <span className="row" style={{ gap: 12 }}>
            <button className="link-btn" onClick={() => setSelected(new Set(items.map((i) => i.id)))}>Vybrat vše</button>
            <button className="link-btn" onClick={() => setSelected(new Set())}>Zrušit</button>
          </span>} />
        <Card tight>
          {items.length === 0 && <Empty title="Na pracovišti nejsou žádná zařízení" />}
          {items.map((i) => (
            <label key={i.id} className="check" style={{ paddingLeft: i.kind === 'point' ? 24 : 0 }}>
              <input type="checkbox" checked={selected.has(i.id)} onChange={() => toggle(i.id)} />
              <div><div className="title small">{i.title}</div><div className="small mono muted">{i.code}</div></div>
            </label>
          ))}
        </Card>
        <Button disabled={chosen.length === 0 || printing} onClick={print}><Printer size={20} /> Vytvořit PDF štítků{chosen.length ? ` (${chosen.length})` : ''}</Button>
      </div>
      <div className="print-only">
        <div className="labels">
          {chosen.map((i) => (
            <div key={i.id} className="label">
              <span className="head" style={{ background: i.kind === 'point' ? '#d11c1c' : '#0d5cd9' }}>{i.kind === 'point' ? 'LOTO · IZOLAČNÍ BOD' : 'LOTO · ZAŘÍZENÍ'}</span>
              {images[i.id] && <img src={images[i.id]} alt={i.payload} />}
              <b className="mono" style={{ fontSize: '13pt' }}>{i.code}</b>
              <span style={{ fontSize: '10pt', fontWeight: 600 }}>{i.title}</span>
              <span style={{ fontSize: '8pt', color: '#555' }}>{i.subtitle}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}
