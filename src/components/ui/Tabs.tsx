import { cn } from '@/lib/cn'

export interface TabItem {
  id: string
  label: string
  count?: number
}

/**
 * Pipeline switcher (R6). A tablist rather than a dropdown: with only two pipelines,
 * both destinations should be visible and one click away.
 */
export function Tabs({
  items,
  activeId,
  onChange,
  ariaLabel,
}: {
  items: TabItem[]
  activeId: string
  onChange: (id: string) => void
  ariaLabel: string
}) {
  return (
    // Scrolls rather than wraps: the number of pipelines is no longer fixed at two, and a
    // tab strip that reflows onto a second line pushes the board down unpredictably.
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="flex max-w-full gap-8 overflow-x-auto rounded-lg border border-hairline bg-paper p-8"
    >
      {items.map((item) => {
        const active = item.id === activeId
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={cn(
              'shrink-0 rounded-lg px-16 py-8 text-body-sm font-semibold whitespace-nowrap',
              'transition-colors duration-(--duration-hover) ease-ui',
              active ? 'bg-signal-blue text-paper' : 'text-slate-gray hover:bg-pebble hover:text-ink-navy',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={cn('ml-8 text-caption font-medium', active ? 'text-paper/75' : 'text-mist-gray')}>
                {item.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
