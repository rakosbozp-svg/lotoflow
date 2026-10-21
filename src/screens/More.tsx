import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Building2, ClipboardList, FileCog, LogOut, QrCode, Search as SearchIcon, Users as UsersIcon, Smartphone } from 'lucide-react'
import { useApp } from '../lib/store'
import { sb } from '../lib/supabase'
import { ROLE_TITLE, lockNumber } from '../lib/rules'
import { updateOwnProfile } from '../lib/api'
import { Avatar, Button, Card, Chevron, ErrorBox, KV, SafetyNotice, SectionHeader, useAction } from '../components/ui'

export default function More() {
  const app = useApp()
  const me = app.profile!
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(me.full_name)
  const [number, setNumber] = useState(me.personal_number)
  const [prefix, setPrefix] = useState(me.lock_prefix)
  const act = useAction()
  const row = (to: string, icon: React.ReactNode, label: string) => (
    <Link to={to} className="list-row"><span style={{ color: 'var(--accent)' }}>{icon}</span><span className="grow">{label}</span><Chevron /></Link>
  )
  return (
    <div className="page">
      <div className="topbar"><h1>Více</h1></div>
      <Card>
        <div className="row">
          <Avatar name={me.full_name} />
          <div className="grow">
            <div className="title">{me.full_name}</div>
            <div className="small muted">{ROLE_TITLE[me.role]} · {me.personal_number}</div>
            <div className="small mono" style={{ color: 'var(--danger)' }}>🔒 {lockNumber(me)}</div>
          </div>
        </div>
        {editing ? (
          <>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jméno a příjmení" />
            <div className="btn-row">
              <input className="input" value={number} onChange={(e) => setNumber(e.target.value)} placeholder="Osobní číslo" />
              <input className="input mono" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} placeholder="Prefix zámku" />
            </div>
            <ErrorBox message={act.error} />
            <div className="btn-row">
              <Button variant="secondary" small onClick={() => setEditing(false)}>Zrušit</Button>
              <Button small disabled={act.busy} onClick={() => act.run(async () => { await updateOwnProfile(me, name, number, prefix); await app.reloadProfile(); setEditing(false) })}>Uložit</Button>
            </div>
          </>
        ) : <button className="link-btn" style={{ textAlign: 'left' }} onClick={() => setEditing(true)}>Upravit své údaje</button>}
        <div className="small muted">{me.email}</div>
      </Card>

      <SectionHeader title="Registr" />
      <Card tight>
        {row('/search', <SearchIcon size={20} />, 'Hledat v registru')}
        {row('/more/audit', <ClipboardList size={20} />, 'Auditní stopa')}
        {row('/more/labels', <QrCode size={20} />, 'Tisk QR štítků')}
        {row('/more/org', <Building2 size={20} />, me.role === 'hse' ? 'Firma, závody a lidé' : 'Firma a závod')}
      </Card>
      {me.role === 'hse' && (
        <>
          <SectionHeader title="Administrace" />
          <Card tight>
            {row('/more/users', <UsersIcon size={20} />, 'Uživatelé a schvalování přístupu')}
            {row('/admin/equipment/new', <FileCog size={20} />, 'Přidat zařízení')}
          </Card>
          <div className="tiny">Postupy upravíte v detailu zařízení. Dostupné pouze pro roli HSE / BOZP administrátor.</div>
        </>
      )}

      <SectionHeader title="Instalace do telefonu" />
      <Card>
        <div className="row-top"><Smartphone size={22} color="var(--accent)" />
          <div className="small">
            <b>iPhone (Safari):</b> tlačítko Sdílet → „Přidat na plochu“.<br />
            <b>Android (Chrome):</b> nabídka ⋮ → „Přidat na plochu“ / „Instalovat aplikaci“.<br />
            Aplikace se pak otevírá z ikony jako běžná aplikace.
          </div>
        </div>
      </Card>

      <SectionHeader title="O aplikaci" />
      <Card>
        <SafetyNotice />
        <KV k="Firma" v={app.company?.name} />
        <KV k="Úložiště" v="Sdílená databáze firmy (EU)" />
        <Button variant="secondary" onClick={() => sb.auth.signOut()}><LogOut size={18} /> Odhlásit se</Button>
      </Card>
    </div>
  )
}
