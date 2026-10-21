// Doménová pravidla LOTO – stejná jako v iOS aplikaci.
import type {
  EnergyType, Equipment, Loto, Procedure, ProcedureStatus, Profile, ReviewState, Role, Severity, Defect, LotoStatus,
} from './types'

export const ROLE_TITLE: Record<Role, string> = {
  worker: 'Pracovník',
  supervisor: 'Vedoucí údržby',
  hse: 'HSE / BOZP administrátor',
}

export const ENERGY_TITLE: Record<EnergyType, string> = {
  electrical: 'Elektrická',
  pneumatic: 'Pneumatická',
  hydraulic: 'Hydraulická',
  mechanical: 'Mechanická',
  thermal: 'Tepelná',
  gravitational: 'Gravitační',
  chemical: 'Chemická',
  stored: 'Akumulovaná / zbytková',
}
export const ENERGY_TYPES = Object.keys(ENERGY_TITLE) as EnergyType[]

export const PROCEDURE_STATUS_TITLE: Record<ProcedureStatus, string> = {
  draft: 'Rozpracováno',
  pendingApproval: 'Čeká na schválení',
  approved: 'Schváleno',
  needsRevision: 'Vyžaduje revizi',
  archived: 'Archivováno',
}

export const LOTO_STATUS_TITLE: Record<LotoStatus, string> = {
  isolating: 'Izolace probíhá',
  active: 'LOTO aktivní',
  restoring: 'Obnova probíhá',
  closed: 'LOTO ukončeno',
}

export const REVIEW_TITLE: Record<ReviewState, string> = {
  onTime: 'V termínu',
  dueSoon: 'Blíží se termín',
  overdue: 'Po termínu',
}

export const SEVERITY_TITLE: Record<Severity, string> = {
  note: 'Poznámka',
  minor: 'Nízká',
  major: 'Vysoká',
  critical: 'Kritická',
}
export const SEVERITY_RANK: Record<Severity, number> = { note: 0, minor: 1, major: 2, critical: 3 }

export const SAFETY_NOTICE =
  'LOTOFLOW eviduje a řídí provádění schváleného postupu, ale nenahrazuje fyzickou izolaci, uzamčení a ověření nulového energetického stavu na zařízení.'

export const ZERO_ENERGY_CHECKS = [
  'Pokus o spuštění – zařízení se nerozběhlo',
  'Nulový tlak ověřen na manometrech',
  'Pohyblivé části jsou v klidu a zajištěny',
  'Zbytková a akumulovaná energie uvolněna',
]

export const HANDOVER_CHECKS = [
  'Stav izolace všech bodů zkontrolován',
  'Osobní zámky a visačky zkontrolovány',
  'Přebírající osoba seznámena s postupem a rozsahem prací',
  'Stav rozpracovaných prací předán',
]

export const RESTORATION_SEQUENCE: { title: string; text: string }[] = [
  { title: 'Kontrola dokončení práce', text: 'Ověřte, že všechny práce na zařízení jsou dokončeny a zařízení je kompletní.' },
  { title: 'Odstranění nářadí a materiálu', text: 'Odstraňte ze zařízení a jeho okolí veškeré nářadí, náhradní díly a materiál.' },
  { title: 'Kontrola ochranných prostředků', text: 'Ověřte, že kryty, zábrany a bezpečnostní zařízení jsou zpět na místě a funkční.' },
  { title: 'Kontrola prostoru', text: 'Zkontrolujte, že v nebezpečném prostoru zařízení nikdo není.' },
  { title: 'Potvrzení přítomných osob', text: 'Ověřte, že všichni účastníci jsou mimo nebezpečný prostor a o obnově vědí.' },
  { title: 'Odstranění osobních zámků', text: 'Každý účastník odstraní svůj osobní zámek a visačku.' },
  { title: 'Obnovení energií', text: 'Obnovte zdroje energie v opačném pořadí, než byly izolovány.' },
  { title: 'Informování dotčených osob', text: 'Informujte obsluhu a vedoucího směny, že zařízení je vráceno do provozu.' },
  { title: 'Standardní spuštění', text: 'Spusťte zařízení standardním postupem a ověřte jeho správnou funkci.' },
]
export const LOCK_REMOVAL_INDEX = 5

