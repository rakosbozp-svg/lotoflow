// Ukázková data pro novou firmu (stejná jako v iOS demu).
import { sb } from './supabase'
import type { EnergyType, IsolationPoint, ProcedureStatus } from './types'
import type { Ctx } from './api'
import { audit } from './api'
import { uid } from './rules'

const day = 86_400_000
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * day).toISOString()
const date = (offsetDays: number) => iso(offsetDays).slice(0, 10)

function pt(code: string, name: string, energy: EnergyType, location: string, method: string, lock: string, verification: string): IsolationPoint {
  return { id: uid(), code, name, energy, location, method, lock, verification, photo_path: null }
}

async function insert<T>(table: string, row: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb.from(table).insert(row).select().single()
  if (error) throw error
  return data as T
}

export async function seedDemo(ctx: Ctx) {
  const c = ctx.company.id
  const prague = await insert<{ id: string }>('sites', { company_id: c, name: 'Výrobní závod Praha', city: 'Praha' })
  const brno = await insert<{ id: string }>('sites', { company_id: c, name: 'Výrobní závod Brno', city: 'Brno' })
  const wp = async (site: string, name: string) => (await insert<{ id: string }>('workplaces', { company_id: c, site_id: site, name })).id
  const hallA = await wp(prague.id, 'Hala A')
  const hallB = await wp(prague.id, 'Hala B')
  const maintenance = await wp(prague.id, 'Údržba')
  const shipping = await wp(brno.id, 'Expedice')

  const machine = async (site: string, workplace: string, name: string, code: string, manufacturer: string, type: string, asset: string,
    energy: [EnergyType, string][], outOfService = false) =>
    (await insert<{ id: string }>('equipment', {
      company_id: c, site_id: site, workplace_id: workplace, name, code, manufacturer, equipment_type: type, asset_number: asset,
      out_of_service: outOfService, energy_sources: energy.map(([type, magnitude]) => ({ type, magnitude, note: '' })),
    })).id

  const author = ctx.profile.full_name
  const procedure = (equipment: string, name: string, revision: number, status: ProcedureStatus, nextReview: number | null,
    ppe: string[], preparation: [string, string][], points: IsolationPoint[], restoration: string[], history: [number, number, string][]) =>
    insert('procedures', {
      company_id: c, equipment_id: equipment, name, revision, status, author_name: author,
      approver_name: status === 'approved' || status === 'needsRevision' ? author : null,
      approved_at: status === 'approved' || status === 'needsRevision' ? iso(-60) : null,
      next_review_date: nextReview === null ? null : date(nextReview),
      last_reviewed_at: status === 'approved' || status === 'needsRevision' ? iso(-60) : null,
      last_reviewed_by: status === 'approved' || status === 'needsRevision' ? author : null,
      ppe, preparation: preparation.map(([title, detail]) => ({ title, detail })), points, restoration,
      revisions: history.map(([r, d, s]) => ({ revision: r, at: iso(d), by: author, summary: s })),
    })

  const mixer = await machine(prague.id, hallA, 'Míchačka 04', 'MIX-004', 'Eirich', 'Intenzivní míchačka R08', 'INV-2019-0412',
    [['electrical', '400 V AC, 22 kW'], ['pneumatic', '6 bar'], ['stored', 'Setrvačnost míchadla, doběh až 40 s']])
  await procedure(mixer, 'LOTO postup – Míchačka 04', 3, 'approved', 150,
    ['Bezpečnostní obuv S3', 'Ochranné brýle', 'Pracovní rukavice', 'Osobní visací zámek a LOTO visačka'],
    [['Informujte obsluhu a vedoucího směny', 'Oznamte odstávku Míchačky 04 obsluze Haly A a všem dotčeným osobám.'],
      ['Zastavte stroj standardním způsobem', 'Dokončete cyklus míchání a stiskněte STOP na ovládacím panelu.'],
      ['Vyprázdněte míchací komoru', 'Ověřte, že v komoře nezůstal materiál, který by mohl uvést míchadlo do pohybu.']],
    [pt('Q01', 'Hlavní elektrický vypínač', 'electrical', 'Rozvaděč RM-04, levá strana stroje, výška 1,4 m', 'Otočte hlavní vypínač do polohy 0 (VYP).', 'Osobní visací zámek + LOTO visačka', 'Pokus o spuštění tlačítkem START – stroj se nesmí rozběhnout.'),
      pt('V03', 'Hlavní ventil stlačeného vzduchu', 'pneumatic', 'Rozvod vzduchu za strojem, modrý kulový ventil', 'Uzavřete ventil a odvzdušněte rozvod výfukovým ventilem.', 'Uzamykací objímka ventilu + osobní zámek', 'Manometr PI-03 ukazuje 0 bar.')],
    ['Zkontrolujte uzavření krytu míchací komory', 'Otevřete ventil V03 a ověřte tlak 6 bar', 'Zapněte vypínač Q01 a proveďte zkušební chod naprázdno'],
    [[1, -720, 'První vydání postupu'], [2, -400, 'Doplněn izolační bod V03'], [3, -62, 'Aktualizace fotodokumentace bodu Q01']])

  const press = await machine(prague.id, hallA, 'Lis 02', 'LIS-002', 'Šmeral', 'Hydraulický lis CTH 250', 'INV-2015-0102',
    [['electrical', '400 V AC'], ['hydraulic', '180 bar'], ['gravitational', 'Horní nástroj 1,2 t']])
  await procedure(press, 'LOTO postup – Lis 02', 2, 'approved', -9,
    ['Bezpečnostní obuv S3', 'Ochranné brýle', 'Osobní visací zámek a LOTO visačka'],
    [['Spusťte beran do dolní polohy', 'Beran spusťte na dorazy nebo do nástroje.'], ['Zastavte hydraulický agregát', 'Vypněte čerpadlo z ovládacího panelu.']],
    [pt('Q01', 'Hlavní vypínač lisu', 'electrical', 'Rozvaděč RL-02 vpravo od lisu', 'Vypínač do polohy 0.', 'Osobní visací zámek', 'Pokus o spuštění.'),
      pt('H02', 'Uzávěr hydraulického čerpadla', 'hydraulic', 'Hydraulický agregát, zadní strana', 'Uzavřete kulový ventil a uvolněte tlak v akumulátoru.', 'Objímka ventilu + osobní zámek', 'Manometr ukazuje 0 bar.'),
      pt('M01', 'Bezpečnostní podpěra beranu', 'gravitational', 'Pracovní prostor lisu', 'Vložte bezpečnostní podpěru pod beran.', 'Zámek podpěry', 'Podpěra dosedá na stůl i beran.')],
    ['Vyjměte bezpečnostní podpěru', 'Otevřete ventil H02', 'Zapněte vypínač Q01'],
    [[1, -1100, 'První vydání postupu'], [2, -375, 'Doplněna podpěra beranu']])

  const conveyor = await machine(prague.id, hallB, 'Dopravník 12', 'DOP-012', 'Transroll', 'Pásový dopravník', 'INV-2021-0912',
    [['electrical', '400 V AC'], ['mechanical', 'Napnutý pás']])
  await procedure(conveyor, 'LOTO postup – Dopravník 12', 4, 'needsRevision', 165,
    ['Bezpečnostní obuv S3', 'Pracovní rukavice', 'Osobní visací zámek a LOTO visačka'],
    [['Vyprázdněte pás', 'Odeberte z pásu všechny výrobky.'], ['Zastavte dopravník', 'Stiskněte STOP na pultu Haly B.']],
    [pt('Q12', 'Vypínač pohonu dopravníku', 'electrical', 'Rozvaděč RB-12', 'Vypínač do polohy 0.', 'Osobní visací zámek', 'Pokus o spuštění z pultu.'),
      pt('M02', 'Napínací stanice pásu', 'mechanical', 'Konec dopravníku u stěny', 'Povolte napínání a zajistěte kolíkem.', 'Řetěz + osobní zámek', 'Pás jde volně ručně posunout bez pnutí.')],
    ['Napněte pás', 'Zapněte vypínač Q12'], [[4, -200, 'Úprava napínací stanice']])

  const cutter = await machine(prague.id, hallB, 'Řezací linka 03', 'RL-003', 'Bystronic', 'Řezací linka BySprint', 'INV-2020-0303',
    [['electrical', '400 V AC, 30 kW'], ['pneumatic', '8 bar'], ['mechanical', 'Pohyblivý portál']])
  await procedure(cutter, 'LOTO postup – Řezací linka 03', 1, 'approved', 12,
    ['Bezpečnostní obuv S3', 'Ochranné brýle', 'Řezuvzdorné rukavice', 'Osobní visací zámek a LOTO visačka'],
    [['Najeďte portálem do parkovací polohy', 'Použijte funkci PARK na ovládacím panelu.'], ['Zastavte linku', 'Ukončete program a stiskněte STOP.']],
    [pt('Q03', 'Hlavní vypínač linky', 'electrical', 'Rozvaděč RL-03', 'Vypínač do polohy 0.', 'Osobní visací zámek', 'Pokus o spuštění.'),
      pt('V01', 'Přívod stlačeného vzduchu', 'pneumatic', 'Vstup vzduchu za linkou', 'Uzavřete ventil a odvzdušněte.', 'Objímka ventilu', 'Manometr 0 bar.'),
      pt('M03', 'Aretace portálu', 'mechanical', 'Pojezd portálu', 'Zasuňte aretační čep portálu.', 'Osobní visací zámek', 'Portálem nelze pohnout.')],
    ['Vysuňte aretační čep', 'Otevřete přívod vzduchu V01', 'Zapněte vypínač Q03'], [[1, -353, 'První vydání postupu']])

  const compressor = await machine(prague.id, maintenance, 'Kompresor 01', 'KOM-001', 'Atlas Copco', 'Šroubový kompresor GA 30', 'INV-2017-0001',
    [['electrical', '400 V AC'], ['pneumatic', '10 bar'], ['thermal', 'Horké části až 90 °C']], true)
  await procedure(compressor, 'LOTO postup – Kompresor 01', 1, 'pendingApproval', null,
    ['Bezpečnostní obuv S3', 'Tepelně odolné rukavice', 'Osobní visací zámek a LOTO visačka'],
    [['Nechte kompresor vychladnout', 'Vyčkejte nejméně 30 minut po zastavení.']],
    [pt('Q20', 'Vypínač kompresoru', 'electrical', 'Rozvaděč údržby RU-01', 'Vypínač do polohy 0.', 'Osobní visací zámek', 'Pokus o spuštění.'),
      pt('V20', 'Výstupní ventil vzdušníku', 'pneumatic', 'Vzdušník u kompresoru', 'Uzavřete ventil a vypusťte vzdušník.', 'Objímka ventilu', 'Manometr 0 bar.'),
      pt('T20', 'Kontrola teploty', 'thermal', 'Kryt kompresoru', 'Ověřte teplotu bezkontaktním teploměrem.', 'Visačka LOTO', 'Teplota pod 40 °C.')],
    ['Zavřete vypouštěcí ventil', 'Zapněte vypínač Q20'], [[1, -3, 'Nový postup']])

  const packer = await machine(brno.id, shipping, 'Balicí linka 01', 'BAL-001', 'Krones', 'Balicí linka', 'INV-2022-1001',
    [['electrical', '400 V AC'], ['pneumatic', '6 bar']])
  await procedure(packer, 'LOTO postup – Balicí linka 01', 1, 'draft', null, [], [['Zastavte linku', 'Stiskněte STOP.']],
    [pt('Q01', 'Hlavní vypínač', 'electrical', 'Rozvaděč expedice', 'Vypínač do polohy 0.', 'Osobní visací zámek', '')], [], [[1, -1, 'Rozpracováno']])

  const defect = (equipment: string, severity: string, title: string, detail: string, offset: number, resolved = false) =>
    insert('defects', {
      company_id: c, equipment_id: equipment, severity, title, detail, reported_by: ctx.profile.id, reported_by_name: author,
      created_at: iso(offset), resolved_at: resolved ? iso(offset + 2) : null, resolved_by_name: resolved ? author : null,
      resolution_note: resolved ? 'Visačka vyměněna.' : '',
    })
  await defect(mixer, 'note', 'Hlučnější ložisko míchadla při rozběhu', 'Sledovat při příští údržbě.', -2)
  await defect(conveyor, 'major', 'Poškozený kryt napínací stanice', 'Kryt je prasklý u úchytu, hrozí zachycení oděvu.', -1)
  await defect(compressor, 'critical', 'Únik oleje pod kompresorem', 'Kluzká podlaha v okolí, olej může být horký.', -3)
  await defect(cutter, 'minor', 'Nečitelná visačka u V01', '', -20, true)

  // HSE přiřadíme do pražského závodu
  await sb.rpc('set_member', { p_user: ctx.profile.id, p_role: 'hse', p_active: true, p_site: prague.id })
  await audit(ctx, 'demoSeeded', 'Vytvořena demo data LOTOFLOW')
}
