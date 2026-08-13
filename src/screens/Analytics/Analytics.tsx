import { useCallback, useMemo } from 'react'
import { useStore } from '@/data/store'
import { useRouter } from '@/app/router'
import { useSelection } from '@/app/selection'
import { useAuth } from '@/app/auth'
import { useAnalytics } from '@/hooks/useAnalytics'
import { useDrill } from '@/hooks/useDrill'
import type { AnalyticsQuery } from '@/api/endpoints'
import type { AnalyticsDeal, AnalyticsPeriod, AnalyticsSummary } from '@/types/domain'
import { compactMoney, count, fullMoney, shortDate } from '@/lib/format'
import { cn } from '@/lib/cn'
import { Skeleton, SkeletonMetricStrip } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { ExportButton } from '@/components/ui/ExportButton'
import { Tabs } from '@/components/ui/Tabs'
import { ChartEmpty, ChartPanel, DataTable, StatTile } from '@/components/viz/primitives'
<<<<<<< Updated upstream
import { HorizontalBars, type BarRow } from '@/components/viz/HorizontalBars'
import { ColumnChart, type Column } from '@/components/viz/ColumnChart'
=======
import { DealRows } from '@/components/viz/DealRows'
import { DrillPath, type Crumb } from '@/components/viz/DrillPath'
import { Dumbbells } from '@/components/viz/Dumbbells'
import { GhostColumns } from '@/components/viz/GhostColumns'
import { StageBands } from '@/components/viz/StageBands'
import { DeltaFigure, RankedRows } from '@/components/viz/pipeline'
>>>>>>> Stashed changes
import { AnalyticsFilters } from './AnalyticsFilters'
import { RisksTab } from './RisksTab'

/**
<<<<<<< Updated upstream
 * The reporting surface. "Visuals to see overall pipeline, filterable by things like
 * individuals and partners" — the feedback this screen answers.
=======
 * The reporting surface. "Visuals to see overall pipeline, filterable by things like individuals" — the
 * feedback this screen answers.
>>>>>>> Stashed changes
 *
 * Three decisions shape it.
 *
 * **Tabs, not a stack.** It was six panels down a long page, so every insight past the second needed
 * scrolling and no two distant figures could be compared. Four tabs put each question on one screen. There
 * is deliberately **no Overview tab**: an overview that restates the others is exactly what made the page
 * long, and the metric band above the tabs already is one — it stays visible on every tab, so the four
 * headline numbers are never the thing you scroll for.
 *
 * **Everything drills.** A bar is an aggregate, and the question a bar provokes is always "which deals". So
 * every chart here goes group → deals → the deal drawer, using the same drawer a deal opens from anywhere
 * else in the product. The path is in the URL, so a drilled view can be linked like any other view.
 *
 * **No weighted value.** It used to be on every panel as `value × the stage's percentage`, and that
 * percentage marks progression rather than likelihood — so the figure read as expected revenue and was
 * arithmetic on a scale that does not carry it. Removing it also took the second series off every chart,
 * which is why there are no legends here: one measure per chart, deal counts as text.
 */

const PARAMS = {
  pipelineId: 'pipeline',
  ownerId: 'owner',
<<<<<<< Updated upstream
  partnerId: 'partner',
  closeFrom: 'from',
  closeTo: 'to',
=======
  period: 'period',
>>>>>>> Stashed changes
} as const

/** Drill levels per tab, outermost first. The funnel is the only one with a middle level. */
const LEVELS = {
  risks: [],
  funnel: ['fpipe', 'stage'],
  team: ['owner'],
  created: ['bucket'],
} as const

type TabId = keyof typeof LEVELS

const TAB_IDS = Object.keys(LEVELS) as TabId[]

const TAB_LABELS: Record<TabId, string> = {
  risks: 'Needs attention',
  funnel: 'Funnel',
  team: 'Team',
  created: 'Created',
}

/**
 * The year, not the quarter.
 *
 * The period scopes every panel by created date, so a narrow default hides most of the book — and a funnel
 * missing its pipeline reads as "no pipeline" rather than as "a narrow window". The widest calendar period
 * always has something to draw; narrowing is a deliberate act, and the filter bar says what is excluded
 * once you do it.
 */
const DEFAULT_PERIOD: AnalyticsPeriod = 'year'

