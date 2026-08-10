import { useCallback, useEffect, useRef, useState } from 'react'

/** Long enough to absorb typing, short enough that the save feels immediate. */
export const COMMIT_DELAY_MS = 500

/**
 * Local input state that commits to the server after typing stops.
 *
 * The drawers used to write straight through on every change, which was free against an
 * in-memory store and is a PATCH per keystroke against a real API. Editing "Core Banking"
 * would fire twelve requests, arriving out of order, with the slowest one winning.
 *
 * So the input owns its value while the user types, and one request goes out when they
 * pause. A blur commits immediately, because leaving a field is a clear signal you are done
 * with it.
 */
export function useDebouncedCommit<T>(
  serverValue: T,
  commit: (value: T) => void | Promise<unknown>,
  delay = COMMIT_DELAY_MS,
) {
  const [draft, setDraft] = useState<T>(serverValue)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)

  // Accept server-side changes, but never overwrite what is being typed — that would yank
  // characters out from under the user when an unrelated refetch lands.
  useEffect(() => {
    if (!dirty.current) setDraft(serverValue)
  }, [serverValue])

  const flush = useCallback(
    (value: T) => {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = null
      }
      dirty.current = false
      if (value !== serverValue) void commit(value)
    },
    [commit, serverValue],
  )

  const change = useCallback(
    (value: T) => {
      setDraft(value)
      dirty.current = true
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => flush(value), delay)
    },
    [delay, flush],
  )

  const blur = useCallback(() => {
    if (dirty.current) flush(draft)
  }, [draft, flush])

  // A pending edit must not be lost because the drawer closed or the row unmounted.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  return { value: draft, onChange: change, onBlur: blur }
}
