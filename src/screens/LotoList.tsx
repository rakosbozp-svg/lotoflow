import { useState } from 'react'
import { useApp } from '../lib/store'
import { Card, Empty, SectionHeader } from '../components/ui'
import { LotoCard } from '../components/rows'

export default function LotoList() {
  const app = useApp()
  const [all, setAll] = useState(false)
  const open = app.scopedLotos.filter((l) => l.status !== 'closed')
  const closed = app.scopedLotos.filter((l) => l.status === 'closed')
  const shown = all ? closed : closed.slice(0, 3)
  return (
    <div className="page">
      <div className="topbar"><h1>Aktivní LOTO</h1></div>
      <div className="tiny">{app.profile?.role === 'worker' ? 'Zobrazuji pouze LOTO, kterých se účastníte' : app.contextLine}</div>
      <SectionHeader title="Probíhající" trailing={open.length} />
      {open.length === 0 && <Card><Empty title="Žádné probíhající LOTO" text="Zahajte LOTO z detailu zařízení." /></Card>}
      {open.map((l) => <LotoCard key={l.id} l={l} />)}
      <SectionHeader title="Ukončená" trailing={closed.length} />
      {closed.length === 0 && <Card><Empty title="Zatím žádné ukončené LOTO" /></Card>}
      {shown.map((l) => <LotoCard key={l.id} l={l} />)}
      {!all && closed.length > 3 && <button className="link-btn" onClick={() => setAll(true)}>Zobrazit všechna ukončená ({closed.length})</button>}
    </div>
  )
}