// --- QR ---
export type QRPayload = { kind: 'machine'; code: string } | { kind: 'point'; machine: string; point: string }

export function parseQR(raw: string): QRPayload | null {
  const parts = raw.trim().split(':').map((p) => p.trim().toUpperCase())
  if (parts[0] === 'LOTOMACHINE' && parts.length === 2 && parts[1]) return { kind: 'machine', code: parts[1] }
  if (parts[0] === 'LOTOPOINT' && parts.length === 3 && parts[1] && parts[2]) return { kind: 'point', machine: parts[1], point: parts[2] }
  return null
}
export const machineQR = (code: string) => `LOTOMACHINE:${code.toUpperCase()}`
export const pointQR = (machine: string, point: string) => `LOTOPOINT:${machine.toUpperCase()}:${point.toUpperCase()}`

// --- Text ---
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}
export function matches(fields: (string | null | undefined)[], query: string): boolean {
  const q = fold(query.trim())
  if (!q) return true
  return fields.some((f) => !!f && fold(f).includes(q))
}

// --- Revize ---
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
export function reviewState(next: string | null, now = new Date()): ReviewState | null {
  if (!next) return null
  const due = startOfDay(new Date(next))
  const today = startOfDay(now)
  if (due < today) return 'overdue'
  const limit = new Date(today)
  limit.setDate(limit.getDate() + 30)
  return due <= limit ? 'dueSoon' : 'onTime'
}
export function procedureReviewState(p: Procedure | undefined, now = new Date()): ReviewState | null {
  if (!p || (p.status !== 'approved' && p.status !== 'needsRevision')) return null
  return reviewState(p.next_review_date, now)
}
export function addMonths(d: Date, months: number): Date {
  const r = new Date(d)
  r.setMonth(r.getMonth() + Math.max(1, months))
  return r
}
export function daysUntil(date: string, now = new Date()): number {
  return Math.round((startOfDay(new Date(date)).getTime() - startOfDay(now).getTime()) / 86_400_000)
}

// --- Osoby ---
export function lockNumber(p: Pick<Profile, 'lock_prefix' | 'personal_number'>): string {
  return `${p.lock_prefix.toUpperCase()}-${p.personal_number.slice(-3)}`
}
export function initials(name: string): string {
  return name.split(' ').filter((w) => w && !w.endsWith('.')).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

// --- Zařízení ---
export function currentProcedure(procs: Procedure[], equipmentId: string): Procedure | undefined {
  return procs
    .filter((p) => p.equipment_id === equipmentId && p.status !== 'archived')
    .sort((a, b) => b.revision - a.revision)[0]
}
export type EquipmentState = 'running' | 'lotoActive' | 'outOfService'
export const EQUIPMENT_STATE_TITLE: Record<EquipmentState, string> = {
  running: 'PROVOZ',
  lotoActive: 'LOTO AKTIVNÍ',
  outOfService: 'MIMO PROVOZ',
}
export function equipmentState(e: Equipment, lotos: Loto[]): EquipmentState {
  if (lotos.some((l) => l.equipment_id === e.id && l.status !== 'closed')) return 'lotoActive'
  return e.out_of_service ? 'outOfService' : 'running'
}
export function openDefects(defects: Defect[], equipmentId: string): Defect[] {
  return defects
    .filter((d) => d.equipment_id === equipmentId && !d.resolved_at)
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] || b.created_at.localeCompare(a.created_at))
}

// --- Kontroly před zahájením ---
export interface Preflight { blockers: string[]; warnings: string[]; open?: Loto }

