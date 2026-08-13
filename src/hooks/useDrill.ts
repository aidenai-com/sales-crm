import { useCallback, useMemo } from 'react'
import { useRouter } from '@/app/router'

/**
 * The drill stack for a chart, held in the URL.
 *
 * Every panel on the Analytics screen drills the same way — group, then group, then deals — so the
 * mechanics live here once and each tab supplies only its own level names. A hook rather than a component
 * because the levels differ per tab while the push/pop/reset does not.
 *
 * **In the URL, not in state.** This screen already treats the URL as its filter state, on the grounds that
 * "send me that chart" is the most common thing anyone does with a reporting page. A drilled view is a view;
 * if it could not be linked or survive a reload it would be a view somebody has to rebuild by hand every
 * time. It also makes the browser's back button do the obvious thing — go up a level — for free.
 *
 * Keys are opaque strings, usually ids. The hook never interprets them; it only remembers the path.
 */

export interface DrillLevel {
  /** The URL parameter this level occupies, e.g. `stage`. */
  param: string
  /** The selected key at this level, or null when it has not been drilled into. */
  key: string | null
}

export interface Drill {
  /** The keys currently selected, outermost first, stopping at the first unset level. */
  path: Array<{ param: string; key: string }>
  /** How many levels deep, 0 at the top. */
  depth: number
  /** The key at a given level, or null. */
  keyAt: (param: string) => string | null
  /** Select a key at a level, clearing every level below it. */
  push: (param: string, key: string) => void
  /** Clear this level and everything below it. */
  clearFrom: (param: string) => void
  /** Back to the top of this tab's stack. */
  reset: () => void
}

/**
 * @param params The level parameter names, outermost first. Order matters: clearing a level clears
 *   everything after it in this list, which is what stops a stale inner key surviving an outer change.
 */
export function useDrill(params: string[]): Drill {
  const { match, navigate } = useRouter()
  const search = match.query

  const write = useCallback(
    (mutate: (next: URLSearchParams) => void) => {
      const next = new URLSearchParams(search)
      mutate(next)
      const suffix = next.toString()
      // `replace`, matching how the filters on this screen navigate: twenty drills should not become
      // twenty back-button steps between the reader and the screen they arrived from.
      navigate(`${match.path}${suffix ? `?${suffix}` : ''}`, { replace: true })
    },
    [match.path, navigate, search],
  )

  const path = useMemo(() => {
    const found: Array<{ param: string; key: string }> = []
    for (const param of params) {
      const key = search.get(param)
      // Stops at the first gap rather than skipping it. A key at level three with level two unset is not a
      // deeper drill, it is a broken link — treating it as depth 1 recovers instead of rendering nonsense.
      if (!key) break
      found.push({ param, key })
    }
    return found
    // `params` is a literal array at every call site, so it is a new reference each render; joining it
    // gives a stable dependency without asking every caller to memoise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.join('|'), search])

  const clearFrom = useCallback(
    (param: string) => {
      const from = params.indexOf(param)
      if (from < 0) return
      write((next) => {
        for (const below of params.slice(from)) next.delete(below)
      })
    },
    [params, write],
  )

  return {
    path,
    depth: path.length,
    keyAt: (param) => search.get(param),
    push: (param, key) => {
      const from = params.indexOf(param)
      write((next) => {
        // Everything below the level being set is dropped: a stage chosen under one pipeline means nothing
        // under another, and leaving it would show an empty panel with a breadcrumb claiming otherwise.
        for (const below of params.slice(from + 1)) next.delete(below)
        next.set(param, key)
      })
    },
    clearFrom,
    reset: () => write((next) => params.forEach((param) => next.delete(param))),
  }
}
