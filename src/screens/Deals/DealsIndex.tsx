import { useMemo, useState } from 'react'
import type { Health } from '@/types/domain'
import { useStore } from '@/data/store'
import { useCreation } from '@/app/creation'
import { Button } from '@/components/ui/Button'
import { Link, routes } from '@/app/router'
import { buildDealViews, type DealView } from '@/lib/rollup'
import { dealRows } from '@/lib/export'
import { compactMoney, relativeToNow } from '@/lib/format'
import { HEALTH_LABEL, REASON_LABEL } from '@/lib/health'
import { Card, EmptyState } from '@/components/ui/Card'
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton'
import { HealthBadge } from '@/components/ui/Badge'
import { ExportButton } from '@/components/ui/ExportButton'
import { SearchField } from '@/components/ui/SearchField'
import { FilterPill, Segmented, ToggleChip } from '@/components/ui/Segmented'
import { cn } from '@/lib/cn'
import { PipelineOverview } from './PipelineOverview'

type SortKey = 'opportunity' | 'stage' | 'value' | 'close' | 'owner' | 'health'
type Direction = 'asc' | 'desc'

/** Rank for sorting by status: the thing needing attention sorts to the top. */
const HEALTH_RANK: Record<Health, number> = { 'at-risk': 0, 'closing-soon': 1, healthy: 2 }

/**
 * How each column compares, and which direction it should start in.
 *
 * Defaults matter: clicking "Value" should show the biggest deals first, while clicking
 * "Close" should show the nearest date first. Both are "most urgent first", which is
 * opposite directions numerically.
 */
const COMPARATORS: Record<SortKey, { compare: (a: DealView, b: DealView) => number; initial: Direction }> = {
  opportunity: {
    // Groups an account's deals together, which is what you want when scanning by customer.
    compare: (a, b) => a.account.name.localeCompare(b.account.name) || a.deal.name.localeCompare(b.deal.name),
    initial: 'asc',
  },
  stage: {
    compare: (a, b) => a.stage.position - b.stage.position || a.deal.value - b.deal.value,
    initial: 'asc',
  },
  value: { compare: (a, b) => a.deal.value - b.deal.value, initial: 'desc' },
  close: {
    compare: (a, b) =>
      new Date(a.deal.expectedCloseDate).getTime() - new Date(b.deal.expectedCloseDate).getTime(),
    initial: 'asc',
  },
  owner: { compare: (a, b) => a.ownerName.localeCompare(b.ownerName), initial: 'asc' },
  health: {
    compare: (a, b) => HEALTH_RANK[a.health] - HEALTH_RANK[b.health] || b.deal.value - a.deal.value,
    initial: 'asc',
  },
}

/**
 * The status filter splits at-risk into its two causes, because they call for different
 * work: an overdue deal needs a new close date, a stalled one needs a conversation.
 * "At risk" stays as the umbrella for when you want both.
 */
type StatusFilter = 'all' | Health | 'overdue' | 'stalled'

const HEALTH_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Any status' },
  { value: 'at-risk', label: HEALTH_LABEL['at-risk'] },
  { value: 'overdue', label: REASON_LABEL.overdue },
  { value: 'stalled', label: REASON_LABEL.stalled },
  { value: 'closing-soon', label: HEALTH_LABEL['closing-soon'] },
  { value: 'healthy', label: HEALTH_LABEL.healthy },
]

/** One place to name a status, so the segmented control and its pill can't disagree. */
function statusLabel(value: StatusFilter): string {
  return HEALTH_FILTERS.find((option) => option.value === value)?.label ?? 'Any status'
}

function matchesStatus(view: DealView, filter: StatusFilter): boolean {
  if (filter === 'all') return true
  if (filter === 'overdue' || filter === 'stalled') return view.healthDetail.reason === filter
  return view.health === filter
}

/**
 * Every deal across every pipeline in one sortable table, above a proportional view of
 * where they all sit.
 *
 * This is the counterpart to the board: the board is for moving one deal, this is for
 * scanning all of them. Both link into the same deal page.
 *
 * The controls are a single sticky bar rather than a row of loose selects: search on its
 * own line because it's the one control used every time, filters below it as visible
 * choices, and sorting moved onto the column headers where the data actually is. A filter
 * bar should let you read the current state without opening anything.
 */
