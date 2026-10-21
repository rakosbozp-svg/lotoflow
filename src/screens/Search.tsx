import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useApp } from '../lib/store'
import { PROCEDURE_STATUS_TITLE, matches, ENERGY_TITLE } from '../lib/rules'
import { Badge, Card, Empty, EnergyIcon, SectionHeader, Tile, TopBar } from '../components/ui'
import { EquipmentRow, procTone } from '../components/rows'

export default function Search() {
  const app = useApp()
  const [q, setQ] = useState('')
  const text = q.trim()
  const ids = new Set(app.scopedEquipment.map((e) => e.id))
  const procs = app.procedures.filter((p) => ids.has(p.equipment_id) && p.status !== 'archived')
  const eq = text.length < 2 ? [] : app.scopedEquipment.filter((e) => matches([e.name, e.code, e.manufacturer, e.equipment_type, e.asset_number], text))
  const pr = text.length < 2 ? [] : procs.filter((p) => matches([p.name, p.author_name, app.equipment.find((e) => e.id === p.equipment_id)?.code], text))
  const pts = text.length < 2 ? [] : procs.flatMap((p) => p.points.map((pt) => ({ p, pt }))).filter(({ pt }) => matches([pt.code, pt.name, pt.location, pt.method, ENERGY_TITLE[pt.energy]], text))
  return (
    <div className="page">
      <TopBar title="Hledat v registru" />
      <input className="input" type="search" autoFocus placeholder="Stroj, postup nebo izolační bod" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="tiny">{app.contextLine}</div>
      {text.length < 2 ? (
        <Empty title="Zadejte alespoň dva znaky" text="Hledá se v zařízeních, postupech a izolačních bodech aktuálního závodu. Diakritika nehraje roli." />
      ) : eq.length + pr.length + pts.length === 0 ? (
        <Empty title={`Pro „${text}“ nic nenalezeno`} />
      ) : (
        <>
          {eq.length > 0 && <><SectionHeader title={`Stroje (${eq.length})`} /><Card tight>{eq.map((e) => <EquipmentRow key={e.id} e={e} lotos={app.lotos} procedures={app.procedures} defects={app.defects} />)}</Card></>}
          {pr.length > 0 && <><SectionHeader title={`Postupy (${pr.length})`} /><Card tight>{pr.map((p) => (
            <Link key={p.id} to={`/procedure/${p.id}`} className="list-row"><div className="grow"><div className="title small">{p.name}</div><div className="small muted">rev. {p.revision}</div></div><Badge text={PROCEDURE_STATUS_TITLE[p.status]} tone={procTone(p.status)} /></Link>
          ))}</Card></>}
          {pts.length > 0 && <><SectionHeader title={`Izolační body (${pts.length})`} /><Card tight>{pts.map(({ p, pt }) => (
            <Link key={pt.id} to={`/procedure/${p.id}`} className="list-row"><Tile icon={<EnergyIcon type={pt.energy} />} tone="danger" small /><div className="grow"><div className="title small">{pt.code} · {pt.name}</div><div className="small muted">{app.equipment.find((e) => e.id === p.equipment_id)?.name} · {pt.location}</div></div></Link>
          ))}</Card></>}
        </>
      )}
    </div>
  )
}
