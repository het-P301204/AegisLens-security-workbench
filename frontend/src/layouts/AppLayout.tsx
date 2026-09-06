import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BookCheck,
  FileText,
  FolderSearch,
  LayoutDashboard,
  Menu,
  ShieldAlert,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import { useWorkspace } from '../context/WorkspaceContext'
import { cx } from '../lib/ui'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/findings', label: 'Findings', icon: ShieldAlert, end: false },
  { to: '/evidence', label: 'Evidence', icon: FolderSearch, end: false },
  { to: '/controls', label: 'Controls', icon: BookCheck, end: false },
  { to: '/reports', label: 'Reports', icon: FileText, end: false },
  { to: '/settings', label: 'Settings', icon: SlidersHorizontal, end: false },
]

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="h-7 w-7 shrink-0" aria-hidden>
        <rect width="32" height="32" rx="7" fill="#171b22" />
        <path
          d="M16 5.5 24.5 9v7.2c0 5.2-3.5 9-8.5 10.8-5-1.8-8.5-5.6-8.5-10.8V9L16 5.5Z"
          stroke="#4f8ff0"
          strokeWidth="1.8"
          strokeLinejoin="round"
          fill="none"
        />
        <circle cx="16" cy="15" r="3.6" stroke="#7fb2f5" strokeWidth="1.6" fill="none" />
        <path d="m18.7 17.7 3 3" stroke="#7fb2f5" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold leading-tight tracking-tight text-ink">AegisLens</p>
        <p className="truncate text-2xs leading-tight text-subtle">Security Evidence Workbench</p>
      </div>
    </div>
  )
}

/** Switches which assessment every page is scoped to. */
function AssessmentSelector({ compact = false }: { compact?: boolean }) {
  const { assessments, assessmentId, selectAssessment, loading } = useWorkspace()

  if (loading && assessments.length === 0) {
    return <div className="h-9 w-full animate-pulse rounded-md bg-raised sm:w-64" aria-hidden />
  }
  if (assessments.length === 0) return null

  return (
    <label className={cx('block', compact ? 'w-full' : 'w-full sm:w-72')}>
      <span className="sr-only">Active assessment</span>
      <select
        className="field py-1.5 text-xs"
        value={assessmentId ?? ''}
        onChange={(event) => selectAssessment(event.target.value)}
      >
        {assessments.map((assessment) => (
          <option key={assessment.id} value={assessment.id}>
            {assessment.name} ({assessment.finding_count})
          </option>
        ))}
      </select>
    </label>
  )
}

export function AppLayout() {
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  const navLinks = (
    <nav className="flex flex-col gap-0.5" aria-label="Main">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cx(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors',
              isActive
                ? 'bg-accent/10 font-medium text-accent-soft'
                : 'text-muted hover:bg-hover hover:text-ink',
            )
          }
        >
          <Icon size={16} aria-hidden />
          {label}
        </NavLink>
      ))}
    </nav>
  )

  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      {/* Mobile top bar */}
      <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-3 lg:hidden">
        <Logo />
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={() => setNavOpen((open) => !open)}
          aria-expanded={navOpen}
          aria-controls="mobile-nav"
        >
          {navOpen ? <X size={15} aria-hidden /> : <Menu size={15} aria-hidden />}
          <span className="sr-only">Toggle navigation</span>
        </button>
      </header>

      {navOpen && (
        <div id="mobile-nav" className="border-b border-line bg-surface px-4 py-3 lg:hidden">
          {navLinks}
          <div className="mt-3 border-t border-line pt-3">
            <AssessmentSelector compact />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col justify-between border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen">
        <div>
          <div className="border-b border-line px-4 py-4">
            <Logo />
          </div>
          <div className="p-3">{navLinks}</div>
        </div>
        <div className="border-t border-line px-4 py-3">
          <p className="text-2xs leading-relaxed text-subtle">
            Educational workbench running on synthetic sample data. Not a SIEM or a substitute for a
            professional audit.
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="hidden items-center justify-between gap-4 border-b border-line bg-surface px-6 py-3 lg:flex">
          <div className="min-w-0">
            <h1 className="truncate text-sm font-semibold tracking-tight text-ink">
              Security Evidence &amp; Risk Intelligence Workbench
            </h1>
            <p className="mt-0.5 text-2xs text-subtle">
              Findings, evidence, and control coverage for the selected assessment
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-2xs uppercase tracking-wider text-subtle">Assessment</span>
            <AssessmentSelector />
          </div>
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
