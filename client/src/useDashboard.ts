import { useCallback, useEffect, useState } from 'react'
import { ApiError } from './apiClient'

// Lab 4 ui-spec.md §3/§4 (AC-34, specification.md §11-18): shared by both
// dashboards. Loads on mount and on an explicit refresh only. A failed
// refresh keeps the last good response on screen and reports the error
// beside it; only a first load with nothing to show falls back to the
// full safe-failure state.
export function useDashboard<T>(fetcher: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    setFailed(false)
    fetcher()
      .then(setData)
      .catch((err) => {
        if (err instanceof ApiError && err.code === 'FORBIDDEN') setForbidden(true)
        else setFailed(true)
      })
      .finally(() => setLoading(false))
  }, [fetcher])

  useEffect(load, [load])

  return { data, loading, failed, forbidden, refresh: load }
}
