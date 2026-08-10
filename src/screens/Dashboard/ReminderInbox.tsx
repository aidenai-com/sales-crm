import type { Reminder, StaleLeadNudge } from '@/types/domain'
import { useReminders } from '@/hooks/useReminders'
import { useSelection } from '@/app/selection'
import { relativeToNow, shortDate, timeAgo } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { Skeleton } from '@/components/ui/Skeleton'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'

/**
 * The first thing on the Dashboard: what has a date on it, and what has gone quiet.
 *
 * Two feedback items land here. "Show reminders for upcoming activities" is the explicit
 * half — rows a rep scheduled against a record. "If no action is taken on a potential lead
 * for a week share a reminder to follow up" is the derived half, computed server-side on
 * every read rather than stored, so it corrects itself as the calendar moves.
 *
 * Above the work queue rather than beside it, because a reminder is dated and the queue is
 * not: something due today outranks the largest at-risk deal, which will still be there in
 * an hour.
 *
 * The whole card disappears when there is nothing due. An empty inbox on a dashboard is a
 * panel that trains people to ignore that part of the screen.
 */
export function ReminderInbox() {
  const { inbox, loading, error, pendingId, complete } = useReminders()

  if (loading && !inbox) return <Skeleton className="mt-24 h-[132px] rounded-3xl" />

  // A failed inbox is not a failed dashboard. The queue below it is the more important
  // surface and still works, so this stays quiet rather than taking the page.
  if (error || !inbox || inbox.totalCount === 0) return null

  return (
    <Card className="mt-24">
      <div className="mb-16 flex flex-wrap items-baseline justify-between gap-16">
        <h2 className="text-body-lg font-semibold text-ink-navy">Needs a follow-up</h2>
        <p className="text-caption text-slate-gray">
          {inbox.overdue.length > 0 && `${inbox.overdue.length} overdue · `}
          {inbox.upcoming.length} upcoming · {inbox.staleLeads.length} quiet lead
          {inbox.staleLeads.length === 1 ? '' : 's'}
        </p>
      </div>

      <ul className="space-y-8">
        {/* Overdue first, then what is coming, then what has simply gone quiet — the order
            a rep would triage them in. */}
        {inbox.overdue.map((reminder) => (
          <ReminderRow
            key={reminder.id}
            reminder={reminder}
            pending={pendingId === reminder.id}
            onComplete={() => void complete(reminder.id)}
          />
        ))}
        {inbox.upcoming.map((reminder) => (
          <ReminderRow
            key={reminder.id}
            reminder={reminder}
            pending={pendingId === reminder.id}
            onComplete={() => void complete(reminder.id)}
          />
        ))}
        {inbox.staleLeads.map((nudge) => (
          <StaleLeadRow key={nudge.leadId} nudge={nudge} />
        ))}
      </ul>
    </Card>
  )
}

function ReminderRow({
  reminder,
  pending,
  onComplete,
}: {
  reminder: Reminder
  pending: boolean
  onComplete: () => void
}) {
  const { select } = useSelection()

  return (
    <li className="flex items-center gap-16 rounded-2xl border border-hairline bg-cloud px-16 py-8">
      <button
        type="button"
        onClick={onComplete}
        disabled={pending}
        aria-label={`Mark "${reminder.title}" complete`}
        className="grid size-16 shrink-0 place-items-center rounded-md border border-mist-gray transition-colors duration-hover ease-ui hover:border-signal-blue disabled:opacity-50"
      >
        {pending && <Spinner className="size-8 text-signal-blue" label="Completing" />}
      </button>

      <button
        type="button"
        onClick={() => select({ type: reminder.subjectType, id: reminder.subjectId })}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-body-sm font-semibold text-ink-navy">
          {reminder.title}
        </span>
        <span className="block truncate text-caption text-slate-gray">
          {reminder.subjectLabel} · {reminder.assigneeName}
        </span>
      </button>

      {/* Overdue is a state, so it gets the status colour *and* the words — "3 days overdue"
          reads the same to someone who cannot see the red. */}
      <span
        className={cn(
          'shrink-0 text-caption font-semibold tabular-nums',
          reminder.overdue ? 'text-risk' : 'text-slate-gray',
        )}
        title={shortDate(reminder.dueAt)}
      >
        {relativeToNow(reminder.dueAt)}
      </span>
    </li>
  )
}

/**
 * A quiet lead. No checkbox, because there is nothing to tick off — the nudge is derived
 * from the absence of activity, and the only thing that clears it is logging some.
 */
function StaleLeadRow({ nudge }: { nudge: StaleLeadNudge }) {
  const { select } = useSelection()

  return (
    <li className="flex items-center gap-16 rounded-2xl border border-dashed border-hairline bg-cloud px-16 py-8">
      <span aria-hidden className="size-16 shrink-0" />

      <button
        type="button"
        onClick={() => select({ type: 'lead', id: nudge.leadId })}
        className="min-w-0 flex-1 text-left"
      >
        <span className="block truncate text-body-sm font-semibold text-ink-navy">
          Follow up: {nudge.accountName} · {nudge.businessUnit}
        </span>
        <span className="block truncate text-caption text-slate-gray">
          {nudge.ownerName}
          {nudge.openDealCount > 0 &&
            ` · ${nudge.openDealCount} open deal${nudge.openDealCount === 1 ? '' : 's'}`}
        </span>
      </button>

      <span className="shrink-0 text-caption text-slate-gray tabular-nums">
        {nudge.lastActivityAt ? timeAgo(nudge.lastActivityAt) : 'never touched'}
      </span>
    </li>
  )
}
