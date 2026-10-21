// Veškeré zápisy do databáze. Obrazovky volají jen tyto funkce.
import { sb } from './supabase'
import type {
  Company, Defect, Equipment, EnergySource, IsolationPoint, Loto, LotoStep, PrepStep, Procedure, Profile, Role, Severity, Site,
  TimelineEntry, Workplace,
} from './types'
import {
  HANDOVER_CHECKS, LOCK_REMOVAL_INDEX, RESTORATION_SEQUENCE, SEVERITY_TITLE, ZERO_ENERGY_CHECKS, addMonths, currentProcedure,
  energySignature, fmtDate, fmtDuration, lockNumber, missingItems, parseQR, pointQR, uid,
} from './rules'

export interface Ctx { profile: Profile; company: Company }

const now = () => new Date().toISOString()

function check<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw res.error
  return res.data
}

export async function audit(
  ctx: Ctx, action: string, summary: string,
  o: { detail?: string; equipment?: Pick<Equipment, 'code' | 'name' | 'site_id'>; loto?: Loto; procedureId?: string } = {},
) {
  const { error } = await sb.from('audit_events').insert({
    company_id: ctx.company.id,
    site_id: o.loto?.site_id ?? o.equipment?.site_id ?? ctx.profile.site_id,
    action,
    actor_id: ctx.profile.id,
    actor_name: ctx.profile.full_name,
    equipment_code: o.loto?.equipment_code ?? o.equipment?.code ?? null,
    equipment_name: o.loto?.equipment_name ?? o.equipment?.name ?? null,
    loto_id: o.loto?.id ?? null,
    procedure_id: o.procedureId ?? o.loto?.procedure_id ?? null,
    summary,
    detail: o.detail ?? '',
  })
  if (error) console.warn('Audit se nepodařilo zapsat', error)
}

// --- Fotky ---
async function resize(file: File, maxPixel = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, maxPixel / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Fotku nelze zpracovat'))), 'image/jpeg', 0.75))
}

export async function uploadPhoto(ctx: Ctx, file: File): Promise<string> {
  const blob = await resize(file)
  const path = `${ctx.company.id}/${uid()}.jpg`
  check(await sb.storage.from('photos').upload(path, blob, { contentType: 'image/jpeg' }))
  return path
}

const urlCache = new Map<string, { url: string; until: number }>()
export async function photoUrl(path: string): Promise<string | null> {
  const cached = urlCache.get(path)
  if (cached && cached.until > Date.now()) return cached.url
  const { data, error } = await sb.storage.from('photos').createSignedUrl(path, 3600)
  if (error || !data) return null
  urlCache.set(path, { url: data.signedUrl, until: Date.now() + 3_300_000 })
  return data.signedUrl
}

// --- LOTO (optimistické zamykání přes sloupec version) ---
async function mutateLoto(id: string, change: (l: Loto) => void): Promise<Loto> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const current = check(await sb.from('lotos').select('*').eq('id', id).single()) as Loto
    const next: Loto = structuredClone(current)
    change(next)
    const { data, error } = await sb
      .from('lotos')
      .update({
        status: next.status, steps: next.steps, participants: next.participants, timeline: next.timeline,
        zero_checks: next.zero_checks, zero_verified_at: next.zero_verified_at, zero_verified_by: next.zero_verified_by,
        restoration_started_at: next.restoration_started_at, closed_at: next.closed_at, closed_by_name: next.closed_by_name,
        responsible_id: next.responsible_id, responsible_name: next.responsible_name,
        version: current.version + 1, updated_at: now(),
      })
      .eq('id', id)
      .eq('version', current.version)
      .select()
    if (error) throw error
    if (data && data.length) return data[0] as Loto
  }
  throw new Error('Záznam mezitím změnil někdo jiný. Zkuste to prosím znovu.')
}

const entry = (ctx: Ctx, kind: string, title: string, detail = ''): TimelineEntry => ({ at: now(), kind, title, detail, actor: ctx.profile.full_name })

