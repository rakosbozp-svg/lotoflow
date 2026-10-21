import { useState } from 'react'
import { useApp, useCtx } from '../lib/store'
import { ROLE_TITLE, lockNumber } from '../lib/rules'
import { setMember } from '../lib/api'
import type { Profile, Role } from '../lib/types'
import { Avatar, Badge, Banner, Button, Card, Empty, ErrorBox, SectionHeader, TopBar, useAction } from '../components/ui'

function Editor({ m, onDone }: { m: Profile; onDone: () => void }) {
  const app = useApp()
  const ctx = useCtx()
  const act = useAction()
  const [role, setRole] = useState<Role>(m.role)
  const [site, setSite] = useState<string>(m.site_id ?? '')
  const save = (active: boolean) => act.run(async () => {
    await setMember(ctx, m, role, active, site || null)
    await app.refresh()
    if (m.id === ctx.profile.id) await app.reloadProfile()
    onDone()
  })
  return (
    <Card>
      <div className="title">{m.full_name || m.email}</div>
      <div className="small muted">{m.email} · os. č. {m.personal_number || '—'}</div>
      <div className="field"><label>Role</label>
        <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
          {(['worker', 'supervisor', 'hse'] as Role[]).map((r) => <option key={r} value={r}>{ROLE_TITLE[r]}</option>)}
        </select>
      </div>
      <div className="field"><label>Domovský závod</label>
        <select className="input" value={site} onChange={(e) => setSite(e.target.value)}>
          <option value="">Všechny závody</option>
          {app.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <ErrorBox message={act.error} />
      <div className="btn-row">
        {m.is_active
          ? <Button variant="secondary" disabled={act.busy} onClick={() => save(false)}>Deaktivovat</Button>
          : null}
        <Button variant={m.is_active ? 'primary' : 'success'} disabled={act.busy} onClick={() => save(true)}>{m.is_active ? 'Uložit' : 'Schválit přístup'}</Button>
      </div>
      <button className="link-btn" onClick={onDone}>Zavřít</button>
    </Card>
  )
}

export default function Users() {
  const app = useApp()
  const [open, setOpen] = useState<string | null>(null)
  const active = app.members.filter((m) => m.is_active)
  const inactive = app.members.filter((m) => !m.is_active)
  const row = (m: Profile) => (
    <div key={m.id}>
      <button className="list-row" onClick={() => setOpen(open === m.id ? null : m.id)}>
        <Avatar name={m.full_name || m.email} tone={m.is_active ? 'accent' : 'neutral'} />
        <div className="grow"><div className="title small">{m.full_name || m.email}</div><div className="small muted">{ROLE_TITLE[m.role]} · os. č. {m.personal_number || '—'}</div></div>
        <div style={{ textAlign: 'right' }}>
          <div className="small mono" style={{ color: m.is_active ? 'var(--danger)' : 'var(--text3)' }}>{lockNumber(m)}</div>
          {!m.is_active && <Badge text="Neaktivní" />}
        </div>
      </button>
      {open === m.id && <Editor m={m} onDone={() => setOpen(null)} />}
    </div>
  )
  return (
    <div className="page">
      <TopBar title="Uživatelé" />
      <Banner title={`Kód firmy pro nové kolegy: ${app.company?.join_code}`} text="Kolega si v aplikaci vytvoří účet, zadá tento kód a vy ho tady schválíte a přidělíte roli." tone="accent" />
      <SectionHeader title="Aktivní" trailing={active.length} />
      <Card tight>{active.map(row)}</Card>
      <SectionHeader title="Čekají na schválení / neaktivní" trailing={inactive.length} />
      <Card tight>{inactive.length ? inactive.map(row) : <Empty title="Nikdo nečeká na schválení" />}</Card>
      <div className="tiny">Neaktivní osoby se nenabízejí ve výběrech (předání směny). Jejich podpisy ve starých záznamech zůstávají.</div>
    </div>
  )
}
