import { useEffect } from 'react'
import { cn } from '@/lib/cn'

/**
 * Where a drill currently is, and the way back out.
 *
 * A breadcrumb rather than a back button, because a drill has a *shape* — `All pipelines / AidenAI Direct /
 * Discover & Qualify` — and a reader three levels down needs to know which three, not merely that there is
 * an up. Every crumb is clickable, so returning two levels is one click rather than two.
 *
 * The summary on the right is the other half of the component. When you drill, the numbers in the KPI band
 * above deliberately do not change — they stay the stable anchor describing the whole filtered set — so the
 * subset you have opened has to state its own total somewhere, or the panel is a chart of an unnamed
 * quantity.
 *
 * `Escape` goes up one level. A drill is a temporary excursion and Escape is what closes those everywhere
 * else in the product.
 */

export interface Crumb {
  /** Null for the root crumb, which is a label rather than a destination. */
  param: string | null
  label: string
}

export function DrillPath({
  crumbs,
  summary,
  onNavigate,
  onEscape,
}: {
  /** Root first. The last crumb is the current position and is not a link. */
  crumbs: Crumb[]
  /** The drilled subset in words — "3 deals · $8.9M". Omitted at the root, where the KPI band says it. */
  summary?: string
  /** Called with the param of the crumb clicked; that level and everything below it is cleared. */
  onNavigate: (param: string) => void
  onEscape: () => void
}) {
  const deep = crumbs.length > 1

  useEffect(() => {
    if (!deep) return
    function onKey(event: KeyboardEvent) {
      // Ignored while typing: the filter bar has a text field, and Escape there means "clear the field".
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return
      if (event.key === 'Escape') onEscape()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deep, onEscape])

  const back = crumbs[crumbs.length - 2]

  return (
    <div className="flex flex-wrap items-center justify-between gap-8 pb-16">
      <nav aria-label="Drill path" className="flex min-w-0 flex-wrap items-center gap-8">
        {/* An explicit control beside the crumbs, not instead of them. The crumbs say *where you are*, which
            a Back button cannot; Back says *how to leave*, which a line of small text is easy to miss —
            especially the first time somebody drills and does not yet know the trail is clickable. */}
        {deep && (
          <button
            type="button"
            onClick={() => onNavigate(back?.param ?? crumbs[crumbs.length - 1].param!)}
            className="inline-flex shrink-0 items-center gap-[4px] rounded-lg border border-hairline bg-paper px-8 py-[2px] text-caption font-semibold text-signal-blue transition-colors duration-(--duration-hover) ease-ui hover:border-signal-blue hover:bg-badge-fill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-blue"
          >
            <span aria-hidden="true">←</span>
            Back
          </button>
        )}

        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1
          return (
            <span key={`${crumb.param ?? 'root'}-${crumb.label}`} className="flex items-baseline gap-[4px]">
              {index > 0 && (
                <span aria-hidden="true" className="text-caption text-mist-gray">
                  /
                </span>
              )}
              {last || crumb.param === null ? (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={cn(
                    'text-caption font-semibold',
                    last ? 'text-ink-navy' : 'text-slate-gray',
                  )}
                >
                  {crumb.label}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate(crumb.param!)}
                  className="rounded-md px-[2px] text-caption font-semibold text-signal-blue transition-colors duration-(--duration-hover) ease-ui hover:bg-pebble focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-blue"
                >
                  {crumb.label}
                </button>
              )}
            </span>
          )
        })}
      </nav>

      {/* Announced, because a drill changes what the panel describes without moving focus — a sighted
          reader sees the bars redraw and a screen-reader user would otherwise get nothing. */}
      <p aria-live="polite" className="shrink-0 text-caption text-slate-gray tabular-nums">
        {summary}
        {deep && (
          <span className="ml-8 text-mist-gray">
            <kbd className="font-sans">Esc</kbd> to go back
          </span>
        )}
      </p>
    </div>
  )
}
