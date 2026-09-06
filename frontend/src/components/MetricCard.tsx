import type { LucideIcon } from 'lucide-react'
import { CoverageBar } from './Badges'
import { cx } from '../lib/ui'

export function MetricCard({
  label,
  value,
  suffix,
  hint,
  icon: Icon,
  tone = 'neutral',
  meter,
}: {
  label: string
  value: number | string
  suffix?: string
  hint?: string
  icon?: LucideIcon
  tone?: 'neutral' | 'critical' | 'high' | 'good' | 'accent'
  meter?: { percent: number; colorClass: string }
}) {
  const toneClass = {
    neutral: 'text-ink',
    critical: 'text-critical',
    high: 'text-high',
    good: 'text-good',
    accent: 'text-accent-soft',
  }[tone]

  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-2xs font-medium uppercase tracking-wider text-muted">{label}</p>
        {Icon && <Icon size={15} className="shrink-0 text-subtle" aria-hidden />}
      </div>
      <p className="mt-2 flex items-baseline gap-1">
        <span className={cx('text-2xl font-semibold leading-none tracking-tight', toneClass)}>
          {value}
        </span>
        {suffix && <span className="text-sm text-subtle">{suffix}</span>}
      </p>
      {meter && <CoverageBar percent={meter.percent} colorClass={meter.colorClass} className="mt-3" />}
      {hint && <p className="mt-2 text-2xs leading-snug text-subtle">{hint}</p>}
    </div>
  )
}
