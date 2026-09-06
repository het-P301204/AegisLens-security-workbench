import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, FolderSearch, Link2Off, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import { useWorkspace } from '../context/WorkspaceContext'
import { useAsync } from '../lib/useAsync'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import { PageHeader } from '../components/PageHeader'
import { ConfirmDialog, Modal } from '../components/Modal'
import { EvidenceForm } from '../components/EvidenceForm'
import { CoverageBar, SeverityBadge, VerificationBadge } from '../components/Badges'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States'
import { coverageColor, cx, formatDate, pluralize } from '../lib/ui'
import type { Evidence, EvidenceInput } from '../types'

export function EvidenceLibrary() {
  const { vocabulary, assessmentId, refresh, revision } = useWorkspace()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [types, setTypes] = useState<string[]>([])
  const [verification, setVerification] = useState<string[]>([])
  const [unlinkedOnly, setUnlinkedOnly] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Evidence | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Evidence | null>(null)
  const [deleting, setDeleting] = useState(false)

  const filters = useMemo(
    () => ({
      search: search.trim(),
      evidence_type: types,
      verification_status: verification,
      unlinked_only: unlinkedOnly,
    }),
    [search, types, verification, unlinkedOnly],
  )

  const { data, loading, error, reload } = useAsync(() => api.evidence(filters), [filters, revision])
  const gapsQuery = useAsync(() => api.evidenceCoverage(assessmentId), [assessmentId, revision])
  const findingsQuery = useAsync(() => api.findings({ assessment_id: assessmentId }), [assessmentId, revision])
  const controlsQuery = useAsync(() => api.controls(), [revision])

  const toggle = (setter: (updater: (current: string[]) => string[]) => void) => (value: string) =>
    setter((current) =>
      current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value],
    )

  const hasQuery = search.trim().length > 0 || types.length > 0 || verification.length > 0 || unlinkedOnly

  function clearFilters() {
    setSearch('')
    setTypes([])
    setVerification([])
    setUnlinkedOnly(false)
  }

  const verifiedCount = data?.filter((item) => item.verification_status === 'Verified').length ?? 0
  const verifiedPercent = data && data.length > 0 ? Math.round((verifiedCount / data.length) * 100) : 0

  async function handleCreate(values: EvidenceInput) {
    const created = await api.createEvidence(values)
    setCreateOpen(false)
    toast.success(`${created.id} added to the evidence library.`)
    refresh()
    reload()
  }

  async function handleUpdate(values: EvidenceInput) {
    if (!editing) return
    const updated = await api.updateEvidence(editing.id, values)
    setEditing(null)
    toast.success(`${updated.id} saved.`)
    refresh()
    reload()
  }

  async function handleVerify(item: Evidence) {
    const next = item.verification_status === 'Verified' ? 'Not Verified' : 'Verified'
    try {
      await api.updateEvidence(item.id, { verification_status: next })
      toast.success(`${item.id} marked ${next}.`)
      refresh()
      reload()
    } catch {
      toast.error('The verification status could not be changed.')
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await api.deleteEvidence(pendingDelete.id)
      toast.success(`${pendingDelete.id} was deleted.`)
      setPendingDelete(null)
      refresh()
      reload()
    } catch {
      toast.error('The evidence item could not be deleted.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <PageHeader
        title="Evidence"
        description="Metadata for every collected artefact, and which findings it supports. Files stay in your existing evidence store."
        actions={
          <button type="button" className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} aria-hidden />
            Add evidence
          </button>
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-3">
        <div className="panel min-w-0 lg:col-span-2">
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
                placeholder="Search name, description, or source"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search evidence"
              />
            </div>
            <button
              type="button"
              onClick={() => setUnlinkedOnly((value) => !value)}
              aria-pressed={unlinkedOnly}
              className={cx(
                'btn-sm btn',
                unlinkedOnly
                  ? 'border-accent/50 bg-accent/15 text-accent-soft'
                  : 'border-line bg-raised text-muted hover:text-ink',
              )}
            >
              <Link2Off size={13} aria-hidden />
              Unlinked only
            </button>
            {hasQuery && (
              <button type="button" className="btn-ghost btn-sm" onClick={clearFilters}>
                <X size={13} aria-hidden />
                Clear
              </button>
            )}
          </div>
          <div className="grid gap-4 border-t border-line px-3 py-3 sm:grid-cols-2">
            <div>
              <p className="label">Type</p>
              <div className="flex flex-wrap gap-1.5">
                {(vocabulary?.evidence_types ?? []).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => toggle(setTypes)(type)}
                    aria-pressed={types.includes(type)}
                    className={cx(
                      'rounded border px-2 py-1 text-2xs transition-colors',
                      types.includes(type)
                        ? 'border-accent/50 bg-accent/15 text-accent-soft'
                        : 'border-line bg-base text-muted hover:border-line-strong hover:text-ink',
                    )}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="label">Verification</p>
              <div className="flex flex-wrap gap-1.5">
                {(vocabulary?.verification_statuses ?? []).map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => toggle(setVerification)(status)}
                    aria-pressed={verification.includes(status)}
                    className={cx(
                      'rounded border px-2 py-1 text-2xs transition-colors',
                      verification.includes(status)
                        ? 'border-accent/50 bg-accent/15 text-accent-soft'
                        : 'border-line bg-base text-muted hover:border-line-strong hover:text-ink',
                    )}
                  >
                    {status}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <section className="panel">
          <div className="panel-head">
            <h3 className="panel-title">Findings without verified evidence</h3>
          </div>
          <div className="px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="text-2xs uppercase tracking-wider text-muted">
                Verified in current view
              </span>
              <span className="font-mono text-sm text-ink">
                {verifiedCount}/{data?.length ?? 0}
              </span>
            </div>
            <CoverageBar
              percent={verifiedPercent}
              colorClass={coverageColor(verifiedPercent)}
              className="mt-2"
            />
          </div>
          {gapsQuery.data && gapsQuery.data.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 size={18} aria-hidden />}
              title="No gaps"
              description="Every finding in this assessment has verified evidence behind it."
              className="py-7"
            />
          ) : (
            <ul className="divide-y divide-line border-t border-line">
              {(gapsQuery.data ?? []).map((gap) => (
                <li key={gap.finding_id}>
                  <Link
                    to={`/findings/${gap.finding_id}`}
                    className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-hover"
                  >
                    <SeverityBadge severity={gap.severity} className="mt-0.5 shrink-0" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs text-ink">{gap.title}</span>
                      <span className="block text-2xs text-subtle">
                        {gap.finding_id} · {gap.reason}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="panel">
        <div className="panel-head">
          <h3 className="panel-title">
            {loading && !data ? 'Loading evidence…' : pluralize(data?.length ?? 0, 'evidence item')}
          </h3>
        </div>

        {loading && !data && <SkeletonRows rows={6} />}
        {error && <ErrorState message={error} onRetry={reload} />}

        {data && data.length === 0 && !error && (
          <EmptyState
            icon={<FolderSearch size={18} aria-hidden />}
            title={hasQuery ? 'No evidence matches these filters' : 'The evidence library is empty'}
            description={
              hasQuery
                ? 'Try a different search term or clear the filters.'
                : 'Record the first artefact so findings can be backed by something concrete.'
            }
            action={
              hasQuery ? (
                <button type="button" className="btn-ghost btn-sm" onClick={clearFilters}>
                  Clear filters
                </button>
              ) : (
                <button type="button" className="btn-primary btn-sm" onClick={() => setCreateOpen(true)}>
                  <Plus size={14} aria-hidden />
                  Add evidence
                </button>
              )
            }
          />
        )}

        {data && data.length > 0 && (
          <div className="table-scroll">
            <table className="w-full min-w-[50rem]">
              <thead className="border-b border-line">
                <tr>
                  <th className="th">Evidence</th>
                  <th className="th">Type</th>
                  <th className="th">Verification</th>
                  <th className="th">Control</th>
                  <th className="th">Findings</th>
                  <th className="th">Collected</th>
                  <th className="th text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((item) => (
                  <tr key={item.id} className="hover:bg-hover">
                    <td className="td max-w-[24rem]">
                      <span className="font-mono text-2xs text-subtle">{item.id}</span>
                      <span className="mt-0.5 block text-sm text-ink">{item.name}</span>
                      {item.source && (
                        <span className="mt-0.5 block text-2xs text-subtle">{item.source}</span>
                      )}
                    </td>
                    <td className="td whitespace-nowrap text-xs text-muted">{item.evidence_type}</td>
                    <td className="td">
                      <VerificationBadge status={item.verification_status} />
                    </td>
                    <td className="td whitespace-nowrap font-mono text-xs text-muted">
                      {item.related_control_id ?? '—'}
                    </td>
                    <td className="td">
                      {item.linked_finding_ids.length === 0 ? (
                        <span className="text-2xs text-subtle">Not linked</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {item.linked_finding_ids.map((id) => (
                            <Link key={id} to={`/findings/${id}`} className="chip hover:text-accent-soft">
                              {id}
                            </Link>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="td whitespace-nowrap text-xs text-muted">
                      {formatDate(item.upload_date)}
                    </td>
                    <td className="td">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleVerify(item)}
                          className="rounded p-1.5 text-subtle hover:bg-raised hover:text-good"
                          title={
                            item.verification_status === 'Verified'
                              ? 'Mark as not verified'
                              : 'Mark as verified'
                          }
                          aria-label={
                            item.verification_status === 'Verified'
                              ? `Mark ${item.id} as not verified`
                              : `Mark ${item.id} as verified`
                          }
                        >
                          <CheckCircle2
                            size={14}
                            className={item.verification_status === 'Verified' ? 'text-good' : ''}
                            aria-hidden
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing(item)}
                          className="rounded p-1.5 text-subtle hover:bg-raised hover:text-ink"
                          aria-label={`Edit ${item.id}`}
                        >
                          <Pencil size={14} aria-hidden />
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(item)}
                          className="rounded p-1.5 text-subtle hover:bg-raised hover:text-critical"
                          aria-label={`Delete ${item.id}`}
                        >
                          <Trash2 size={14} aria-hidden />
                        </button>
                      </div>
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
        title="Add evidence"
        description="Record what the artefact is, where it came from, and what it supports."
        size="lg"
      >
        <EvidenceForm
          findingOptions={findingsQuery.data ?? []}
          controlOptions={controlsQuery.data ?? []}
          onSubmit={handleCreate}
          onCancel={() => setCreateOpen(false)}
        />
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.id}` : 'Edit evidence'}
        size="lg"
      >
        {editing && (
          <EvidenceForm
            evidence={editing}
            findingOptions={findingsQuery.data ?? []}
            controlOptions={controlsQuery.data ?? []}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={pendingDelete ? `Delete ${pendingDelete.id}?` : 'Delete evidence?'}
        message={
          pendingDelete
            ? `"${pendingDelete.name}" will be removed and unlinked from ${pluralize(
                pendingDelete.linked_finding_ids.length,
                'finding',
              )}. This cannot be undone.`
            : ''
        }
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </>
  )
}
