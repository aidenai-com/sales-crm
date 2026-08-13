import type { ChampionGap, Id } from '@/types/domain'
import { useStore } from '@/data/store'
import { cn } from '@/lib/cn'

/**
 * Whether this deal fails the champion requirement of the stage it is *currently in*.
 *
 * The gate itself only refuses transitions, which leaves a state it cannot see: a deal that entered a
 * stage before an admin switched the requirement on, or whose champion was unmapped afterwards. Those
 * deals are not refused anything until somebody tries to move them on, so without this they would look
 * perfectly healthy right up to the moment they are blocked.
 *
 * Read from the snapshot rather than fetched per deal: the answer is needed on every card of a board,
 * and a request per card would be a request per card.
 */
export function useChampionGap(dealId: Id): ChampionGap | null {
  const { snapshot } = useStore()
  return snapshot.championGaps.find((gap) => gap.dealId === dealId) ?? null
}

/**
 * The full statement, for a deal page or drawer: what is missing, and what it will cost.
 *
 * Blue rather than red, and deliberately not a new colour. This is not a failure — the deal is fine,
 * and in most cases entirely legitimate — it is work that has to happen before the deal can move on.
 * Risk red is reserved for a deal that is actually in trouble, and spending it here would make both
 * warnings mean less. The theme also keeps exactly one hue beyond blue on purpose, so inventing an
 * amber for this would cost more than it bought; the icon and the label carry the distinction.
 */
export function ChampionWarning({ gap, className }: { gap: ChampionGap; className?: string }) {
  return (
    <div
      className={cn(
        'flex items-start gap-12 rounded-2xl border border-signal-blue bg-badge-fill px-16 py-12',
        className,
      )}
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="mt-[2px] size-16 shrink-0 text-deep-cobalt"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <path d="M8 2.5 1.5 13.5h13L8 2.5Z" strokeLinejoin="round" />
        <path d="M8 6.5v3.25M8 11.75v.5" strokeLinecap="round" />
      </svg>
      <div className="min-w-0">
        <p className="text-body-sm font-semibold text-ink-navy">Champion needed to move on</p>
        <p className="mt-[2px] text-caption text-slate-gray">{gap.detail}</p>
      </div>
    </div>
  )
}

/**
 * The same fact at card size: a word, not a sentence.
 *
 * The full reason is one click away on the deal itself, and a card that tried to carry it would push
 * the value and the owner off the bottom of a board column.
 */
export function ChampionBadge({ gap }: { gap: ChampionGap }) {
  return (
    <span
      title={gap.detail}
      className="inline-flex shrink-0 items-center gap-[4px] rounded-full bg-badge-fill px-8 py-[2px] text-caption font-semibold text-deep-cobalt"
    >
      <svg
        viewBox="0 0 16 16"
        aria-hidden="true"
        className="size-8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      >
        <path d="M8 2.5 1.5 13.5h13L8 2.5Z" strokeLinejoin="round" />
      </svg>
      Champion
    </span>
  )
}
