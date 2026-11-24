import { describe, expect, it } from 'vitest'
import {
  ZERO_CHECK_NEUTRAL, ZERO_CHECK_START, codeColor, fold, isAutoCode, lockNumber, matches, missingItems, nextPointCode, parseQR, preflight, reviewState, zeroChecksFor,
} from './rules'
import type { Defect, Equipment, Procedure } from './types'

const equipment: Equipment = {
  id: 'e1', company_id: 'c', site_id: null, workplace_id: null, name: 'Míchačka 04', code: 'MIX-004',
  manufacturer: '', equipment_type: '', asset_number: '', out_of_service: false,
  energy_sources: [{ type: 'electrical', magnitude: '400 V', note: '' }], created_at: '', updated_at: '',
}
const procedure = (over: Partial<Procedure> = {}): Procedure => ({
  id: 'p1', company_id: 'c', equipment_id: 'e1', name: 'Postup', revision: 1, status: 'approved', author_name: '',
  approver_name: 'X', approved_at: '2026-01-01', next_review_date: new Date(Date.now() + 200 * 864e5).toISOString(),
  last_reviewed_at: null, last_reviewed_by: null, review_interval_months: 12, ppe: ['Brýle'],
  preparation: [{ title: 'Stop', detail: '' }], restoration: ['Zapnout'],
  points: [{ id: 'q', code: 'E1', name: 'Vypínač', energy: 'electrical', location: 'RM', method: '0', lock: 'Uzávěr vypínače', verification: 'Pokus o spuštění', photo_path: 'f/e1.jpg' }],
  revisions: [], updated_at: '', overview_photo_path: 'f/prehled.jpg', ...over,
})

describe('QR', () => {
  it('parsuje kódy strojů a bodů', () => {
    expect(parseQR('LOTOMACHINE:MIX-004')).toEqual({ kind: 'machine', code: 'MIX-004' })
    expect(parseQR(' lotopoint:mix-004:q01 ')).toEqual({ kind: 'point', machine: 'MIX-004', point: 'Q01' })
    expect(parseQR('LOTOPOINT:MIX-004')).toBeNull()
    expect(parseQR('https://example.com')).toBeNull()
  })
})

describe('text', () => {
  it('ignoruje diakritiku', () => {
    expect(fold('Řezací')).toBe('rezaci')
    expect(matches(['Míchačka 04'], 'michacka')).toBe(true)
    expect(matches(['Lis 02'], 'kompresor')).toBe(false)
  })
  it('skládá číslo osobního zámku', () => {
    expect(lockNumber({ lock_prefix: 'jn', personal_number: '10417' })).toBe('JN-417')
  })
})

describe('revize', () => {
  it('určí stav podle termínu', () => {
    const now = new Date('2026-10-21T10:00:00')
    expect(reviewState('2026-10-19', now)).toBe('overdue')
    expect(reviewState('2026-11-01', now)).toBe('dueSoon')
    expect(reviewState('2027-03-01', now)).toBe('onTime')
    expect(reviewState(null, now)).toBeNull()
  })
})

describe('zahájení LOTO', () => {
  it('schválený postup bez závad nevaruje', () => {
    const r = preflight(equipment, [procedure()], [], [])
    expect(r.blockers).toEqual([])
    expect(r.warnings).toEqual([])
  })
  it('revize po termínu blokuje, rozpracovaný postup blokuje', () => {
    expect(preflight(equipment, [procedure({ next_review_date: '2020-01-01' })], [], []).blockers.length).toBe(1)
    expect(preflight(equipment, [procedure({ status: 'draft' })], [], []).blockers.length).toBe(1)
  })
  it('závada varuje, poznámka ne', () => {
    const base: Defect = {
      id: 'd', company_id: 'c', equipment_id: 'e1', severity: 'note', title: 'Hluk', detail: '', photo_path: null,
      reported_by: 'u', reported_by_name: 'U', created_at: '2026-10-01', resolved_at: null, resolved_by_name: null, resolution_note: '',
    }
    expect(preflight(equipment, [procedure()], [], [base]).warnings).toEqual([])
    expect(preflight(equipment, [procedure()], [], [{ ...base, severity: 'major' }]).warnings.length).toBe(1)
    expect(preflight(equipment, [procedure()], [], [{ ...base, severity: 'major', resolved_at: '2026-10-02' }]).warnings).toEqual([])
  })
})