export const lockoutSteps = (l: Loto) => l.steps.filter((s) => s.kind !== 'restoration')
export const restorationSteps = (l: Loto) => l.steps.filter((s) => s.kind === 'restoration')
export const nextLockout = (l: Loto) => lockoutSteps(l).find((s) => !s.done)
export const nextRestoration = (l: Loto) => restorationSteps(l).find((s) => !s.done)
export const activeParticipants = (l: Loto) => l.participants.filter((p) => !p.removed_at)

export async function startLoto(ctx: Ctx, e: Equipment, procs: Procedure[], reason: string): Promise<Loto> {
  const p = currentProcedure(procs, e.id)
  if (!p) throw new Error('Zařízení nemá LOTO postup.')
  const steps: LotoStep[] = []
  for (const s of p.preparation) {
    steps.push({ id: uid(), kind: 'preparation', title: s.title, instruction: s.detail, done: false })
  }
  for (const pt of p.points) {
    const lines = [pt.method, pt.location && `Umístění: ${pt.location}`, pt.verification && `Ověření: ${pt.verification}`].filter(Boolean)
    steps.push({
      id: uid(), kind: 'isolation', title: `Izolujte ${pt.code} – ${pt.name}`, instruction: lines.join('\n'),
      point_id: pt.id, point_code: pt.code, point_name: pt.name, energy: pt.energy, required_lock: pt.lock, done: false,
    })
    steps.push({
      id: uid(), kind: 'lockout', title: `Uzamkněte ${pt.code}`,
      instruction: `Připevněte ${pt.lock ? pt.lock.toLowerCase() : 'osobní visací zámek'} a vyplněnou LOTO visačku. Zámek vyfoťte.`,
      point_id: pt.id, point_code: pt.code, point_name: pt.name, energy: pt.energy, required_lock: pt.lock, done: false,
    })
  }
  const me = ctx.profile
  const row = {
    company_id: ctx.company.id, site_id: e.site_id, equipment_id: e.id, procedure_id: p.id, status: 'isolating', reason: reason.trim(),
    equipment_code: e.code, equipment_name: e.name, procedure_name: p.name, procedure_revision: p.revision,
    procedure_approved_by: p.approver_name, procedure_approved_at: p.approved_at,
    started_by: me.id, started_by_name: me.full_name, responsible_id: me.id, responsible_name: me.full_name,
    steps,
    participants: [{ user_id: me.id, name: me.full_name, personal_number: me.personal_number, lock: lockNumber(me), role: me.role, joined_at: now() }],
    timeline: [entry(ctx, 'started', 'LOTO zahájeno', reason.trim())],
  }
  const loto = check(await sb.from('lotos').insert(row).select().single()) as Loto
  await audit(ctx, 'lotoStarted', `LOTO zahájeno na ${e.name} (postup rev. ${p.revision})`, { detail: reason.trim(), loto })
  return loto
}

export async function confirmStep(ctx: Ctx, lotoId: string, stepId: string, o: { lock?: string; photoPath?: string }) {
  let summary = ''
  let action = 'stepConfirmed'
  const loto = await mutateLoto(lotoId, (l) => {
    if (l.status !== 'isolating') throw new Error('LOTO už není ve fázi izolace.')
    const step = nextLockout(l)
    if (!step || step.id !== stepId) throw new Error('Kroky se potvrzují v pořadí podle postupu.')
    if (step.kind === 'lockout') {
      const lock = (o.lock ?? '').trim().toUpperCase()
      if (!lock) throw new Error('Zadejte číslo osobního zámku.')
      if (!o.photoPath) throw new Error('Uzamčení je nutné doložit fotografií.')
      step.lock = lock
      if (!activeParticipants(l).some((p) => p.user_id === ctx.profile.id)) {
        l.participants.push({ user_id: ctx.profile.id, name: ctx.profile.full_name, personal_number: ctx.profile.personal_number, lock, role: ctx.profile.role, joined_at: now() })
      }
      l.timeline.push(entry(ctx, 'locked', `${step.point_code} uzamčen zámkem ${lock}`))
      action = 'lockApplied'
      summary = `Zámek ${lock} připojen na ${step.point_code}`
    } else if (step.kind === 'isolation') {
      l.timeline.push(entry(ctx, 'isolated', `${step.point_code} izolován`, step.point_name ?? ''))
      action = 'pointIsolated'
      summary = `${step.point_code} izolován – ${step.point_name}${step.qr ? ' (ověřeno QR)' : ''}`
    } else {
      summary = `Potvrzen krok: ${step.title}`
    }
    if (o.photoPath) step.photo_path = o.photoPath
    step.done = true
    step.at = now()
    step.by = ctx.profile.full_name
  })
  await audit(ctx, action, summary, { loto })
}

