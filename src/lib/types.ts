export type Role = 'worker' | 'supervisor' | 'hse'
export type EnergyType = 'electrical' | 'pneumatic' | 'hydraulic' | 'mechanical' | 'thermal' | 'gravitational' | 'chemical' | 'stored'
export type ProcedureStatus = 'draft' | 'pendingApproval' | 'approved' | 'needsRevision' | 'archived'
export type LotoStatus = 'isolating' | 'active' | 'restoring' | 'closed'
export type StepKind = 'preparation' | 'isolation' | 'lockout' | 'restoration'
export type Severity = 'note' | 'minor' | 'major' | 'critical'
export type ReviewState = 'onTime' | 'dueSoon' | 'overdue'

export interface Company { id: string; name: string; registration_number: string; join_code: string }
export interface Profile {
  id: string; email: string; full_name: string; personal_number: string; lock_prefix: string
  role: Role; is_active: boolean; company_id: string | null; site_id: string | null
}
export interface Site { id: string; company_id: string; name: string; city: string }
export interface Workplace { id: string; company_id: string; site_id: string; name: string }
export interface EnergySource { type: EnergyType; magnitude: string; note: string }
export interface Equipment {
  id: string; company_id: string; site_id: string | null; workplace_id: string | null
  name: string; code: string; manufacturer: string; equipment_type: string; asset_number: string
  out_of_service: boolean; energy_sources: EnergySource[]; created_at: string; updated_at: string
}
export interface IsolationPoint {
  id: string; code: string; name: string; energy: EnergyType; location: string
  method: string; lock: string; verification: string; photo_path?: string | null
}
export interface PrepStep { title: string; detail: string }
export interface Revision { revision: number; at: string; by: string; summary: string }
export interface Procedure {
  id: string; company_id: string; equipment_id: string; name: string; revision: number; status: ProcedureStatus
  author_name: string; approver_name: string | null; approved_at: string | null; next_review_date: string | null
  last_reviewed_at: string | null; last_reviewed_by: string | null; review_interval_months: number
  ppe: string[]; preparation: PrepStep[]; restoration: string[]; points: IsolationPoint[]; revisions: Revision[]; updated_at: string
}
export interface LotoStep {
  id: string; kind: StepKind; title: string; instruction: string
  point_id?: string; point_code?: string; point_name?: string; energy?: EnergyType; required_lock?: string
  done: boolean; at?: string; by?: string; lock?: string; photo_path?: string; qr?: boolean
}
export interface Participant { user_id: string; name: string; personal_number: string; lock: string; role: Role; joined_at: string; removed_at?: string }
export interface TimelineEntry { at: string; kind: string; title: string; detail: string; actor: string }
export interface Loto {
  id: string; company_id: string; site_id: string | null; equipment_id: string | null; procedure_id: string | null
  status: LotoStatus; reason: string; equipment_code: string; equipment_name: string; procedure_name: string
  procedure_revision: number; procedure_approved_by: string | null; procedure_approved_at: string | null
  started_at: string; started_by: string; started_by_name: string; responsible_id: string; responsible_name: string
  steps: LotoStep[]; participants: Participant[]; timeline: TimelineEntry[]; zero_checks: string[]
  zero_verified_at: string | null; zero_verified_by: string | null; restoration_started_at: string | null
  closed_at: string | null; closed_by_name: string | null; version: number; updated_at: string
}
export interface Defect {
  id: string; company_id: string; equipment_id: string; severity: Severity; title: string; detail: string
  photo_path: string | null; reported_by: string; reported_by_name: string; created_at: string
  resolved_at: string | null; resolved_by_name: string | null; resolution_note: string
}
export interface AuditEvent {
  id: string; company_id: string; site_id: string | null; at: string; action: string; actor_id: string | null; actor_name: string
  equipment_code: string | null; equipment_name: string | null; loto_id: string | null; procedure_id: string | null
  summary: string; detail: string
}
