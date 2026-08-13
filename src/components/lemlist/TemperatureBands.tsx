import type { LemlistProspect } from '@/types/domain'
import { cn } from '@/lib/cn'

/**
 * The shape of the outreach book, as a filter.
 *
 * This replaces a state dropdown, and the replacement is the point. A dropdown hides the distribution behind
 * a click: you cannot tell from a closed `<select>` whether twelve people replied or none did, so the first
 * thing anybody does is open it and try each option. These bands *are* the census — the counts are visible
 * before you touch anything, and clicking one is how you act on what you just read.
 *
 * Five bands rather than lemlist's fifty event types, because a rep's actual question is not "who is at
 * `linkedinInviteAccepted`" but "who is worth a call". The bands collapse the vocabulary into that question
 * and are ordered by it: warmest first, dead last, which is also roughly the order of scarcity.
 *
 * `Dead` is deliberately included rather than hidden. A list that quietly omits bounces makes an outreach
 * campaign look better than it is, and the number of closed doors is a real measure of list quality.
 */

export type Band = 'all' | 'won' | 'replied' | 'engaged' | 'sent' | 'dead'

/**
 * Which band a prospect belongs to, from the derived funnel step rather than the raw state.
 *
 * One definition, used for both the counts and the filtering, so a band can never show a count it then fails
 * to produce rows for.
 */
export function bandOf(prospect: LemlistProspect): Exclude<Band, 'all'> {
  if (prospect.deadEnd) return 'dead'
  if (prospect.funnelStep >= 5) return 'won'
  if (prospect.funnelStep === 4) return 'replied'
  if (prospect.funnelStep >= 2) return 'engaged'
  return 'sent'
}

const BANDS: Array<{
  value: Exclude<Band, 'all'>
  label: string
  /** What this band means, in the words a rep would use. Shown as the control's title. */
  hint: string
  /** The dot's fill, from the same sequential ramp the trail uses. */
  dot: string
}> = [
  { value: 'won', label: 'Booked', hint: 'Interested, or a meeting on the calendar', dot: 'bg-deep-cobalt' },
  { value: 'replied', label: 'Replied', hint: 'They wrote back', dot: 'bg-signal-blue' },
  { value: 'engaged', label: 'Engaged', hint: 'Opened or clicked, no reply yet', dot: 'bg-sky-cyan' },
  { value: 'sent', label: 'Sent', hint: 'Contacted, nothing back yet', dot: 'bg-mist-gray' },
  { value: 'dead', label: 'Dead', hint: 'Bounced or unsubscribed', dot: 'bg-risk' },
]

export function TemperatureBands({
  prospects,
  value,
  onChange,
}: {
  /** The unfiltered set, so the counts describe the book rather than the current filter. */
  prospects: LemlistProspect[]
  value: Band
  onChange: (band: Band) => void
}) {
  const counts = new Map<string, number>()
  for (const prospect of prospects) {
    const band = bandOf(prospect)
    counts.set(band, (counts.get(band) ?? 0) + 1)
  }

  return (
    <div
      role="group"
      aria-label="Filter prospects by how far they got"
      className="flex flex-wrap items-stretch gap-8"
    >
      <BandButton
        active={value === 'all'}
        count={prospects.length}
        label="Everyone"
        hint="Every imported prospect"
        onClick={() => onChange('all')}
      />

      {BANDS.map((band) => {
        const count = counts.get(band.value) ?? 0
        return (
          <BandButton
            key={band.value}
            active={value === band.value}
            count={count}
            label={band.label}
            hint={band.hint}
            dot={band.dot}
            // An empty band stays visible but unclickable: hiding it would make the census incomplete, and
            // enabling it would offer a filter that can only return nothing.
            disabled={count === 0}
            onClick={() => onChange(band.value)}
          />
        )
      })}
    </div>
  )
}

function BandButton({
  active,
  count,
  label,
  hint,
  dot,
  disabled,
  onClick,
}: {
  active: boolean
  count: number
  label: string
  hint: string
  dot?: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      title={hint}
      className={cn(
        'group flex min-w-[104px] flex-col items-start gap-[2px] rounded-xl border px-16 py-8 text-left',
        'transition-[background-color,border-color,box-shadow] duration-(--duration-hover) ease-ui',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-blue',
        active
          ? 'border-signal-blue bg-paper shadow-sm'
          : disabled
            ? 'cursor-not-allowed border-hairline bg-cloud opacity-60'
            : 'border-hairline bg-cloud hover:border-mist-gray hover:bg-paper',
      )}
    >
      {/* The count leads, at body scale, because the number is the thing being read. The label is the
          caption under it — the opposite of a chip, where the word leads and a number trails in parentheses. */}
      <span
        className={cn(
          'text-body-lg leading-none font-bold tabular-nums',
          active ? 'text-ink-navy' : count === 0 ? 'text-mist-gray' : 'text-ink-navy',
        )}
      >
        {count}
      </span>
      <span className="flex items-center gap-[4px] text-caption font-semibold text-slate-gray">
        {dot && <span aria-hidden="true" className={cn('size-8 shrink-0 rounded-full', dot)} />}
        {label}
      </span>
    </button>
  )
}
