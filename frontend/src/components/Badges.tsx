import { AlertTriangle } from 'lucide-react'
import type { ControlStatus, FindingStatus, Severity, VerificationStatus } from '../types'
import {
  controlStatusStyle,
  cx,
  riskScoreColor,
  severityStyle,
  statusStyle,
  verificationStyle,
} from '../lib/ui'

export function SeverityBadge({ severity, className }: { severity: Severity; className?: string }) {
  return <span className={cx('badge', severityStyle[severity], className)}>{severity}</span>
}

export function StatusBadge({ status }: { status: FindingStatus }) {
  return <span className={cx('badge', statusStyle[status])}>{status}</span>
}

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return <span className={cx('badge', verificationStyle[status])}>{status}</span>
}

export function ControlStatusBadge({ status }: { status: ControlStatus }) {
  return <span className={cx('badge', controlStatusStyle[status])}>{status}</span>
}

/** Risk score with its likelihood/impact working shown alongside. */
export function RiskScore({
  score,
  likelihood,
  impact,
  showWorking = true,
}: {
  score: number
  likelihood?: number
  impact?: number
  showWorking?: boolean
}) {
  return (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className={cx('font-mono text-sm font-semibold', riskScoreColor(score))}>{score}</span>
      <span className="text-2xs text-subtle">/25</span>
      {showWorking && likelihood !== undefined && impact !== undefined && (
        <span className="font-mono text-2xs text-subtle">
          ({likelihood}×{impact})
        </span>
      )}
    </span>
  )
}

export function OverdueFlag({ show }: { show: boolean }) {
  if (!show) return null
  return (
    <span className="badge border-critical/40 bg-critical/10 text-critical" title="Past its due date">
      <AlertTriangle size={11} aria-hidden />
      Overdue
    </span>
  )
}

/** Small horizontal meter used for coverage percentages. */
export function CoverageBar({
  percent,
  colorClass,
  className,
}: {
  percent: number
  colorClass: string
  className?: string
}) {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div
      className={cx('h-1.5 w-full overflow-hidden rounded-full bg-base', className)}
      role="meter"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cx('h-full rounded-full transition-[width]', colorClass)} style={{ width: `${clamped}%` }} />
    </div>
  )
}
