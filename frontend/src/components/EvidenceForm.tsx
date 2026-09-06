import { useState } from 'react'
import { ApiError } from '../services/api'
import { useWorkspace } from '../context/WorkspaceContext'
import type { Control, Evidence, EvidenceInput, Finding, VerificationStatus } from '../types'

function emptyForm(defaultType: string): EvidenceInput {
  return {
    name: '',
    evidence_type: defaultType,
    description: '',
    source: '',
    related_control_id: null,
    verification_status: 'Pending',
    linked_finding_ids: [],
  }
}

export function EvidenceForm({
  evidence,
  findingOptions,
  controlOptions,
  onSubmit,
  onCancel,
}: {
  evidence?: Evidence
  findingOptions: Finding[]
  controlOptions: Control[]
  onSubmit: (values: EvidenceInput) => Promise<void>
  onCancel: () => void
}) {
  const { vocabulary } = useWorkspace()
  const types = vocabulary?.evidence_types ?? ['Document']
  const verificationStatuses = vocabulary?.verification_statuses ?? ['Pending']

  const [values, setValues] = useState<EvidenceInput>(() =>
    evidence
      ? {
          name: evidence.name,
          evidence_type: evidence.evidence_type,
          description: evidence.description,
          source: evidence.source,
          related_control_id: evidence.related_control_id,
          verification_status: evidence.verification_status,
          linked_finding_ids: [...evidence.linked_finding_ids],
        }
      : emptyForm(types[0]),
  )
  const [problems, setProblems] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof EvidenceInput>(key: K, value: EvidenceInput[K]) => {
    setValues((current) => ({ ...current, [key]: value }))
  }

  const toggleFinding = (id: string) => {
    setValues((current) => ({
      ...current,
      linked_finding_ids: current.linked_finding_ids.includes(id)
        ? current.linked_finding_ids.filter((entry) => entry !== id)
        : [...current.linked_finding_ids, id],
    }))
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)

    if (!values.name.trim()) {
      setProblems({ name: 'A name is required.' })
      return
    }
    setProblems({})
    setSaving(true)
    try {
      await onSubmit({ ...values, name: values.name.trim() })
    } catch (cause) {
      if (cause instanceof ApiError) {
        setFormError(cause.message)
        setProblems(
          Object.fromEntries(cause.problems.map((problem) => [problem.field, problem.message])),
        )
      } else {
        setFormError('The evidence item could not be saved.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex max-h-[calc(100vh-12rem)] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {formError && (
          <p className="rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-sm text-critical">
            {formError}
          </p>
        )}

        <div>
          <label className="label" htmlFor="evidence-name">
            Evidence name *
          </label>
          <input
            id="evidence-name"
            className="field"
            value={values.name}
            maxLength={300}
            onChange={(event) => set('name', event.target.value)}
            placeholder="What the item is, e.g. Backup schedule configuration"
          />
          {problems.name && <p className="mt-1 text-2xs text-critical">{problems.name}</p>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="evidence-type">
              Type
            </label>
            <select
              id="evidence-type"
              className="field"
              value={values.evidence_type}
              onChange={(event) => set('evidence_type', event.target.value)}
            >
              {types.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            {problems.evidence_type && (
              <p className="mt-1 text-2xs text-critical">{problems.evidence_type}</p>
            )}
          </div>
          <div>
            <label className="label" htmlFor="evidence-verification">
              Verification status
            </label>
            <select
              id="evidence-verification"
              className="field"
              value={values.verification_status}
              onChange={(event) => set('verification_status', event.target.value as VerificationStatus)}
            >
              {verificationStatuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="label" htmlFor="evidence-description">
            Description
          </label>
          <textarea
            id="evidence-description"
            className="field min-h-[4.5rem] resize-y"
            value={values.description}
            maxLength={5000}
            onChange={(event) => set('description', event.target.value)}
            placeholder="What the item shows"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="evidence-source">
              Source
            </label>
            <input
              id="evidence-source"
              className="field"
              value={values.source}
              maxLength={300}
              onChange={(event) => set('source', event.target.value)}
              placeholder="Where it came from and when"
            />
          </div>
          <div>
            <label className="label" htmlFor="evidence-control">
              Related control
            </label>
            <select
              id="evidence-control"
              className="field"
              value={values.related_control_id ?? ''}
              onChange={(event) => set('related_control_id', event.target.value || null)}
            >
              <option value="">Not mapped to a control</option>
              {controlOptions.map((control) => (
                <option key={control.id} value={control.id}>
                  {control.id} — {control.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <p className="label">Linked findings ({values.linked_finding_ids.length} selected)</p>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-line bg-base p-2">
            {findingOptions.length === 0 && (
              <p className="px-1 py-2 text-xs text-subtle">No findings have been recorded yet.</p>
            )}
            {findingOptions.map((finding) => (
              <label
                key={finding.id}
                className="flex cursor-pointer items-start gap-2 rounded px-1.5 py-1 hover:bg-hover"
              >
                <input
                  type="checkbox"
                  className="mt-1 accent-[#4f8ff0]"
                  checked={values.linked_finding_ids.includes(finding.id)}
                  onChange={() => toggleFinding(finding.id)}
                />
                <span className="min-w-0 text-xs">
                  <span className="font-mono text-2xs text-subtle">{finding.id}</span>{' '}
                  <span className="text-ink">{finding.title}</span>
                  <span className="block text-2xs text-subtle">
                    {finding.severity} · {finding.status}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <p className="rounded-md border border-line bg-base px-3 py-2 text-2xs leading-relaxed text-subtle">
          AegisLens stores evidence <span className="text-muted">metadata</span> only. Keep the files
          themselves in your existing evidence store and record the location in the source field.
        </p>
      </div>

      <div className="flex shrink-0 justify-end gap-2 border-t border-line px-5 py-3">
        <button type="button" className="btn-ghost btn-sm" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn-primary btn-sm" disabled={saving}>
          {saving ? 'Saving…' : evidence ? 'Save changes' : 'Add evidence'}
        </button>
      </div>
    </form>
  )
}
