import { useMemo, useState } from 'react'
import { Info } from 'lucide-react'
import { ApiError } from '../services/api'
import { useWorkspace } from '../context/WorkspaceContext'
import { cx, riskScoreColor, severityStyle } from '../lib/ui'
import type { Control, Evidence, FindingDetail, FindingInput, Severity } from '../types'

const SEVERITIES: Severity[] = ['Critical', 'High', 'Medium', 'Low', 'Informational']
const SCALE = [1, 2, 3, 4, 5]

const SCALE_HINTS: Record<number, string> = {
  1: 'Rare / negligible',
  2: 'Unlikely / minor',
  3: 'Possible / moderate',
  4: 'Likely / major',
  5: 'Almost certain / severe',
}

function levelForScore(score: number): Severity {
  if (score >= 20) return 'Critical'
  if (score >= 12) return 'High'
  if (score >= 6) return 'Medium'
  if (score >= 3) return 'Low'
  return 'Informational'
}

function emptyForm(defaultCategory: string): FindingInput {
  return {
    title: '',
    description: '',
    category: defaultCategory,
    severity: 'Medium',
    likelihood: 3,
    impact: 3,
    status: 'Open',
    owner: '',
    affected_asset: '',
    security_impact: '',
    recommended_action: '',
    due_date: null,
    evidence_ids: [],
    control_ids: [],
  }
}

