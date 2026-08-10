import { useEffect, useRef, type ComponentPropsWithoutRef } from 'react'
import { cn } from '@/lib/cn'

/**
 * The search input for a list view: icon inside the field, a clear button once there's
 * something to clear, and `/` to focus it from anywhere on the page.
 *
 * `/` rather than another modifier chord because Ctrl+K is already the global record
 * search — this one filters the table in front of you, and the two shouldn't compete.
 * The shortcut is ignored while you're typing somewhere else, so it can't swallow a
 * literal slash.
 */
export function SearchField({
  value,
  onValueChange,
  className,
  ...rest
}: {
  value: string
  onValueChange: (value: string) => void
} & Omit<ComponentPropsWithoutRef<'input'>, 'value' | 'onChange'>) {
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return

      const active = document.activeElement
      const typing =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement ||
        (active instanceof HTMLElement && active.isContentEditable)
      if (typing) return

      event.preventDefault()
      input.current?.focus()
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className={cn('relative flex items-center', className)}>
      <svg
        viewBox="0 0 20 20"
        aria-hidden="true"
        className="pointer-events-none absolute left-16 size-16 text-mist-gray"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <circle cx="9" cy="9" r="5.25" />
        <path d="M12.9 12.9L16.5 16.5" strokeLinecap="round" />
      </svg>

      <input
        ref={input}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          // Escape clears rather than blurring: with an empty field it's a no-op anyway,
          // and clearing is what you actually want mid-search.
          if (event.key === 'Escape' && value) {
            event.preventDefault()
            onValueChange('')
          }
        }}
        className={cn(
          'w-full rounded-lg border border-hairline bg-pebble py-8 pr-64 pl-48',
          'text-body-sm text-ink-navy placeholder:text-mist-gray',
          'transition-colors duration-(--duration-hover) ease-(--ease-ui)',
          'hover:border-mist-gray focus:border-signal-blue focus:bg-paper focus:outline-none',
          // Chrome draws its own clear button on type=search; ours is better placed.
          '[&::-webkit-search-cancel-button]:hidden',
        )}
        {...rest}
      />

      {value ? (
        <button
          type="button"
          onClick={() => {
            onValueChange('')
            input.current?.focus()
          }}
          aria-label="Clear search"
          className={cn(
            'absolute right-8 grid size-24 place-items-center rounded-md text-slate-gray',
            'transition-colors duration-(--duration-hover) hover:bg-pebble hover:text-ink-navy',
          )}
        >
          <svg viewBox="0 0 20 20" className="size-16" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      ) : (
        <kbd
          aria-hidden="true"
          className="absolute right-16 rounded-md border border-hairline bg-paper px-8 text-caption font-medium text-mist-gray"
        >
          /
        </kbd>
      )}
    </div>
  )
}
