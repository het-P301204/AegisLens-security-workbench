/**
 * Workspace-wide state: the list of assessments, which one is selected, and the
 * vocabularies the backend allows in forms. Loading it once here keeps every
 * dropdown in the application in step with the API.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, api } from '../services/api'
import type { Assessment, RiskModel, Vocabulary } from '../types'

const STORAGE_KEY = 'aegislens.assessment'

interface WorkspaceValue {
  assessments: Assessment[]
  assessment: Assessment | null
  assessmentId: string | undefined
  selectAssessment: (id: string) => void
  vocabulary: Vocabulary | null
  riskModel: RiskModel | null
  loading: boolean
  error: string | null
  reload: () => void
  /** Bumped after any write, so pages can refetch derived data. */
  revision: number
  refresh: () => void
}

const WorkspaceContext = createContext<WorkspaceValue | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [vocabulary, setVocabulary] = useState<Vocabulary | null>(null)
  const [riskModel, setRiskModel] = useState<RiskModel | null>(null)
  const [selectedId, setSelectedId] = useState<string | undefined>(
    () => localStorage.getItem(STORAGE_KEY) ?? undefined,
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState(0)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all([api.assessments(), api.vocabulary(), api.riskModel()])
      .then(([loadedAssessments, loadedVocabulary, loadedRiskModel]) => {
        if (cancelled) return
        setAssessments(loadedAssessments)
        setVocabulary(loadedVocabulary)
        setRiskModel(loadedRiskModel)
        setSelectedId((current) => {
          if (current && loadedAssessments.some((item) => item.id === current)) return current
          return loadedAssessments.find((item) => item.is_active)?.id ?? loadedAssessments[0]?.id
        })
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setError(cause instanceof ApiError ? cause.message : 'Could not load the workspace.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [reloadToken])

  const selectAssessment = useCallback((id: string) => {
    setSelectedId(id)
    localStorage.setItem(STORAGE_KEY, id)
  }, [])

  const value = useMemo<WorkspaceValue>(
    () => ({
      assessments,
      assessment: assessments.find((item) => item.id === selectedId) ?? null,
      assessmentId: selectedId,
      selectAssessment,
      vocabulary,
      riskModel,
      loading,
      error,
      reload: () => setReloadToken((token) => token + 1),
      revision,
      refresh: () => {
        setRevision((current) => current + 1)
        setReloadToken((token) => token + 1)
      },
    }),
    [assessments, selectedId, selectAssessment, vocabulary, riskModel, loading, error, revision],
  )

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceValue {
  const context = useContext(WorkspaceContext)
  if (!context) throw new Error('useWorkspace must be used inside a WorkspaceProvider')
  return context
}