export async function verifyPoint(ctx: Ctx, lotoId: string, stepId: string, raw: string): Promise<{ ok: boolean; message: string }> {
  let result = { ok: false, message: '' }
  const loto = await mutateLoto(lotoId, (l) => {
    const step = l.steps.find((s) => s.id === stepId)
    if (!step) throw new Error('Krok nenalezen')
    const expected = pointQR(l.equipment_code, step.point_code ?? '')
    const parsed = parseQR(raw)
    if (!parsed) {
      result = { ok: false, message: 'Neznámý QR kód' }
      return
    }
    const scanned = parsed.kind === 'point' ? pointQR(parsed.machine, parsed.point) : `LOTOMACHINE:${parsed.code}`
    if (scanned === expected) {
      step.qr = true
      result = { ok: true, message: `QR kód bodu ${step.point_code} ověřen` }
    } else {
      result = { ok: false, message: `Naskenovaný kód ${scanned} nepatří k tomuto kroku. Očekáván je ${expected}. Najděte správný bod a naskenujte jej znovu.` }
    }
  })
  await audit(ctx, result.ok ? 'qrVerified' : 'qrMismatch', result.message, { loto })
  return result
}

export async function verifyZeroEnergy(ctx: Ctx, lotoId: string, checks: string[]) {
  const loto = await mutateLoto(lotoId, (l) => {
    if (l.status !== 'isolating' || nextLockout(l)) throw new Error('Nejprve dokončete všechny kroky izolace a uzamčení.')
    if (!ZERO_ENERGY_CHECKS.every((c) => checks.includes(c))) throw new Error('Potvrďte všechny body ověření nulového energetického stavu.')
    l.zero_checks = ZERO_ENERGY_CHECKS
    l.zero_verified_at = now()
    l.zero_verified_by = ctx.profile.full_name
    l.status = 'active'
    l.timeline.push(entry(ctx, 'verified', 'TRY test dokončen – nulový energetický stav ověřen', ZERO_ENERGY_CHECKS.join(' · ')))
    l.timeline.push(entry(ctx, 'workAuthorized', 'Práce povolena'))
  })
  await audit(ctx, 'zeroEnergyVerified', `Ověřen nulový energetický stav – ${loto.equipment_name}, práce povolena`, { loto })
}

export async function joinLoto(ctx: Ctx, lotoId: string, lockRaw: string) {
  const lock = lockRaw.trim().toUpperCase()
  if (!lock) throw new Error('Zadejte číslo osobního zámku.')
  const loto = await mutateLoto(lotoId, (l) => {
    if (l.status !== 'isolating' && l.status !== 'active') throw new Error('K tomuto LOTO se už nelze připojit.')
    if (activeParticipants(l).some((p) => p.user_id === ctx.profile.id)) throw new Error('Už jste připojeni se svým zámkem.')
    l.participants.push({ user_id: ctx.profile.id, name: ctx.profile.full_name, personal_number: ctx.profile.personal_number, lock, role: ctx.profile.role, joined_at: now() })
    l.timeline.push(entry(ctx, 'participant', `${ctx.profile.full_name} připojil(a) zámek ${lock}`))
  })
  await audit(ctx, 'participantJoined', `${ctx.profile.full_name} se připojil(a) se zámkem ${lock}`, { loto })
}

