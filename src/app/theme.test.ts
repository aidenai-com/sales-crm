import { describe, expect, it } from 'vitest'
import { readStoredPreference, resolveTheme } from './theme'

describe('readStoredPreference', () => {
  it('accepts the two explicit preferences', () => {
    expect(readStoredPreference('light')).toBe('light')
    expect(readStoredPreference('dark')).toBe('dark')
  })

  it('falls back to system for anything else', () => {
    // Nothing stored yet, a stale value from an earlier format, or hand-edited nonsense.
    expect(readStoredPreference(null)).toBe('system')
    expect(readStoredPreference('')).toBe('system')
    expect(readStoredPreference('Dark')).toBe('system')
    expect(readStoredPreference('midnight')).toBe('system')
  })
})

describe('resolveTheme', () => {
  it('honours an explicit preference over the OS setting', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('follows the OS when the preference is system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
})
