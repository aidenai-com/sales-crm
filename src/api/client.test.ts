import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, api, errorMessage, setSessionExpiredHandler, tokens } from './client'

/**
 * These cover the parts of the client that are easy to get subtly wrong and impossible to
 * notice by hand: that a 401 refreshes once rather than once per concurrent request, that
 * a refresh token is not mistaken for an access token, and that a failed refresh signs out
 * instead of retrying forever.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const fetchMock = vi.fn()

beforeEach(() => {
  window.localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  setSessionExpiredHandler(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('tokens', () => {
  it('stores and clears both tokens', () => {
    tokens.save('access-1', 'refresh-1')
    expect(tokens.access()).toBe('access-1')
    expect(tokens.refresh()).toBe('refresh-1')

    tokens.clear()
    expect(tokens.access()).toBeNull()
    expect(tokens.refresh()).toBeNull()
  })

  it('keeps the existing refresh token when only the access token is replaced', () => {
    tokens.save('access-1', 'refresh-1')
    tokens.save('access-2')
    expect(tokens.access()).toBe('access-2')
    expect(tokens.refresh()).toBe('refresh-1')
  })
})

describe('authorisation header', () => {
  it('attaches the bearer token', async () => {
    tokens.save('abc')
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))

    await api.get('/deals')

    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer abc')
  })

  it('omits it when there is no token', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    await api.get('/deals')

    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined()
  })
})

describe('errors', () => {
  it('surfaces the API detail', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: '3 deals are still in this stage.' }, 409))

    await expect(api.delete('/pipelines/p/stages/s')).rejects.toMatchObject({
      status: 409,
      detail: '3 deals are still in this stage.',
    })
  })

  it('flags conflicts and forbidden separately', async () => {
    expect(new ApiError(409, 'x').isConflict).toBe(true)
    expect(new ApiError(403, 'x').isForbidden).toBe(true)
    expect(new ApiError(401, 'x').isUnauthorized).toBe(true)
    expect(new ApiError(409, 'x').isForbidden).toBe(false)
  })

  it('reads the first field error out of a 422 rather than showing an object', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: [{ loc: ['body', 'value'], msg: 'must be positive' }] }, 422),
    )

    await expect(api.post('/deals', {})).rejects.toMatchObject({
      detail: 'value: must be positive',
    })
  })

  it('reports an unreachable server as a network error, not a crash', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(api.get('/deals')).rejects.toMatchObject({ status: 0 })
  })

  it('errorMessage handles anything thrown', () => {
    expect(errorMessage(new ApiError(409, 'conflict detail'))).toBe('conflict detail')
    expect(errorMessage(new Error('plain'))).toBe('plain')
    expect(errorMessage('a string')).toBe('Something went wrong')
  })
})

describe('401 recovery', () => {
  it('refreshes once and retries the original request', async () => {
    tokens.save('stale', 'refresh-1')

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ accessToken: 'fresh' }))
      .mockResolvedValueOnce(jsonResponse([{ id: 'deal-1' }]))

    const result = await api.get<Array<{ id: string }>>('/deals')

    expect(result).toEqual([{ id: 'deal-1' }])
    expect(tokens.access()).toBe('fresh')

    // The retry must carry the new token, not the stale one.
    const [, retryInit] = fetchMock.mock.calls[2]
    expect((retryInit.headers as Record<string, string>).Authorization).toBe('Bearer fresh')
  })

  it('refreshes only once for concurrent 401s', async () => {
    // The dashboard fires several requests at once. Without single-flighting, each would
    // refresh and all but one would race against an already-rotated token.
    tokens.save('stale', 'refresh-1')

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/auth/refresh')) return jsonResponse({ accessToken: 'fresh' })
      const auth = (init?.headers as Record<string, string> | undefined)?.Authorization
      if (auth === 'Bearer stale') return jsonResponse({ detail: 'expired' }, 401)
      return jsonResponse({ ok: true })
    })

    await Promise.all([api.get('/deals'), api.get('/accounts'), api.get('/leads')])

    const refreshCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/refresh'))
    expect(refreshCalls).toHaveLength(1)
  })

  it('signs out when the refresh token is also rejected', async () => {
    tokens.save('stale', 'dead-refresh')
    const onExpired = vi.fn()
    setSessionExpiredHandler(onExpired)

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ detail: 'expired' }, 401))
      .mockResolvedValueOnce(jsonResponse({ detail: 'invalid' }, 401))

    await expect(api.get('/deals')).rejects.toMatchObject({ status: 401 })
    expect(onExpired).toHaveBeenCalledOnce()
    expect(tokens.access()).toBeNull()
  })

  it('does not retry when there is no refresh token', async () => {
    tokens.save('stale')
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'expired' }, 401))

    await expect(api.get('/deals')).rejects.toMatchObject({ status: 401 })
    // One attempt, one refresh attempt that bails early, and no retry.
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('never retries a login, so bad credentials fail immediately', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'Incorrect email or password' }, 401))

    await expect(api.postForm('/auth/login', { username: 'a', password: 'b' })).rejects.toMatchObject(
      { detail: 'Incorrect email or password' },
    )
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})

describe('request encoding', () => {
  it('sends JSON bodies as JSON', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    await api.patch('/deals/1', { value: '100' })

    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"value":"100"}')
  })

  it('sends the login as form encoding, which OAuth2 requires', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    await api.postForm('/auth/login', { username: 'a@b.com', password: 'pw' })

    const [, init] = fetchMock.mock.calls[0]
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    )
    expect(String(init.body)).toBe('username=a%40b.com&password=pw')
  })
})