export function preflight(e: Equipment, procs: Procedure[], lotos: Loto[], defects: Defect[], now = new Date()): Preflight {
  const result: Preflight = { blockers: [], warnings: [] }
  result.open = lotos.find((l) => l.equipment_id === e.id && l.status !== 'closed')
  const p = currentProcedure(procs, e.id)
  if (!p) {
    result.blockers.push('Zařízení nemá LOTO postup. Kontaktujte HSE / BOZP administrátora.')
  } else {
    if (p.status !== 'approved' && p.status !== 'needsRevision') {
      result.blockers.push(`Postup není schválen (stav: ${PROCEDURE_STATUS_TITLE[p.status]}). LOTO lze provádět jen podle schváleného postupu.`)
    }
    const review = procedureReviewState(p, now)
    if (review === 'overdue') {
      result.blockers.push('Periodická revize postupu je po termínu. Dokud ji vedoucí nebo HSE neprovede, nelze LOTO zahájit.')
    }
    if (p.status === 'needsRevision') {
      result.warnings.push('Postup vyžaduje revizi – od schválení se změnily zdroje energie. Ověřte na místě, že postup odpovídá skutečnosti, a informujte HSE.')
    }
    if (review === 'dueSoon' && p.next_review_date) {
      result.warnings.push(`Periodická revize postupu se blíží (${fmtDate(p.next_review_date)}).`)
    }
  }
  if (e.out_of_service) result.warnings.push('Zařízení je evidováno mimo provoz.')
  for (const d of openDefects(defects, e.id)) {
    if (d.severity !== 'note') {
      result.warnings.push(`Nevyřešená závada (${SEVERITY_TITLE[d.severity].toLowerCase()}): ${d.title}. Ověřte, zda neovlivňuje izolaci nebo bezpečnost prací.`)
    }
  }
  return result
}

// --- Úplnost postupu (schválení) ---
export function missingItems(p: Procedure, e: Equipment | undefined): string[] {
  const missing: string[] = []
  if (!p.name.trim()) missing.push('Chybí název postupu')
  if (p.ppe.length === 0) missing.push('Nejsou uvedeny osobní ochranné prostředky')
  if (p.preparation.length === 0) missing.push('Chybí přípravné kroky')
  if (p.points.length === 0) missing.push('Postup nemá žádný izolační bod')
  for (const pt of p.points) {
    if (!pt.location.trim() || !pt.method.trim() || !pt.lock.trim()) {
      missing.push(`Bod ${pt.code || pt.name} nemá vyplněné umístění, metodu izolace nebo požadovaný zámek`)
    }
  }
  if (e) {
    if (e.energy_sources.length === 0) missing.push('Zařízení nemá evidované zdroje energie')
    const covered = new Set(p.points.map((pt) => pt.energy))
    const exempt: EnergyType[] = ['stored', 'gravitational', 'mechanical']
    for (const t of new Set(e.energy_sources.map((s) => s.type))) {
      if (!covered.has(t) && !exempt.includes(t)) missing.push(`Zdroj energie ${ENERGY_TITLE[t]} nemá izolační bod`)
    }
  }
  if (p.restoration.length === 0) missing.push('Chybí specifické kroky obnovení')
  return missing
}

export function energySignature(sources: { type: string; magnitude: string }[]): string {
  return sources.map((s) => `${s.type}|${s.magnitude.trim()}`).sort().join(';')
}

// --- Formátování ---
const dateFmt = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric' })
const dateTimeFmt = new Intl.DateTimeFormat('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const timeFmt = new Intl.DateTimeFormat('cs-CZ', { hour: '2-digit', minute: '2-digit' })
export const fmtDate = (s: string | null | undefined) => (s ? dateFmt.format(new Date(s)) : '—')
export const fmtDateTime = (s: string | null | undefined) => (s ? dateTimeFmt.format(new Date(s)) : '—')
export const fmtTime = (s: string | null | undefined) => (s ? timeFmt.format(new Date(s)) : '—')
export function fmtDuration(fromIso: string, toIso?: string | null): string {
  const minutes = Math.max(0, Math.round((new Date(toIso ?? Date.now()).getTime() - new Date(fromIso).getTime()) / 60000))
  const h = Math.floor(minutes / 60)
  return h > 0 ? `${h} h ${minutes % 60} min` : `${minutes} min`
}
export function plural(n: number, one: string, few: string, many: string): string {
  return `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`
}
export const uid = () => crypto.randomUUID()
