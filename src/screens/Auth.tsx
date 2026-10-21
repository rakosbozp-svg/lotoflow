import { useState } from 'react'
import { LockKeyhole, ShieldCheck, Activity } from 'lucide-react'
import { sb } from '../lib/supabase'
import { useApp } from '../lib/store'
import { createCompany, joinCompany } from '../lib/api'
import { seedDemo } from '../lib/demo'
import { Banner, Button, Card, ErrorBox, SafetyNotice, Tile, useAction } from '../components/ui'
import type { Company, Profile } from '../lib/types'

function Intro() {
  return (
    <Card>
      <div className="row"><Tile icon={<LockKeyhole size={22} />} tone="danger" /><div><div className="title">LOTO pod kontrolou</div><div className="small muted">Uzamčení zařízení krok za krokem podle schváleného postupu.</div></div></div>
      <div className="row"><Tile icon={<ShieldCheck size={22} />} /><div><div className="title">Správný postup. Správné zařízení. Správný bod.</div><div className="small muted">QR štítky hlídají, že izolujete přesně to, co postup předepisuje.</div></div></div>
      <div className="row"><Tile icon={<Activity size={22} />} tone="success" /><div><div className="title">Přehled v reálném čase</div><div className="small muted">Kdo má na stroji zámek a co čeká na revizi – pro celý tým.</div></div></div>
    </Card>
  )
}

export function AuthScreen() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [info, setInfo] = useState<string | null>(null)
  const { busy, error, run } = useAction()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setInfo(null)
    run(async () => {
      if (mode === 'login') {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else {
        const redirect = window.location.origin + window.location.pathname
        const { data, error } = await sb.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: redirect } })
        if (error) throw error
        if (!data.session) setInfo('Poslali jsme vám potvrzovací e-mail. Otevřete odkaz v něm a pak se přihlaste.')
      }
    })
  }

  return (
    <div className="page">
      <div className="topbar"><div className="brand">LOTOFLOW</div></div>
      <Intro />
      <form className="card" onSubmit={submit}>
        <div className="chips">
          <button type="button" className={`chip ${mode === 'login' ? 'on' : ''}`} onClick={() => setMode('login')}>Přihlásit se</button>
          <button type="button" className={`chip ${mode === 'register' ? 'on' : ''}`} onClick={() => setMode('register')}>Nový účet</button>
        </div>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pw">Heslo</label>
          <input id="pw" className="input" type="password" minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <ErrorBox message={error} />
        {info && <Banner title={info} tone="success" />}
        <Button type="submit" disabled={busy}>{mode === 'login' ? 'Přihlásit se' : 'Vytvořit účet'}</Button>
      </form>
      <SafetyNotice />
    </div>
  )
}

/** Po registraci: založit firmu (HSE) nebo se připojit kódem firmy. */
export function SetupScreen() {
  const { profile, reloadProfile } = useApp()
  const [mode, setMode] = useState<'join' | 'create'>('join')
  const [fullName, setFullName] = useState(profile?.full_name ?? '')
  const [personal, setPersonal] = useState('')
  const [prefix, setPrefix] = useState('')
  const [code, setCode] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [demo, setDemo] = useState(true)
  const { busy, error, run } = useAction()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    run(async () => {
      if (!fullName.trim() || !personal.trim() || !prefix.trim()) throw new Error('Vyplňte jméno, osobní číslo a prefix zámku.')
      if (mode === 'create') {
        const companyId = await createCompany(companyName, fullName, personal, prefix)
        if (demo) {
          const { data: c } = await sb.from('companies').select('*').eq('id', companyId).single()
          const { data: p } = await sb.from('profiles').select('*').eq('id', profile!.id).single()
          await seedDemo({ company: c as Company, profile: p as Profile })
        }
      } else {
        await joinCompany(code, fullName, personal, prefix)
      }
      await reloadProfile()
    })
  }

  return (
    <div className="page">
      <div className="topbar"><div className="brand">LOTOFLOW</div><button className="link-btn" onClick={() => sb.auth.signOut()}>Odhlásit</button></div>
      <form className="card" onSubmit={submit}>
        <div className="h3">Vaše údaje</div>
        <div className="field"><label>Jméno a příjmení</label><input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required /></div>
        <div className="btn-row">
          <div className="field"><label>Osobní číslo</label><input className="input" inputMode="numeric" value={personal} onChange={(e) => setPersonal(e.target.value)} required /></div>
          <div className="field"><label>Prefix zámku (např. JN)</label><input className="input mono" value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} maxLength={4} required /></div>
        </div>
        <div className="chips">
          <button type="button" className={`chip ${mode === 'join' ? 'on' : ''}`} onClick={() => setMode('join')}>Připojit se k firmě</button>
          <button type="button" className={`chip ${mode === 'create' ? 'on' : ''}`} onClick={() => setMode('create')}>Založit firmu</button>
        </div>
        {mode === 'join' ? (
          <>
            <div className="field"><label>Kód firmy</label><input className="input mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Např. 4F2A9C" required /></div>
            <span className="small muted">Kód vám dá HSE administrátor (najde ho ve Více → Firma a lidé). Po připojení vás musí schválit.</span>
          </>
        ) : (
          <>
            <div className="field"><label>Název firmy</label><input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required /></div>
            <label className="check"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} /> Naplnit ukázkovými daty (závody, stroje, postupy)</label>
            <span className="small muted">Stanete se HSE / BOZP administrátorem firmy a budete schvalovat přístup kolegů.</span>
          </>
        )}
        <ErrorBox message={error} />
        <Button type="submit" disabled={busy}>{busy ? 'Ukládám…' : mode === 'join' ? 'Připojit se' : 'Založit firmu'}</Button>
      </form>
    </div>
  )
}

export function PendingScreen() {
  const { profile, reloadProfile } = useApp()
  return (
    <div className="page">
      <div className="topbar"><div className="brand">LOTOFLOW</div><button className="link-btn" onClick={() => sb.auth.signOut()}>Odhlásit</button></div>
      <Banner
        title="Čekáte na schválení"
        text={`Účet ${profile?.email ?? ''} je připojený k firmě. HSE administrátor vám musí v aplikaci (Více → Firma a lidé) povolit přístup a přidělit roli.`}
        tone="accent"
      />
      <Button onClick={() => reloadProfile()}>Zkontrolovat znovu</Button>
    </div>
  )
}
