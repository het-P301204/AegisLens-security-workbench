/** Small data-loading hook giving every page a consistent loading/error/retry shape. */

import { useCallback, useEffect, useState } from 'react'
import { ApiError } from '../services/api'

interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: string | null
  reload: () => void
}

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [token, setToken] = useState(0)

  // The loader closes over the caller's dependencies, which are the real inputs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    run()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        setData(null)
        setError(cause instanceof ApiError ? cause.message : 'Unexpected error while loading data.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [run, token])

  return { data, loading, error, reload: () => setToken((current) => current + 1) }
}
