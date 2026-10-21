import { describe, expect, it } from 'vitest'
import { fold, lockNumber, matches, missingItems, parseQR, preflight, reviewState } from './rules'
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
  points: [{ id: 'q', code: 'Q01', name: 'Vypínač', energy: 'electrical', location: 'RM', method: '0', lock: 'Zámek', verification: '' }],
  revisions: [], updated_at: '', ...over,
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
