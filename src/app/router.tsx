import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type AnchorHTMLAttributes,
  type ReactNode,
} from 'react'

/**
 * A minimal History-API router.
 *
 * The app needs four things: URLs, path params, deep links, and working back/forward.
 * It has no data loaders, no server actions, no nested layouts and no forms, so a
 * routing library would be several hundred kilobytes and a standing stream of
 * server-side advisories in exchange for features this app does not use.
 */

export type RouteName =
  | 'landing'
  | 'dashboard'
  | 'analytics'
  | 'pipeline'
  | 'accounts'
  | 'deals'
  | 'deal'
  | 'pipelines'
  | 'not-found'

export interface Match {
  name: RouteName
  params: Record<string, string>
  path: string
  /**
   * Parsed query string.
   *
   * Added for the Analytics screen, whose filter state belongs in the URL: a filtered view
   * that cannot be linked or survive a reload is a view somebody has to rebuild by hand every
   * time they want to look at it again.
   */
  query: URLSearchParams
}

const ROUTES: Array<{ name: RouteName; pattern: string }> = [
  { name: 'landing', pattern: '/' },
  { name: 'dashboard', pattern: '/dashboard' },
  { name: 'analytics', pattern: '/analytics' },
  { name: 'pipeline', pattern: '/pipeline' },
  { name: 'accounts', pattern: '/accounts' },
  { name: 'deals', pattern: '/deals' },
  { name: 'deal', pattern: '/deals/:dealId' },
  { name: 'pipelines', pattern: '/settings/pipelines' },
]

/**
 * Matches a concrete URL against the route table, extracting `:param` segments.
 *
 * Accepts an optional query string on the input — `/analytics?owner=x` matches `analytics`.
 * Splitting it off here rather than at every call site means no route pattern has to know
 * that query strings exist.
 */
export function matchRoute(pathWithQuery: string): Match {
  const [rawPath, rawQuery = ''] = pathWithQuery.split('?')
  const query = new URLSearchParams(rawQuery)

  const normalized = rawPath.replace(/\/+$/, '') || '/'
  const segments = normalized.split('/').filter(Boolean)

  for (const route of ROUTES) {
    const patternSegments = route.pattern.split('/').filter(Boolean)
    if (patternSegments.length !== segments.length) continue

    const params: Record<string, string> = {}
    let matched = true

    for (let i = 0; i < patternSegments.length; i += 1) {
      const pattern = patternSegments[i]
      if (pattern.startsWith(':')) params[pattern.slice(1)] = decodeURIComponent(segments[i])
      else if (pattern !== segments[i]) {
        matched = false
        break
      }
    }

    if (matched) return { name: route.name, params, path: normalized, query }
  }

  return { name: 'not-found', params: {}, path: normalized, query }
}

interface RouterValue {
  match: Match
  navigate: (to: string, options?: { replace?: boolean }) => void
}

const RouterContext = createContext<RouterValue | null>(null)

export function RouterProvider({ children }: { children: ReactNode }) {
  // Path *and* search, so a filtered Analytics view is part of the location rather than
  // state the URL knows nothing about.
  const [href, setHref] = useState(() => window.location.pathname + window.location.search)

  useEffect(() => {
    function onPopState() {
      setHref(window.location.pathname + window.location.search)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    const current = window.location.pathname + window.location.search
    if (to === current) return

    if (options?.replace) window.history.replaceState(null, '', to)
    else window.history.pushState(null, '', to)
    setHref(to)

    // Only on a real navigation. Changing a filter uses `replace`, and yanking the page to
    // the top every time somebody picks an owner from a dropdown would be maddening.
    if (!options?.replace) window.scrollTo({ top: 0 })
  }, [])

  const match = useMemo(() => matchRoute(href), [href])
  const value = useMemo(() => ({ match, navigate }), [match, navigate])

  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>
}

export function useRouter(): RouterValue {
  const value = useContext(RouterContext)
  if (!value) throw new Error('useRouter must be used inside a RouterProvider')
  return value
}

/**
 * A real anchor, so middle-click, ctrl-click and "copy link address" all behave as
 * users expect. Only plain left-clicks are intercepted for client-side navigation.
 */
export function Link({
  to,
  replace,
  onClick,
  children,
  ...rest
}: { to: string; replace?: boolean } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { navigate } = useRouter()

  return (
    <a
      href={to}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return
        event.preventDefault()
        navigate(to, { replace })
      }}
      {...rest}
    >
      {children}
    </a>
  )
}

/** Path builders, so route strings live in one place. */
export const routes = {
  landing: '/',
  dashboard: '/dashboard',
  analytics: '/analytics',
  pipeline: '/pipeline',
  accounts: '/accounts',
  deals: '/deals',
  deal: (dealId: string) => `/deals/${encodeURIComponent(dealId)}`,
  pipelines: '/settings/pipelines',
} as const
