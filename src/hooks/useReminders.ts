import { useCallback, useEffect, useState } from 'react'
import type { Id, ReminderInbox } from '@/types/domain'
import { reminderApi } from '@/api/endpoints'
import { ApiError, errorMessage } from '@/api/client'
import { useToast } from '@/app/toast'

/**
 * What greets a user on opening the app: due reminders, and leads that have gone quiet.
 *
 * The two arrive together from `/reminders/inbox` because they answer one question — what
 * have I not got back to — even though only one of them is a stored row. The stale-lead half
 * is derived on every read, so there is nothing to dismiss: a nudge disappears when the lead
 * is actually worked, which is the only thing that should make it disappear.
 *
 * Not in the global store. The snapshot is a picture of the CRM's records; this is a picture
 * of the clock, and it goes stale on its own schedule rather than when a deal is edited.
 */

interface UseReminders {
  inbox: ReminderInbox | null
  loading: boolean
  error: string | null
  /** Which reminder is mid-write, so one row can show its own pending state. */
  pendingId: Id | null
  complete: (reminderId: Id) => Promise<void>
  reload: () => Promise<void>
}

export function useReminders(): UseReminders {
  const { show } = useToast()

  const [inbox, setInbox] = useState<ReminderInbox | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<Id | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setInbox(await reminderApi.inbox())
      setError(null)
    } catch (caught) {
      if (!(caught instanceof ApiError && caught.isUnauthorized)) setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const complete = useCallback(
    async (reminderId: Id) => {
      setPendingId(reminderId)

      // Removed from the list immediately rather than after a refetch. Ticking something off
      // is the one interaction that has to feel instant, and the failure path below puts it
      // back — an optimistic update is only dishonest if it does not.
      const previous = inbox
      setInbox((current) =>
        current
          ? {
              ...current,
              overdue: current.overdue.filter((item) => item.id !== reminderId),
              upcoming: current.upcoming.filter((item) => item.id !== reminderId),
              totalCount: Math.max(0, current.totalCount - 1),
            }
          : current,
      )

      try {
        await reminderApi.complete(reminderId)
      } catch (caught) {
        setInbox(previous)
        if (!(caught instanceof ApiError && caught.isUnauthorized)) {
          show({ tone: 'danger', title: 'Could not complete reminder', detail: errorMessage(caught) })
        }
      } finally {
        setPendingId(null)
      }
    },
    [inbox, show],
  )

  return { inbox, loading, error, pendingId, complete, reload: load }
}
