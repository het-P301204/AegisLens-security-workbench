import { Link } from 'react-router-dom'
import {
  Activity,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  FolderSearch,
  Gauge,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react'
import { useWorkspace } from '../context/WorkspaceContext'
import { useAsync } from '../lib/useAsync'
import { api } from '../services/api'
import { PageHeader } from '../components/PageHeader'
import { MetricCard } from '../components/MetricCard'
import { RiskDistributionChart } from '../components/RiskDistributionChart'
import { CoverageBar, OverdueFlag, RiskScore, SeverityBadge, StatusBadge } from '../components/Badges'
import { EmptyState, ErrorState, SkeletonRows } from '../components/States'
import { coverageColor, formatDate, relativeTime } from '../lib/ui'

export function Overview() {
  const { assessmentId, assessment, revision } = useWorkspace()
  const { data, loading, error, reload } = useAsync(
    () => api.dashboard(assessmentId),
    [assessmentId, revision],
  )

  if (loading && !data) {
    return (
      <>
        <PageHeader title="Overview" description="Loading assessment statistics…" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="panel h-[6.5rem] animate-pulse" aria-hidden />
          ))}
        </div>
      </>
    )
  }

  if (error || !data) {
    return (
      <>
        <PageHeader title="Overview" />
        <div className="panel">
          <ErrorState message={error ?? 'No dashboard data was returned.'} onRetry={reload} />
        </div>
      </>
    )
  }

  const noFindings = data.total_findings === 0

  return (
    <>
      <PageHeader
        title="Overview"
        description={
          assessment
            ? `${assessment.name} · ${assessment.period || 'period not recorded'} · owned by ${
                assessment.owner || 'unassigned'
              }`
            : undefined
        }
        actions={
          <Link to="/reports" className="btn-ghost btn-sm">
            <ClipboardList size={14} aria-hidden />
            Generate report
          </Link>
        }
      />

      {noFindings ? (
        <div className="panel">
          <EmptyState
            icon={<ShieldCheck size={18} aria-hidden />}
            title="No findings in this assessment"
            description="Nothing has been recorded against this assessment yet. Add a finding, or switch to another assessment using the selector in the header."
            action={
              <Link to="/findings" className="btn-primary btn-sm">
                Go to findings
              </Link>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total findings"
              value={data.total_findings}
              icon={ShieldAlert}
              hint={`${data.open_findings} open or in review · ${data.resolved_findings} resolved`}
            />
            <MetricCard
              label="Critical"
              value={data.critical_findings}
              icon={FileWarning}
              tone={data.critical_findings > 0 ? 'critical' : 'neutral'}
              hint="Risk score 20–25"
            />
            <MetricCard
              label="High risk"
              value={data.high_findings}
              icon={FileWarning}
              tone={data.high_findings > 0 ? 'high' : 'neutral'}
              hint="Risk score 12–19"
            />
            <MetricCard
              label="Overdue"
              value={data.overdue_findings}
              icon={Activity}
              tone={data.overdue_findings > 0 ? 'critical' : 'good'}
              hint="Past due date and not resolved"
            />
            <MetricCard
              label="Overall risk"
              value={data.overall_risk_score}
              suffix="/ 100"
              icon={Gauge}
              tone={data.overall_risk_score >= 60 ? 'critical' : data.overall_risk_score >= 35 ? 'high' : 'good'}
              hint={`Mean score of live findings · ${data.overall_risk_level}`}
              meter={{
                percent: data.overall_risk_score,
                colorClass:
                  data.overall_risk_score >= 60
                    ? 'bg-critical'
                    : data.overall_risk_score >= 35
                      ? 'bg-high'
                      : 'bg-good',
              }}
            />
            <MetricCard
              label="Evidence items"
              value={data.evidence_items}
              icon={FolderSearch}
              hint={`${data.verified_evidence_items} verified across the library`}
            />
            <MetricCard
              label="Evidence completion"
              value={data.evidence_completion_percent}
              suffix="%"
              icon={CheckCircle2}
              tone="accent"
              hint="Findings with at least one verified item"
              meter={{
                percent: data.evidence_completion_percent,
                colorClass: coverageColor(data.evidence_completion_percent),
              }}
            />
            <MetricCard
              label="Control coverage"
              value={data.control_coverage_percent}
              suffix="%"
              icon={ShieldCheck}
              tone="accent"
              hint={`${data.controls_assessed} of ${data.controls_total} controls assessed`}
              meter={{
                percent: data.control_coverage_percent,
                colorClass: coverageColor(data.control_coverage_percent),
              }}
            />
          </div>

          <div className="mt-4 grid items-start gap-4 xl:grid-cols-3">
            <section className="panel min-w-0 xl:col-span-2">
              <div className="panel-head">
                <h3 className="panel-title">Risk distribution</h3>
                <p className="text-2xs text-subtle">Findings by recorded severity</p>
              </div>
              <RiskDistributionChart data={data.severity_distribution} />
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 border-t border-line px-4 py-3 sm:grid-cols-5">
                {data.status_distribution.map((row) => (
                  <div key={row.status} className="min-w-0">
                    <p className="truncate text-2xs uppercase tracking-wider text-subtle">
                      {row.status}
                    </p>
                    <p className="font-mono text-sm text-ink">{row.count}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel min-w-0">
              <div className="panel-head">
                <h3 className="panel-title">Evidence coverage</h3>
                <Link to="/evidence" className="text-2xs text-accent-soft hover:underline">
                  Evidence library
                </Link>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-2xs uppercase tracking-wider text-muted">
                    Findings with verified evidence
                  </span>
                  <span className="font-mono text-sm text-ink">
                    {data.evidence_completion_percent}%
                  </span>
                </div>
                <CoverageBar
                  percent={data.evidence_completion_percent}
                  colorClass={coverageColor(data.evidence_completion_percent)}
                  className="mt-2"
                />
              </div>
              {data.evidence_gaps.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 size={18} aria-hidden />}
                  title="No evidence gaps"
                  description="Every finding in this assessment has at least one verified evidence item."
                  className="py-8"
                />
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {data.evidence_gaps.map((gap) => (
                    <li key={gap.finding_id}>
                      <Link
                        to={`/findings/${gap.finding_id}`}
                        className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-hover"
                      >
                        <SeverityBadge severity={gap.severity} className="mt-0.5 shrink-0" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-ink">{gap.title}</span>
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

          <div className="mt-4 grid items-start gap-4 xl:grid-cols-3">
            <section className="panel min-w-0 xl:col-span-2">
              <div className="panel-head">
                <h3 className="panel-title">Highest scoring open findings</h3>
                <Link to="/findings" className="text-2xs text-accent-soft hover:underline">
                  All findings
                </Link>
              </div>
              {data.top_findings.length === 0 ? (
                <EmptyState
                  icon={<CheckCircle2 size={18} aria-hidden />}
                  title="Nothing outstanding"
                  description="No findings are Open or In Review in this assessment."
                  className="py-8"
                />
              ) : (
                <div className="table-scroll">
                  <table className="w-full min-w-[36rem]">
                    <thead className="border-b border-line">
                      <tr>
                        <th className="th">Finding</th>
                        <th className="th">Severity</th>
                        <th className="th">Score</th>
                        <th className="th">Status</th>
                        <th className="th">Due</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {data.top_findings.map((finding) => (
                        <tr key={finding.id} className="hover:bg-hover">
                          <td className="td">
                            <Link to={`/findings/${finding.id}`} className="block">
                              <span className="font-mono text-2xs text-subtle">{finding.id}</span>
                              <span className="mt-0.5 block text-sm text-ink hover:text-accent-soft">
                                {finding.title}
                              </span>
                            </Link>
                          </td>
                          <td className="td">
                            <SeverityBadge severity={finding.severity} />
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
                            <span className="block">{formatDate(finding.due_date)}</span>
                            <OverdueFlag show={finding.is_overdue} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="panel min-w-0">
              <div className="panel-head">
                <h3 className="panel-title">Recent activity</h3>
              </div>
              {data.recent_activity.length === 0 ? (
                <SkeletonRows rows={3} />
              ) : (
                <ul className="divide-y divide-line">
                  {data.recent_activity.map((entry) => (
                    <li key={entry.id} className="px-4 py-2.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-xs font-medium text-ink">{entry.action}</span>
                        <span className="shrink-0 text-2xs text-subtle">
                          {relativeTime(entry.timestamp)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-2xs leading-snug text-muted">{entry.detail}</p>
                      <p className="mt-1 font-mono text-2xs text-subtle">
                        {entry.entity_id} · {entry.actor}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </>
  )
}
