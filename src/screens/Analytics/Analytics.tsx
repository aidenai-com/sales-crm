import { useCallback, useMemo } from 'react'
import { useStore } from '@/data/store'
import { useRouter } from '@/app/router'
import { useAnalytics } from '@/hooks/useAnalytics'
import type { AnalyticsQuery } from '@/api/endpoints'
import { compactMoney, count, fullMoney } from '@/lib/format'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { ExportButton } from '@/components/ui/ExportButton'
import { ChartEmpty, ChartPanel, DataTable, StatTile } from '@/components/viz/primitives'
import { HorizontalBars, type BarRow } from '@/components/viz/HorizontalBars'
import { ColumnChart, type Column } from '@/components/viz/ColumnChart'
import { AnalyticsFilters } from './AnalyticsFilters'

/**
 * The reporting surface. "Visuals to see overall pipeline, filterable by things like
 * individuals and partners" — the feedback this screen answers.
 *
 * It is a separate screen rather than more sections on the Dashboard because spec.md §4.1
 * calls the Dashboard "an action surface, not a reporting surface", and it had drifted into
 * six stacked panels of reporting. Splitting them lets the Dashboard answer "what should I
 * do now" and this screen answer "how are we doing" — two questions that want different
 * layouts, different defaults and, here, filters.
 *
 * Every figure comes from one request against one filtered deal set, so no two charts can
 * disagree. See `app/api/v1/analytics.py`.
 */

/** URL parameter names. Short, because a filtered view is a link people paste. */
const PARAMS = {
  pipelineId: 'pipeline',
  ownerId: 'owner',
  partnerId: 'partner',
  closeFrom: 'from',
  closeTo: 'to',
} as const

function queryFromUrl(search: URLSearchParams): AnalyticsQuery {
  return {
    pipelineId: search.get(PARAMS.pipelineId),
    ownerId: search.get(PARAMS.ownerId),
    partnerId: search.get(PARAMS.partnerId),
    closeFrom: search.get(PARAMS.closeFrom),
    closeTo: search.get(PARAMS.closeTo),
  }
}

