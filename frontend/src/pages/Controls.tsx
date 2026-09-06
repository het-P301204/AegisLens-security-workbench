import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BookCheck, Info } from 'lucide-react'
import { useWorkspace } from '../context/WorkspaceContext'
import { useAsync } from '../lib/useAsync'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import { PageHeader } from '../components/PageHeader'
import { ControlStatusBadge, CoverageBar } from '../components/Badges'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States'
import { coverageColor, cx } from '../lib/ui'
import type { ControlStatus } from '../types'

export function Controls() {
  const { vocabulary, refresh, revision } = useWorkspace()
  const toast = useToast()

  const { data, loading, error, reload } = useAsync(() => api.controls(), [revision])
  const categoriesQuery = useAsync(() => api.controlCategories(), [revision])
  const [busyId, setBusyId] = useState<string | null>(null)

  async function handleStatusChange(id: string, status: ControlStatus) {
    setBusyId(id)
    try {
      await api.updateControl(id, { status })
      toast.success(`${id} set to ${status}.`)
      reload()
      categoriesQuery.reload()
      refresh()
    } catch {
      toast.error(`${id} could not be updated.`)
    } finally {
      setBusyId(null)
    }
  }

  const grouped = (data ?? []).reduce<Record<string, typeof data>>((accumulator, control) => {
    ;(accumulator[control.category] ??= []).push(control)
    return accumulator
  }, {})

  return (
    <>
      <PageHeader
        title="Controls"
        description="Coverage across the illustrative sample framework, linked to the findings and evidence that support each control."
      />

      <div className="panel mb-4 flex items-start gap-2.5 px-4 py-3">
        <Info size={15} className="mt-0.5 shrink-0 text-accent-soft" aria-hidden />
        <p className="text-xs leading-relaxed text-muted">
          This is an <span className="text-ink">illustrative control set</span> written for this
          project, not ISO 27001, SOC 2, NIST CSF, or any other published standard. Coverage is{' '}
          <span className="text-ink">60% from the recorded status and 40% from verified evidence</span>{' '}
          (capped at two verified items), so a control claimed as implemented with no evidence cannot
          reach 100%.
        </p>
      </div>

      {categoriesQuery.data && categoriesQuery.data.length > 0 && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {categoriesQuery.data.map((row) => (
            <div key={row.category} className="panel p-4">
              <p className="truncate text-xs font-medium text-ink" title={row.category}>
                {row.category}
              </p>
              <p className="mt-1 flex items-baseline gap-1">
                <span className="text-xl font-semibold leading-none text-ink">
                  {row.coverage_percent}
                </span>
                <span className="text-xs text-subtle">% coverage</span>
              </p>
              <CoverageBar
                percent={row.coverage_percent}
                colorClass={coverageColor(row.coverage_percent)}
                className="mt-2.5"
              />
              <p className="mt-2 text-2xs text-subtle">
                {row.control_count} control{row.control_count === 1 ? '' : 's'} ·{' '}
                {row.open_findings} open finding{row.open_findings === 1 ? '' : 's'}
              </p>
            </div>
          ))}
        </div>
      )}

      {loading && !data && (
        <div className="panel">
          <SkeletonRows rows={8} />
        </div>
      )}
      {error && (
        <div className="panel">
          <ErrorState message={error} onRetry={reload} />
        </div>
      )}
      {data && data.length === 0 && !error && (
        <div className="panel">
          <EmptyState
            icon={<BookCheck size={18} aria-hidden />}
            title="No controls defined"
            description="Seed the sample dataset to load the illustrative control framework."
          />
        </div>
      )}

      <div className="space-y-4">
        {Object.entries(grouped).map(([category, controls]) => (
          <section key={category} className="panel">
            <div className="panel-head">
              <h3 className="panel-title">{category}</h3>
              <p className="text-2xs text-subtle">
                {controls?.length} control{controls?.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="table-scroll">
              <table className="w-full min-w-[54rem]">
                <thead className="border-b border-line">
                  <tr>
                    <th className="th">Control</th>
                    <th className="th">Status</th>
                    <th className="th">Findings</th>
                    <th className="th">Evidence</th>
                    <th className="th w-40">Coverage</th>
                    <th className="th">Set status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {controls?.map((control) => (
                    <tr key={control.id} className="hover:bg-hover">
                      <td className="td max-w-[24rem]">
                        <span className="font-mono text-2xs text-subtle">{control.id}</span>
                        <span className="mt-0.5 block text-sm text-ink">{control.name}</span>
                        <span className="mt-1 block text-2xs leading-snug text-subtle">
                          {control.description}
                        </span>
                        {control.notes && (
                          <span className="mt-1.5 block border-l border-line pl-2 text-2xs italic leading-snug text-muted">
                            {control.notes}
                          </span>
                        )}
                      </td>
                      <td className="td">
                        <ControlStatusBadge status={control.status} />
                      </td>
                      <td className="td">
                        {control.linked_finding_ids.length === 0 ? (
                          <span className="text-2xs text-subtle">None</span>
                        ) : (
                          <span className="flex flex-wrap gap-1">
                            {control.linked_finding_ids.map((id) => (
                              <Link
                                key={id}
                                to={`/findings/${id}`}
                                className="chip hover:text-accent-soft"
                              >
                                {id}
                              </Link>
                            ))}
                          </span>
                        )}
                        {control.open_finding_count > 0 && (
                          <span className="mt-1 block text-2xs text-high">
                            {control.open_finding_count} open
                          </span>
                        )}
                      </td>
                      <td className="td whitespace-nowrap text-xs">
                        <span
                          className={cx(
                            'font-mono',
                            control.verified_evidence_count > 0 ? 'text-good' : 'text-medium',
                          )}
                        >
                          {control.verified_evidence_count}
                        </span>
                        <span className="font-mono text-subtle">/{control.evidence_count}</span>
                        <span className="ml-1 text-2xs text-subtle">verified</span>
                      </td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <CoverageBar
                            percent={control.coverage_percent}
                            colorClass={coverageColor(control.coverage_percent)}
                          />
                          <span className="w-9 shrink-0 text-right font-mono text-xs text-muted">
                            {control.coverage_percent}%
                          </span>
                        </div>
                      </td>
                      <td className="td">
                        <label className="sr-only" htmlFor={`status-${control.id}`}>
                          Status for {control.id}
                        </label>
                        <select
                          id={`status-${control.id}`}
                          className="field py-1.5 text-xs"
                          value={control.status}
                          disabled={busyId === control.id}
                          onChange={(event) =>
                            handleStatusChange(control.id, event.target.value as ControlStatus)
                          }
                        >
                          {(vocabulary?.control_statuses ?? []).map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </div>
    </>
  )
}