export async function beginRestoration(ctx: Ctx, lotoId: string, procs: Procedure[]) {
  const loto = await mutateLoto(lotoId, (l) => {
    if (l.status !== 'active') throw new Error('Obnovu lze zahájit až u aktivního LOTO s ověřeným nulovým stavem.')
    const specific = procs.find((p) => p.id === l.procedure_id)?.restoration ?? []
    RESTORATION_SEQUENCE.forEach((s, i) => {
      let text = s.text
      if (i === 6 && specific.length) text += '\n\nSpecifické kroky podle postupu:\n' + specific.map((t, j) => `${j + 1}. ${t}`).join('\n')
      l.steps.push({ id: uid(), kind: 'restoration', title: s.title, instruction: text, done: false })
    })
    l.status = 'restoring'
    l.restoration_started_at = now()
    l.timeline.push(entry(ctx, 'restoration', 'Zahájena řízená obnova'))
  })
  await audit(ctx, 'restorationStep', `Zahájena řízená obnova – ${loto.equipment_name}`, { loto })
}

export async function confirmRestoration(ctx: Ctx, lotoId: string, stepId: string) {
  const removed: string[] = []
  let summary = ''
  const loto = await mutateLoto(lotoId, (l) => {
    if (l.status !== 'restoring') throw new Error('Obnova neprobíhá.')
    const step = nextRestoration(l)
    if (!step || step.id !== stepId) throw new Error('Kroky obnovy se potvrzují v pořadí.')
    const index = restorationSteps(l).indexOf(step)
    if (index === LOCK_REMOVAL_INDEX) {
      for (const p of activeParticipants(l)) {
        p.removed_at = now()
        removed.push(`${p.lock} (${p.name})`)
        l.timeline.push(entry(ctx, 'lockRemoved', `Zámek ${p.lock} odstraněn (${p.name})`))
      }
    }
    step.done = true
    step.at = now()
    step.by = ctx.profile.full_name
    summary = `Obnova ${index + 1}/${RESTORATION_SEQUENCE.length}: ${step.title}`
  })
  for (const r of removed) await audit(ctx, 'lockRemoved', `Zámek ${r} odstraněn`, { loto })
  await audit(ctx, 'restorationStep', summary, { loto })
}

export async function closeLoto(ctx: Ctx, lotoId: string) {
  const loto = await mutateLoto(lotoId, (l) => {
    if (l.status !== 'restoring' || nextRestoration(l) || restorationSteps(l).length === 0) throw new Error('Nejprve potvrďte všechny kroky obnovy.')
    l.status = 'closed'
    l.closed_at = now()
    l.closed_by_name = ctx.profile.full_name
    l.timeline.push(entry(ctx, 'closed', 'LOTO ukončeno – zařízení vráceno do provozu'))
  })
  await audit(ctx, 'lotoClosed', `LOTO ukončeno – ${loto.equipment_name} vrácen do provozu`, { loto, detail: `Doba trvání ${fmtDuration(loto.started_at, loto.closed_at)}` })
}

export async function handover(ctx: Ctx, lotoId: string, receiver: Profile, checks: string[], note: string) {
  if (!HANDOVER_CHECKS.every((c) => checks.includes(c))) throw new Error('Předání vyžaduje potvrzení všech bodů kontrolního seznamu.')
  let previous = ''
  const loto = await mutateLoto(lotoId, (l) => {
    if (l.status === 'closed') throw new Error('LOTO je ukončeno.')
    if (!receiver.is_active || receiver.id === l.responsible_id) throw new Error('Vyberte aktivní přebírající osobu (jinou než současnou odpovědnou).')
    previous = l.responsible_name
    if (!activeParticipants(l).some((p) => p.user_id === receiver.id)) {
      l.participants.push({ user_id: receiver.id, name: receiver.full_name, personal_number: receiver.personal_number, lock: lockNumber(receiver), role: receiver.role, joined_at: now() })
    }
    l.responsible_id = receiver.id
    l.responsible_name = receiver.full_name
    l.timeline.push(entry(ctx, 'handover', `Předání směny: ${previous} → ${receiver.full_name}`, note.trim()))
  })
  await audit(ctx, 'shiftHandover', `Předání směny ${previous} → ${receiver.full_name}`, { loto, detail: note.trim() })
}

