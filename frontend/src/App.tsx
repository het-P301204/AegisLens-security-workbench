import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { WorkspaceProvider, useWorkspace } from './context/WorkspaceContext'
import { ToastProvider } from './components/Toast'
import { AppLayout } from './layouts/AppLayout'
import { Overview } from './pages/Overview'
import { Findings } from './pages/Findings'
import { FindingDetail } from './pages/FindingDetail'
import { EvidenceLibrary } from './pages/EvidenceLibrary'
import { Controls } from './pages/Controls'
import { Reports } from './pages/Reports'
import { Settings } from './pages/Settings'
import { EmptyState, ErrorState, Loading } from './components/States'

/** Blocks the app shell until the workspace essentials have loaded. */
function WorkspaceGate({ children }: { children: React.ReactNode }) {
  const { loading, error, reload, assessments } = useWorkspace()

  if (loading && assessments.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loading label="Starting AegisLens" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="panel w-full max-w-lg">
          <ErrorState message={error} onRetry={reload} />
          <p className="border-t border-line px-4 py-3 text-center text-2xs text-subtle">
            Start the API with <code className="font-mono text-muted">uvicorn app.main:app</code> from
            the <code className="font-mono text-muted">backend</code> directory, then retry.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}

function NotFound() {
  return (
    <div className="panel">
      <EmptyState
        title="Page not found"
        description="That route does not exist in AegisLens."
        action={
          <Link to="/" className="btn-primary btn-sm">
            Back to overview
          </Link>
        }
      />
    </div>
  )
}

export function App() {
  return (
    <ToastProvider>
      <WorkspaceProvider>
        <WorkspaceGate>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<Overview />} />
              <Route path="findings" element={<Findings />} />
              <Route path="findings/:findingId" element={<FindingDetail />} />
              <Route path="evidence" element={<EvidenceLibrary />} />
              <Route path="controls" element={<Controls />} />
              <Route path="reports" element={<Reports />} />
              <Route path="settings" element={<Settings />} />
              <Route path="overview" element={<Navigate to="/" replace />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </WorkspaceGate>
      </WorkspaceProvider>
    </ToastProvider>
  )
}
