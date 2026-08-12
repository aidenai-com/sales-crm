import type { DealView } from '@/lib/rollup'
import { useSelection } from '@/app/selection'
import { compactMoney, relativeToNow } from '@/lib/format'
import { HealthBadge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/Card'

/** Status-coded list. Every row opens the drawer — no row is a dead end (spec 4.1). */
export function HighPriorityDeals({ views }: { views: DealView[] }) {
  const { select } = useSelection()

  if (views.length === 0) {
    return (
      <EmptyState
        title="Every open deal is on track"
        hint="Nothing is overdue or has gone quiet. Deals will appear here as close dates approach."
      />
    )
  }

  return (
    <ul className="divide-y divide-hairline">
      {views.map((view) => (
        <li key={view.deal.id}>
          <button
            onClick={() => select({ type: 'deal', id: view.deal.id })}
            className="flex w-full items-center gap-16 py-16 text-left transition-colors hover:bg-cloud"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-body-sm font-semibold text-ink-navy">
                {view.deal.name}
              </span>
              <span className="mt-[2px] block truncate text-caption text-slate-gray">
                {view.account.name}
                {view.lead && ` · ${view.lead.businessUnit}`}
              </span>
            </span>

            <span className="hidden shrink-0 text-right sm:block">
              <span className="block text-body-sm font-semibold text-ink-navy tabular-nums">
                {compactMoney(view.deal.value)}
              </span>
              <span className="block text-caption text-slate-gray">
                {relativeToNow(view.deal.expectedCloseDate)}
              </span>
            </span>

            <HealthBadge health={view.health} detail={view.healthDetail} />
          </button>
        </li>
      ))}
    </ul>
  )
}
