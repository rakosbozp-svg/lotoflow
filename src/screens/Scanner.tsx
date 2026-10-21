import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { QrCode } from 'lucide-react'
import { useApp } from '../lib/store'
import { parseQR } from '../lib/rules'
import type { Equipment, IsolationPoint } from '../lib/types'
import { currentProcedure } from '../lib/rules'
import { Banner, Button, TopBar } from '../components/ui'
import QrScanner from '../components/QrScanner'
import PointCard from '../components/PointCard'

export default function Scanner() {
  const app = useApp()
  const navigate = useNavigate()
  const [found, setFound] = useState<{ e: Equipment; p: IsolationPoint } | null>(null)
  const demo = ['LOTOMACHINE:MIX-004', 'LOTOPOINT:MIX-004:Q01', 'LOTOMACHINE:LIS-002', 'LOTOMACHINE:XYZ-999', 'https://example.com/neznamy']

  const onCode = (raw: string) => {
    const q = parseQR(raw)
    if (!q) return { ok: false as const, message: 'Neznámý QR kód' }
    const code = q.kind === 'machine' ? q.code : q.machine
    const e = app.equipment.find((x) => x.code.toUpperCase() === code)
    if (!e) return { ok: false as const, message: `Neznámý QR kód – zařízení ${code} není v registru.` }
    if (q.kind === 'machine') {
      navigate(`/equipment/${e.id}`, { replace: true })
      return { ok: true as const }
    }
    const p = currentProcedure(app.procedures, e.id)?.points.find((x) => x.code.toUpperCase() === q.point)
    if (!p) return { ok: false as const, message: `Neznámý QR kód – bod ${q.point} není v platném postupu.` }
    setFound({ e, p })
    return { ok: true as const }
  }

  if (found) {
    const open = app.lotos.find((l) => l.equipment_id === found.e.id && l.status !== 'closed')
    return (
      <div className="page">
        <TopBar title="Izolační bod" />
        <Banner title={`Izolační bod ${found.p.code}`} text={`Bod patří k zařízení ${found.e.name} (${found.e.code}) a je součástí platného postupu.`} tone="accent" />
        <PointCard point={found.p} machineCode={found.e.code} />
        {open && <Banner title="Na zařízení probíhá LOTO" tone="danger" />}
        <Button onClick={() => navigate(`/equipment/${found.e.id}`, { replace: true })}>Otevřít zařízení</Button>
        <Button variant="secondary" onClick={() => setFound(null)}><QrCode size={18} /> Skenovat znovu</Button>
      </div>
    )
  }

  return (
    <div className="page">
      <TopBar title="Skenovat QR" />
      <QrScanner onCode={onCode} demoCodes={demo} hint="Namiřte kameru na QR štítek stroje (LOTOMACHINE) nebo izolačního bodu (LOTOPOINT)." />
    </div>
  )
}
