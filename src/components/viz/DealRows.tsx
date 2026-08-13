import type { AnalyticsDeal } from '@/types/domain'
import { cn } from '@/lib/cn'
import { compactMoney, shortDate } from '@/lib/format'
import { HealthDot } from '@/components/ui/Badge'

/**
 * The bottom of every drill: the deals behind one bar.
 *
 * Horizontal bars because deal names are long and *are* the label somebody drilled for — a name under a
 * vertical column either truncates or turns sideways. Sorted by value descending, because the reason anyone
 * clicked a bar was to find out which deals make up the number.
 *
 * Each row carries its **health and its stage** rather than only a length, which is the upgrade over plain
 * ranked bars: a reader at the leaf is deciding what to do next, and "biggest" is not the same question as
 * "biggest and slipping". The dot is the same `HealthDot` the board and the deals index use, so a deal looks
 * the same wherever it is met.
 *
 * The whole row is the control and it opens the application's own deal drawer — not a chart-specific panel.
 * A deal reached from a chart should behave exactly like a deal reached from anywhere else.
 */

export function DealRows({
  deals,
  onOpen,
  /** Hidden when every row is in the same stage — a column of identical chips is noise. */
  showStage = true,
}: {
  deals: AnalyticsDeal[]
  onOpen: (id: string) => void
  showStage?: boolean
}) {
  const sorted = [...deals].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name))
  const max = Math.max(1, ...sorted.map((deal) => deal.value))

  return (
    <ol className="divide-y divide-hairline">
      {sorted.map((deal) => (
        <li key={deal.id} className="-mx-8">
          <button
            type="button"
            onClick={() => onOpen(deal.id)}
            aria-label={`${deal.name} at ${deal.accountName} — open this deal`}
            className={cn(
              'grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-16 rounded-lg px-8 py-12 text-left',
              'cursor-pointer transition-colors duration-(--duration-hover) ease-ui hover:bg-cloud',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-blue',
            )}
          >
            <span className="min-w-0">
              <span className="flex items-center gap-8">
                <HealthDot health={deal.health} />
                <span className="min-w-0 truncate text-body-sm font-semibold text-ink-navy">
                  {deal.name}
                </span>
                {showStage && (
                  <span className="shrink-0 rounded-md bg-pebble px-8 text-caption font-semibold text-slate-gray">
                    {deal.stageShortName}
                  </span>
                )}
              </span>

              <span className="mt-[2px] block truncate text-caption text-slate-gray">
                {deal.accountName} · {deal.ownerName} · closes {shortDate(deal.expectedCloseDate)}
              </span>

              <span
                aria-hidden
                className="mt-8 block h-[6px] rounded-[3px] bg-viz-1 transition-[width] duration-300 ease-ui motion-reduce:transition-none"
                style={{ width: `${Math.max((deal.value / max) * 100, 2)}%` }}
              />
            </span>

            <span className="shrink-0 text-right text-body-sm font-semibold text-ink-navy tabular-nums">
              {compactMoney(deal.value)}
            </span>
          </button>
        </li>
      ))}
    </ol>
  )
}
