import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Copy, Download, FileText, Printer } from 'lucide-react'
import { useWorkspace } from '../context/WorkspaceContext'
import { useAsync } from '../lib/useAsync'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import { PageHeader } from '../components/PageHeader'
import { CoverageBar, SeverityBadge, StatusBadge } from '../components/Badges'
import { EmptyState, ErrorState, Loading } from '../components/States'
import { coverageColor, cx, formatDate, formatDateTime } from '../lib/ui'
import type { Severity } from '../types'

type Tab = 'preview' | 'markdown'

function ReportSection({
  number,
  title,
  subtitle,
  children,
}: {
  number: number
  title: string
  subtitle?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-t border-line px-5 py-5 first:border-t-0">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-ink">
          <span className="mr-2 font-mono text-xs text-subtle">{number}.</span>
          {title}
        </h3>
        {subtitle && <p className="mt-0.5 text-2xs text-subtle">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function Bullets({ items, ordered = false }: { items: string[]; ordered?: boolean }) {
  const List = ordered ? 'ol' : 'ul'
  return (
    <List
      className={cx(
        'ml-4 space-y-1.5 text-sm leading-relaxed text-muted',
        ordered ? 'list-decimal' : 'list-disc',
      )}
    >
      {items.map((item, index) => (
        <li key={index}>{item}</li>
      ))}
    </List>
  )
}

export function Reports() {
  const { assessmentId, assessment, revision } = useWorkspace()
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('preview')
  const [copied, setCopied] = useState(false)

  const { data, loading, error, reload } = useAsync(
    () => api.reportSummary(assessmentId),
    [assessmentId, revision],
  )
  const markdownQuery = useAsync(() => api.reportMarkdown(assessmentId), [assessmentId, revision])

  async function copyMarkdown() {
    if (!markdownQuery.data) return
    try {
      await navigator.clipboard.writeText(markdownQuery.data)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
      toast.success('Markdown report copied to the clipboard.')
    } catch {
      toast.error('The clipboard is not available in this browser context.')
    }
  }

  if (loading && !data) return <Loading label="Generating report" />
  if (error || !data) {
    return (
      <>
        <PageHeader title="Reports" />
        <div className="panel">
          <ErrorState message={error ?? 'The report could not be generated.'} onRetry={reload} />
        </div>
      </>
    )
  }

  const report = data

  return (
    <>
      <PageHeader
        title="Reports"
        description="A security assessment report built from the current findings, evidence, and control coverage."
        actions={
          <>
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={copyMarkdown}
              disabled={!markdownQuery.data}
            >
              {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
              {copied ? 'Copied' : 'Copy Markdown'}
            </button>
            <a
              className="btn-ghost btn-sm"
              href={api.reportMarkdownDownloadUrl(assessmentId)}
              download
            >
              <Download size={14} aria-hidden />
              Download .md
            </a>
            <a
              className="btn-primary btn-sm"
              href={api.reportPrintUrl(assessmentId)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Printer size={14} aria-hidden />
              Print / PDF
            </a>
          </>
        }
      />

      <div className="mb-4 flex gap-1 border-b border-line">
        {(
          [
            ['preview', 'Report preview'],
            ['markdown', 'Markdown source'],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cx(
              '-mb-px border-b-2 px-3 py-2 text-xs font-medium transition-colors',
              tab === value
                ? 'border-accent text-accent-soft'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'markdown' ? (
        <div className="panel">
          <div className="panel-head">
            <h3 className="panel-title">Markdown source</h3>
            <p className="text-2xs text-subtle">Exactly what the download and print view contain</p>
          </div>
          {markdownQuery.loading && !markdownQuery.data && <Loading label="Rendering Markdown" />}
          {markdownQuery.error && <ErrorState message={markdownQuery.error} onRetry={markdownQuery.reload} />}
          {markdownQuery.data && (
            <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap break-words px-5 py-4 font-mono text-xs leading-relaxed text-muted">
              {markdownQuery.data}
            </pre>
          )}
        </div>
      ) : (
        <article className="panel">
          <header className="border-b border-line px-5 py-5">
            <div className="flex items-center gap-2 text-2xs uppercase tracking-wider text-subtle">
              <FileText size={13} aria-hidden />
              AegisLens assessment report
            </div>
            <h2 className="mt-2 text-lg font-semibold tracking-tight text-ink">{report.title}</h2>
            <p className="mt-1 text-xs text-muted">
              Generated {formatDateTime(report.generated_at)} · Period{' '}
              {report.assessment.period || 'not recorded'} · Owner{' '}
              {report.assessment.owner || 'not recorded'}
            </p>
            <p className="mt-3 rounded border-l-2 border-accent/60 bg-base px-3 py-2 text-xs leading-relaxed text-muted">
              Generated from synthetic sample data for educational use. This is not a professional
              security audit.
            </p>
          </header>

          <ReportSection number={1} title="Assessment overview">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Findings recorded', value: String(report.findings.length) },
                {
                  label: 'Critical / High',
                  value: `${report.risk_summary.Critical ?? 0} / ${report.risk_summary.High ?? 0}`,
                },
                {
                  label: 'Aggregate risk',
                  value: `${report.overall_risk_score}/100`,
                  hint: report.overall_risk_level,
                  percent: report.overall_risk_score,
                },
                {
                  label: 'Evidence completion',
                  value: `${report.evidence_completion_percent}%`,
                  percent: report.evidence_completion_percent,
                },
              ].map((metric) => (
                <div key={metric.label} className="rounded-md border border-line bg-base p-3">
                  <p className="text-2xs uppercase tracking-wider text-subtle">{metric.label}</p>
                  <p className="mt-1 text-lg font-semibold leading-none text-ink">{metric.value}</p>
                  {metric.hint && <p className="mt-1 text-2xs text-muted">{metric.hint}</p>}
                  {metric.percent !== undefined && (
                    <CoverageBar
                      percent={metric.percent}
                      colorClass={coverageColor(metric.percent)}
                      className="mt-2"
                    />
                  )}
                </div>
              ))}
            </div>
          </ReportSection>

          <ReportSection number={2} title="Scope and assumptions">
            <div className="space-y-3">
              <div>
                <p className="label">Scope</p>
                <p className="text-sm leading-relaxed text-muted">
                  {report.assessment.scope || 'No scope has been recorded for this assessment.'}
                </p>
              </div>
              <div>
                <p className="label">Assumptions</p>
                <p className="text-sm leading-relaxed text-muted">
                  {report.assessment.assumptions ||
                    'No assumptions have been recorded for this assessment.'}
                </p>
              </div>
              <p className="text-2xs text-subtle">
                Scope and assumptions are edited on the{' '}
                <Link to="/settings" className="link">
                  Settings
                </Link>{' '}
                page.
              </p>
            </div>
          </ReportSection>

          <ReportSection number={3} title="Executive summary">
            <Bullets items={report.executive_summary} />
          </ReportSection>

          <ReportSection
            number={4}
            title="Risk summary"
            subtitle="Risk score is likelihood × impact, each rated 1–5, giving a range of 1–25."
          >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(Object.keys(report.risk_summary) as Severity[]).map((severity) => (
                <div key={severity} className="rounded-md border border-line bg-base p-3">
                  <SeverityBadge severity={severity} />
                  <p className="mt-2 font-mono text-lg leading-none text-ink">
                    {report.risk_summary[severity]}
                  </p>
                </div>
              ))}
            </div>
          </ReportSection>

          <ReportSection number={5} title="Findings">
            {report.findings.length === 0 ? (
              <EmptyState
                title="No findings recorded"
                description="This assessment has no findings, so the report contains no risk assessment."
                className="py-8"
              />
            ) : (
              <div className="table-scroll">
                <table className="w-full min-w-[44rem]">
                  <thead className="border-b border-line">
                    <tr>
                      <th className="th">ID</th>
                      <th className="th">Title</th>
                      <th className="th">Severity</th>
                      <th className="th">L × I</th>
                      <th className="th">Score</th>
                      <th className="th">Status</th>
                      <th className="th">Due</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {report.findings.map((row) => (
                      <tr key={row.id}>
                        <td className="td font-mono text-xs text-subtle">{row.id}</td>
                        <td className="td max-w-[20rem] text-sm text-ink">
                          <Link to={`/findings/${row.id}`} className="hover:text-accent-soft">
                            {row.title}
                          </Link>
                          <span className="mt-0.5 block text-2xs text-subtle">{row.category}</span>
                        </td>
                        <td className="td">
                          <SeverityBadge severity={row.severity} />
                        </td>
                        <td className="td whitespace-nowrap font-mono text-xs text-muted">
                          {row.likelihood} × {row.impact}
                        </td>
                        <td className="td font-mono text-sm text-ink">{row.risk_score}</td>
                        <td className="td">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="td whitespace-nowrap text-xs text-muted">
                          {formatDate(row.due_date)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReportSection>

          <ReportSection number={6} title="Critical and high-risk findings">
            {report.priority_findings.length === 0 ? (
              <p className="text-sm text-muted">No Critical or High severity findings were recorded.</p>
            ) : (
              <div className="space-y-3">
                {report.priority_findings.map((row) => (
                  <div key={row.id} className="rounded-md border border-line bg-base p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-mono text-2xs text-subtle">{row.id}</p>
                        <p className="mt-0.5 text-sm font-medium text-ink">{row.title}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <SeverityBadge severity={row.severity} />
                        <StatusBadge status={row.status} />
                      </div>
                    </div>
                    <dl className="mt-3 grid gap-x-6 gap-y-1.5 text-xs sm:grid-cols-2">
                      {[
                        ['Risk', `${row.likelihood} × ${row.impact} = ${row.risk_score}/25`],
                        ['Affected asset', row.affected_asset || 'not recorded'],
                        ['Owner', row.owner || 'unassigned'],
                        ['Due date', formatDate(row.due_date)],
                        [
                          'Supporting evidence',
                          `${row.evidence_count} item(s), ${row.verified_evidence_count} verified`,
                        ],
                      ].map(([label, value]) => (
                        <div key={label} className="flex gap-2">
                          <dt className="shrink-0 text-subtle">{label}:</dt>
                          <dd className="min-w-0 text-muted">{value}</dd>
                        </div>
                      ))}
                    </dl>
                    <div className="mt-3 border-t border-line pt-2.5">
                      <p className="text-2xs uppercase tracking-wider text-subtle">
                        Recommended action (analyst recommendation)
                      </p>
                      <p className="mt-1 text-sm leading-relaxed text-muted">
                        {row.recommended_action || 'No remediation action has been recorded.'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ReportSection>

          <ReportSection
            number={7}
            title="Confirmed evidence"
            subtitle="What verified evidence actually shows."
          >
            <Bullets items={report.confirmed_evidence} />
          </ReportSection>

          <ReportSection
            number={8}
            title="Analyst assessment"
            subtitle="Judgement calls made during review, stated as such."
          >
            <Bullets items={report.analyst_assessment} />
          </ReportSection>

          <ReportSection
            number={9}
            title="Control coverage"
            subtitle="Illustrative sample framework, not a real compliance standard."
          >
            <div className="table-scroll">
              <table className="w-full min-w-[40rem]">
                <thead className="border-b border-line">
                  <tr>
                    <th className="th">Control</th>
                    <th className="th">Category</th>
                    <th className="th">Status</th>
                    <th className="th">Findings</th>
                    <th className="th">Evidence</th>
                    <th className="th w-32">Coverage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {report.controls.map((row) => (
                    <tr key={row.id}>
                      <td className="td">
                        <span className="font-mono text-2xs text-subtle">{row.id}</span>
                        <span className="mt-0.5 block text-sm text-ink">{row.name}</span>
                      </td>
                      <td className="td whitespace-nowrap text-xs text-muted">{row.category}</td>
                      <td className="td whitespace-nowrap text-xs text-muted">{row.status}</td>
                      <td className="td font-mono text-xs text-muted">{row.linked_finding_count}</td>
                      <td className="td font-mono text-xs text-muted">{row.evidence_count}</td>
                      <td className="td">
                        <div className="flex items-center gap-2">
                          <CoverageBar
                            percent={row.coverage_percent}
                            colorClass={coverageColor(row.coverage_percent)}
                          />
                          <span className="w-9 shrink-0 text-right font-mono text-xs text-muted">
                            {row.coverage_percent}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ReportSection>

          <ReportSection
            number={10}
            title="Missing information"
            subtitle="What could not be established from the evidence supplied."
          >
            <Bullets items={report.missing_information} />
          </ReportSection>

          <ReportSection number={11} title="Recommended next steps">
            <Bullets items={report.recommended_next_steps} ordered />
          </ReportSection>

          <ReportSection number={12} title="Limitations">
            <Bullets items={report.limitations} />
          </ReportSection>

          <footer className="border-t border-line px-5 py-4">
            <p className="text-2xs text-subtle">
              Generated by AegisLens for {assessment?.name ?? report.assessment.name} on{' '}
              {formatDateTime(report.generated_at)}.
            </p>
          </footer>
        </article>
      )}
    </>
  )
}