// --- Závady ---
export async function reportDefect(ctx: Ctx, e: Equipment, severity: Severity, title: string, detail: string, photoPath: string | null) {
  if (!title.trim()) throw new Error('Stručně popište závadu.')
  check(await sb.from('defects').insert({
    company_id: ctx.company.id, equipment_id: e.id, severity, title: title.trim(), detail: detail.trim(),
    photo_path: photoPath, reported_by: ctx.profile.id, reported_by_name: ctx.profile.full_name,
  }))
  await audit(ctx, 'defectReported', `${e.code}: zapsána závada (${SEVERITY_TITLE[severity].toLowerCase()}) – ${title.trim()}`, { equipment: e, detail: detail.trim() })
}

export async function resolveDefect(ctx: Ctx, d: Defect, e: Equipment | undefined, note: string) {
  const res = check(await sb.from('defects').update({ resolved_at: now(), resolved_by_name: ctx.profile.full_name, resolution_note: note.trim() }).eq('id', d.id).select())
  if (!res || (res as unknown[]).length === 0) throw new Error('Závadu může uzavřít vedoucí údržby nebo HSE administrátor.')
  await audit(ctx, 'defectResolved', `${e?.code ?? ''}: vyřešena závada – ${d.title}`, { equipment: e, detail: note.trim() })
}

// --- Zařízení a postupy (HSE) ---
export interface EquipmentDraft {
  name: string; code: string; manufacturer: string; equipment_type: string; asset_number: string
  site_id: string | null; workplace_id: string | null; out_of_service: boolean; energy_sources: EnergySource[]
}

export async function saveEquipment(ctx: Ctx, existing: Equipment | null, d: EquipmentDraft, procs: Procedure[]): Promise<Equipment> {
  const code = d.code.trim().toUpperCase()
  if (!d.name.trim()) throw new Error('Vyplňte název.')
  if (!code) throw new Error('Vyplňte kód zařízení.')
  if (code.includes(':')) throw new Error('Kód nesmí obsahovat dvojtečku.')
  if (!d.site_id) throw new Error('Vyberte závod.')
  const row = {
    company_id: ctx.company.id, name: d.name.trim(), code, manufacturer: d.manufacturer.trim(), equipment_type: d.equipment_type.trim(),
    asset_number: d.asset_number.trim(), site_id: d.site_id, workplace_id: d.workplace_id, out_of_service: d.out_of_service,
    energy_sources: d.energy_sources.map((s) => ({ ...s, magnitude: s.magnitude.trim(), note: s.note.trim() })), updated_at: now(),
  }
  let saved: Equipment
  if (existing) {
    saved = check(await sb.from('equipment').update(row).eq('id', existing.id).select().single()) as Equipment
    await audit(ctx, 'equipmentEdited', `Upraveno zařízení ${saved.name} (${saved.code})`, { equipment: saved })
    if (energySignature(existing.energy_sources) !== energySignature(saved.energy_sources)) {
      await audit(ctx, 'energySourcesChanged', `Změněny zdroje energie zařízení ${saved.code}`, { equipment: saved })
      const p = currentProcedure(procs, saved.id)
      if (p && (p.status === 'approved' || p.status === 'pendingApproval')) {
        check(await sb.from('procedures').update({ status: 'needsRevision', updated_at: now() }).eq('id', p.id))
        await audit(ctx, 'procedureNeedsRevision', `${p.name} převeden do stavu Vyžaduje revizi kvůli změně zdrojů energie`, { equipment: saved, procedureId: p.id })
      }
    }
  } else {
    saved = check(await sb.from('equipment').insert(row).select().single()) as Equipment
    await audit(ctx, 'equipmentCreated', `Přidáno zařízení ${saved.name} (${saved.code})`, { equipment: saved })
  }
  return saved
}

