import type { ActivityView } from '@/lib/rollup'
import { useSelection } from '@/app/selection'
import { timeAgo } from '@/lib/format'
import { activityKindLabel } from '@/lib/activityCategory'
import { ActivityMarker } from '@/components/ui/ActivityMarker'
import { EmptyState } from '@/components/ui/Card'

/** Recent activity across all three levels. Each entry opens its subject's drawer. */
export function RecentActivity({ views }: { views: ActivityView[] }) {
  const { select } = useSelection()

  if (views.length === 0) {
    return <EmptyState title="No activity logged yet" hint="Open any deal and log the first call or note." />
  }

  return (
    <ul className="divide-y divide-hairline">
      {views.map(({ activity, authorName, subjectLabel }) => (
        <li key={activity.id}>
          <button
            onClick={() => select({ type: activity.subjectType, id: activity.subjectId })}
            className="w-full py-16 text-left transition-colors hover:bg-cloud"
          >
            <div className="flex items-baseline justify-between gap-16">
              <span className="min-w-0 truncate text-body-sm font-semibold text-ink-navy">
                {subjectLabel}
              </span>
              <span className="shrink-0 text-caption text-mist-gray">{timeAgo(activity.occurredAt)}</span>
            </div>
            <div className="mt-8 flex gap-8">
              <ActivityMarker kind={activity.kind} />
              <p className="line-clamp-2 min-w-0 text-body-sm leading-relaxed text-slate-gray">
                {activity.summary}
              </p>
            </div>
            <p className="mt-8 pl-24 text-caption text-mist-gray">
              {activityKindLabel[activity.kind]} · {authorName}
            </p>
          </button>
        </li>
      ))}
    </ul>
  )
}