function queryFromUrl(search: URLSearchParams): AnalyticsQuery {
  const period = search.get(PARAMS.period)
  return {
    pipelineId: search.get(PARAMS.pipelineId),
    ownerId: search.get(PARAMS.ownerId),
<<<<<<< Updated upstream
    partnerId: search.get(PARAMS.partnerId),
    closeFrom: search.get(PARAMS.closeFrom),
    closeTo: search.get(PARAMS.closeTo),
=======
    period: (period as AnalyticsPeriod | null) ?? DEFAULT_PERIOD,
>>>>>>> Stashed changes
  }
}

export function Analytics() {
  const { snapshot, status } = useStore()
  const { match, navigate } = useRouter()
  const { select } = useSelection()

  // The URL is the filter state, not a copy of it. A filtered view that cannot be linked or survive a
  // reload is one somebody rebuilds by hand every time — and "send me that chart" is the most common thing
  // anyone does with a reporting screen.
  const query = useMemo(() => queryFromUrl(match.query), [match.query])
  const { isAdmin } = useAuth()

  // Administrators only. The exception report is a management view — it names which rep is behind and by how
  // much — and the server scopes every read anyway, so a rep opening it would see a report about themselves
  // titled as though it were about a team. Hidden rather than scoped-down, matching Ask AI.
  const visibleTabs = useMemo<TabId[]>(
    () => (isAdmin ? TAB_IDS : TAB_IDS.filter((id) => id !== 'risks')),
    [isAdmin],
  )
  const fallbackTab: TabId = isAdmin ? 'risks' : 'funnel'
  const requested = match.query.get('view') as TabId | null
  const activeTab: TabId =
    requested && visibleTabs.includes(requested) ? requested : fallbackTab

  const applyQuery = useCallback(
    (next: AnalyticsQuery) => {
      const search = new URLSearchParams()
      for (const [key, param] of Object.entries(PARAMS)) {
        const value = next[key as keyof AnalyticsQuery]
        if (value) search.set(param, String(value))
      }
      // The tab survives a filter change; the drill does not. Changing pipeline while three levels deep in
      // another pipeline's stage would leave a breadcrumb describing a set that is no longer on screen.
      search.set('view', activeTab)
      navigate(`/analytics?${search.toString()}`, { replace: true })
    },
    [activeTab, navigate],
  )

  const changeTab = useCallback(
    (next: string) => {
      const search = new URLSearchParams(match.query)
      search.set('view', next)
      // Every drill parameter is cleared on a tab change: they are per-tab keys, and one left behind would
      // silently re-open a drill the next time that tab was visited.
      for (const level of Object.values(LEVELS).flat()) search.delete(level)
      navigate(`/analytics?${search.toString()}`, { replace: true })
    },
    [match.query, navigate],
  )

  const { summary, loading, error, reload } = useAnalytics(query)

  if (status === 'loading') return <AnalyticsSkeleton />

  return (
    // One vertical rhythm for the whole screen, from the theme's own scale: 24px between the page's own
    // blocks, set once as a flex gap rather than as a margin on each child. Per-element margins were what
    // made the old page's spacing drift — two of them collapse, two of them double, and nothing says which.
    // Narrower gutters on a phone, because 24px each side of a 360px screen is a tenth of the reading width.
    <div className="mx-auto flex max-w-page flex-col gap-24 px-16 pb-96 sm:px-24">
      <header className="flex flex-wrap items-end justify-between gap-16 pt-32">
        <div>
          <p className="text-caption font-semibold tracking-wide text-slate-gray uppercase">Reporting</p>
          <h1 className="mt-8 text-subheading font-bold text-ink-navy sm:text-heading-sm">Analytics</h1>
        </div>
        {summary && (
          <ExportButton
            sheets={[
              { name: 'Funnel', rows: summary.funnel.map(funnelExportRow) },
              { name: 'Pipelines', rows: summary.byPipeline.map(pipelineExportRow) },
              { name: 'By individual', rows: summary.byOwner.map(ownerExportRow) },
<<<<<<< Updated upstream
              { name: 'By partner', rows: summary.byPartner.map(partnerExportRow) },
              { name: 'Forecast', rows: summary.forecast.map(forecastExportRow) },
=======
              { name: 'Created', rows: summary.created.buckets.map(createdExportRow) },
              { name: 'Deals', rows: summary.deals.map(dealExportRow) },
>>>>>>> Stashed changes
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
        resolved={summary?.filters ?? null}
      />

      {/* Kept as an inline panel with a retry rather than the shared `ErrorBanner`, which is a dismissible
          strip for a failed *mutation*. Nothing was optimistically changed here — the screen simply has no
          data — so the right shape is a block that stays put and offers the one action that helps. */}
      {error && (
        <div className="rounded-2xl border border-risk bg-risk-fill p-24">
          <p className="text-body-sm font-semibold text-ink-navy">Could not load analytics</p>
          <p className="mt-8 text-body-sm text-slate-gray">{error}</p>
          <div className="mt-16">
            <Button size="sm" onClick={() => void reload()}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {/* The previous result stays on screen while a new filter loads, dimmed. Blanking the page on every
          dropdown change makes the screen feel like it is thinking harder than it is, and the numbers you
          are comparing against vanish mid-comparison. */}
      {summary && (
        <div
          className={cn(
            'flex flex-col gap-24',
            loading ? 'opacity-60 transition-opacity duration-hover ease-ui' : 'transition-opacity',
          )}
          aria-busy={loading}
        >
          <MetricBand summary={summary} />

<<<<<<< Updated upstream
          <div className="mt-24 grid gap-24 lg:grid-cols-2">
            <Funnel summary={summary} />
            <Forecast summary={summary} />
            <ByOwner summary={summary} />
            <ByPartner summary={summary} />
=======
          <Tabs
            variant="underline"
            ariaLabel="Analytics sections"
            activeId={activeTab}
            onChange={changeTab}
            items={visibleTabs.map((id) =>
              id === 'risks'
                ? // The count rides on the tab so an administrator sees there is something to look at before
                  // choosing to look. None of the other tabs carries one — a number on every tab is
                  // wallpaper, and only this one is a queue of work.
                  { id, label: 'Needs attention', count: summary.risks.deals.length }
                : { id, label: TAB_LABELS[id] },
            )}
          />

          {/* Keyed on the tab, so switching tab remounts the panel rather than reusing it. Without the key
              React keeps the previous panel's state — a chart mid-transition, a hover — and the new tab
              animates in from the old tab's numbers. */}
          <div key={activeTab}>
            {activeTab === 'risks' && (
              <RisksTab summary={summary} onOpenDeal={(id) => select({ type: 'deal', id })} />
            )}
            {activeTab === 'funnel' && (
              <FunnelTab summary={summary} query={query} onOpenDeal={(id) => select({ type: 'deal', id })} />
            )}
            {activeTab === 'team' && (
              <TeamTab summary={summary} onOpenDeal={(id) => select({ type: 'deal', id })} />
            )}
            {activeTab === 'created' && (
              <CreatedTab summary={summary} onOpenDeal={(id) => select({ type: 'deal', id })} />
            )}
>>>>>>> Stashed changes
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * The four headline figures, above the tabs and never inside one.
 *
 * This is the overview, which is why no tab is. It also deliberately does **not** change as you drill: it is
 * the stable anchor the drilled subset is read against, and numbers that silently re-scope under you are
 * numbers you cannot compare.
 */
function MetricBand({ summary }: { summary: AnalyticsSummary }) {
  const { filters, created } = summary
  return (
<<<<<<< Updated upstream
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
=======
    // Four across, two, then one. Two-up on a phone would put a 38px figure in a 150px box.
    <div className="grid gap-16 sm:grid-cols-2 lg:grid-cols-4">
>>>>>>> Stashed changes
      <StatTile
        label="Deals"
        value={count(filters.dealCount)}
        hint={`${filters.accountCount} ${filters.accountCount === 1 ? 'company' : 'companies'}`}
        emphasis
      />
      <StatTile label="Open value" value={compactMoney(summary.totalOpenValue)} hint="Still in play" />
      <StatTile
        label="Created"
        value={compactMoney(created.value)}
        hint={`vs ${compactMoney(created.priorValue)} ${created.priorLabel}`}
      />
      {/* Stuck rather than Won, above the fold. Won is history and is still on the Team tab and in the
          outcomes; money that has stopped moving is the thing somebody can do something about today, which
          is the whole argument of an exception-led report. */}
      <StatTile
        label="Stuck"
        value={compactMoney(summary.risks.stuckValue)}
        hint={`${summary.risks.stuckCount} of ${summary.risks.openCount} open past their allowance`}
      />
    </div>
  )
}

// --- Shared drill leaf -------------------------------------------------------

function dealTable(deals: AnalyticsDeal[]) {
  return (
    <DataTable
      columns={['Deal', 'Company', 'Stage', 'Owner', 'Closes', 'Value']}
      rows={[...deals]
        .sort((a, b) => b.value - a.value)
        .map((deal) => ({
          key: deal.id,
          cells: [
            deal.name,
            deal.accountName,
            deal.stageShortName,
            deal.ownerName,
            shortDate(deal.expectedCloseDate),
            fullMoney(deal.value),
          ],
        }))}
    />
  )
}

/** "3 deals · $8.9M" — what the drilled subset is, since the metric band above stays global. */
function subsetSummary(deals: AnalyticsDeal[]): string {
  const total = deals.reduce((sum, deal) => sum + deal.value, 0)
  return `${deals.length} ${deals.length === 1 ? 'deal' : 'deals'} · ${compactMoney(total)}`
}

// --- Funnel ------------------------------------------------------------------

/**
 * Where value is sitting, by pipeline and then by stage.
 *
 * Contextual on the global filter rather than a fifth tab, because "all pipelines" and "one pipeline" are
 * the same question at two zoom levels. Not every deal follows the same process, so a single funnel drawn
 * across two pipelines would be two processes in one shape — which is why the top level is pipelines.
 *
 * The two levels use different forms on purpose. Pipelines are **named categories with no order**, so they
 * get ranked bars. Stages are **ordered**, so they get centred bands where the taper is the shape.
 */
<<<<<<< Updated upstream
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
=======
function FunnelTab({
  summary,
  query,
  onOpenDeal,
}: {
  summary: AnalyticsSummary
  query: AnalyticsQuery
  onOpenDeal: (id: string) => void
}) {
  const drill = useDrill([...LEVELS.funnel])
  const pipelineKey = query.pipelineId ?? drill.keyAt('fpipe')
  const stageKey = drill.keyAt('stage')

  const inPipeline = useMemo(
    () => (pipelineKey ? summary.deals.filter((d) => d.pipelineId === pipelineKey) : summary.deals),
    [summary.deals, pipelineKey],
  )
  const inStage = useMemo(
    () => (stageKey ? inPipeline.filter((d) => d.stageId === stageKey) : inPipeline),
    [inPipeline, stageKey],
  )

  const pipelineName =
    summary.byPipeline.find((p) => p.pipelineId === pipelineKey)?.pipelineName ??
    summary.deals.find((d) => d.pipelineId === pipelineKey)?.pipelineName ??
    'Pipeline'
  const stageName = summary.funnel.find((s) => s.stageId === stageKey)?.stageName ?? 'Stage'

  const crumbs: Crumb[] = [{ param: null, label: 'All pipelines' }]
  // A pipeline chosen in the *global* filter is not a drill level — it has no crumb, because clicking it
  // would have to clear a filter the reader set elsewhere.
  if (pipelineKey && !query.pipelineId) crumbs.push({ param: 'fpipe', label: pipelineName })
  else if (query.pipelineId) crumbs[0] = { param: null, label: pipelineName }
  if (stageKey) crumbs.push({ param: 'stage', label: stageName })

  const showStages = Boolean(pipelineKey)

  return (
    <ChartPanel
      title={stageKey ? `Deals in ${stageName}` : showStages ? `${pipelineName} — where value is sitting` : 'Pipelines'}
      subtitle={
        stageKey
          ? 'Biggest first. Open one to see the whole deal.'
          : showStages
            ? 'Value resting in each stage today — not conversion between them. The percentage is how far along the process a stage is; nothing multiplies by it.'
            : 'Not every deal follows the same process, so pipelines are counted separately. Open one for its stages.'
>>>>>>> Stashed changes
      }
      table={stageKey ? dealTable(inStage) : showStages ? funnelTable(summary) : pipelineTable(summary)}
    >
<<<<<<< Updated upstream
      {rows.length === 0 ? (
        <ChartEmpty message="No pipeline matches these filters." />
      ) : (
        <HorizontalBars rows={rows} valueLabel="Open value against weighted" />
      )}
    </ChartPanel>
  )
}
=======
      <DrillPath
        crumbs={crumbs}
        summary={crumbs.length > 1 ? subsetSummary(stageKey ? inStage : inPipeline) : undefined}
        onNavigate={(param) => drill.clearFrom(param)}
        onEscape={() => drill.clearFrom(stageKey ? 'stage' : 'fpipe')}
      />
>>>>>>> Stashed changes

      {stageKey ? (
        // The stage is already named in the title, so a chip repeating it on every row is noise.
        <DealRows deals={inStage} onOpen={onOpenDeal} showStage={false} />
      ) : showStages ? (
        <StageBands
          bands={summary.funnel
            .filter((slice) => slice.pipelineId === pipelineKey)
            .map((slice) => {
              // The oldest deal in the stage, so "where are they stuck" is answerable from the funnel itself.
              // The oldest rather than the average: an average hides the one deal that has been motionless
              // for four months behind nine that are fine, and it is that one somebody needs to see.
              const oldest = summary.deals
                .filter((deal) => deal.stageId === slice.stageId && deal.ageing !== null)
                .reduce<number>((worst, deal) => Math.max(worst, deal.ageing!.daysUsed), 0)
              const over = summary.deals.filter(
                (deal) => deal.stageId === slice.stageId && (deal.ageing?.daysOver ?? 0) > 0,
              ).length

<<<<<<< Updated upstream
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
=======
              return {
                key: slice.stageId,
                label: slice.stageShortName,
                meta:
                  slice.count > 0 && oldest > 0
                    ? `${slice.probability}% · oldest ${oldest}d${over > 0 ? ` · ${over} over` : ''}`
                    : `${slice.probability}% through`,
                value: Number(slice.value),
                valueDisplay: compactMoney(slice.value),
                count: slice.count,
                selectable: slice.count > 0,
                alert: over > 0,
              }
            })}
          onSelect={(key) => drill.push('stage', key)}
          selectHint="show the deals sitting here"
>>>>>>> Stashed changes
        />
      ) : summary.byPipeline.length === 0 ? (
        <ChartEmpty message="No deals were created in this period." />
      ) : (
<<<<<<< Updated upstream
        <ColumnChart columns={columns} valueLabel="Open value against weighted" />
=======
        <RankedRows
          rows={summary.byPipeline.map((row) => ({
            key: row.pipelineId,
            label: row.pipelineName,
            primary: Number(row.value),
            primaryDisplay: compactMoney(row.value),
            meta: `${row.count} ${row.count === 1 ? 'deal' : 'deals'} · ${row.accountCount} ${
              row.accountCount === 1 ? 'company' : 'companies'
            }`,
          }))}
          primaryLabel="Deal value"
          onSelect={(key) => drill.push('fpipe', key)}
          selectHint="show its stages"
        />
>>>>>>> Stashed changes
      )}
    </ChartPanel>
  )
}

<<<<<<< Updated upstream
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
=======
// --- Team --------------------------------------------------------------------

function TeamTab({ summary, onOpenDeal }: { summary: AnalyticsSummary; onOpenDeal: (id: string) => void }) {
  const drill = useDrill([...LEVELS.team])
  const ownerKey = drill.keyAt('owner')

  const owned = useMemo(
    () => (ownerKey ? summary.deals.filter((d) => d.ownerId === ownerKey) : []),
    [summary.deals, ownerKey],
  )
  const ownerName = summary.byOwner.find((o) => o.ownerId === ownerKey)?.ownerName ?? 'Individual'

  return (
    <ChartPanel
      title={ownerKey ? `${ownerName}'s deals` : 'Open pipeline against closed won'}
      subtitle={
        ownerKey
          ? 'Biggest first. Open one to see the whole deal.'
          : 'Two independent measures on one line: the gap between the dots is the difference. Won can exceed open — money banked is not a share of money in play.'
      }
      table={ownerKey ? dealTable(owned) : ownerTable(summary)}
    >
      <DrillPath
        crumbs={[
          { param: null, label: 'Everyone' },
          ...(ownerKey ? [{ param: 'owner', label: ownerName }] : []),
        ]}
        summary={ownerKey ? subsetSummary(owned) : undefined}
        onNavigate={(param) => drill.clearFrom(param)}
        onEscape={() => drill.clearFrom('owner')}
      />

      {ownerKey ? (
        <DealRows deals={owned} onOpen={onOpenDeal} />
      ) : summary.byOwner.length === 0 ? (
        <ChartEmpty message="No deals were created in this period." />
      ) : (
        <Dumbbells
>>>>>>> Stashed changes
          rows={summary.byOwner.map((slice) => ({
            key: slice.ownerId,
            label: slice.ownerName,
            // The denominator, not a percentage: "won 1 of 2" is a fact where "50%" on two deals flatters.
            meta: `${slice.openCount} open · won ${slice.wonCount} of ${slice.resolvedCount} decided`,
            primary: Number(slice.openValue),
            primaryDisplay: compactMoney(slice.openValue),
            secondary: Number(slice.wonValue),
            secondaryDisplay: compactMoney(slice.wonValue),
          }))}
          primaryLabel="Open pipeline"
          secondaryLabel="Closed won"
          onSelect={(key) => drill.push('owner', key)}
          selectHint="show their deals"
        />
<<<<<<< Updated upstream
      }
    >
      {rows.length === 0 ? (
        <ChartEmpty message="No deals match these filters." />
      ) : (
        <HorizontalBars rows={rows} valueLabel="Open against won" />
=======
>>>>>>> Stashed changes
      )}
    </ChartPanel>
  )
}

<<<<<<< Updated upstream
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
=======
// --- Created -----------------------------------------------------------------
>>>>>>> Stashed changes

/**
 * How much pipeline was created, against the period before it.
 *
 * The comparison is the reason this is a tab rather than a tile. "$8.4M created" is a number nobody can act
 * on; "$8.4M, down 19% on last quarter" is a finding — so the previous period is stated in words above and
 * drawn as an outline behind the columns below.
 */
function CreatedTab({
  summary,
  onOpenDeal,
}: {
  summary: AnalyticsSummary
  onOpenDeal: (id: string) => void
}) {
  const drill = useDrill([...LEVELS.created])
  const bucketKey = drill.keyAt('bucket')
  const { created } = summary

  const bucket = created.buckets.find((b) => b.start === bucketKey)
  const nextBucket = bucket ? created.buckets[created.buckets.indexOf(bucket) + 1] : undefined

<<<<<<< Updated upstream
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
=======
  const inBucket = useMemo(() => {
    if (!bucket) return []
    return summary.deals.filter((deal) => {
      const day = deal.createdAt.slice(0, 10)
      // Up to the next bucket's start, or open-ended for the last one — the period bound already limits it.
      return day >= bucket.start && (nextBucket === undefined || day < nextBucket.start)
    })
  }, [summary.deals, bucket, nextBucket])
>>>>>>> Stashed changes

  return (
    <div className="flex flex-col gap-24">
      <div className="rounded-3xl border border-hairline bg-paper p-24 shadow-sm">
        <DeltaFigure
          label="Pipeline created"
          value={fullMoney(created.value)}
          meta={`${created.count} ${created.count === 1 ? 'deal' : 'deals'} · ${shortDate(
            summary.filters.periodFrom,
          )} – ${shortDate(summary.filters.periodTo)}`}
          currentValue={Number(created.value)}
          priorValue={Number(created.priorValue)}
          priorDisplay={compactMoney(created.priorValue)}
          priorLabel={created.priorLabel}
        />
      </div>

      <ChartPanel
        title={bucket ? `Created ${bucket.label}` : 'When it was created'}
        subtitle={
          bucket
            ? 'Biggest first. Open one to see the whole deal.'
            : 'Empty buckets are kept — a week with nothing created is the signal, not a gap to close up.'
        }
        table={bucket ? dealTable(inBucket) : createdTable(summary)}
      >
        <DrillPath
          crumbs={[
            { param: null, label: 'Whole period' },
            ...(bucket ? [{ param: 'bucket', label: bucket.label }] : []),
          ]}
          summary={bucket ? subsetSummary(inBucket) : undefined}
          onNavigate={(param) => drill.clearFrom(param)}
          onEscape={() => drill.clearFrom('bucket')}
        />

        {bucket ? (
          <DealRows deals={inBucket} onOpen={onOpenDeal} />
        ) : created.buckets.length === 0 ? (
          <ChartEmpty message="Nothing was created in this period." />
        ) : (
          <GhostColumns
            columns={created.buckets.map((row, index) => ({
              key: row.start,
              label: row.label,
              value: Number(row.value),
              valueDisplay: compactMoney(row.value),
              count: row.count,
              // Paired by position, which is what the server aligned them by — the third week against the
              // third week, since two windows rarely divide into the same dates.
              priorValue: Number(created.priorBuckets[index]?.value ?? 0),
              selectable: row.count > 0,
            }))}
            priorLabel={created.priorLabel}
            hasPrior={Number(created.priorValue) > 0}
            onSelect={(key) => drill.push('bucket', key)}
            selectHint="show the deals created then"
          />
        )}
      </ChartPanel>
    </div>
  )
}

// --- Tables and export -------------------------------------------------------

function funnelTable(summary: AnalyticsSummary) {
  return (
    <DataTable
      columns={['Stage', 'Through', 'Deals', 'Value']}
      rows={summary.funnel.map((slice) => ({
        key: slice.stageId,
        cells: [slice.stageName, `${slice.probability}%`, count(slice.count), fullMoney(slice.value)],
      }))}
    />
  )
}

function pipelineTable(summary: AnalyticsSummary) {
  return (
    <DataTable
      columns={['Pipeline', 'Deals', 'Companies', 'Value']}
      rows={summary.byPipeline.map((row) => ({
        key: row.pipelineId,
        cells: [row.pipelineName, count(row.count), count(row.accountCount), fullMoney(row.value)],
      }))}
    />
  )
}

function ownerTable(summary: AnalyticsSummary) {
  return (
    <DataTable
      columns={['Individual', 'Open', 'Open value', 'Won', 'Decided', 'Won value']}
      rows={summary.byOwner.map((slice) => ({
        key: slice.ownerId,
        cells: [
          slice.ownerName,
          count(slice.openCount),
          fullMoney(slice.openValue),
          count(slice.wonCount),
          count(slice.resolvedCount),
          fullMoney(slice.wonValue),
        ],
      }))}
    />
  )
}


function createdTable(summary: AnalyticsSummary) {
  return (
    <DataTable
      columns={['Bucket', 'Deals', 'Value']}
      rows={summary.created.buckets.map((row) => ({
        key: row.start,
        cells: [row.label, count(row.count), fullMoney(row.value)],
      }))}
    />
  )
}

function funnelExportRow(slice: AnalyticsSummary['funnel'][number]) {
  return {
    Stage: slice.stageName,
    Position: slice.position,
    'Through %': slice.probability,
    Deals: slice.count,
    Value: Number(slice.value),
  }
}

function pipelineExportRow(row: AnalyticsSummary['byPipeline'][number]) {
  return {
    Pipeline: row.pipelineName,
    Deals: row.count,
    Companies: row.accountCount,
    Value: Number(row.value),
  }
}

function ownerExportRow(slice: AnalyticsSummary['byOwner'][number]) {
  return {
    Individual: slice.ownerName,
    'Open deals': slice.openCount,
    'Open value': Number(slice.openValue),
    Won: slice.wonCount,
    Decided: slice.resolvedCount,
    'Won value': Number(slice.wonValue),
  }
}


function createdExportRow(row: AnalyticsSummary['created']['buckets'][number]) {
  return { Bucket: row.label, Starting: row.start, Deals: row.count, Value: Number(row.value) }
}

function dealExportRow(deal: AnalyticsDeal) {
  return {
    Deal: deal.name,
    Company: deal.accountName,
    Pipeline: deal.pipelineName,
    Stage: deal.stageName,
    Owner: deal.ownerName,
    Created: deal.createdAt.slice(0, 10),
    Closes: deal.expectedCloseDate,
    Open: deal.isOpen ? 'Yes' : 'No',
    Value: Number(deal.value),
  }
}

function AnalyticsSkeleton() {
  return (
    <div className="mx-auto max-w-page px-24 pb-96">
      <div className="pt-32 pb-16">
        <Skeleton className="h-16 w-96" />
        <Skeleton className="mt-8 h-32 w-[220px]" />
      </div>
      <Skeleton className="h-72 rounded-2xl" />
      <div className="mt-24">
        <SkeletonMetricStrip />
      </div>
      <Skeleton className="mt-24 h-40 rounded-lg" />
      <Skeleton className="mt-24 h-[320px] rounded-3xl" />
    </div>
  )
}