export interface ProcedureDraft {
  name: string; review_interval_months: number; ppe: string[]; preparation: PrepStep[]; points: IsolationPoint[]; restoration: string[]
}

export async function saveProcedure(ctx: Ctx, existing: Procedure | null, e: Equipment, d: ProcedureDraft, summary: string): Promise<Procedure> {
  if (!d.name.trim()) throw new Error('Vyplňte název postupu.')
  const codes = d.points.map((p) => p.code.trim().toUpperCase())
  if (codes.some((c) => !c)) throw new Error('Každý izolační bod musí mít kód.')
  if (new Set(codes).size !== codes.length) throw new Error('Kódy izolačních bodů se nesmí opakovat.')
  const revision = (existing?.revision ?? 0) + 1
  const text = summary.trim() || (existing ? 'Úprava postupu' : 'První vydání postupu')
  const row = {
    company_id: ctx.company.id, equipment_id: e.id, name: d.name.trim(), revision, status: 'draft',
    author_name: existing?.author_name || ctx.profile.full_name, approver_name: null, approved_at: null,
    review_interval_months: Math.max(1, d.review_interval_months),
    ppe: d.ppe.map((s) => s.trim()).filter(Boolean),
    preparation: d.preparation.filter((s) => s.title.trim()).map((s) => ({ title: s.title.trim(), detail: s.detail.trim() })),
    restoration: d.restoration.map((s) => s.trim()).filter(Boolean),
    points: d.points.map((p) => ({ ...p, code: p.code.trim().toUpperCase(), name: p.name.trim(), location: p.location.trim(), method: p.method.trim(), lock: p.lock.trim(), verification: p.verification.trim() })),
    revisions: [...(existing?.revisions ?? []), { revision, at: now(), by: ctx.profile.full_name, summary: text }],
    updated_at: now(),
  }
  const saved = existing
    ? (check(await sb.from('procedures').update(row).eq('id', existing.id).select().single()) as Procedure)
    : (check(await sb.from('procedures').insert(row).select().single()) as Procedure)
  await audit(ctx, existing ? 'procedureEdited' : 'procedureCreated', `${existing ? 'Upraven' : 'Vytvořen'} ${saved.name}, revize ${revision}`, {
    equipment: e, procedureId: saved.id, detail: text + (existing?.status === 'approved' ? ' · schválení zrušeno, nutné nové schválení' : ''),
  })
  return saved
}

export async function submitProcedure(ctx: Ctx, p: Procedure, e: Equipment | undefined) {
  const missing = missingItems(p, e)
  if (missing.length) {
    await audit(ctx, 'procedureApprovalBlocked', `Schválení ${p.name} zablokováno – postup není kompletní`, { equipment: e, procedureId: p.id, detail: missing.join('; ') })
    throw new Error('Postup nelze odeslat ke schválení, protože není kompletní:\n• ' + missing.join('\n• '))
  }
  check(await sb.from('procedures').update({ status: 'pendingApproval', updated_at: now() }).eq('id', p.id))
  await audit(ctx, 'procedureSubmitted', `${p.name} rev. ${p.revision} odeslán ke schválení`, { equipment: e, procedureId: p.id })
}

export async function approveProcedure(ctx: Ctx, p: Procedure, e: Equipment | undefined, procs: Procedure[]) {
  const missing = missingItems(p, e)
  if (missing.length) {
    await audit(ctx, 'procedureApprovalBlocked', `Schválení ${p.name} zablokováno – postup není kompletní`, { equipment: e, procedureId: p.id, detail: missing.join('; ') })
    throw new Error('Postup nelze schválit, protože není kompletní:\n• ' + missing.join('\n• '))
  }
  for (const other of procs.filter((o) => o.equipment_id === p.equipment_id && o.id !== p.id && o.status !== 'archived')) {
    check(await sb.from('procedures').update({ status: 'archived' }).eq('id', other.id))
  }
  const next = addMonths(new Date(), p.review_interval_months).toISOString().slice(0, 10)
  check(await sb.from('procedures').update({
    status: 'approved', approver_name: ctx.profile.full_name, approved_at: now(), last_reviewed_at: now(),
    last_reviewed_by: ctx.profile.full_name, next_review_date: next, updated_at: now(),
  }).eq('id', p.id))
  await audit(ctx, 'procedureApproved', `${p.name} rev. ${p.revision} schválen`, { equipment: e, procedureId: p.id })
}

