import type { ActivityView } from '@/lib/rollup'
import type { Activity } from '@/types/domain'
import { useSelection } from '@/app/selection'
import { timeAgo } from '@/lib/format'
import { EmptyState } from '@/components/ui/Card'

const kindLabel: Record<Activity['kind'], string> = {
  call: 'Call',
  meeting: 'Meeting',
  email: 'Email',
  note: 'Note',
  'stage-change': 'Stage change',
}

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
            <p className="mt-8 line-clamp-2 text-body-sm leading-relaxed text-slate-gray">
              {activity.summary}
            </p>
            <p className="mt-8 text-caption text-mist-gray">
              {kindLabel[activity.kind]} · {authorName}
            </p>
          </button>
        </li>
      ))}
    </ul>
  )
}
