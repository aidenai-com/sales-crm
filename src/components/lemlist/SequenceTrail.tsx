import { cn } from '@/lib/cn'

/**
 * How far a prospect got along the outreach sequence, as five marks.
 *
 * This is the one deliberately unusual thing on the Prospects screen, and the argument for it is that
 * **outreach is genuinely a sequence** — you cannot open an email nobody sent, or reply to one you never
 * opened. An ordered display is therefore describing the mechanics rather than decorating them, which is the
 * only justification for a stepped device.
 *
 * It replaces a status pill as the primary read. A pill answers "what happened last" in a word you have to
 * stop and read; two hundred pills down a column are two hundred words. Five marks answer "how far did this
 * go" as a *shape*, so a full page of prospects can be triaged by scanning a single column, and the outliers
 * — the one person who replied among fifty who only opened — surface without being looked for.
 *
 * The word is not lost: the state is still written beside the trail at row scale, and the step labels appear
 * in the expanded detail. The shape is the index; the word is the confirmation.
 *
 * Colour deepens with progress rather than changing hue — mist grey for unreached, `sky-cyan` for the middle
 * steps, `signal-blue` at a reply, `deep-cobalt` at a booked meeting. That is a sequential ramp, which is
 * what a sequence deserves, and it stays legible to a colourblind reader because the *number* of filled
 * marks carries the same information as the colour.
 *
 * A dead end — bounced, unsubscribed — is drawn as a break rather than as a shorter trail, because "the door
 * closed at step two" is a different fact from "we are at step two and still going", and a shorter trail
 * would say the second thing.
 */

export const STEP_LABELS = ['Sent', 'Opened', 'Clicked', 'Replied', 'Booked'] as const

const STEP_COUNT = STEP_LABELS.length

/** The fill for the furthest reached mark. Earlier marks take the same colour, one step quieter. */
function fillFor(step: number, dead: boolean): string {
  if (dead) return 'bg-risk'
  if (step >= 5) return 'bg-deep-cobalt'
  if (step >= 4) return 'bg-signal-blue'
  if (step >= 2) return 'bg-sky-cyan'
  return 'bg-mist-gray'
}

export function SequenceTrail({
  step,
  dead = false,
  size = 'md',
}: {
  /** 0 = never contacted, 5 = meeting booked. */
  step: number
  dead?: boolean
  size?: 'sm' | 'md'
}) {
  const reached = Math.max(0, Math.min(STEP_COUNT, step))
  const fill = fillFor(reached, dead)
  const bar = size === 'sm' ? 'h-[3px] w-12' : 'h-[4px] w-16'

  // One sentence for assistive tech, because five decorative bars say nothing out loud.
  const spoken = dead
    ? `Stopped at ${STEP_LABELS[Math.max(0, reached - 1)] ?? 'no contact'} — bounced or unsubscribed`
    : reached === 0
      ? 'Not contacted yet'
      : `Reached ${STEP_LABELS[reached - 1]}, step ${reached} of ${STEP_COUNT}`

  return (
    <span className="inline-flex items-center gap-[3px]" role="img" aria-label={spoken}>
      {STEP_LABELS.map((label, index) => {
        const filled = index < reached
        return (
          <span
            key={label}
            aria-hidden="true"
            title={label}
            className={cn(
              'block rounded-full transition-colors duration-(--duration-hover) ease-ui',
              bar,
              filled ? fill : 'bg-hairline',
            )}
          />
        )
      })}

      {/* The break. Placed after the marks so the trail still reads left to right as progress, with the
          closure as its terminal punctuation. */}
      {dead && (
        <span aria-hidden="true" className="ml-[2px] text-caption leading-none font-bold text-risk">
          ×
        </span>
      )}
    </span>
  )
}

/**
 * The same trail with its steps named, for the expanded row.
 *
 * At detail scale there is room for the words, and the words are what teach somebody to read the compact
 * version in the rows above.
 */
export function SequenceTrailLegend({ step, dead = false }: { step: number; dead?: boolean }) {
  const reached = Math.max(0, Math.min(STEP_COUNT, step))
  const fill = fillFor(reached, dead)

  return (
    <ol className="flex flex-wrap items-center gap-[2px]">
      {STEP_LABELS.map((label, index) => {
        const filled = index < reached
        const furthest = index === reached - 1
        return (
          <li key={label} className="flex items-center gap-[2px]">
            <span
              className={cn(
                'rounded-md px-8 py-[2px] text-caption font-semibold whitespace-nowrap',
                filled
                  ? furthest && !dead
                    ? cn(fill, 'text-paper')
                    : 'bg-pebble text-slate-gray'
                  : 'text-mist-gray',
                furthest && dead && 'bg-risk-fill text-risk',
              )}
            >
              {label}
            </span>
            {index < STEP_COUNT - 1 && (
              <span aria-hidden="true" className={cn('text-caption', filled ? 'text-mist-gray' : 'text-hairline')}>
                ›
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
