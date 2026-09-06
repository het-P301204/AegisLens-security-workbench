/**
 * Thin typed wrapper around the AegisLens REST API.
 *
 * Every call goes through `request`, which turns a non-2xx response into an
 * `ApiError` carrying the field-level problems the backend reports, so forms can
 * show them next to the offending input.
 */

import type {
  ActivityEntry,
  Asset,
  Assessment,
  Control,
  ControlCategorySummary,
  Dashboard,
  Evidence,
  EvidenceGap,
  EvidenceInput,
  Finding,
  FindingDetail,
  FindingInput,
  FindingStatus,
  ReportSummary,
  RiskModel,
  Vocabulary,
} from '../types'

const BASE = '/api'

export interface FieldProblem {
  field: string
  message: string
}

export class ApiError extends Error {
  status: number
  problems: FieldProblem[]

  constructor(message: string, status: number, problems: FieldProblem[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.problems = problems
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    })
  } catch {
    throw new ApiError('Could not reach the AegisLens API. Is the backend running?', 0)
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`
    let problems: FieldProblem[] = []
    try {
      const body = await response.json()
      if (typeof body.detail === 'string') message = body.detail
      if (Array.isArray(body.problems)) problems = body.problems
    } catch {
      /* response had no JSON body; the status-based message stands */
    }
    throw new ApiError(message, response.status, problems)
  }

  if (response.status === 204) return undefined as T
  const contentType = response.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) return (await response.json()) as T
  return (await response.text()) as unknown as T
}

/** Build a query string, dropping empty values and expanding array filters. */
function query(params: Record<string, string | number | boolean | string[] | undefined | null>) {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) value.forEach((entry) => search.append(key, entry))
    else search.append(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export interface FindingFilters {
  assessment_id?: string
  search?: string
  severity?: string[]
  status?: string[]
  category?: string[]
  sort?: string
  order?: 'asc' | 'desc'
}

export interface EvidenceFilters {
  search?: string
  evidence_type?: string[]
  verification_status?: string[]
  control_id?: string
  unlinked_only?: boolean
}

export const api = {
  health: () => request<{ status: string; version: string; database: string }>('/health'),

  dashboard: (assessmentId?: string) =>
    request<Dashboard>(`/dashboard${query({ assessment_id: assessmentId })}`),

  assessments: () => request<Assessment[]>('/assessments'),
  updateAssessment: (id: string, body: Partial<Assessment>) =>
    request<Assessment>(`/assessments/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  activateAssessment: (id: string) =>
    request<Assessment>(`/assessments/${id}/activate`, { method: 'POST' }),

  vocabulary: () => request<Vocabulary>('/vocabulary'),
  riskModel: () => request<RiskModel>('/risk-model'),
  assets: () => request<Asset[]>('/assets'),
  activity: (limit = 50) => request<ActivityEntry[]>(`/activity${query({ limit })}`),

  findings: (filters: FindingFilters = {}) => request<Finding[]>(`/findings${query({ ...filters })}`),
  finding: (id: string) => request<FindingDetail>(`/findings/${id}`),
  createFinding: (body: FindingInput) =>
    request<FindingDetail>('/findings', { method: 'POST', body: JSON.stringify(body) }),
  updateFinding: (id: string, body: Partial<FindingInput>) =>
    request<FindingDetail>(`/findings/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  setFindingStatus: (id: string, status: FindingStatus) =>
    request<FindingDetail>(`/findings/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  deleteFinding: (id: string) => request<void>(`/findings/${id}`, { method: 'DELETE' }),

  evidence: (filters: EvidenceFilters = {}) => request<Evidence[]>(`/evidence${query({ ...filters })}`),
  createEvidence: (body: EvidenceInput) =>
    request<Evidence>('/evidence', { method: 'POST', body: JSON.stringify(body) }),
  updateEvidence: (id: string, body: Partial<EvidenceInput>) =>
    request<Evidence>(`/evidence/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteEvidence: (id: string) => request<void>(`/evidence/${id}`, { method: 'DELETE' }),
  evidenceCoverage: (assessmentId?: string) =>
    request<EvidenceGap[]>(`/evidence/coverage${query({ assessment_id: assessmentId })}`),

  controls: () => request<Control[]>('/controls'),
  controlCategories: () => request<ControlCategorySummary[]>('/controls/categories'),
  updateControl: (id: string, body: { status?: string; notes?: string }) =>
    request<Control>(`/controls/${id}`, { method: 'PUT', body: JSON.stringify(body) }),

  reportSummary: (assessmentId?: string) =>
    request<ReportSummary>(`/reports/summary${query({ assessment_id: assessmentId })}`),
  reportMarkdown: (assessmentId?: string) =>
    request<string>(`/reports/markdown${query({ assessment_id: assessmentId })}`),

  /** URLs opened directly by the browser rather than fetched. */
  reportMarkdownDownloadUrl: (assessmentId?: string) =>
    `${BASE}/reports/markdown${query({ assessment_id: assessmentId, download: true })}`,
  reportPrintUrl: (assessmentId?: string) =>
    `${BASE}/reports/print${query({ assessment_id: assessmentId })}`,
  docsUrl: `${BASE}/docs`,
}
