import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { sb } from './supabase'
import type { Company, Defect, Equipment, Loto, Procedure, Profile, Site, Workplace } from './types'
import type { Ctx } from './api'

interface Data {
  sites: Site[]
  workplaces: Workplace[]
  equipment: Equipment[]
  procedures: Procedure[]
  lotos: Loto[]
  defects: Defect[]
  members: Profile[]
}

const EMPTY: Data = { sites: [], workplaces: [], equipment: [], procedures: [], lotos: [], defects: [], members: [] }

interface AppValue extends Data {
  session: Session | null
  profile: Profile | null
  company: Company | null
  ready: boolean
  loading: boolean
  ctx: Ctx | null
  /** Vybraný závod; null = všechny (jen HSE). */
  siteId: string | null
  setSiteId: (id: string | null) => void
  contextLine: string
  refresh: () => Promise<void>
  reloadProfile: () => Promise<void>
  // Data omezená na vybraný závod
  scopedEquipment: Equipment[]
  scopedLotos: Loto[]
}

const AppContext = createContext<AppValue | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [data, setData] = useState<Data>(EMPTY)
  const [ready, setReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [siteChoice, setSiteChoice] = useState<string | null>(() => {
    try { return localStorage.getItem('lotoflow.site') } catch { return null }
  })

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (!data.session) setReady(true)
    })
    const { data: sub } = sb.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const reloadProfile = useCallback(async () => {
    if (!session) {
      setProfile(null)
      setCompany(null)
      setData(EMPTY)
      setReady(true)
      return
    }
    const { data: p } = await sb.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
    setProfile((p as Profile) ?? null)
    if (p?.company_id && p.is_active) {
      const { data: c } = await sb.from('companies').select('*').eq('id', p.company_id).maybeSingle()
      setCompany((c as Company) ?? null)
    } else {
      setCompany(null)
    }
    setReady(true)
  }, [session])

  useEffect(() => { reloadProfile() }, [reloadProfile])

  const refresh = useCallback(async () => {
    if (!company) return
    setLoading(true)
    const [sites, workplaces, equipment, procedures, lotos, defects, members] = await Promise.all([
      sb.from('sites').select('*').order('name'),
      sb.from('workplaces').select('*').order('name'),
      sb.from('equipment').select('*').order('name'),
      sb.from('procedures').select('*'),
      sb.from('lotos').select('*').order('started_at', { ascending: false }).limit(300),
      sb.from('defects').select('*').order('created_at', { ascending: false }),
      sb.from('profiles').select('*').order('full_name'),
    ])
    setData({
      sites: (sites.data ?? []) as Site[],
      workplaces: (workplaces.data ?? []) as Workplace[],
      equipment: (equipment.data ?? []) as Equipment[],
      procedures: (procedures.data ?? []) as Procedure[],
      lotos: (lotos.data ?? []) as Loto[],
      defects: (defects.data ?? []) as Defect[],
      members: (members.data ?? []) as Profile[],
    })
    setLoading(false)
  }, [company])

  useEffect(() => { refresh() }, [refresh])

  // Živé změny od ostatních uživatelů
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => {
    if (!company) return
    const schedule = () => {
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => refresh(), 400)
    }
    const channel = sb
      .channel('lotoflow-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lotos' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'defects' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'procedures' }, schedule)
      .subscribe()
    const onFocus = () => schedule()
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      sb.removeChannel(channel)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [company, refresh])

  const canChooseSite = profile?.role === 'hse'
  const siteId = canChooseSite ? (siteChoice && data.sites.some((s) => s.id === siteChoice) ? siteChoice : null) : profile?.site_id ?? null
  const setSiteId = (id: string | null) => {
    setSiteChoice(id)
    try { id ? localStorage.setItem('lotoflow.site', id) : localStorage.removeItem('lotoflow.site') } catch { /* soukromý režim */ }
  }
  const site = data.sites.find((s) => s.id === siteId)
  const contextLine = site ? `Zobrazuji pouze závod ${site.city || site.name}` : `Zobrazuji všechny závody – ${company?.name ?? ''}`

  const value = useMemo<AppValue>(() => {
    const scopedEquipment = data.equipment.filter((e) => !siteId || e.site_id === siteId)
    const scopedLotos = data.lotos.filter((l) => {
      if (siteId && l.site_id !== siteId) return false
      if (profile?.role === 'worker') {
        return l.started_by === profile.id || l.responsible_id === profile.id || l.participants.some((p) => p.user_id === profile.id)
      }
      return true
    })
    return {
      ...data, session, profile, company, ready, loading, siteId, setSiteId, contextLine, refresh, reloadProfile,
      ctx: profile && company ? { profile, company } : null,
      scopedEquipment, scopedLotos,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, session, profile, company, ready, loading, siteId, contextLine, refresh, reloadProfile])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppValue {
  const v = useContext(AppContext)
  if (!v) throw new Error('useApp mimo AppProvider')
  return v
}

/** Kontext pro zápis – volat jen na obrazovkách za přihlášením. */
export function useCtx(): Ctx {
  const { ctx } = useApp()
  if (!ctx) throw new Error('Nepřihlášen')
  return ctx
}