export function DealsIndex() {
  const { snapshot, status } = useStore()
  const { openCreate } = useCreation()
  const [query, setQuery] = useState('')
  const [pipelineFilter, setPipelineFilter] = useState('all')
  const [healthFilter, setHealthFilter] = useState<StatusFilter>('all')
  const [stageFilter, setStageFilter] = useState<string | null>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: Direction }>({ key: 'value', dir: 'desc' })
  const [openOnly, setOpenOnly] = useState(true)

  const views = useMemo(() => buildDealViews(snapshot), [snapshot])

  /** Everything except the pipeline choice, so the segmented control can show live counts. */
  const scoped = useMemo(() => views.filter((v) => !openOnly || v.isOpen), [views, openOnly])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()

    const result = scoped.filter((v) => {
      if (pipelineFilter !== 'all' && v.pipeline.id !== pipelineFilter) return false
      if (!matchesStatus(v, healthFilter)) return false
      if (stageFilter && v.deal.stageId !== stageFilter) return false
      if (!q) return true
      return (
        v.deal.name.toLowerCase().includes(q) ||
        v.account.name.toLowerCase().includes(q) ||
        v.stage.name.toLowerCase().includes(q) ||
        v.ownerName.toLowerCase().includes(q) ||
        (v.lead?.businessUnit.toLowerCase().includes(q) ?? false) ||
        (v.partner?.name.toLowerCase().includes(q) ?? false)
      )
    })

    const { compare } = COMPARATORS[sort.key]
    const sign = sort.dir === 'asc' ? 1 : -1
    return result.sort((a, b) => compare(a, b) * sign)
  }, [scoped, query, pipelineFilter, healthFilter, stageFilter, sort])

  const totalValue = filtered.filter((v) => v.isOpen).reduce((sum, v) => sum + v.deal.value, 0)
  const weighted = filtered
    .filter((v) => v.isOpen)
    .reduce((sum, v) => sum + (v.deal.value * v.stage.probability) / 100, 0)

  const stageFilterName = stageFilter
    ? (snapshot.pipelines.flatMap((p) => p.stages).find((s) => s.id === stageFilter)?.name ?? null)
    : null

  const activePipeline = snapshot.pipelines.find((p) => p.id === pipelineFilter)
  const filtersActive =
    query.trim() !== '' || pipelineFilter !== 'all' || healthFilter !== 'all' || stageFilter !== null

  function clearAll() {
    setQuery('')
    setPipelineFilter('all')
    setHealthFilter('all')
    setStageFilter(null)
  }

  /** Same column re-clicked flips direction; a new column starts in its natural one. */
  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: COMPARATORS[key].initial },
    )
  }

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-page px-24 pb-96">
        <div className="py-32">
          <Skeleton className="h-40 w-[140px]" />
          <Skeleton className="mt-8 h-16 w-[420px]" />
        </div>
        <div className="grid gap-24 lg:grid-cols-[1fr_360px]">
          <Card>
            <Skeleton className="h-24 w-[120px]" />
            <div className="mt-16 grid grid-cols-2 gap-16">
              <Skeleton className="h-[96px] rounded-2xl" />
              <Skeleton className="h-[96px] rounded-2xl" />
            </div>
          </Card>
          <Card>
            <Skeleton className="h-24 w-[180px]" />
            <Skeleton className="mt-16 h-24 w-full rounded-lg" />
            <Skeleton className="mt-16 h-24 w-full rounded-lg" />
          </Card>
        </div>
        <div className="mt-24">
          <Card>
            <SkeletonRows rows={8} />
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-page px-24 pb-96">
      <div className="flex flex-wrap items-end justify-between gap-16 py-32">
        <div>
          <h1 className="text-heading-sm font-bold text-ink-navy">Deals</h1>
          <p className="mt-8 text-body text-slate-gray">
            Every opportunity across both pipelines, with where each one stands.
          </p>
        </div>
        <div className="flex items-center gap-8">
          <ExportButton
            sheets={[{ name: 'Deals', rows: dealRows(filtered) }]}
            filenameBase="all-deals"
          />
          <Button size="sm" onClick={() => openCreate({ kind: 'deal' })}>
            New deal
          </Button>
        </div>
      </div>

      <div className="grid gap-24 lg:grid-cols-[1fr_360px]">
        <Card>
          <h2 className="mb-16 text-body-lg font-semibold text-ink-navy">
            {filtered.length} {filtered.length === 1 ? 'deal' : 'deals'}
          </h2>
          <dl className="grid grid-cols-2 gap-16">
            <div className="rounded-2xl bg-cloud p-16">
              <dt className="text-caption font-semibold tracking-wide text-slate-gray uppercase">
                Open value
              </dt>
              <dd className="mt-8 text-subheading font-bold text-ink-navy tabular-nums">
                {compactMoney(totalValue)}
              </dd>
            </div>
            <div className="rounded-2xl bg-cloud p-16">
              <dt className="text-caption font-semibold tracking-wide text-slate-gray uppercase">
                Weighted
              </dt>
              <dd className="mt-8 text-subheading font-bold text-ink-navy tabular-nums">
                {compactMoney(weighted)}
              </dd>
              <dd className="mt-8 text-caption text-slate-gray">By stage probability</dd>
            </div>
          </dl>
        </Card>

        <Card>
          <h2 className="mb-16 text-body-lg font-semibold text-ink-navy">Across the pipeline</h2>
          <PipelineOverview
            pipelines={snapshot.pipelines}
            views={scoped}
            activeStageId={stageFilter}
            onSelectStage={setStageFilter}
          />
        </Card>
      </div>

      {/*
        Sticky under the 64px nav so the controls stay reachable while the table scrolls —
        this table runs to 20+ rows and losing the search box behind you is the main
        annoyance of a long list view.
      */}
      <div className="sticky top-64 z-20 -mx-24 mt-24 bg-cloud px-24 pt-16 pb-8">
        <Card padded={false} className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-16 border-b border-hairline p-16">
            <SearchField
              value={query}
              onValueChange={setQuery}
              placeholder="Search deals, customers, partners, business units, owners"
              aria-label="Search deals"
              className="min-w-[280px] flex-1"
            />

            <p className="text-body-sm whitespace-nowrap text-slate-gray tabular-nums">
              <span className="font-semibold text-ink-navy">{filtered.length}</span> of {scoped.length}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-16 p-16">
            <Segmented
              label="Filter by pipeline"
              value={pipelineFilter}
              onChange={setPipelineFilter}
              options={[
                { value: 'all', label: 'All', count: scoped.length },
                ...snapshot.pipelines.map((pipeline) => ({
                  value: pipeline.id,
                  label: pipeline.name,
                  count: scoped.filter((v) => v.pipeline.id === pipeline.id).length,
                })),
              ]}
            />

            <Segmented
              label="Filter by status"
              value={healthFilter}
              onChange={setHealthFilter}
              options={HEALTH_FILTERS}
            />

            <ToggleChip pressed={openOnly} onChange={setOpenOnly}>
              Open deals only
            </ToggleChip>

            {filtersActive && (
              <div className="ml-auto flex flex-wrap items-center gap-8">
                {query.trim() && (
                  <FilterPill label="Search" value={query.trim()} onClear={() => setQuery('')} />
                )}
                {activePipeline && (
                  <FilterPill
                    label="Pipeline"
                    value={activePipeline.name}
                    onClear={() => setPipelineFilter('all')}
                  />
                )}
                {healthFilter !== 'all' && (
                  <FilterPill
                    label="Status"
                    value={statusLabel(healthFilter)}
                    onClear={() => setHealthFilter('all')}
                  />
                )}
                {stageFilterName && (
                  <FilterPill
                    label="Stage"
                    value={stageFilterName}
                    onClear={() => setStageFilter(null)}
                  />
                )}
                <button
                  onClick={clearAll}
                  className="rounded-lg px-8 py-[4px] text-caption font-semibold text-slate-gray transition-colors duration-(--duration-hover) hover:bg-pebble hover:text-ink-navy"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        </Card>
      </div>

      {filtered.length === 0 ? (
        <div className="mt-16">
          <EmptyState
            title="No deals match these filters"
            hint="Widen the search, clear the stage filter, or include closed deals."
          />
        </div>
      ) : (
        <Card padded={false} className="mt-8 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="border-b border-hairline bg-cloud">
                  <SortableTh sortKey="opportunity" sort={sort} onSort={toggleSort}>
                    Opportunity
                  </SortableTh>
                  <SortableTh sortKey="stage" sort={sort} onSort={toggleSort}>
                    Stage
                  </SortableTh>
                  <SortableTh sortKey="value" sort={sort} onSort={toggleSort} align="right">
                    Value
                  </SortableTh>
                  <SortableTh sortKey="close" sort={sort} onSort={toggleSort} align="right">
                    Close
                  </SortableTh>
                  <SortableTh sortKey="owner" sort={sort} onSort={toggleSort}>
                    Owner
                  </SortableTh>
                  <SortableTh sortKey="health" sort={sort} onSort={toggleSort}>
                    Status
                  </SortableTh>
                </tr>
              </thead>
              <tbody>
                {filtered.map((view) => (
                  <DealRow key={view.deal.id} view={view} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}

/**
 * A sortable column header.
 *
 * `aria-sort` on the `th` is what makes this legible to a screen reader — the caret alone
 * is decoration. The caret only appears on the active column, because six carets pointing
 * in various directions is noise, not information.
 */
function SortableTh({
  children,
  sortKey,
  sort,
  onSort,
  align = 'left',
}: {
  children: string
  sortKey: SortKey
  sort: { key: SortKey; dir: Direction }
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
}) {
  const active = sort.key === sortKey

  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-16 py-8', align === 'right' && 'text-right')}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'inline-flex items-center gap-8 rounded-md text-caption font-semibold tracking-wide uppercase',
          'transition-colors duration-(--duration-hover) ease-(--ease-ui)',
          active ? 'text-ink-navy' : 'text-slate-gray hover:text-ink-navy',
          align === 'right' && 'flex-row-reverse',
        )}
      >
        {children}
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          className={cn(
            'size-8 shrink-0 transition-opacity duration-(--duration-hover)',
            active ? 'opacity-100' : 'opacity-0',
            active && sort.dir === 'desc' && 'rotate-180',
          )}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M6 10V2M2.5 5.5L6 2l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </th>
  )
}

function DealRow({ view }: { view: DealView }) {
  const { deal, account, lead, partner, stage } = view

  return (
    <tr className="border-b border-hairline transition-colors last:border-0 hover:bg-cloud">
      <td className="px-16 py-8">
        <Link
          to={routes.deal(deal.id)}
          className="block text-body-sm font-semibold text-ink-navy hover:text-signal-blue"
        >
          {deal.name}
        </Link>
        <span className="mt-[2px] block text-caption text-slate-gray">
          {account.name}
          {partner && ` · via ${partner.name}`}
          {lead && ` · ${lead.businessUnit}`}
        </span>
      </td>

      <td className="px-16 py-8">
        <span className="flex items-center gap-8">
          <span
            className="size-8 shrink-0 rounded-full"
            style={{ backgroundColor: stage.color }}
            aria-hidden="true"
          />
          <span className="text-body-sm text-ink-navy">{stage.shortName}</span>
          <span className="text-caption text-mist-gray tabular-nums">{stage.probability}%</span>
        </span>
      </td>

      <td className="px-16 py-8 text-right text-body-sm font-semibold text-ink-navy tabular-nums">
        {compactMoney(deal.value)}
      </td>

      <td className="px-16 py-8 text-right text-caption whitespace-nowrap text-slate-gray">
        {relativeToNow(deal.expectedCloseDate)}
      </td>

      <td className="px-16 py-8 text-body-sm text-slate-gray">{view.ownerName}</td>

      <td className="px-16 py-8">
        <HealthBadge health={view.health} detail={view.healthDetail} />
      </td>
    </tr>
  )
}
