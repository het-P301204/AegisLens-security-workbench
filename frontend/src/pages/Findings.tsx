import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Filter, Plus, Search, ShieldAlert, X } from 'lucide-react'
import { useWorkspace } from '../context/WorkspaceContext'
import { useAsync } from '../lib/useAsync'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import { PageHeader } from '../components/PageHeader'
import { Modal } from '../components/Modal'
import { FindingForm } from '../components/FindingForm'
import { OverdueFlag, RiskScore, SeverityBadge, StatusBadge } from '../components/Badges'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States'
import { cx, formatDate, pluralize } from '../lib/ui'
import type { FindingInput } from '../types'

function FilterGroup({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string
  options: string[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option)
          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              aria-pressed={active}
              className={cx(
                'rounded border px-2 py-1 text-2xs transition-colors',
                active
                  ? 'border-accent/50 bg-accent/15 text-accent-soft'
                  : 'border-line bg-base text-muted hover:border-line-strong hover:text-ink',
              )}
            >
              {option}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function Findings() {
  const { assessmentId, vocabulary, refresh, revision } = useWorkspace()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [severity, setSeverity] = useState<string[]>([])
  const [status, setStatus] = useState<string[]>([])
  const [category, setCategory] = useState<string[]>([])
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const filters = useMemo(
    () => ({ assessment_id: assessmentId, search: search.trim(), severity, status, category }),
    [assessmentId, search, severity, status, category],
  )

  const { data, loading, error, reload } = useAsync(
    () => api.findings(filters),
    [filters, revision],
  )
  const evidenceQuery = useAsync(() => api.evidence(), [revision])
  const controlsQuery = useAsync(() => api.controls(), [revision])

  const toggle = (setter: (updater: (current: string[]) => string[]) => void) => (value: string) =>
    setter((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    )

  const activeFilterCount = severity.length + status.length + category.length
  const hasQuery = activeFilterCount > 0 || search.trim().length > 0

  function clearFilters() {
    setSeverity([])
    setStatus([])
    setCategory([])
    setSearch('')
  }

  async function handleCreate(values: FindingInput) {
    const created = await api.createFinding(values)
    setCreateOpen(false)
    toast.success(`${created.id} created with risk score ${created.risk_score}/25.`)
    refresh()
  }

  return (
    <>
      <PageHeader
        title="Findings"
        description="Every recorded weakness in the selected assessment, with its likelihood, impact, and evidence."
        actions={
          <>
            <button
              type="button"
              className={cx('btn-ghost btn-sm', filtersOpen && 'border-accent/40 text-accent-soft')}
              onClick={() => setFiltersOpen((open) => !open)}
              aria-expanded={filtersOpen}
            >
              <Filter size={14} aria-hidden />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 rounded bg-accent/20 px-1 font-mono text-2xs text-accent-soft">
                  {activeFilterCount}
                </span>
              )}
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
              <Plus size={14} aria-hidden />
              New finding
            </button>
          </>
        }
      />

      <div className="panel mb-4">
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
          <div className="relative min-w-0 flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-subtle"
              aria-hidden
            />
            <input
              type="search"
              className="field pl-8"
              placeholder="Search title, id, asset, owner, or description"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search findings"
            />
          </div>
          {hasQuery && (
            <button type="button" className="btn-ghost btn-sm" onClick={clearFilters}>
              <X size={13} aria-hidden />
              Clear
            </button>
          )}
        </div>

        {filtersOpen && (
          <div className="grid gap-4 border-t border-line px-3 py-3 md:grid-cols-3">
            <FilterGroup
              label="Severity"
              options={vocabulary?.severities ?? []}
              selected={severity}
              onToggle={toggle(setSeverity)}
            />
            <FilterGroup
              label="Status"
              options={vocabulary?.statuses ?? []}
              selected={status}
              onToggle={toggle(setStatus)}
            />
            <FilterGroup
              label="Category"
              options={vocabulary?.categories ?? []}
              selected={category}
              onToggle={toggle(setCategory)}
            />
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title">
            {loading && !data ? 'Loading findings…' : pluralize(data?.length ?? 0, 'finding')}
          </h3>
          <p className="text-2xs text-subtle">Sorted by risk score, highest first</p>
        </div>

        {loading && !data && <SkeletonRows rows={6} />}
        {error && <ErrorState message={error} onRetry={reload} />}

        {data && data.length === 0 && !error && (
          <EmptyState
            icon={<ShieldAlert size={18} aria-hidden />}
            title={hasQuery ? 'No findings match these filters' : 'No findings recorded yet'}
            description={
              hasQuery
                ? 'Try a different search term, or clear the active filters.'
                : 'Create the first finding for this assessment to start building the risk picture.'
            }
            action={
              hasQuery ? (
                <button type="button" className="btn-ghost btn-sm" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : (
                <button type="button" className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
                  <Plus size={14} aria-hidden />
                  New finding
                </button>
              )
            }
          />
        )}

        {data && data.length > 0 && (
          <div className="table-scroll">
            <table className="w-full min-w-[52rem]">
              <thead className="border-b border-line">
                <tr>
                  <th className="th">Finding</th>
                  <th className="th">Category</th>
                  <th className="th">Severity</th>
                  <th className="th">Risk</th>
                  <th className="th">Status</th>
                  <th className="th">Owner</th>
                  <th className="th">Evidence</th>
                  <th className="th">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((finding) => (
                  <tr key={finding.id} className="hover:bg-hover">
                    <td className="td max-w-[22rem]">
                      <Link to={`/findings/${finding.id}`} className="block">
                        <span className="font-mono text-2xs text-subtle">{finding.id}</span>
                        <span className="mt-0.5 block text-sm text-ink hover:text-accent-soft">
                          {finding.title}
                        </span>
                      </Link>
                    </td>
                    <td className="td whitespace-nowrap text-xs text-muted">{finding.category}</td>
                    <td className="td">
                      <SeverityBadge severity={finding.severity} />
                      {!finding.severity_matches_score && (
                        <span
                          className="mt-1 block text-2xs text-medium"
                          title={`Likelihood × impact implies ${finding.derived_severity}`}
                        >
                          score implies {finding.derived_severity}
                        </span>
                      )}
                    </td>
                    <td className="td">
                      <RiskScore
                        score={finding.risk_score}
                        likelihood={finding.likelihood}
                        impact={finding.impact}
                      />
                    </td>
                    <td className="td">
                      <StatusBadge status={finding.status} />
                    </td>
                    <td className="td whitespace-nowrap text-xs text-muted">
                      {finding.owner || '—'}
                    </td>
                    <td className="td whitespace-nowrap text-xs">
                      <span
                        className={cx(
                          'font-mono',
                          finding.verified_evidence_count > 0 ? 'text-good' : 'text-medium',
                        )}
                      >
                        {finding.verified_evidence_count}
                      </span>
                      <span className="font-mono text-subtle">/{finding.evidence_ids.length}</span>
                      <span className="ml-1 text-2xs text-subtle">verified</span>
                    </td>
                    <td className="td whitespace-nowrap text-xs text-muted">
                      <span className="block">{formatDate(finding.due_date)}</span>
                      <OverdueFlag show={finding.is_overdue} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New finding"
        description="The risk score is calculated from likelihood and impact; it cannot be entered directly."
        size="lg"
      >
        <FindingForm
          evidenceOptions={evidenceQuery.data ?? []}
          controlOptions={controlsQuery.data ?? []}
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>
    </>
  )
}
