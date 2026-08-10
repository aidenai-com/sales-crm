import { describe, expect, it } from 'vitest'
import { matchRoute, routes } from './router'

describe('matchRoute', () => {
  it('matches the static routes', () => {
    expect(matchRoute('/').name).toBe('landing')
    expect(matchRoute('/dashboard').name).toBe('dashboard')
    expect(matchRoute('/pipeline').name).toBe('pipeline')
    expect(matchRoute('/accounts').name).toBe('accounts')
    expect(matchRoute('/deals').name).toBe('deals')
    expect(matchRoute('/settings/pipelines').name).toBe('pipelines')
  })

  it('extracts a deal id', () => {
    const match = matchRoute('/deals/deal-14')
    expect(match.name).toBe('deal')
    expect(match.params.dealId).toBe('deal-14')
  })

  it('prefers the static /deals route over the :dealId pattern', () => {
    // Both patterns could match a single segment; segment count disambiguates.
    expect(matchRoute('/deals').name).toBe('deals')
  })

  it('tolerates a trailing slash', () => {
    expect(matchRoute('/pipeline/').name).toBe('pipeline')
    expect(matchRoute('/deals/deal-1/').params.dealId).toBe('deal-1')
  })

  it('decodes percent-encoded params', () => {
    expect(matchRoute('/deals/deal%20one').params.dealId).toBe('deal one')
  })

  it('returns not-found for unknown paths and wrong depths', () => {
    expect(matchRoute('/nope').name).toBe('not-found')
    expect(matchRoute('/deals/deal-1/extra').name).toBe('not-found')
    expect(matchRoute('/settings').name).toBe('not-found')
  })
})

describe('routes', () => {
  it('builds a deal path that matches back to the deal route', () => {
    const path = routes.deal('deal-14')
    expect(path).toBe('/deals/deal-14')
    expect(matchRoute(path).params.dealId).toBe('deal-14')
  })

  it('encodes ids that need it, and round-trips them', () => {
    const path = routes.deal('deal/odd id')
    expect(matchRoute(path).params.dealId).toBe('deal/odd id')
  })
})
