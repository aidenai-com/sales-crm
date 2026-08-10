import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { createElement, type ReactElement } from 'react'
import { useDebouncedCommit } from './useDebouncedCommit'

/**
 * The behaviour under test is timing, so these use fake timers and a real render rather
 * than asserting on the hook's shape. What matters:
 *
 *  - typing does not fire a request per keystroke
 *  - a refetch landing mid-edit does not yank characters out from under the user
 *  - leaving the field commits immediately rather than waiting out the delay
 */

let container: HTMLDivElement
let root: Root

// A tiny harness that exposes the hook's return value to the test.
function renderHook<T>(
  serverValue: T,
  commit: (value: T) => void,
): { current: ReturnType<typeof useDebouncedCommit<T>>; rerender: (next: T) => void } {
  const box = {} as { current: ReturnType<typeof useDebouncedCommit<T>> }

  function Probe({ value }: { value: T }): ReactElement | null {
    box.current = useDebouncedCommit(value, commit)
    return null
  }

  act(() => {
    root.render(createElement(Probe, { value: serverValue }))
  })

  return {
    get current() {
      return box.current
    },
    rerender: (next: T) => {
      act(() => {
        root.render(createElement(Probe, { value: next }))
      })
    },
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  container = document.createElement('div')
  document.body.appendChild(container)
  act(() => {
    root = createRoot(container)
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

describe('useDebouncedCommit', () => {
  it('starts from the server value', () => {
    const commit = vi.fn()
    const hook = renderHook<string>('Core Banking', commit)

    expect(hook.current.value).toBe('Core Banking')
    expect(commit).not.toHaveBeenCalled()
  })

  it('commits once after typing stops, not once per keystroke', () => {
    const commit = vi.fn()
    const hook = renderHook<string>('', commit)

    for (const text of ['C', 'Co', 'Cor', 'Core']) {
      act(() => hook.current.onChange(text))
    }
    expect(commit).not.toHaveBeenCalled()

    act(() => void vi.advanceTimersByTime(500))

    expect(commit).toHaveBeenCalledOnce()
    expect(commit).toHaveBeenCalledWith('Core')
  })

  it('shows keystrokes immediately even though the commit waits', () => {
    const hook = renderHook<string>('', vi.fn())

    act(() => hook.current.onChange('typed'))
    expect(hook.current.value).toBe('typed')
  })

  it('does not commit a value equal to the server value', () => {
    const commit = vi.fn()
    const hook = renderHook<string>('same', commit)

    act(() => hook.current.onChange('changed'))
    act(() => hook.current.onChange('same'))
    act(() => void vi.advanceTimersByTime(500))

    expect(commit).not.toHaveBeenCalled()
  })

  it('commits immediately on blur rather than waiting out the delay', () => {
    const commit = vi.fn()
    const hook = renderHook<string>('', commit)

    act(() => hook.current.onChange('done'))
    act(() => hook.current.onBlur())

    expect(commit).toHaveBeenCalledWith('done')
  })

  it('does not commit twice when blur is followed by the timer firing', () => {
    const commit = vi.fn()
    const hook = renderHook<string>('', commit)

    act(() => hook.current.onChange('once'))
    act(() => hook.current.onBlur())
    act(() => void vi.advanceTimersByTime(1000))

    expect(commit).toHaveBeenCalledOnce()
  })

  it('blur is a no-op when nothing was typed', () => {
    const commit = vi.fn()
    const hook = renderHook<string>('unchanged', commit)

    act(() => hook.current.onBlur())
    expect(commit).not.toHaveBeenCalled()
  })

  it('accepts a new server value while idle', () => {
    const hook = renderHook<string>('first', vi.fn())
    hook.rerender('second')
    expect(hook.current.value).toBe('second')
  })

  it('does NOT overwrite the draft while the user is mid-edit', () => {
    // The regression this guards: a background refetch landing during typing used to
    // replace what had been typed with the stale server value.
    const hook = renderHook<string>('server', vi.fn())

    act(() => hook.current.onChange('user is typing'))
    hook.rerender('some other server value')

    expect(hook.current.value).toBe('user is typing')
  })

  it('resumes tracking the server once the edit has committed', () => {
    const commit = vi.fn()
    const hook = renderHook<string>('a', commit)

    act(() => hook.current.onChange('b'))
    act(() => void vi.advanceTimersByTime(500))
    expect(commit).toHaveBeenCalledWith('b')

    hook.rerender('c')
    expect(hook.current.value).toBe('c')
  })

  it('works for numbers, not just strings', () => {
    const commit = vi.fn()
    const hook = renderHook<number>(1000, commit)

    act(() => hook.current.onChange(2500))
    act(() => void vi.advanceTimersByTime(500))

    expect(commit).toHaveBeenCalledWith(2500)
  })
})
