import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { compactMoney, count } from '@/lib/format'

/**
 * Components for the shape this application actually has: an ordered ladder of stages, each
 * carrying a probability that converts an open number into a weighted one.
 *
 * The generic form these replace was grouped two-series bars — open value beside weighted
 * value, once per panel, four panels alike. It misreports the relationship. Weighted value is
 * `open × probability`, so it is a *part* of the open figure and can never exceed it. Drawn
 * side by side, two bars say "two independent measures"; drawn nested, they say "this much of
 * that is what we expect to land", which is the sentence a pipeline review is actually having.
 *
 * That nesting is the one encoding used everywhere on the screen, which is also what stops
 * every panel looking like the last one: with containment carrying open-against-weighted, the
 * second series slot is freed for the one place two measures really are independent — open
 * pipeline against closed-won, per person and per partner.
 */

/**
 * Open value, with the weighted portion nested inside it.
 *
 * Three layers, outermost first: the track is the full scale, so bars are comparable across
 * rows; the open fill is this row's share of it; the weighted fill sits inside the open fill.
 * The 2px surface ring on the inner fill is what keeps two blues from reading as one shape —
 * without it the nested bar's end is indistinguishable from a gradient.
 */
export function ProbabilityBar({
  openValue,
  weightedValue,
  max,
  /** Drawn at the bar's end, in ink rather than in the series colour. */
  trailing,
}: {
  openValue: number
  weightedValue: number
  max: number
  trailing?: ReactNode
}) {
  const openPercent = max > 0 ? (openValue / max) * 100 : 0
  // Of the open bar, not of the scale: the inner bar is a proportion of its parent.
  const weightedPercent = openValue > 0 ? (weightedValue / openValue) * 100 : 0

  return (
    <div className="flex items-center gap-[12px]">
      <div className="h-16 min-w-0 flex-1 overflow-hidden rounded-md bg-viz-track">
        <div
          className="h-full rounded-md bg-viz-1/35 transition-[width] duration-300 ease-ui motion-reduce:transition-none"
          style={{ width: `${openPercent}%` }}
        >
          {/* Inset by 2px on the cross axis so the parent fill stays visible as a frame. */}
          <div className="flex h-full items-center px-[2px]">
            <div
              className="h-[12px] rounded-[3px] bg-viz-1 transition-[width] duration-300 ease-ui motion-reduce:transition-none"
              style={{ width: `${weightedPercent}%` }}
            />
          </div>
        </div>
      </div>
      {trailing && (
        <span className="shrink-0 text-body-sm font-semibold text-ink-navy tabular-nums">
          {trailing}
        </span>
      )}
    </div>
  )
}

/** The legend for the nesting, spelled out once per panel that uses it. */
export function ProbabilityLegend() {
  return (
    <ul className="flex flex-wrap items-center gap-16">
      <li className="flex items-center gap-8">
        <span aria-hidden className="h-8 w-16 shrink-0 rounded-[3px] bg-viz-1" />
        <span className="text-caption text-slate-gray">Weighted</span>
      </li>
      <li className="flex items-center gap-8">
        <span aria-hidden className="h-8 w-16 shrink-0 rounded-[3px] bg-viz-1/35" />
        <span className="text-caption text-slate-gray">Open, unweighted</span>
      </li>
    </ul>
  )
}

export interface LadderStage {
  key: string
  name: string
  /** The stage's own configured colour, as the board and the deal page's rail draw it. */
  color: string
  probability: number
  dealCount: number
  openValue: number
  weightedValue: number
}

/**
 * The pipeline as its stages, in pipeline order.
 *
 * This is the screen's hero because it is the screen's subject, and it borrows the deal page's
 * own vocabulary on purpose: the same ordered path, the same per-stage colour chip. A lead who
 * has been reading stage rails all week should recognise this immediately as the same object,
 * seen from above.
 *
 * Between rows sits the narrowing — this stage's deal count as a share of the one before it.
 * Named "narrowing" and not "conversion" deliberately. These are all deals standing in the
 * pipeline right now, not one cohort followed through it, so the figure describes the
 * pipeline's present shape. Calling a snapshot ratio a conversion rate is the most common lie
 * a funnel chart tells, and a lead would act on it.
 */
