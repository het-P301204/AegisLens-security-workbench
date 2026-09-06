import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  BookCheck,
  CalendarClock,
  FileSearch,
  History,
  Pencil,
  ShieldAlert,
  Trash2,
  User,
} from 'lucide-react'
import { useAsync } from '../lib/useAsync'
import { api } from '../services/api'
import { useWorkspace } from '../context/WorkspaceContext'
import { useToast } from '../components/Toast'
import { ConfirmDialog, Modal } from '../components/Modal'
import { FindingForm } from '../components/FindingForm'
import {
  ControlStatusBadge,
  OverdueFlag,
  SeverityBadge,
  StatusBadge,
  VerificationBadge,
} from '../components/Badges'
import { EmptyState, ErrorState, Loading } from '../components/States'
import { cx, formatDate, formatDateTime, riskScoreColor } from '../lib/ui'
import type { FindingDetail as FindingDetailType, FindingInput, FindingStatus } from '../types'

function Section({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string
  icon?: typeof ShieldAlert
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h3 className="panel-title flex items-center gap-2">
          {Icon && <Icon size={14} className="text-subtle" aria-hidden />}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  )
}

function Prose({ text, fallback }: { text: string; fallback: string }) {
  if (!text.trim()) return <p className="px-4 py-3 text-sm italic text-subtle">{fallback}</p>
  return <p className="whitespace-pre-line px-4 py-3 text-sm leading-relaxed text-muted">{text}</p>
}

/** Finding → Evidence → Control, drawn with plain cards and connector rules. */
function RelationshipMap({ finding }: { finding: FindingDetailType }) {
  const verified = finding.evidence.filter((item) => item.verification_status === 'Verified').length

  const Column = ({
    heading,
    count,
    children,
  }: {
    heading: string
    count: number
    children: React.ReactNode
  }) => (
    <div className="min-w-0 flex-1">
      <p className="mb-2 flex items-baseline justify-between text-2xs uppercase tracking-wider text-subtle">
        {heading}
        <span className="font-mono">{count}</span>
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  )

  const Connector = () => (
    <div className="flex shrink-0 items-center justify-center px-1 py-2 lg:w-8 lg:py-0" aria-hidden>
      <div className="h-6 w-px bg-line-strong lg:h-px lg:w-full" />
    </div>
  )

  return (
    <div className="flex flex-col gap-1 px-4 py-4 lg:flex-row lg:items-stretch">
      <Column heading="Finding" count={1}>
        <div className="rounded-md border border-accent/40 bg-accent/5 p-2.5">
          <p className="font-mono text-2xs text-subtle">{finding.id}</p>
          <p className="mt-0.5 line-clamp-3 text-xs text-ink">{finding.title}</p>
          <div className="mt-1.5">
            <SeverityBadge severity={finding.severity} />
          </div>
        </div>
      </Column>

      <Connector />

      <Column heading="Evidence" count={finding.evidence.length}>
        {finding.evidence.length === 0 ? (
          <p className="rounded-md border border-dashed border-line p-2.5 text-2xs text-subtle">
            No evidence linked. Conclusions here are unsupported.
          </p>
        ) : (
          finding.evidence.map((item) => (
            <div key={item.id} className="rounded-md border border-line bg-base p-2.5">
              <p className="font-mono text-2xs text-subtle">{item.id}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-ink">{item.name}</p>
              <p className="mt-1 text-2xs text-subtle">{item.evidence_type}</p>
            </div>
          ))
        )}
        {finding.evidence.length > 0 && (
          <p className="pt-0.5 text-2xs text-subtle">
            {verified} of {finding.evidence.length} verified
          </p>
        )}
      </Column>

      <Connector />

      <Column heading="Controls" count={finding.controls.length}>
        {finding.controls.length === 0 ? (
          <p className="rounded-md border border-dashed border-line p-2.5 text-2xs text-subtle">
            Not mapped to a control.
          </p>
        ) : (
          finding.controls.map((control) => (
            <Link
              key={control.id}
              to="/controls"
              className="block rounded-md border border-line bg-base p-2.5 hover:border-line-strong hover:bg-hover"
            >
              <p className="font-mono text-2xs text-subtle">{control.id}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-ink">{control.name}</p>
              <div className="mt-1.5">
                <ControlStatusBadge status={control.status} />
              </div>
            </Link>
          ))
        )}
      </Column>
    </div>
  )
}

