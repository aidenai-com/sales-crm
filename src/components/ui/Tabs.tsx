import { useRef } from 'react'
import { cn } from '@/lib/cn'

export interface TabItem {
  id: string
  label: string
  count?: number
}

/**
 * A tablist, in two forms.
 *
 * `pill` is the original: a filled switcher used for choosing a pipeline on the board, where both
 * destinations should be visible and one click away.
 *
 * `underline` is for page-level sections — the Analytics tabs. The distinction is worth having rather than
 * reusing the pill: filled pills read as a *filter* applied to one view, and these tabs change which view
 * you are looking at. Underlines are the convention for that, and using the same chrome for both would make
 * a section change look like a filter change.
 *
 * **Arrow keys work.** They did not before, and `role="tablist"` without them is a broken promise: assistive
 * technology announces a tablist and then the expected navigation does nothing. One tab stop for the whole
 * strip, arrows to move between tabs, Home and End to jump — the WAI-ARIA pattern, and the reason this
 * component holds a ref at all.
 */
export function Tabs({
  items,
  activeId,
  onChange,
  ariaLabel,
  variant = 'pill',
}: {
  items: TabItem[]
  activeId: string
  onChange: (id: string) => void
  ariaLabel: string
  variant?: 'pill' | 'underline'
}) {
  const strip = useRef<HTMLDivElement>(null)

  function onKeyDown(event: React.KeyboardEvent) {
    const keys = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
    if (!keys.includes(event.key)) return
    event.preventDefault()

    const current = items.findIndex((item) => item.id === activeId)
    const last = items.length - 1
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? last
          : event.key === 'ArrowRight'
            ? // Wraps, which is what the pattern specifies and what a reader at the end expects.
              current >= last
              ? 0
              : current + 1
            : current <= 0
              ? last
              : current - 1

    onChange(items[next].id)
    // Focus follows selection: with `aria-selected` moving, focus must move with it or the next arrow press
    // is measured from a tab the user is no longer on.
    const buttons = strip.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
    buttons?.[next]?.focus()
  }

  const pill = variant === 'pill'

  return (
    // Scrolls rather than wraps: the number of tabs is not fixed, and a strip that reflows onto a second
    // line pushes everything below it down unpredictably.
    <div
      ref={strip}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        'flex max-w-full overflow-x-auto',
        pill ? 'gap-8 rounded-lg border border-hairline bg-paper p-8' : 'gap-24 border-b border-hairline',
      )}
    >
      {items.map((item) => {
        const active = item.id === activeId
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={active}
            // One tab stop for the strip: Tab reaches the tablist, arrows move inside it.
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(item.id)}
            className={cn(
              'shrink-0 text-body-sm font-semibold whitespace-nowrap',
              'transition-colors duration-(--duration-hover) ease-ui',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-blue',
              pill
                ? cn(
                    'rounded-lg px-16 py-8',
                    active ? 'bg-signal-blue text-paper' : 'text-slate-gray hover:bg-pebble hover:text-ink-navy',
                  )
                : cn(
                    // A transparent border on the inactive state, so selecting a tab does not shift the
                    // strip by two pixels.
                    'border-b-2 px-[2px] pb-12',
                    active
                      ? 'border-signal-blue text-ink-navy'
                      : 'border-transparent text-slate-gray hover:border-mist-gray hover:text-ink-navy',
                  ),
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'ml-8 text-caption font-medium tabular-nums',
                  pill
                    ? active
                      ? 'text-paper/75'
                      : 'text-mist-gray'
                    : active
                      ? 'text-slate-gray'
                      : 'text-mist-gray',
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
