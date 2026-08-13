import { useState } from 'react'
import { cn } from '@/lib/cn'

/**
 * Ranked horizontal bars, and the one figure that needs a comparison beside it.
 *
 * This file used to hold a probability-nesting encoding — open value with a weighted portion drawn inside
 * it — plus a stage ladder built around the same idea. All of it is gone. Weighted value was
 * `value × stage percentage`, and that percentage marks how far along a deal is rather than how likely it
 * is to be won, so the nesting drew a relationship that did not exist. Removing the second series took the
 * legend with it: one measure per chart, and the count rides as text.
 *
 * What remains is the form these bars were always right for: **magnitude by identity.** Names need
 * horizontal room, and a reader compares lengths down a column far more accurately than heights across
 * one. Every drill-down leaf in the application uses this, because the question at a leaf is always "which
 * of these is biggest" with a label too long to sit under a vertical bar.
 */

export interface RankedRow {
  key: string
  label: string
  /** Bar length — the measure the ranking is by. */
  primary: number
  primaryDisplay: string
  /** Shown in place of the primary figure on hover: the fact the bar length cannot carry. */
  meta: string
  /**
   * A second, genuinely independent measure, drawn as its own short bar beneath.
   *
   * Optional, and rarely used on purpose. It is honest for open pipeline against closed-won — money banked
   * is not a fraction of money in play — and dishonest for anything that is a share of the primary, which
   * is exactly the mistake the nested encoding used to make.
   */
  secondary?: number
  secondaryDisplay?: string
  /** Marks a row as drillable. Rows without it are inert and show no affordance. */
  selectable?: boolean
}

export function RankedRows({
  rows,
  primaryLabel,
  secondaryLabel,
  onSelect,
  selectHint,
}: {
  rows: RankedRow[]
  primaryLabel: string
  secondaryLabel?: string
  /** Called with the row key. Rows become buttons only when this is supplied. */
  onSelect?: (key: string) => void
  /** What clicking does, for the row's accessible name — "Show deals in this stage". */
  selectHint?: string
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const hasSecondary = rows.some((row) => row.secondary !== undefined)
  const max = Math.max(
    1,
    ...rows.flatMap((row) => [row.primary, row.secondary ?? 0]),
  )

  return (
    <div>
      {/* A legend only when there are genuinely two measures. One series needs no key — the panel title
          names it, and a legend box for a single colour is furniture. */}
      {hasSecondary && secondaryLabel && (
        <ul className="flex flex-wrap items-center gap-16 pb-16">
          <li className="flex items-center gap-8">
            <span aria-hidden className="h-8 w-16 shrink-0 rounded-[3px] bg-viz-1" />
            <span className="text-caption text-slate-gray">{primaryLabel}</span>
          </li>
          <li className="flex items-center gap-8">
            <span aria-hidden className="h-8 w-16 shrink-0 rounded-[3px] bg-viz-2" />
            <span className="text-caption text-slate-gray">{secondaryLabel}</span>
          </li>
        </ul>
      )}

      <ol className="divide-y divide-hairline">
        {rows.map((row, index) => {
          const clickable = onSelect !== undefined && row.selectable !== false
          const body = (
            <>
              <span className="w-16 shrink-0 text-caption font-semibold text-mist-gray tabular-nums">
                {index + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-[12px]">
                  <span className="min-w-0 truncate text-body-sm font-semibold text-ink-navy">
                    {row.label}
                  </span>
                  {/* The figure swaps for the meta on hover rather than showing both: two numbers on one
                      line and neither is read. */}
                  <span className="shrink-0 text-caption text-slate-gray tabular-nums">
                    {hovered === row.key ? row.meta : row.primaryDisplay}
                  </span>
                </div>

                <div className="mt-8 space-y-[3px]">
                  <Track value={row.primary} max={max} fill="bg-viz-1" />
                  {row.secondary !== undefined && (
                    <Track value={row.secondary} max={max} fill="bg-viz-2" />
                  )}
                </div>
              </div>

              {clickable && <Chevron />}
            </>
          )

          const shell =
            '-mx-8 flex w-full items-center gap-[12px] px-8 py-[12px] text-left transition-colors duration-hover ease-ui'

          return (
            <li
              key={row.key}
              onMouseEnter={() => setHovered(row.key)}
              onMouseLeave={() => setHovered(null)}
            >
              {clickable ? (
                <button
                  type="button"
                  onClick={() => onSelect?.(row.key)}
                  aria-label={selectHint ? `${row.label} — ${selectHint}` : row.label}
                  className={cn(
                    shell,
                    'cursor-pointer hover:bg-cloud',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-blue',
                  )}
                >
                  {body}
                </button>
              ) : (
                <div className={cn(shell, 'hover:bg-cloud')}>{body}</div>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

/** The drill affordance. Present only on rows that go somewhere, so it means one thing. */
function Chevron() {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className="size-16 shrink-0 text-mist-gray"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
    >
      <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function Track({ value, max, fill }: { value: number; max: number; fill: string }) {
  return (
    <div className="h-8 overflow-hidden rounded-[3px] bg-viz-track">
      <div
        className={cn(
          'h-full rounded-[3px] transition-[width] duration-300 ease-ui motion-reduce:transition-none',
          fill,
        )}
        style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
      />
    </div>
  )
}

/**
 * One headline figure with the previous period beside it.
 *
 * The comparison is the whole component. "$8.4M created" is a number nobody can act on; "$8.4M, up from
 * $5.1M last quarter" is a finding. The delta is stated in words as well as colour, because up and down
 * are the two things a red-green pair fails to communicate to the readers who most need them.
 */
export function DeltaFigure({
  label,
  value,
  meta,
  priorValue,
  priorDisplay,
  priorLabel,
  currentValue,
}: {
  label: string
  value: string
  meta: string
  /** Raw numbers, for the direction. The displays are pre-formatted. */
  currentValue: number
  priorValue: number
  priorDisplay: string
  priorLabel: string
}) {
  const delta = currentValue - priorValue
  // A percentage against zero is undefined, not infinite — so it is simply not shown. "New" is the honest
  // word for pipeline where there was none before.
  const percent = priorValue > 0 ? Math.round((delta / priorValue) * 100) : null
  const direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'level'

  return (
    <div>
      <p className="text-caption font-semibold tracking-wide text-slate-gray uppercase">{label}</p>
      <p className="mt-8 text-heading-sm leading-none font-bold text-ink-navy tabular-nums">{value}</p>
      <p className="mt-8 text-caption text-slate-gray">{meta}</p>

      <p className="mt-16 flex flex-wrap items-baseline gap-8 text-caption">
        <span
          className={cn(
            'font-semibold',
            direction === 'up'
              ? 'text-signal-blue'
              : direction === 'down'
                ? 'text-risk'
                : 'text-slate-gray',
          )}
        >
          {priorValue === 0
            ? currentValue > 0
              ? 'All new'
              : 'Nothing either period'
            : direction === 'level'
              ? 'Level with'
              : `${direction === 'up' ? 'Up' : 'Down'}${percent !== null ? ` ${Math.abs(percent)}%` : ''} on`}
        </span>
        <span className="text-slate-gray tabular-nums">
          {priorLabel} ({priorDisplay})
        </span>
      </p>
    </div>
  )
}
