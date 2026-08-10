import { useCallback, useEffect, useRef, useState } from 'react'
import type { AnalyticsSummary } from '@/types/domain'
import { analyticsApi, type AnalyticsQuery } from '@/api/endpoints'
import { ApiError, errorMessage } from '@/api/client'

/**
 * The Analytics screen's data, refetched whenever the filters change.
 *
 * Every chart comes from one request. That is a property of the endpoint rather than a
 * convenience here: five separately-filtered calls would eventually land out of step with
 * each other, and two charts on one screen disagreeing about the same pipeline is the kind
 * of bug nobody reports and everybody stops trusting the screen over.
 *
 * Like `useChecklist`, this stays out of the global store — the snapshot holds what every
 * screen reads, and these aggregates are read by one.
 */

interface UseAnalytics {
  summary: AnalyticsSummary | null
  loading: boolean
  error: string | null
  reload: () => Promise<void>
}

export function useAnalytics(query: AnalyticsQuery): UseAnalytics {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Filters change fast — a user clicking through owners can outrun the network. Only the
  // newest request may write, or an early response lands last and the charts show a filter
  // the controls no longer say is applied.
  const requestId = useRef(0)

  // Serialised, so the effect below depends on the filter *values* rather than on the
  // identity of an object the caller rebuilds on every render.
  const key = JSON.stringify(query)

  const load = useCallback(async () => {
    const id = requestId.current + 1
    requestId.current = id
    setLoading(true)

    try {
      const loaded = await analyticsApi.summary(JSON.parse(key) as AnalyticsQuery)
      if (requestId.current !== id) return
      setSummary(loaded)
      setError(null)
    } catch (caught) {
      if (requestId.current !== id) return
      // A 401 is the session expiring; the auth layer handles that and showing an error
      // here would just be noise on top of a redirect.
      if (!(caught instanceof ApiError && caught.isUnauthorized)) setError(errorMessage(caught))
    } finally {
      if (requestId.current === id) setLoading(false)
    }
  }, [key])

  useEffect(() => {
    void load()
  }, [load])

  return { summary, loading, error, reload: load }
}
