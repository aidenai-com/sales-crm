import type { Activity } from '@/types/domain'
import { timeAgo } from '@/lib/format'
import { activityKindLabel } from '@/lib/activityCategory'
import { ActivityMarker } from '@/components/ui/ActivityMarker'

export function ActivityTimeline({
  activities,
  authorName,
}: {
  activities: Activity[]
  authorName: (id: string) => string
}) {
  if (activities.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-hairline bg-cloud px-16 py-24 text-center text-body-sm text-slate-gray">
        No activity logged yet. Add the first one above.
      </p>
    )
  }

  return (
    <ol className="space-y-16">
      {activities.map((activity) => (
        <li key={activity.id} className="flex gap-16">
          <div className="flex flex-col items-center pt-8">
            <ActivityMarker kind={activity.kind} className="mt-0" />
            <span className="mt-8 w-px flex-1 bg-hairline" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1 pb-8">
            <div className="flex flex-wrap items-baseline gap-8">
              <span className="text-body-sm font-semibold text-ink-navy">
                {activityKindLabel[activity.kind]}
              </span>
              <span className="text-caption text-slate-gray">
                {authorName(activity.authorId)} · {timeAgo(activity.occurredAt)}
              </span>
            </div>
            <p className="mt-8 text-body-sm leading-relaxed text-slate-gray">{activity.summary}</p>
          </div>
        </li>
      ))}
    </ol>
  )
}
