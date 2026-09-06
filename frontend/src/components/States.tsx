import type { ReactNode } from 'react'
import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react'
import { cx } from '../lib/ui'

export function Loading({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div className={cx('flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted', className)}>
      <Loader2 size={16} className="animate-spin" aria-hidden />
      <span>{label}…</span>
    </div>
  )
}

/** Placeholder blocks used while a panel's data is in flight. */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" aria-hidden>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="h-9 animate-pulse rounded bg-raised" />
      ))}
    </div>
  )
}

export function ErrorState({
  message,
  onRetry,
  className,
}: {
  message: string
  onRetry?: () => void
  className?: string
}) {
  return (
    <div className={cx('flex flex-col items-center gap-3 px-4 py-10 text-center', className)}>
      <AlertCircle size={22} className="text-critical" aria-hidden />
      <div>
        <p className="text-sm font-medium text-ink">Something went wrong</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-muted">{message}</p>
      </div>
      {onRetry && (
        <button type="button" className="btn-ghost btn-sm" onClick={onRetry}>
          <RefreshCw size={13} aria-hidden />
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cx('flex flex-col items-center gap-3 px-4 py-12 text-center', className)}>
      <div className="rounded-full border border-line bg-raised p-2.5 text-subtle">
        {icon ?? <Inbox size={18} aria-hidden />}
      </div>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        {description && <p className="mx-auto mt-1 max-w-md text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}
