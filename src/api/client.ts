/**
 * The single place that talks to the backend.
 *
 * Everything above this file deals in domain objects and never in fetch, headers, or
 * status codes. That boundary is what made swapping the seeded mock store for a real API a
 * contained change rather than a rewrite.
 */

export const API_BASE = '/api/v1'

const ACCESS_TOKEN_KEY = 'crm-access-token'
const REFRESH_TOKEN_KEY = 'crm-refresh-token'

export class ApiError extends Error {
  readonly status: number
  /** FastAPI's `detail`, which is written for humans and safe to show. */
  readonly detail: string

  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }

  get isUnauthorized(): boolean {
    return this.status === 401
  }

  get isForbidden(): boolean {
    return this.status === 403
  }

  /** 409 carries a rule the user broke, e.g. a stage that still holds deals. */
  get isConflict(): boolean {
    return this.status === 409
  }
}

// --- Token storage ----------------------------------------------------------
// localStorage rather than a cookie because the API is token-based and stateless. The
// trade-off is XSS exposure; the mitigation is that nothing in this app renders
// unsanitised HTML. A httpOnly cookie would be the stronger choice if that changes.

export const tokens = {
  access: () => window.localStorage.getItem(ACCESS_TOKEN_KEY),
  refresh: () => window.localStorage.getItem(REFRESH_TOKEN_KEY),

  save(access: string, refresh?: string) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, access)
    if (refresh) window.localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
  },

  clear() {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY)
    window.localStorage.removeItem(REFRESH_TOKEN_KEY)
  },
}

/** Notified when the session cannot be recovered, so the app can return to the login screen. */
type SessionExpiredHandler = () => void
let onSessionExpired: SessionExpiredHandler = () => {}

export function setSessionExpiredHandler(handler: SessionExpiredHandler): void {
  onSessionExpired = handler
}

// --- Refresh ----------------------------------------------------------------

/**
 * Shared across concurrent 401s.
 *
 * The dashboard fires several requests at once. Without this, each one would trigger its
 * own refresh, and all but the first would fail against an already-rotated token.
 */
let refreshInFlight: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = tokens.refresh()
  if (!refreshToken) return null

  const response = await fetch(`${API_BASE}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  })

  if (!response.ok) return null

  const data = (await response.json()) as { accessToken: string }
  tokens.save(data.accessToken)
  return data.accessToken
}

function refreshOnce(): Promise<string | null> {
  refreshInFlight ??= refreshAccessToken().finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

// --- Request ----------------------------------------------------------------

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  /** Login and refresh must not carry a bearer token or attempt a retry. */
  anonymous?: boolean
  signal?: AbortSignal
}

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json()
    const detail = (data as { detail?: unknown }).detail
    if (typeof detail === 'string') return detail
    // 422 returns a list of field errors; surface the first usefully rather than [object Object].
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { loc?: unknown[]; msg?: string }
      const field = Array.isArray(first.loc) ? String(first.loc.at(-1)) : 'input'
      return `${field}: ${first.msg ?? 'is invalid'}`
    }
  } catch {
    // Fall through to the status text below.
  }
  return response.statusText || `Request failed with status ${response.status}`
}

async function send<T>(path: string, options: RequestOptions, isRetry = false): Promise<T> {
  const { method = 'GET', body, anonymous = false, signal } = options

  const headers: Record<string, string> = {}
  if (body !== undefined && !(body instanceof URLSearchParams)) {
    headers['Content-Type'] = 'application/json'
  }
  if (body instanceof URLSearchParams) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }

  const accessToken = tokens.access()
  if (!anonymous && accessToken) headers.Authorization = `Bearer ${accessToken}`

  let response: Response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      signal,
      body:
        body === undefined
          ? undefined
          : body instanceof URLSearchParams
            ? body
            : JSON.stringify(body),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    // A network-level failure, not an HTTP one: the API is probably not running.
    throw new ApiError(0, 'Cannot reach the server. Is the API running on port 8000?')
  }

  if (response.status === 401 && !anonymous && !isRetry) {
    const fresh = await refreshOnce()
    if (fresh) return send<T>(path, options, true)
    tokens.clear()
    onSessionExpired()
    throw new ApiError(401, 'Your session has expired. Please sign in again.')
  }

  if (!response.ok) throw new ApiError(response.status, await readError(response))

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => send<T>(path, { method: 'GET', signal }),
  post: <T>(path: string, body?: unknown) => send<T>(path, { method: 'POST', body }),
  /** For idempotent writes — ticking an already-ticked checkbox is not a new fact. */
  put: <T>(path: string, body?: unknown) => send<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown) => send<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => send<T>(path, { method: 'DELETE' }),

  /** OAuth2 password flow expects form encoding, not JSON. */
  postForm: <T>(path: string, form: Record<string, string>) =>
    send<T>(path, { method: 'POST', body: new URLSearchParams(form), anonymous: true }),
}

/** Turns any thrown value into something worth showing a user. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail
  if (error instanceof Error) return error.message
  return 'Something went wrong'
}