export async function performReview(ctx: Ctx, p: Procedure, e: Equipment | undefined, note: string) {
  if (ctx.profile.role === 'worker') throw new Error('K této akci nemáte oprávnění.')
  if (p.status !== 'approved') throw new Error('Revizi lze provést jen u schváleného postupu.')
  const next = check(await sb.rpc('perform_review', { p_procedure: p.id })) as string
  await audit(ctx, 'reviewCompleted', `Provedena revize postupu ${p.name}`, { equipment: e, procedureId: p.id, detail: `Příští revize ${fmtDate(next)}${note.trim() ? ' · ' + note.trim() : ''}` })
}

// --- Organizace a lidé ---
export async function saveSite(ctx: Ctx, existing: Site | null, name: string, city: string) {
  if (!name.trim()) throw new Error('Vyplňte název.')
  const row = { company_id: ctx.company.id, name: name.trim(), city: city.trim() }
  if (existing) check(await sb.from('sites').update(row).eq('id', existing.id))
  else check(await sb.from('sites').insert(row))
  await audit(ctx, 'organizationEdited', `Uložen závod ${name.trim()}`)
}

export async function saveWorkplace(ctx: Ctx, existing: Workplace | null, siteId: string, name: string) {
  if (!name.trim()) throw new Error('Vyplňte název.')
  const row = { company_id: ctx.company.id, site_id: siteId, name: name.trim() }
  if (existing) check(await sb.from('workplaces').update(row).eq('id', existing.id))
  else check(await sb.from('workplaces').insert(row))
  await audit(ctx, 'organizationEdited', `Uloženo pracoviště ${name.trim()}`)
}

export async function saveCompanyName(ctx: Ctx, name: string, registration: string) {
  if (!name.trim()) throw new Error('Vyplňte název.')
  check(await sb.from('companies').update({ name: name.trim(), registration_number: registration.trim() }).eq('id', ctx.company.id))
  await audit(ctx, 'organizationEdited', `Uložena firma ${name.trim()}`)
}

export async function setMember(ctx: Ctx, member: Profile, role: Role, active: boolean, siteId: string | null) {
  check(await sb.rpc('set_member', { p_user: member.id, p_role: role, p_active: active, p_site: siteId }))
  const action = member.is_active && !active ? 'userDeactivated' : 'userEdited'
  await audit(ctx, action, `${active ? (member.is_active ? 'Upravena osoba' : 'Schválen přístup') : 'Deaktivována osoba'}: ${member.full_name}`, { detail: role })
}

export async function updateOwnProfile(profile: Profile, fullName: string, personalNumber: string, lockPrefix: string) {
  if (!fullName.trim() || !personalNumber.trim() || !lockPrefix.trim()) throw new Error('Vyplňte jméno, osobní číslo a prefix zámku.')
  check(await sb.from('profiles').update({ full_name: fullName.trim(), personal_number: personalNumber.trim(), lock_prefix: lockPrefix.trim().toUpperCase() }).eq('id', profile.id))
}

export async function createCompany(name: string, fullName: string, personalNumber: string, lockPrefix: string): Promise<string> {
  return check(await sb.rpc('create_company', { p_name: name, p_full_name: fullName, p_personal_number: personalNumber, p_lock_prefix: lockPrefix })) as string
}

export async function joinCompany(code: string, fullName: string, personalNumber: string, lockPrefix: string): Promise<string> {
  return check(await sb.rpc('join_company', { p_code: code, p_full_name: fullName, p_personal_number: personalNumber, p_lock_prefix: lockPrefix })) as string
}