export function StageLadder({ stages }: { stages: LadderStage[] }) {
  const max = Math.max(1, ...stages.map((stage) => stage.openValue))

  return (
    <ol className="space-y-[4px]">
      {stages.map((stage, index) => {
        const previous = index > 0 ? stages[index - 1] : null
        const narrowing =
          previous && previous.dealCount > 0
            ? Math.round((stage.dealCount / previous.dealCount) * 100)
            : null

        return (
          <li key={stage.key}>
            {narrowing !== null && (
              <div className="flex items-center gap-8 py-[4px] pl-8">
                <ArrowDown />
                <span className="text-caption text-mist-gray tabular-nums">
                  {narrowing}% as many deals as {previous?.name}
                </span>
              </div>
            )}

            <div className="-mx-8 rounded-xl px-8 py-[12px] transition-colors duration-hover ease-ui hover:bg-cloud">
              <div className="flex flex-wrap items-baseline justify-between gap-x-16 gap-y-[4px]">
                <div className="flex min-w-0 items-center gap-8">
                  <span
                    aria-hidden
                    className="size-8 shrink-0 rounded-full"
                    style={{ backgroundColor: stage.color }}
                  />
                  <span className="truncate text-body-sm font-semibold text-ink-navy">
                    {stage.name}
                  </span>
                  <span className="shrink-0 rounded-full bg-pebble px-8 py-[1px] text-caption font-medium text-slate-gray tabular-nums">
                    {stage.probability}%
                  </span>
                </div>
                <span className="shrink-0 text-caption text-slate-gray tabular-nums">
                  {count(stage.dealCount)} deal{stage.dealCount === 1 ? '' : 's'}
                </span>
              </div>

              <div className="mt-8">
                <ProbabilityBar
                  openValue={stage.openValue}
                  weightedValue={stage.weightedValue}
                  max={max}
                  trailing={compactMoney(stage.openValue)}
                />
              </div>
            </div>
          </li>
        )
      })}
    </ol>
  )
}

function ArrowDown() {
  return (
    <svg
      viewBox="0 0 12 12"
      className="size-[12px] shrink-0 text-mist-gray"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path d="M6 1.5v9M3 7.5L6 10.5l3-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export interface RankedRow {
  key: string
  label: string
  /** Bar length. The measure the ranking is by. */
  primary: number
  primaryDisplay: string
  /** Second, independent measure — drawn as a separate short bar, not nested. */
  secondary: number
  secondaryDisplay: string
  meta: string
}

/**
 * A ranked list of people or partners, densest form on the screen.
 *
 * Deliberately not the ladder's form. These rows have no order beyond size and no probability
 * to nest, and the two measures here — open pipeline and closed-won — genuinely are
 * independent: won value is money already banked, not a fraction of what is open. That is the
 * one case on this screen where the second series slot is honest, so it gets it.
 *
 * A rank number is printed because the list *is* a ranking; the position carries information
 * a reader would otherwise have to count out.
 */
export function RankedRows({
  rows,
  primaryLabel,
  secondaryLabel,
}: {
  rows: RankedRow[]
  primaryLabel: string
  secondaryLabel: string
}) {
  const [hovered, setHovered] = useState<string | null>(null)
  const max = Math.max(1, ...rows.flatMap((row) => [row.primary, row.secondary]))

  return (
    <div>
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

      <ol className="divide-y divide-hairline">
        {rows.map((row, index) => (
          <li
            key={row.key}
            onMouseEnter={() => setHovered(row.key)}
            onMouseLeave={() => setHovered(null)}
            className="-mx-8 flex items-center gap-[12px] px-8 py-[12px] transition-colors duration-hover ease-ui hover:bg-cloud"
          >
            <span className="w-16 shrink-0 text-caption font-semibold text-mist-gray tabular-nums">
              {index + 1}
            </span>

            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-[12px]">
                <span className="min-w-0 truncate text-body-sm font-semibold text-ink-navy">
                  {row.label}
                </span>
                <span className="shrink-0 text-caption text-slate-gray tabular-nums">
                  {hovered === row.key ? row.meta : row.primaryDisplay}
                </span>
              </div>

              <div className="mt-8 space-y-[3px]">
                <Track value={row.primary} max={max} fill="bg-viz-1" />
                <Track value={row.secondary} max={max} fill="bg-viz-2" />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
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
 * The screen's opening figure: one number large enough to be the headline, with the weighted
 * portion shown beneath it in the same nesting used everywhere else.
 *
 * Sized against the three tiles beside it rather than matching them. Four identical tiles make
 * a reader weigh four numbers equally; the open pipeline is the number the page is about, and
 * the layout should say so before the copy has to.
 */
export function HeroFigure({
  label,
  value,
  weightedValue,
  openValue,
  weightedDisplay,
  meta,
}: {
  label: string
  value: string
  weightedValue: number
  openValue: number
  weightedDisplay: string
  meta: string
}) {
  const percent = openValue > 0 ? Math.round((weightedValue / openValue) * 100) : 0

  return (
    <div className="rounded-3xl border border-hairline bg-paper p-24 shadow-sm sm:col-span-2">
      <p className="text-caption font-semibold tracking-wide text-slate-gray uppercase">{label}</p>
      <p className="mt-8 text-heading font-bold text-ink-navy tabular-nums">{value}</p>

      <div className="mt-16 h-16 overflow-hidden rounded-md bg-viz-track">
        <div className="flex h-full items-center px-[2px]">
          <div
            className="h-[12px] rounded-[3px] bg-viz-1 transition-[width] duration-300 ease-ui motion-reduce:transition-none"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <p className="mt-8 text-body-sm text-slate-gray">
        <span className="font-semibold text-ink-navy tabular-nums">{weightedDisplay}</span> weighted
        — {percent}% of open value. {meta}
      </p>
    </div>
  )
}