describe('úplnost postupu', () => {
  it('kompletní postup projde, neúplný ne', () => {
    expect(missingItems(procedure(), equipment)).toEqual([])
    expect(missingItems(procedure({ ppe: [], restoration: [] }), equipment).length).toBe(2)
    expect(missingItems(procedure({ points: [] }), equipment).length).toBe(2)
  })
})

describe('úplnost postupu podle karty', () => {
  it('vyžaduje přehledovou fotografii, fotografii a ověření u bodu', () => {
    const m = missingItems(procedure({ overview_photo_path: null, points: [{ ...procedure().points[0], photo_path: null, verification: '' }] }), equipment)
    expect(m).toHaveLength(3)
  })
  it('neuzamykaný bod nepotřebuje LOTO prvek', () => {
    const odlozeni = { id: 'm', code: 'M1', name: 'Odložení břemene', energy: 'gravitational' as const, location: 'Chapadlo', method: 'Odložit', lock: '', verification: 'Chapadlo prázdné', photo_path: 'f/m1.jpg', lockable: false }
    expect(missingItems(procedure({ points: [...procedure().points, odlozeni] }), equipment)).toEqual([])
    expect(missingItems(procedure({ points: [...procedure().points, { ...odlozeni, lockable: true }] }), equipment)).toHaveLength(1)
  })
})

describe('kódy izolačních bodů', () => {
  it('čísluje podle druhu energie', () => {
    expect(nextPointCode('electrical', [])).toBe('E1')
    expect(nextPointCode('pneumatic', ['E1', 'P1'])).toBe('P2')
    expect(nextPointCode('gravitational', ['E1'])).toBe('M1')
    expect(nextPointCode('water', [])).toBe('W1')
    expect(nextPointCode('gas', [])).toBe('G1')
  })
  it('rozliší automatický a ručně zadaný kód', () => {
    expect(isAutoCode('P01')).toBe(true)
    expect(isAutoCode('E2')).toBe(true)
    expect(isAutoCode('RM-04')).toBe(false)
  })
  it('barví podle kódu, starší kódy podle energie', () => {
    expect(codeColor('P2', 'stored').bg).toBe('#1565C0')
    expect(codeColor('E1', 'electrical').bg).toBe('#C62828')
    expect(codeColor('P01', 'electrical').bg).toBe('#C62828')
    expect(codeColor('Q01', 'electrical').bg).toBe('#C62828')
    expect(codeColor('H1').fg).toBe('#1C2536')
  })
})

describe('ověření nulového stavu', () => {
  it('skládá se z ověření u jednotlivých bodů', () => {
    const p = procedure({ points: [
      { ...procedure().points[0], code: 'E1', verification: 'Pokus o spuštění tlačítkem START' },
      { ...procedure().points[0], id: 'p', code: 'P1', energy: 'pneumatic', verification: 'Manometr 0 bar' },
    ] })
    expect(zeroChecksFor(p)).toEqual([ZERO_CHECK_START, 'E1: Pokus o spuštění tlačítkem START', 'P1: Manometr 0 bar', ZERO_CHECK_NEUTRAL])
  })
  it('bez ověření u bodů použije obecné body', () => {
    const p = procedure({ points: [{ ...procedure().points[0], verification: '' }] })
    expect(zeroChecksFor(p)).toContain(ZERO_CHECK_NEUTRAL)
    expect(zeroChecksFor(p).some((c) => c.includes('manometr'))).toBe(false)
  })
})
