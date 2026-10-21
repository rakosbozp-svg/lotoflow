import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, MapPin, Plus } from 'lucide-react'
import { useApp, useCtx } from '../lib/store'
import { ROLE_TITLE } from '../lib/rules'
import { saveCompanyName, saveSite, saveWorkplace } from '../lib/api'
import type { Site, Workplace } from '../lib/types'
import { Banner, Button, Card, ErrorBox, SectionHeader, TopBar, useAction } from '../components/ui'

function InlineEdit({ initial, placeholder, second, secondPlaceholder, onSave, onCancel }: {
  initial: string; placeholder: string; second?: string; secondPlaceholder?: string
  onSave: (a: string, b: string) => Promise<void>; onCancel: () => void
}) {
  const [a, setA] = useState(initial)
  const [b, setB] = useState(second ?? '')
  const act = useAction()
  return (
    <Card>
      <input className="input" placeholder={placeholder} value={a} onChange={(e) => setA(e.target.value)} />
      {secondPlaceholder !== undefined && <input className="input" placeholder={secondPlaceholder} value={b} onChange={(e) => setB(e.target.value)} />}
      <ErrorBox message={act.error} />
      <div className="btn-row">
        <Button variant="secondary" small onClick={onCancel}>Zrušit</Button>
        <Button small disabled={act.busy} onClick={() => act.run(() => onSave(a, b))}>Uložit</Button>
      </div>
    </Card>
  )
}

export default function Organization() {
  const app = useApp()
  const ctx = useCtx()
  const isHSE = app.profile?.role === 'hse'
  const [edit, setEdit] = useState<string | null>(null)

  const done = async () => { await app.refresh(); await app.reloadProfile(); setEdit(null) }
  const choose = (id: string | null) => app.setSiteId(id)
  const siteRow = (s: Site | null) => {
    const selected = app.siteId === (s?.id ?? null)
    return (
      <button key={s?.id ?? 'all'} className="list-row" disabled={!isHSE} onClick={() => choose(s?.id ?? null)}>
        <MapPin size={18} color="var(--accent)" />
        <div className="grow"><div className="title small">{s?.name ?? 'Všechny závody'}</div><div className="small muted">{s?.city ?? app.company?.name}</div></div>
        {selected && <Check size={20} color="var(--accent)" />}
      </button>
    )
  }

  return (
    <div className="page">
      <TopBar title={isHSE ? 'Firma, závody a lidé' : 'Firma a závod'} />
      {!isHSE && <Banner title="Zobrazení je dané vaší rolí" text={`Role ${ROLE_TITLE[app.profile!.role]} vidí pouze svůj domovský závod. Přepnout závod může HSE / BOZP administrátor.`} tone="accent" />}
      <SectionHeader title="Zobrazovaný závod" />
      <Card tight>
        {isHSE && siteRow(null)}
        {app.sites.map(siteRow)}
      </Card>
      <div className="tiny">{app.contextLine}</div>

      {isHSE && (
        <>
          <SectionHeader title="Firma" />
          {edit === 'company' ? (
            <InlineEdit initial={app.company!.name} placeholder="Název" second={app.company!.registration_number} secondPlaceholder="IČO"
              onSave={async (a, b) => { await saveCompanyName(ctx, a, b); await done() }} onCancel={() => setEdit(null)} />
          ) : (
            <Card>
              <div className="title">{app.company!.name}</div>
              <div className="small muted">IČO {app.company!.registration_number || '—'} · kód pro kolegy <b className="mono">{app.company!.join_code}</b></div>
              <button className="link-btn" style={{ textAlign: 'left' }} onClick={() => setEdit('company')}>Upravit firmu</button>
              <Link to="/more/users" className="link-btn">Uživatelé a schvalování přístupu →</Link>
            </Card>
          )}
          <SectionHeader title="Závody a pracoviště" />
          {app.sites.map((s) => (
            <Card key={s.id}>
              {edit === `s-${s.id}` ? (
                <InlineEdit initial={s.name} placeholder="Název závodu" second={s.city} secondPlaceholder="Město" onSave={async (a, b) => { await saveSite(ctx, s, a, b); await done() }} onCancel={() => setEdit(null)} />
              ) : (
                <button className="list-row" onClick={() => setEdit(`s-${s.id}`)}><div className="grow"><div className="title">{s.name}</div><div className="small muted">{s.city}</div></div></button>
              )}
              {app.workplaces.filter((w) => w.site_id === s.id).map((w: Workplace) => edit === `w-${w.id}` ? (
                <InlineEdit key={w.id} initial={w.name} placeholder="Název pracoviště" onSave={async (a) => { await saveWorkplace(ctx, w, s.id, a); await done() }} onCancel={() => setEdit(null)} />
              ) : (
                <button key={w.id} className="list-row small" style={{ paddingLeft: 20 }} onClick={() => setEdit(`w-${w.id}`)}>{w.name}</button>
              ))}
              {edit === `nw-${s.id}` ? (
                <InlineEdit initial="" placeholder="Název pracoviště" onSave={async (a) => { await saveWorkplace(ctx, null, s.id, a); await done() }} onCancel={() => setEdit(null)} />
              ) : <button className="link-btn" style={{ textAlign: 'left' }} onClick={() => setEdit(`nw-${s.id}`)}><Plus size={14} /> Přidat pracoviště</button>}
            </Card>
          ))}
          {edit === 'ns' ? (
            <InlineEdit initial="" placeholder="Název závodu" second="" secondPlaceholder="Město" onSave={async (a, b) => { await saveSite(ctx, null, a, b); await done() }} onCancel={() => setEdit(null)} />
          ) : <Button variant="secondary" onClick={() => setEdit('ns')}><Plus size={18} /> Přidat závod</Button>}
        </>
      )}
    </div>
  )
}