export function FindingForm({
  finding,
  evidenceOptions,
  controlOptions,
  onSubmit,
  onCancel,
}: {
  finding?: FindingDetail
  evidenceOptions: Evidence[]
  controlOptions: Control[]
  onSubmit: (values: FindingInput) => Promise<void>
  onCancel: () => void
}) {
  const { vocabulary, assessmentId } = useWorkspace()
  const categories = vocabulary?.categories ?? []
  const statuses = vocabulary?.statuses ?? ['Open']

  const [values, setValues] = useState<FindingInput>(() =>
    finding
      ? {
          title: finding.title,
          description: finding.description,
          category: finding.category,
          severity: finding.severity,
          likelihood: finding.likelihood,
          impact: finding.impact,
          status: finding.status,
          owner: finding.owner,
          affected_asset: finding.affected_asset,
          security_impact: finding.security_impact,
          recommended_action: finding.recommended_action,
          due_date: finding.due_date,
          evidence_ids: [...finding.evidence_ids],
          control_ids: [...finding.control_ids],
        }
      : emptyForm(categories[0] ?? 'Access Control'),
  )
  const [problems, setProblems] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const score = values.likelihood * values.impact
  const impliedSeverity = levelForScore(score)
  const severityDiffers = impliedSeverity !== values.severity

  const set = <K extends keyof FindingInput>(key: K, value: FindingInput[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
    setProblems((current) => {
      if (!(key in current)) return current
      const next = { ...current }
      delete next[key as string]
      return next
    })
  }

  const toggle = (key: 'evidence_ids' | 'control_ids', id: string) => {
    setValues((current) => {
      const list = current[key]
      return {
        ...current,
        [key]: list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id],
      }
    })
  }

  const sortedEvidence = useMemo(
    () => [...evidenceOptions].sort((a, b) => a.id.localeCompare(b.id)),
    [evidenceOptions],
  )

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    const nextProblems: Record<string, string> = {}
    if (!values.title.trim()) nextProblems.title = 'A title is required.'
    if (!values.category.trim()) nextProblems.category = 'Choose a category.'
    if (Object.keys(nextProblems).length > 0) {
      setProblems(nextProblems)
      return
    }

    setSaving(true)
    try {
      await onSubmit({
        ...values,
        title: values.title.trim(),
        due_date: values.due_date || null,
        assessment_id: finding ? undefined : assessmentId,
      })
    } catch (cause) {
      if (cause instanceof ApiError) {
        setFormError(cause.message)
        setProblems(
          Object.fromEntries(cause.problems.map((problem) => [problem.field, problem.message])),
        )
      } else {
        setFormError('The finding could not be saved.')
      }
    } finally {
      setSaving(false)
    }
  }

  const fieldError = (name: string) =>
    problems[name] ? <p className="mt-1 text-2xs text-critical">{problems[name]}</p> : null

  return (
    <form onSubmit={handleSubmit} className="flex max-h-[calc(100vh-12rem)] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {formError && (
          <p className="rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical">
            {formError}
          </p>
        )}

        <div>
          <label className="label" htmlFor="finding-title">
            Title *
          </label>
          <input
            id="finding-title"
            className="field"
            value={values.title}
            maxLength={300}
            onChange={(event) => set('title', event.target.value)}
            placeholder="Short statement of the weakness"
          />
          {fieldError('title')}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="finding-category">
              Category *
            </label>
            <input
              id="finding-category"
              className="field"
              list="finding-categories"
              value={values.category}
              maxLength={80}
              onChange={(event) => set('category', event.target.value)}
            />
            <datalist id="finding-categories">
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            {fieldError('category')}
          </div>
          <div>
            <label className="label" htmlFor="finding-status">
              Status
            </label>
            <select
              id="finding-status"
              className="field"
              value={values.status}
              onChange={(event) => set('status', event.target.value as FindingInput['status'])}
            >
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="finding-description">
            Description
          </label>
          <textarea
            id="finding-description"
            className="field min-h-[5rem] resize-y"
            value={values.description}
            maxLength={5000}
            onChange={(event) => set('description', event.target.value)}
            placeholder="What was observed, and in which evidence"
          />
        </div>

        {/* Risk rating */}
        <fieldset className="rounded-md border border-line bg-base p-3">
          <legend className="px-1 text-2xs font-medium uppercase tracking-wider text-muted">
            Risk rating
          </legend>
          <div className="grid gap-4 sm:grid-cols-2">
            {(['likelihood', 'impact'] as const).map((key) => (
              <div key={key}>
                <label className="label capitalize" htmlFor={`finding-${key}`}>
                  {key} (1–5)
                </label>
                <select
                  id={`finding-${key}`}
                  className="field"
                  value={values[key]}
                  onChange={(event) => set(key, Number(event.target.value))}
                >
                  {SCALE.map((value) => (
                    <option key={value} value={value}>
                      {value} — {SCALE_HINTS[value]}
                    </option>
                  ))}
                </select>
                {fieldError(key)}
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 rounded border border-line bg-surface px-3 py-2">
            <span className="font-mono text-xs text-muted">
              {values.likelihood} × {values.impact} =
            </span>
            <span className={cx('font-mono text-lg font-semibold', riskScoreColor(score))}>{score}</span>
            <span className="text-2xs text-subtle">/ 25</span>
            <span className={cx('badge', severityStyle[impliedSeverity])}>{impliedSeverity}</span>
            <span className="text-2xs text-subtle">calculated automatically</span>
          </div>

          <div className="mt-3">
            <label className="label" htmlFor="finding-severity">
              Recorded severity
            </label>
            <select
              id="finding-severity"
              className="field"
              value={values.severity}
              onChange={(event) => set('severity', event.target.value as Severity)}
            >
              {SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {severity}
                </option>
              ))}
            </select>
            {fieldError('severity')}
            {severityDiffers && (
              <p className="mt-1.5 flex items-start gap-1.5 text-2xs text-medium">
                <Info size={12} className="mt-0.5 shrink-0" aria-hidden />
                The score implies {impliedSeverity}. Keeping {values.severity} is allowed, and the
                difference is flagged on the finding and in the report.
              </p>
            )}
          </div>
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="finding-owner">
              Owner
            </label>
            <input
              id="finding-owner"
              className="field"
              value={values.owner}
              maxLength={120}
              onChange={(event) => set('owner', event.target.value)}
              placeholder="Team accountable for remediation"
            />
          </div>
          <div>
            <label className="label" htmlFor="finding-asset">
              Affected asset
            </label>
            <input
              id="finding-asset"
              className="field"
              value={values.affected_asset}
              maxLength={160}
              onChange={(event) => set('affected_asset', event.target.value)}
              placeholder="System or service in scope"
            />
          </div>
        </div>

        <div>
          <label className="label" htmlFor="finding-due">
            Due date
          </label>
          <input
            id="finding-due"
            type="date"
            className="field sm:max-w-[16rem]"
            value={values.due_date ?? ''}
            onChange={(event) => set('due_date', event.target.value || null)}
          />
        </div>

        <div>
          <label className="label" htmlFor="finding-impact-text">
            Security impact
          </label>
          <textarea
            id="finding-impact-text"
            className="field min-h-[4.5rem] resize-y"
            value={values.security_impact}
            maxLength={5000}
            onChange={(event) => set('security_impact', event.target.value)}
            placeholder="Why this matters if it is not addressed"
          />
        </div>

        <div>
          <label className="label" htmlFor="finding-action">
            Recommended action
          </label>
          <textarea
            id="finding-action"
            className="field min-h-[4.5rem] resize-y"
            value={values.recommended_action}
            maxLength={5000}
            onChange={(event) => set('recommended_action', event.target.value)}
            placeholder="Concrete remediation steps"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="label">Supporting evidence ({values.evidence_ids.length} selected)</p>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-line bg-base p-2">
              {sortedEvidence.length === 0 && (
                <p className="px-1 py-2 text-xs text-subtle">No evidence has been recorded yet.</p>
              )}
              {sortedEvidence.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-hover"
                >
                  <input
                    type="checkbox"
                    className="mt-1 accent-[#4f8ff0]"
                    checked={values.evidence_ids.includes(item.id)}
                    onChange={() => toggle('evidence_ids', item.id)}
                  />
                  <span className="min-w-0 text-xs">
                    <span className="font-mono text-2xs text-subtle">{item.id}</span>{' '}
                    <span className="text-ink">{item.name}</span>
                    <span className="block text-2xs text-subtle">
                      {item.evidence_type} · {item.verification_status}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="label">Related controls ({values.control_ids.length} selected)</p>
            <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-line bg-base p-2">
              {controlOptions.length === 0 && (
                <p className="px-1 py-2 text-xs text-subtle">No controls are defined.</p>
              )}
              {controlOptions.map((control) => (
                <label
                  key={control.id}
                  className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-hover"
                >
                  <input
                    type="checkbox"
                    className="mt-1 accent-[#4f8ff0]"
                    checked={values.control_ids.includes(control.id)}
                    onChange={() => toggle('control_ids', control.id)}
                  />
                  <span className="min-w-0 text-xs">
                    <span className="font-mono text-2xs text-subtle">{control.id}</span>{' '}
                    <span className="text-ink">{control.name}</span>
                    <span className="block text-2xs text-subtle">{control.category}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-line px-5 py-3">
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn-primary btn-sm" disabled={saving}>
          {saving ? 'Saving…' : finding ? 'Save changes' : 'Create finding'}
        </button>
      </div>
    </form>
  )
}
