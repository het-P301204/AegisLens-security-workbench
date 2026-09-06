import { useEffect, useState } from 'react'
import { BookOpen, Check, ExternalLink, Server } from 'lucide-react'
import { useWorkspace } from '../context/WorkspaceContext'
import { useAsync } from '../lib/useAsync'
import { api } from '../services/api'
import { useToast } from '../components/Toast'
import { PageHeader } from '../components/PageHeader'
import { SeverityBadge } from '../components/Badges'
import { ErrorState, Loading } from '../components/States'
import { cx } from '../lib/ui'

export function Settings() {
  const { assessments, assessment, assessmentId, selectAssessment, riskModel, refresh, revision } =
    useWorkspace()
  const toast = useToast()

  const health = useAsync(() => api.health(), [revision])
  const assets = useAsync(() => api.assets(), [revision])

  const [form, setForm] = useState({ name: '', period: '', owner: '', scope: '', assumptions: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!assessment) return
    setForm({
      name: assessment.name,
      period: assessment.period,
      owner: assessment.owner,
      scope: assessment.scope,
      assumptions: assessment.assumptions,
    })
  }, [assessment])

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (!assessmentId) return
    if (!form.name.trim()) {
      toast.error('The assessment name cannot be empty.')
      return
    }

    setSaving(true)
    try {
      await api.updateAssessment(assessmentId, { ...form, name: form.name.trim() })
      toast.success('Assessment details saved. The report will use the new scope and assumptions.')
      refresh()
    } catch {
      toast.error('The assessment could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function handleActivate(id: string) {
    try {
      await api.activateAssessment(id)
      selectAssessment(id)
      toast.success('New findings will now be created against this assessment.')
      refresh()
    } catch {
      toast.error('The active assessment could not be changed.')
    }
  }

  return (
    <>
      <PageHeader
        title="Settings"
        description="Assessment metadata, the risk model AegisLens applies, and the in-scope asset list."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="min-w-0 space-y-4 xl:col-span-2">
          <section className="panel">
            <div className="panel-head">
              <h3 className="panel-title">Assessment details</h3>
              <p className="text-2xs text-subtle">Used verbatim in the generated report</p>
            </div>
            {!assessment ? (
              <Loading label="Loading assessment" />
            ) : (
              <form onSubmit={handleSave} className="space-y-4 px-4 py-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="assessment-name">
                      Name *
                    </label>
                    <input
                      id="assessment-name"
                      className="field"
                      value={form.name}
                      maxLength={200}
                      onChange={(event) => setForm({ ...form, name: event.target.value })}
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="assessment-owner">
                      Owner
                    </label>
                    <input
                      id="assessment-owner"
                      className="field"
                      value={form.owner}
                      maxLength={120}
                      onChange={(event) => setForm({ ...form, owner: event.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="assessment-period">
                    Period
                  </label>
                  <input
                    id="assessment-period"
                    className="field sm:max-w-sm"
                    value={form.period}
                    maxLength={100}
                    onChange={(event) => setForm({ ...form, period: event.target.value })}
                    placeholder="e.g. 2026-07-01 to 2026-09-30"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="assessment-scope">
                    Scope
                  </label>
                  <textarea
                    id="assessment-scope"
                    className="field min-h-[5.5rem] resize-y"
                    value={form.scope}
                    maxLength={5000}
                    onChange={(event) => setForm({ ...form, scope: event.target.value })}
                    placeholder="Which systems, environments, and activities the assessment covered"
                  />
                </div>
                <div>
                  <label className="label" htmlFor="assessment-assumptions">
                    Assumptions
                  </label>
                  <textarea
                    id="assessment-assumptions"
                    className="field min-h-[5.5rem] resize-y"
                    value={form.assumptions}
                    maxLength={5000}
                    onChange={(event) => setForm({ ...form, assumptions: event.target.value })}
                    placeholder="What was taken as given, and what was explicitly not done"
                  />
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="btn-primary btn-sm" disabled={saving}>
                    {saving ? 'Saving…' : 'Save assessment'}
                  </button>
                </div>
              </form>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3 className="panel-title">Assessments</h3>
              <p className="text-2xs text-subtle">The active one receives newly created findings</p>
            </div>
            <ul className="divide-y divide-line">
              {assessments.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm text-ink">
                      <span className="font-mono text-2xs text-subtle">{item.id}</span>
                      {item.name}
                      {item.is_active && (
                        <span className="badge border-accent/40 bg-accent/10 text-accent-soft">
                          Active
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-2xs text-subtle">
                      {item.finding_count} finding{item.finding_count === 1 ? '' : 's'} ·{' '}
                      {item.period || 'no period recorded'}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      className={cx('btn-ghost btn-sm', item.id === assessmentId && 'text-accent-soft')}
                      onClick={() => selectAssessment(item.id)}
                      disabled={item.id === assessmentId}
                    >
                      {item.id === assessmentId ? (
                        <>
                          <Check size={13} aria-hidden />
                          Viewing
                        </>
                      ) : (
                        'View'
                      )}
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => handleActivate(item.id)}
                      disabled={item.is_active}
                    >
                      Set active
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3 className="panel-title">In-scope assets</h3>
              <p className="text-2xs text-subtle">Reference list from the sample dataset</p>
            </div>
            {assets.loading && !assets.data && <Loading label="Loading assets" />}
            {assets.error && <ErrorState message={assets.error} onRetry={assets.reload} />}
            {assets.data && (
              <div className="table-scroll">
                <table className="w-full min-w-[40rem]">
                  <thead className="border-b border-line">
                    <tr>
                      <th className="th">Asset</th>
                      <th className="th">Type</th>
                      <th className="th">Environment</th>
                      <th className="th">Owner</th>
                      <th className="th">Criticality</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {assets.data.map((asset) => (
                      <tr key={asset.id}>
                        <td className="td">
                          <span className="font-mono text-2xs text-subtle">{asset.id}</span>
                          <span className="mt-0.5 block text-sm text-ink">{asset.name}</span>
                          <span className="mt-0.5 block text-2xs text-subtle">
                            {asset.description}
                          </span>
                        </td>
                        <td className="td whitespace-nowrap text-xs text-muted">{asset.asset_type}</td>
                        <td className="td whitespace-nowrap text-xs text-muted">{asset.environment}</td>
                        <td className="td whitespace-nowrap text-xs text-muted">{asset.owner}</td>
                        <td className="td whitespace-nowrap text-xs text-muted">{asset.criticality}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-4">
          <section className="panel">
            <div className="panel-head">
              <h3 className="panel-title flex items-center gap-2">
                <BookOpen size={14} className="text-subtle" aria-hidden />
                Risk model
              </h3>
            </div>
            {!riskModel ? (
              <Loading label="Loading risk model" />
            ) : (
              <div className="space-y-3 px-4 py-4">
                <p className="rounded border border-line bg-base px-3 py-2.5 text-center font-mono text-sm text-accent-soft">
                  risk score = likelihood × impact
                </p>
                <p className="text-xs leading-relaxed text-muted">
                  Likelihood and impact are each rated {riskModel.scale_min}–{riskModel.scale_max}, so
                  the score runs from 1 to {riskModel.max_score}. Nothing is weighted or hidden: the
                  two inputs are analyst judgements and the score is their product.
                </p>
                <div className="space-y-1">
                  {riskModel.bands.map((band) => (
                    <div
                      key={band.level}
                      className="flex items-center justify-between rounded border border-line bg-base px-3 py-1.5"
                    >
                      <SeverityBadge severity={band.level} />
                      <span className="font-mono text-xs text-muted">{band.range}</span>
                    </div>
                  ))}
                </div>
                <dl className="space-y-2.5 border-t border-line pt-3 text-xs">
                  {[
                    ['Overall risk score', riskModel.overall_risk_score],
                    ['Evidence completion', riskModel.evidence_completion],
                    ['Control coverage', riskModel.control_coverage],
                  ].map(([label, description]) => (
                    <div key={label}>
                      <dt className="text-2xs uppercase tracking-wider text-subtle">{label}</dt>
                      <dd className="mt-0.5 leading-relaxed text-muted">{description}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-head">
              <h3 className="panel-title flex items-center gap-2">
                <Server size={14} className="text-subtle" aria-hidden />
                API status
              </h3>
            </div>
            <div className="space-y-2 px-4 py-4 text-xs">
              {health.loading && !health.data && <Loading label="Checking" className="py-2" />}
              {health.error && <ErrorState message={health.error} onRetry={health.reload} />}
              {health.data && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Backend</span>
                    <span className="badge border-good/40 bg-good/10 text-good">
                      {health.data.status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Database</span>
                    <span
                      className={cx(
                        'badge',
                        health.data.database === 'connected'
                          ? 'border-good/40 bg-good/10 text-good'
                          : 'border-critical/40 bg-critical/10 text-critical',
                      )}
                    >
                      {health.data.database}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted">Version</span>
                    <span className="font-mono text-muted">{health.data.version}</span>
                  </div>
                </>
              )}
              <a
                href={api.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost btn-sm mt-2 w-full"
              >
                <ExternalLink size={13} aria-hidden />
                Open API documentation
              </a>
            </div>
          </section>

          <section className="panel px-4 py-4">
            <h3 className="panel-title mb-2">About this workbench</h3>
            <p className="text-xs leading-relaxed text-muted">
              AegisLens is an educational and defensive security assessment workbench using synthetic
              data. It is not a replacement for a SIEM, GRC platform, vulnerability scanner, or
              professional security audit. All data ships with the project and stays on this machine.
            </p>
          </section>
        </div>
      </div>
    </>
  )
}