export function Analytics() {
  const { snapshot, status } = useStore()
  const { match, navigate } = useRouter()

  // The URL is the filter state, not a copy of it. A filtered view that cannot be linked or
  // survive a reload is one somebody has to rebuild by hand every time they want it again —
  // and "send me that chart" is the most common thing anyone does with a reporting screen.
  const query = useMemo(() => queryFromUrl(match.query), [match.query])

  const applyQuery = useCallback(
    (next: AnalyticsQuery) => {
      const search = new URLSearchParams()
      for (const [key, param] of Object.entries(PARAMS)) {
        const value = next[key as keyof AnalyticsQuery]
        if (value) search.set(param, value)
      }
      const suffix = search.toString()
      // `replace`, so twenty filter tweaks do not become twenty back-button steps between
      // the user and the screen they came from.
      navigate(`/analytics${suffix ? `?${suffix}` : ''}`, { replace: true })
    },
    [navigate],
  )

  const { summary, loading, error, reload } = useAnalytics(query)

  if (status === 'loading') return <AnalyticsSkeleton />

  return (
    <div className="mx-auto max-w-page px-24 pb-96">
      <header className="flex flex-wrap items-end justify-between gap-16 py-32">
        <div>
          <p className="text-caption font-semibold tracking-wide text-slate-gray uppercase">
            Reporting
          </p>
          <h1 className="mt-8 text-heading-sm font-bold text-ink-navy">Analytics</h1>
          <p className="mt-8 max-w-[640px] text-body text-slate-gray">
            The whole pipeline, filtered. Every figure below describes the same set of deals.
          </p>
        </div>
        {summary && (
          <ExportButton
            sheets={[
              { name: 'Funnel', rows: summary.funnel.map(funnelExportRow) },
              { name: 'By individual', rows: summary.byOwner.map(ownerExportRow) },
              { name: 'By partner', rows: summary.byPartner.map(partnerExportRow) },
              { name: 'Forecast', rows: summary.forecast.map(forecastExportRow) },
            ]}
            filenameBase="analytics"
            label="Download"
          />
        )}
      </header>

      <AnalyticsFilters
        snapshot={snapshot}
        query={query}
        onChange={applyQuery}
        dealCount={summary?.filters.dealCount ?? null}
      />

      {error && (
        <div className="mt-24 rounded-2xl border border-risk bg-risk-fill p-24">
          <p className="text-body-sm font-semibold text-ink-navy">Could not load analytics</p>
          <p className="mt-8 text-body-sm text-slate-gray">{error}</p>
          <div className="mt-16">
            <Button size="sm" onClick={() => void reload()}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {/* The previous result stays on screen while a new filter loads, dimmed. Blanking the
          page on every dropdown change makes the screen feel like it is thinking harder
          than it is, and the numbers you are comparing against vanish mid-comparison. */}
      {summary && (
        <div
          className={
            loading ? 'opacity-60 transition-opacity duration-hover ease-ui' : 'transition-opacity'
          }
          aria-busy={loading}
        >
          <Totals summary={summary} />

          <div className="mt-24 grid gap-24 lg:grid-cols-2">
            <Funnel summary={summary} />
            <Forecast summary={summary} />
            <ByOwner summary={summary} />
            <ByPartner summary={summary} />
          </div>
        </div>
      )}

      {!summary && loading && <AnalyticsSkeleton bare />}
    </div>
  )
}

// --- Panels ------------------------------------------------------------------

type Summary = NonNullable<ReturnType<typeof useAnalytics>['summary']>

/**
 * The headline figures.
 *
 * Numbers, not charts. Each is a single value with no comparison inside it, and the form
 * heuristic's first question is whether the data is even a chart — a one-bar chart of total
 * open value would add a scale and an axis that carry nothing the number does not.
 */
function Totals({ summary }: { summary: Summary }) {
  const { outcomes } = summary

  return (
    <div className="mt-24 grid gap-16 sm:grid-cols-2 lg:grid-cols-4">
      <StatTile
        label="Open pipeline"
        value={fullMoney(summary.totalOpenValue)}
        hint={`${count(outcomes.openCount)} open deals`}
        emphasis
      />
      <StatTile
        label="Weighted"
        value={fullMoney(summary.totalWeightedValue)}
        hint="Open value × stage probability"
        emphasis
      />
      <StatTile
        label="Win rate"
        value={`${outcomes.winRate.toFixed(0)}%`}
        // Spelling out the denominator, because a win rate is only ever misread one way.
        hint={`${count(outcomes.wonCount)} won of ${count(outcomes.wonCount + outcomes.lostCount)} decided`}
        emphasis
      />
      <OutcomeTile summary={summary} />
    </div>
  )
}

/**
 * Won against lost, as a single split bar.
 *
 * These wear the reserved outcome colours rather than a series slot, and both carry a text
 * label — won and lost are states, not "series 1 and 2", and a reader must never have to
 * resolve which green means which from the fill alone.
 */
function OutcomeTile({ summary }: { summary: Summary }) {
  const { outcomes } = summary
  const decided = outcomes.wonCount + outcomes.lostCount

  return (
    <div className="rounded-2xl border border-hairline bg-cloud px-24 py-16">
      <p className="text-caption font-semibold tracking-wide text-slate-gray uppercase">
        Closed business
      </p>

      {decided === 0 ? (
        <p className="mt-8 text-body-sm text-slate-gray">Nothing decided in this view yet.</p>
      ) : (
        <>
          <div className="mt-8 flex h-8 gap-[2px] overflow-hidden rounded-full">
            <div
              className="rounded-l-md bg-viz-won"
              style={{ width: `${(outcomes.wonCount / decided) * 100}%` }}
            />
            <div
              className="rounded-r-md bg-viz-lost"
              style={{ width: `${(outcomes.lostCount / decided) * 100}%` }}
            />
          </div>
          <dl className="mt-16 space-y-[2px]">
            <OutcomeRow label="Won" fill="bg-viz-won" value={fullMoney(outcomes.wonValue)} n={outcomes.wonCount} />
            <OutcomeRow label="Lost" fill="bg-viz-lost" value={fullMoney(outcomes.lostValue)} n={outcomes.lostCount} />
          </dl>
        </>
      )}
    </div>
  )
}

function OutcomeRow({ label, fill, value, n }: { label: string; fill: string; value: string; n: number }) {
  return (
    <div className="flex items-baseline justify-between gap-16">
      <dt className="flex items-center gap-8 text-caption text-slate-gray">
        <span aria-hidden className={`h-8 w-8 shrink-0 rounded-full ${fill}`} />
        {label} ({count(n)})
      </dt>
      <dd className="text-caption font-semibold text-ink-navy tabular-nums">{value}</dd>
    </div>
  )
}

/**
 * Value per stage, in pipeline order.
 *
 * Stages are ordered — swapping two of them would change what the chart means — but the
 * order is already carried by the row sequence and the stage names. Colouring the bars by
 * position as well would spend the identity channel re-encoding what the reader can already
 * see, so both bars take the series slots and the stage's own colour appears as a chip
 * beside its name, matching how the board and the stage rail identify it.
 */
function Funnel({ summary }: { summary: Summary }) {
  const rows: BarRow[] = summary.funnel.map((slice) => ({
    key: slice.stageId,
    label: slice.stageName,
    primaryLabel: compactMoney(slice.value),
    meta: `${count(slice.count)} deal${slice.count === 1 ? '' : 's'} · ${slice.probability}% probability`,
    values: [
      { slot: 1, label: 'Open value', value: slice.value, display: fullMoney(slice.value) },
      {
        slot: 2,
        label: 'Weighted',
        value: slice.weightedValue,
        display: fullMoney(slice.weightedValue),
      },
    ],
  }))

  return (
    <ChartPanel
      title="Pipeline by stage"
      subtitle="Every stage of the matching pipelines, including the empty ones."
      series={[
        { slot: 1, label: 'Open value' },
        { slot: 2, label: 'Weighted' },
      ]}
      table={
        <DataTable
          columns={['Stage', 'Deals', 'Open value', 'Weighted']}
          rows={summary.funnel.map((slice) => ({
            key: slice.stageId,
            cells: [
              slice.stageName,
              count(slice.count),
              fullMoney(slice.value),
              fullMoney(slice.weightedValue),
            ],
          }))}
        />
      }
    >
      {rows.length === 0 ? (
        <ChartEmpty message="No pipeline matches these filters." />
      ) : (
        <HorizontalBars rows={rows} valueLabel="Open value against weighted" />
      )}
    </ChartPanel>
  )
}

/**
 * Open value by expected close month.
 *
 * Columns rather than rows, because the category is time and a reader expects time to run
 * left to right. Open deals only — the endpoint excludes closed business, since a forecast
 * containing deals that already landed is a report of the past wearing a forecast's title.
 */
function Forecast({ summary }: { summary: Summary }) {
  const columns: Column[] = summary.forecast.map((slice) => ({
    key: slice.month,
    label: slice.label,
    meta: `${count(slice.count)}`,
    values: [
      { slot: 1, label: 'Open value', value: slice.value, display: fullMoney(slice.value) },
      {
        slot: 2,
        label: 'Weighted',
        value: slice.weightedValue,
        display: fullMoney(slice.weightedValue),
      },
    ],
  }))

  return (
    <ChartPanel
      title="Forecast by close month"
      subtitle="Open deals only, by the month they are expected to close."
      series={[
        { slot: 1, label: 'Open value' },
        { slot: 2, label: 'Weighted' },
      ]}
      table={
        <DataTable
          columns={['Month', 'Deals', 'Open value', 'Weighted']}
          rows={summary.forecast.map((slice) => ({
            key: slice.month,
            cells: [
              slice.label,
              count(slice.count),
              fullMoney(slice.value),
              fullMoney(slice.weightedValue),
            ],
          }))}
        />
      }
    >
      {columns.length === 0 ? (
        <ChartEmpty message="No open deals close inside this window." />
      ) : (
        <ColumnChart columns={columns} valueLabel="Open value against weighted" />
      )}
    </ChartPanel>
  )
}

/** The "filterable by individuals" half of the feedback, as a breakdown rather than a filter. */
function ByOwner({ summary }: { summary: Summary }) {
  const rows: BarRow[] = summary.byOwner.map((slice) => ({
    key: slice.ownerId,
    label: slice.ownerName,
    primaryLabel: compactMoney(slice.openValue),
    meta: `${count(slice.openCount)} open · ${count(slice.wonCount)} won`,
    values: [
      { slot: 1, label: 'Open value', value: slice.openValue, display: fullMoney(slice.openValue) },
      { slot: 2, label: 'Won value', value: slice.wonValue, display: fullMoney(slice.wonValue) },
    ],
  }))

  return (
    <ChartPanel
      title="By individual"
      subtitle="Open pipeline against closed-won, largest first."
      series={[
        { slot: 1, label: 'Open value' },
        { slot: 2, label: 'Won value' },
      ]}
      table={
        <DataTable
          columns={['Individual', 'Open', 'Open value', 'Won', 'Won value']}
          rows={summary.byOwner.map((slice) => ({
            key: slice.ownerId,
            cells: [
              slice.ownerName,
              count(slice.openCount),
              fullMoney(slice.openValue),
              count(slice.wonCount),
              fullMoney(slice.wonValue),
            ],
          }))}
        />
      }
    >
      {rows.length === 0 ? (
        <ChartEmpty message="No deals match these filters." />
      ) : (
        <HorizontalBars rows={rows} valueLabel="Open against won" />
      )}
    </ChartPanel>
  )
}

/**
 * Value sourced through each partner, with Direct last.
 *
 * Direct is on the chart deliberately: partner contribution only means something next to the
 * business that arrived without one. It sorts last regardless of size so the partner rows
 * read as the subject and Direct as the baseline.
 */
function ByPartner({ summary }: { summary: Summary }) {
  const rows: BarRow[] = summary.byPartner.map((slice) => ({
    key: slice.partnerId ?? 'direct',
    label: slice.partnerName,
    primaryLabel: compactMoney(slice.openValue),
    meta: `${count(slice.openCount)} open · ${count(slice.wonCount)} won`,
    values: [
      { slot: 1, label: 'Open value', value: slice.openValue, display: fullMoney(slice.openValue) },
      { slot: 2, label: 'Won value', value: slice.wonValue, display: fullMoney(slice.wonValue) },
    ],
  }))

  return (
    <ChartPanel
      title="By partner"
      subtitle="Deals sourced through each partner, with direct business as the baseline."
      series={[
        { slot: 1, label: 'Open value' },
        { slot: 2, label: 'Won value' },
      ]}
      table={
        <DataTable
          columns={['Source', 'Open', 'Open value', 'Won', 'Won value']}
          rows={summary.byPartner.map((slice) => ({
            key: slice.partnerId ?? 'direct',
            cells: [
              slice.partnerName,
              count(slice.openCount),
              fullMoney(slice.openValue),
              count(slice.wonCount),
              fullMoney(slice.wonValue),
            ],
          }))}
        />
      }
    >
      {rows.length === 0 ? (
        <ChartEmpty message="No deals match these filters." />
      ) : (
        <HorizontalBars rows={rows} valueLabel="Open against won" />
      )}
    </ChartPanel>
  )
}

// --- Export rows -------------------------------------------------------------
// Headers name the unit, so a workbook opened months later needs no legend.

const funnelExportRow = (slice: Summary['funnel'][number]) => ({
  Stage: slice.stageName,
  'Probability %': slice.probability,
  Deals: slice.count,
  'Open value (USD)': slice.value,
  'Weighted value (USD)': slice.weightedValue,
})

const ownerExportRow = (slice: Summary['byOwner'][number]) => ({
  Individual: slice.ownerName,
  'Open deals': slice.openCount,
  'Open value (USD)': slice.openValue,
  'Weighted value (USD)': slice.weightedValue,
  'Won deals': slice.wonCount,
  'Won value (USD)': slice.wonValue,
})

const partnerExportRow = (slice: Summary['byPartner'][number]) => ({
  Source: slice.partnerName,
  'Open deals': slice.openCount,
  'Open value (USD)': slice.openValue,
  'Won deals': slice.wonCount,
  'Won value (USD)': slice.wonValue,
})

const forecastExportRow = (slice: Summary['forecast'][number]) => ({
  Month: slice.label,
  Deals: slice.count,
  'Open value (USD)': slice.value,
  'Weighted value (USD)': slice.weightedValue,
})

// --- Loading -----------------------------------------------------------------

/** The layout is fixed and known, so the skeleton is that layout — the page does not jump. */
function AnalyticsSkeleton({ bare = false }: { bare?: boolean }) {
  const body = (
    <>
      <div className="mt-24 grid gap-16 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[108px] rounded-2xl" />
        ))}
      </div>
      <div className="mt-24 grid gap-24 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[320px] rounded-3xl" />
        ))}
      </div>
    </>
  )

  if (bare) return body

  return (
    <div className="mx-auto max-w-page px-24 pb-96">
      <div className="py-32">
        <Skeleton className="h-[12px] w-[80px]" />
        <Skeleton className="mt-16 h-40 w-[240px]" />
      </div>
      <Skeleton className="h-[132px] rounded-3xl" />
      {body}
    </div>
  )
}
