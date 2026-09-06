/** Shared presentation helpers: colour vocabulary, formatting, and class merging. */

import type { ControlStatus, FindingStatus, Severity, VerificationStatus } from '../types'

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ')
}

/** Severity drives the strongest colour signal in the interface. */
export const severityStyle: Record<Severity, string> = {
  Critical: 'border-critical/40 bg-critical/10 text-critical',
  High: 'border-high/40 bg-high/10 text-high',
  Medium: 'border-medium/40 bg-medium/10 text-medium',
  Low: 'border-low/40 bg-low/10 text-low',
  Informational: 'border-line-strong bg-raised text-muted',
}

export const severityHex: Record<Severity, string> = {
  Critical: '#f0616d',
  High: '#f0913f',
  Medium: '#dcb544',
  Low: '#4fa3d1',
  Informational: '#8d95a6',
}

export const statusStyle: Record<FindingStatus, string> = {
  Open: 'border-critical/30 bg-critical/5 text-critical',
  'In Review': 'border-accent/40 bg-accent/10 text-accent-soft',
  Accepted: 'border-medium/30 bg-medium/5 text-medium',
  Remediated: 'border-good/40 bg-good/10 text-good',
  Closed: 'border-line-strong bg-raised text-muted',
}

export const verificationStyle: Record<VerificationStatus, string> = {
  Verified: 'border-good/40 bg-good/10 text-good',
  Pending: 'border-medium/40 bg-medium/10 text-medium',
  'Not Verified': 'border-line-strong bg-raised text-muted',
}

export const controlStatusStyle: Record<ControlStatus, string> = {
  Implemented: 'border-good/40 bg-good/10 text-good',
  'Partially Implemented': 'border-medium/40 bg-medium/10 text-medium',
  'Not Implemented': 'border-critical/40 bg-critical/10 text-critical',
  'Not Assessed': 'border-line-strong bg-raised text-muted',
}

/** Bar colour for a 0-100 percentage: low coverage should look like a problem. */
export function coverageColor(percent: number): string {
  if (percent >= 75) return 'bg-good'
  if (percent >= 45) return 'bg-medium'
  if (percent > 0) return 'bg-high'
  return 'bg-line-strong'
}

export function riskScoreColor(score: number): string {
  if (score >= 20) return 'text-critical'
  if (score >= 12) return 'text-high'
  if (score >= 6) return 'text-medium'
  if (score >= 3) return 'text-low'
  return 'text-muted'
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—'
  const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
}

export function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** "3 days ago" style label for activity timestamps. */
export function relativeTime(value: string): string {
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return value

  const seconds = Math.round((Date.now() - then) / 1000)
  if (seconds < 60) return 'just now'

  const units: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, 'minute'],
    [3600, 'hour'],
    [86400, 'day'],
    [604800, 'week'],
    [2629800, 'month'],
    [31557600, 'year'],
  ]

  let chosen: [number, Intl.RelativeTimeFormatUnit] = units[0]
  for (const unit of units) {
    if (seconds >= unit[0]) chosen = unit
  }
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  return formatter.format(-Math.round(seconds / chosen[0]), chosen[1])
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`
}