export function FindingDetail() {
  const { findingId = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { refresh, revision, vocabulary } = useWorkspace()

  const { data, loading, error, reload } = useAsync(
    () => api.finding(findingId),
    [findingId, revision],
  )
  const evidenceQuery = useAsync(() => api.evidence(), [revision])
  const controlsQuery = useAsync(() => api.controls(), [revision])

  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)

  if (loading && !data) return <Loading label="Loading finding" />
  if (error || !data) {
    return (
      <div className="panel">
        <ErrorState message={error ?? 'That finding could not be loaded.'} onRetry={reload} />
        <div className="flex justify-center pb-6">
          <Link to="/findings" className="btn-ghost btn-sm">
            <ArrowLeft size={14} aria-hidden />
            Back to findings
          </Link>
        </div>
      </div>
    )
  }

  const finding = data

  async function handleStatusChange(status: FindingStatus) {
    setStatusBusy(true)
    try {
      await api.setFindingStatus(finding.id, status)
      toast.success(`${finding.id} moved to ${status}.`)
      reload()
      refresh()
    } catch {
      toast.error('The status could not be changed.')
    } finally {
      setStatusBusy(false)
    }
  }

  async function handleEdit(values: FindingInput) {
    const updated = await api.updateFinding(finding.id, values)
    setEditOpen(false)
    toast.success(`${updated.id} saved. Risk score is now ${updated.risk_score}/25.`)
    reload()
    refresh()
  }

  async function handleDelete() {
    setDeleting(true)
    try {
      await api.deleteFinding(finding.id)
      toast.success(`${finding.id} was deleted.`)
      refresh()
      navigate('/findings')
    } catch {
      toast.error('The finding could not be deleted.')
      setDeleting(false)
      setConfirmOpen(false)
    }
  }

  return (
    <>
      <Link
        to="/findings"
        className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink"
      >
        <ArrowLeft size={13} aria-hidden />
        All findings
      </Link>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs text-subtle">{finding.id}</p>
          <h2 className="mt-1 max-w-3xl text-lg font-semibold leading-snug tracking-tight text-ink">
            {finding.title}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <SeverityBadge severity={finding.severity} />
            <StatusBadge status={finding.status} />
            <OverdueFlag show={finding.is_overdue} />
            <span className="chip">{finding.category}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost btn-sm" onClick={() => setEditOpen(true)}>
            <Pencil size={13} aria-hidden />
            Edit
          </button>
          <button type="button" className="btn-danger btn-sm" onClick={() => setConfirmOpen(true)}>
            <Trash2 size={13} aria-hidden />
            Delete
          </button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <Section title="Description" icon={FileSearch}>
            <Prose text={finding.description} fallback="No description has been recorded." />
          </Section>

          <Section title="Security impact" icon={ShieldAlert}>
            <Prose
              text={finding.security_impact}
              fallback="No impact statement has been recorded."
            />
          </Section>

          <Section title="Recommended remediation" icon={BookCheck}>
            <p className="border-b border-line bg-base px-4 py-2 text-2xs text-subtle">
              Analyst recommendation, not a statement of fact.
            </p>
            <Prose
              text={finding.recommended_action}
              fallback="No remediation action has been recorded."
            />
          </Section>

          <Section title="Finding → Evidence → Control">
            <RelationshipMap finding={finding} />
          </Section>

          <Section
            title="Supporting evidence"
            icon={FileSearch}
            action={
              <Link to="/evidence" className="text-2xs text-accent-soft hover:underline">
                Evidence library
              </Link>
            }
          >
            {finding.evidence.length === 0 ? (
              <EmptyState
                title="No evidence linked"
                description="Link evidence from the library, or edit this finding to attach items."
                className="py-8"
                action={
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setEditOpen(true)}>
                    Link evidence
                  </button>
                }
              />
            ) : (
              <ul className="divide-y divide-line">
                {finding.evidence.map((item) => (
                  <li key={item.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-2xs text-subtle">{item.id}</p>
                        <p className="mt-0.5 text-sm text-ink">{item.name}</p>
                        <p className="mt-1 text-2xs text-subtle">
                          {item.evidence_type}
                          {item.source ? ` · ${item.source}` : ''}
                        </p>
                      </div>
                      <VerificationBadge status={item.verification_status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Activity history" icon={History}>
            {finding.activity.length === 0 ? (
              <EmptyState title="No recorded activity" className="py-8" />
            ) : (
              <ol className="divide-y divide-line">
                {finding.activity.map((entry) => (
                  <li key={entry.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="text-xs font-medium text-ink">{entry.action}</span>
                      <span className="text-2xs text-subtle">{formatDateTime(entry.timestamp)}</span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-muted">{entry.detail}</p>
                    <p className="mt-1 font-mono text-2xs text-subtle">{entry.actor}</p>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        <div className="min-w-0 space-y-4">
          <Section title="Risk rating">
            <div className="px-4 py-4">
              <div className="flex items-baseline gap-2">
                <span
                  className={cx(
                    'font-mono text-3xl font-semibold leading-none',
                    riskScoreColor(finding.risk_score),
                  )}
                >
                  {finding.risk_score}
                </span>
                <span className="text-sm text-subtle">/ 25</span>
                <span className="ml-auto">
                  <SeverityBadge severity={finding.risk_level} />
                </span>
              </div>
              <p className="mt-3 rounded border border-line bg-base px-3 py-2 font-mono text-xs text-muted">
                likelihood {finding.likelihood} × impact {finding.impact} = {finding.risk_score}
              </p>
              {!finding.severity_matches_score && (
                <p className="mt-2 rounded border border-medium/40 bg-medium/10 px-3 py-2 text-2xs leading-relaxed text-medium">
                  Recorded severity is {finding.severity}, but the score implies{' '}
                  {finding.derived_severity}. The difference is deliberate or needs reconciling before
                  sign-off; it is flagged in the report either way.
                </p>
              )}
            </div>
          </Section>

          <Section title="Details">
            <dl className="divide-y divide-line text-sm">
              {[
                { label: 'Owner', value: finding.owner || '—', icon: User },
                { label: 'Affected asset', value: finding.affected_asset || '—' },
                { label: 'Category', value: finding.category },
                { label: 'Due date', value: formatDate(finding.due_date), icon: CalendarClock },
                { label: 'Created', value: formatDate(finding.created_at) },
                { label: 'Last updated', value: formatDateTime(finding.updated_at) },
              ].map((row) => (
                <div key={row.label} className="flex items-start justify-between gap-3 px-4 py-2.5">
                  <dt className="flex shrink-0 items-center gap-1.5 text-2xs uppercase tracking-wider text-muted">
                    {row.icon && <row.icon size={12} aria-hidden />}
                    {row.label}
                  </dt>
                  <dd className="min-w-0 text-right text-xs text-ink">{row.value}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title="Change status">
            <div className="flex flex-wrap gap-1.5 px-4 py-3">
              {(vocabulary?.statuses ?? []).map((status) => (
                <button
                  key={status}
                  type="button"
                  disabled={statusBusy || status === finding.status}
                  onClick={() => handleStatusChange(status)}
                  className={cx(
                    'rounded border px-2 py-1 text-2xs transition-colors disabled:cursor-not-allowed',
                    status === finding.status
                      ? 'border-accent/50 bg-accent/15 text-accent-soft'
                      : 'border-line bg-base text-muted hover:border-line-strong hover:text-ink disabled:opacity-40',
                  )}
                >
                  {status}
                </button>
              ))}
            </div>
          </Section>

          <Section title="Related controls" icon={BookCheck}>
            {finding.controls.length === 0 ? (
              <EmptyState title="Not mapped to a control" className="py-7" />
            ) : (
              <ul className="divide-y divide-line">
                {finding.controls.map((control) => (
                  <li key={control.id} className="px-4 py-2.5">
                    <p className="font-mono text-2xs text-subtle">{control.id}</p>
                    <p className="mt-0.5 text-xs text-ink">{control.name}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <ControlStatusBadge status={control.status} />
                      <span className="text-2xs text-subtle">{control.category}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title={`Edit ${finding.id}`}
        description="Changing likelihood or impact recalculates the risk score immediately."
        size="lg"
      >
        <FindingForm
          finding={finding}
          evidenceOptions={evidenceQuery.data ?? []}
          controlOptions={controlsQuery.data ?? []}
          onSubmit={handleEdit}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        title={`Delete ${finding.id}?`}
        message={`"${finding.title}" and its activity history will be removed. Linked evidence items stay in the library. This cannot be undone.`}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
