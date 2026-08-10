import { useCallback, useState } from 'react'
import type { DealView } from '@/lib/rollup'
import { useSelection } from '@/app/selection'
import { compactMoney, relativeToNow } from '@/lib/format'
import { reasonDetail } from '@/lib/health'
import { HealthBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'

/**
 * The hero is a work queue, not a summary.
 *
 * Spec 4.1 calls the dashboard an action surface. A count of what's wrong is still a
 * report — so this presents the deals needing attention *one at a time* and gives each one
 * two explicit ways out: deal with it, or say "not now". There is no third option that
 * quietly makes the card go away, because that is how a queue becomes wallpaper.
 *
 * Skips live in `sessionStorage`, deliberately:
 *
 *  - they survive navigating to the board and back, so a skip within one sitting sticks;
 *  - they do not survive tomorrow's sign-in, because an overdue deal you ignored on Monday
 *    is not resolved by Tuesday. Persisting them would let a rep permanently bury a problem
 *    with one click, which is the opposite of what this section is for.
 */
const SKIP_KEY = 'crm-dashboard-skipped'

function readSkipped(): Set<string> {
  try {
    const raw = window.sessionStorage.getItem(SKIP_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    // A corrupt or unavailable store must not take the dashboard down with it.
    return new Set()
  }
}

export function DashboardHero({
  queue,
  onViewDeals,
}: {
  /**
   * Every open deal that is at-risk or closing soon, worst first — uncapped, because the
   * headline counts this list and a capped one would under-report the work.
   */
  queue: DealView[]
  onViewDeals: () => void
}) {
  const { select } = useSelection()
  const [skipped, setSkipped] = useState<Set<string>>(readSkipped)

  const skip = useCallback((dealId: string) => {
    setSkipped((current) => {
      const next = new Set(current).add(dealId)
      try {
        window.sessionStorage.setItem(SKIP_KEY, JSON.stringify([...next]))
      } catch {
        // Skipping still works for this render; only its persistence is lost.
      }
      return next
    })
  }, [])

  const remaining = queue.filter((view) => !skipped.has(view.deal.id))
  const current = remaining[0] ?? null
  const position = queue.length - remaining.length + 1
  const skippedCount = queue.length - remaining.length

  // Two different empty states. "Nothing was ever wrong" and "you chose to move past it"
  // deserve different sentences — the second one should not read as praise.
  const headline = current
    ? queue.length === 1
      ? '1 deal needs you today.'
      : `${queue.length} deals need you today.`
    : skippedCount > 0
      ? 'Queue cleared for now.'
      : 'Nothing needs you right now.'

  const subcopy = current
    ? 'Overdue, gone quiet for three weeks, or closing this week. Work them one at a time.'
    : skippedCount > 0
      ? `You skipped ${skippedCount} ${skippedCount === 1 ? 'deal' : 'deals'}. They stay in the list below, and they will be waiting again tomorrow.`
      : 'Every open deal is on track and recently touched. Good time to work the top of the funnel.'

  return (
    <section className="grid items-center gap-48 py-32 lg:grid-cols-[1fr_400px]">
      <div>
        <p className="mb-16 text-caption font-semibold tracking-wide text-signal-blue uppercase">
          Today
        </p>
        <h1 className="max-w-[560px] text-heading font-bold text-ink-navy">{headline}</h1>
        <p className="mt-24 max-w-[480px] text-body-lg text-slate-gray">{subcopy}</p>

        <div className="mt-32 flex flex-wrap items-center gap-16">
          <Button variant={current ? 'outline' : 'primary'} onClick={onViewDeals}>
            Open all deals
          </Button>
          {current && (
            <p className="text-body-sm text-slate-gray tabular-nums">
              {position} of {queue.length}
            </p>
          )}
        </div>
      </div>

      {current ? (
        <div className="relative">
          {/* Atmosphere only — never a fill for a functional element (design.md). */}
          <div
            aria-hidden="true"
            className="absolute -top-32 -right-24 size-[220px] rounded-full bg-coral-magenta/35 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-24 -left-32 size-[180px] rounded-full bg-sky-cyan/30 blur-3xl"
          />

          <div
            // Announced when the queue advances, so the next deal isn't a silent swap.
            aria-live="polite"
            className="relative rounded-2xl bg-paper p-24 shadow-sm-2"
          >
            <div className="flex items-center justify-between gap-16">
              <span className="text-caption font-semibold tracking-wide text-slate-gray uppercase">
                Next up
              </span>
              <HealthBadge health={current.health} detail={current.healthDetail} />
            </div>

            <p className="mt-16 text-body-lg font-semibold text-ink-navy">{current.deal.name}</p>
            <p className="mt-8 text-body-sm text-slate-gray">{current.account.name}</p>

            {/* Says why it's here. A queue that doesn't explain itself gets dismissed. */}
            <p className="mt-16 text-body-sm font-semibold text-ink-navy">
              {reasonDetail(current.healthDetail)}
            </p>

            <div className="mt-24 flex items-end justify-between gap-16 border-t border-hairline pt-16">
              <span>
                <span className="block text-caption text-slate-gray">Value</span>
                <span className="block text-subheading font-bold text-ink-navy tabular-nums">
                  {compactMoney(current.deal.value)}
                </span>
              </span>
              <span className="text-right">
                <span className="block text-caption text-slate-gray">{current.stage.shortName}</span>
                <span className="block text-body-sm font-semibold text-ink-navy">
                  {relativeToNow(current.deal.expectedCloseDate)}
                </span>
              </span>
            </div>

            <div className="mt-24 flex flex-wrap items-center gap-8">
              <Button size="sm" onClick={() => select({ type: 'deal', id: current.deal.id })}>
                Open and update
              </Button>
              <Button variant="ghost" size="sm" onClick={() => skip(current.deal.id)}>
                Not now
              </Button>
            </div>
          </div>
        </div>
      ) : (
        skippedCount > 0 && (
          <div className="rounded-2xl border border-dashed border-hairline bg-cloud p-24 text-center">
            <p className="text-body-sm text-slate-gray">
              {skippedCount} skipped {skippedCount === 1 ? 'deal' : 'deals'} still need a decision.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-16"
              onClick={() => {
                setSkipped(new Set())
                try {
                  window.sessionStorage.removeItem(SKIP_KEY)
                } catch {
                  // Nothing to recover from: the in-memory reset above already happened.
                }
              }}
            >
              Bring them back
            </Button>
          </div>
        )
      )}
    </section>
  )
}
