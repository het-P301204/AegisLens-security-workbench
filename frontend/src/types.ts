/** Shapes returned by the AegisLens API. Kept in step with backend/app/schemas.py. */

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low' | 'Informational'
export type FindingStatus = 'Open' | 'In Review' | 'Accepted' | 'Remediated' | 'Closed'
export type VerificationStatus = 'Verified' | 'Pending' | 'Not Verified'
export type ControlStatus =
  | 'Implemented'
  | 'Partially Implemented'
  | 'Not Implemented'
  | 'Not Assessed'

export interface Assessment {
  id: string
  name: string
  period: string
  owner: string
  scope: string
  assumptions: string
  is_active: boolean
  finding_count: number
}

export interface EvidenceSummary {
  id: string
  name: string
  evidence_type: string
  verification_status: VerificationStatus
  source: string
  upload_date: string
  related_control_id: string | null
}

export interface Evidence extends EvidenceSummary {
  description: string
  linked_finding_ids: string[]
}

export interface ControlSummary {
  id: string
  name: string
  category: string
  status: ControlStatus
}

export interface Control extends ControlSummary {
  description: string
  notes: string
  linked_finding_ids: string[]
  open_finding_count: number
  evidence_count: number
  verified_evidence_count: number
  coverage_percent: number
}

export interface ControlCategorySummary {
  category: string
  control_count: number
  implemented: number
  partially_implemented: number
  not_implemented: number
  not_assessed: number
  open_findings: number
  coverage_percent: number
}

export interface ActivityEntry {
  id: number
  timestamp: string
  actor: string
  action: string
  entity_type: string
  entity_id: string
  detail: string
}

export interface Finding {
  id: string
  assessment_id: string
  title: string
  description: string
  category: string
  severity: Severity
  likelihood: number
  impact: number
  risk_score: number
  risk_level: Severity
  derived_severity: Severity
  severity_matches_score: boolean
  status: FindingStatus
  owner: string
  affected_asset: string
  security_impact: string
  recommended_action: string
  due_date: string | null
  created_at: string
  updated_at: string
  is_overdue: boolean
  evidence_ids: string[]
  control_ids: string[]
  verified_evidence_count: number
}

export interface FindingDetail extends Finding {
  evidence: EvidenceSummary[]
  controls: ControlSummary[]
  activity: ActivityEntry[]
}

export interface Asset {
  id: string
  name: string
  asset_type: string
  environment: string
  owner: string
  criticality: string
  description: string
}

export interface EvidenceGap {
  finding_id: string
  title: string
  severity: Severity
  reason: string
}

export interface Dashboard {
  assessment: Assessment
  total_findings: number
  critical_findings: number
  high_findings: number
  open_findings: number
  resolved_findings: number
  accepted_findings: number
  overdue_findings: number
  evidence_items: number
  verified_evidence_items: number
  evidence_completion_percent: number
  overall_risk_score: number
  overall_risk_level: string
  control_coverage_percent: number
  controls_assessed: number
  controls_total: number
  severity_distribution: { severity: Severity; count: number }[]
  status_distribution: { status: FindingStatus; count: number }[]
  category_distribution: { category: string; count: number; open_count: number }[]
  top_findings: Finding[]
  evidence_gaps: EvidenceGap[]
  recent_activity: ActivityEntry[]
}

export interface Vocabulary {
  severities: Severity[]
  statuses: FindingStatus[]
  evidence_types: string[]
  verification_statuses: VerificationStatus[]
  control_statuses: ControlStatus[]
  categories: string[]
}

export interface RiskBand {
  level: Severity
  min_score: number
  max_score: number
  range: string
}

export interface RiskModel {
  formula: string
  scale_min: number
  scale_max: number
  max_score: number
  bands: RiskBand[]
  overall_risk_score: string
  evidence_completion: string
  control_coverage: string
}

export interface ReportFindingRow {
  id: string
  title: string
  category: string
  severity: Severity
  likelihood: number
  impact: number
  risk_score: number
  status: FindingStatus
  owner: string
  affected_asset: string
  due_date: string | null
  evidence_count: number
  verified_evidence_count: number
  recommended_action: string
}

export interface ReportSummary {
  title: string
  generated_at: string
  assessment: Assessment
  executive_summary: string[]
  risk_summary: Record<string, number>
  overall_risk_score: number
  overall_risk_level: string
  evidence_completion_percent: number
  control_coverage_percent: number
  findings: ReportFindingRow[]
  priority_findings: ReportFindingRow[]
  controls: {
    id: string
    name: string
    category: string
    status: ControlStatus
    linked_finding_count: number
    evidence_count: number
    coverage_percent: number
  }[]
  confirmed_evidence: string[]
  analyst_assessment: string[]
  missing_information: string[]
  recommended_next_steps: string[]
  limitations: string[]
}

export interface FindingInput {
  title: string
  description: string
  category: string
  severity: Severity
  likelihood: number
  impact: number
  status: FindingStatus
  owner: string
  affected_asset: string
  security_impact: string
  recommended_action: string
  due_date: string | null
  evidence_ids: string[]
  control_ids: string[]
  assessment_id?: string
}

export interface EvidenceInput {
  name: string
  evidence_type: string
  description: string
  source: string
  related_control_id: string | null
  verification_status: VerificationStatus
  linked_finding_ids: string[]
}
