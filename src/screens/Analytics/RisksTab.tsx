import { useMemo, useState } from 'react'
import type { AnalyticsSummary, DealRisk, RiskReason } from '@/types/domain'
import { cn } from '@/lib/cn'
import { compactMoney, shortDate } from '@/lib/format'
import { HealthDot } from '@/components/ui/Badge'
import { Segmented } from '@/components/ui/Segmented'
import { ChartEmpty, ChartPanel, DataTable, StatTile } from '@/components/viz/primitives'
import { AgeingBar } from '@/components/viz/AgeingBar'

/**
 * The exception report: which deals have stopped moving, why, and what to do about them.
 *
 * Built to answer four questions in one row — **who** is stuck (the owner), **where** (the stage, with its
 * ageing), **why** (the reasons), and **what action is required** (the next unticked deliverable). Anything
 * that did not serve one of those four was left out.
 *
 * **Not a scoreboard and not a score.** There is no risk number between 0 and 100, because a score compresses
 * the reasons back into something nobody can act on: an administrator reading "72" learns nothing they can
 * do. The reasons are listed, each with its action, and the ordering is a fact — days past the allowance.
 *
 * **Only exceptions appear.** Four things put a deal here: past its allowance, close date gone, quiet too
 * long, or missing a champion it needs. An untouched checklist three days into a stage is a deal on schedule,
 * and a report that listed it would be a list of every deal.
 *
 * Grouping is the "who vs where" switch. The same rows, re-headed: by owner answers "which rep needs help",
 * by stage answers "which part of the process is jamming" — and a whole stage running hot is a process
 * problem rather than anybody's fault, which is a distinction worth being able to see.
 */

type Grouping = 'owner' | 'stage' | 'none'
type Sorting = 'ageing' | 'value'

const REASON_STYLE: Record<RiskReason['code'], { label: string; className: string }> = {
  // Risk colour for the two that mean the deal is failing now; neutral for the rest. If everything were red
  // nothing would be, and "the checklist is unfinished" is not the same order of problem as "this closed
  // three weeks ago and nobody noticed".
  stuck: { label: 'Stuck', className: 'border-risk bg-risk-fill text-risk' },
  overdue: { label: 'Overdue', className: 'border-risk bg-risk-fill text-risk' },
  cold: { label: 'No contact', className: 'border-hairline bg-pebble text-slate-gray' },
  'no-champion': { label: 'No champion', className: 'border-hairline bg-pebble text-slate-gray' },
  'actions-outstanding': {
    label: 'Actions open',
    className: 'border-hairline bg-pebble text-slate-gray',
  },
  'no-actions-defined': {
    // Marked distinctly because it is not the rep's failing. An admin reading their own configuration gap as
    // a rep's performance problem is the specific misreading this styling exists to prevent.
    label: 'Stage has no actions',
    className: 'border-signal-blue/30 bg-badge-fill text-signal-blue',
  },
}

export function RisksTab({
  summary,
  onOpenDeal,
}: {
  summary: AnalyticsSummary
  onOpenDeal: (id: string) => void
}) {
  const [grouping, setGrouping] = useState<Grouping>('owner')
  const [sorting, setSorting] = useState<Sorting>('ageing')

  const { risks } = summary

  const sorted = useMemo(() => {
    const rows = [...risks.deals]
    if (sorting === 'value') return rows.sort((a, b) => b.value - a.value)
    // The server already ordered by days over; this keeps the two consistent rather than re-deriving it.
    return rows
  }, [risks.deals, sorting])

  const groups = useMemo(() => {
    if (grouping === 'none') return [{ key: 'all', label: 'Every flagged deal', rows: sorted }]

    const byKey = new Map<string, { key: string; label: string; rows: DealRisk[] }>()
    for (const row of sorted) {
      const key = grouping === 'owner' ? row.ownerId : row.stageId
      const label = grouping === 'owner' ? row.ownerName : row.stageName
      const existing = byKey.get(key)
      if (existing) existing.rows.push(row)
      else byKey.set(key, { key, label, rows: [row] })
    }
    // Groups ordered by the worst thing in them, so the rep or stage that needs attention first is first.
    return [...byKey.values()].sort(
      (a, b) =>
        Math.max(...b.rows.map((r) => r.ageing.daysOver)) -
          Math.max(...a.rows.map((r) => r.ageing.daysOver)) ||
        b.rows.length - a.rows.length,
    )
  }, [sorted, grouping])

  return (
    <div className="flex flex-col gap-24">
      <div className="grid gap-16 sm:grid-cols-2 lg:grid-cols-3">
        <StatTile
          label="Stuck"
          value={compactMoney(risks.stuckValue)}
          hint={`${risks.stuckCount} of ${risks.openCount} open deals past their allowance`}
          emphasis
        />
        <StatTile
          label="Needs attention"
          value={String(risks.deals.length)}
          hint="Deals with at least one exception"
        />
        <StatTile
          label="Stages with no actions"
          value={String(risks.withoutActionsCount)}
          // Named as a setup gap, because that is what it is and who can fix it differs.
          hint={
            risks.withoutActionsCount > 0
              ? 'No deliverables defined — add them in Settings'
              : 'Every stage in use defines its deliverables'
          }
        />
      </div>

      <ChartPanel
        title="Deals needing intervention"
        subtitle="Worst first, by how far past its allowance each deal has run. Every row names the next action; open one to work it."
        action={
          <div className="flex flex-wrap items-center gap-8">
            <Segmented
              label="Group deals by"
              value={grouping}
              onChange={setGrouping}
              options={[
                { value: 'owner', label: 'By rep' },
                { value: 'stage', label: 'By stage' },
                { value: 'none', label: 'Flat' },
              ]}
            />
            <Segmented
              label="Sort deals by"
              value={sorting}
              onChange={setSorting}
              options={[
                { value: 'ageing', label: 'Ageing' },
                { value: 'value', label: 'Value' },
              ]}
            />
          </div>
        }
        table={riskTable(sorted)}
      >
        {risks.deals.length === 0 ? (
          <ChartEmpty message="Nothing is stuck, overdue, quiet or missing a champion. Every open deal is inside its allowance." />
        ) : (
          <div className="flex flex-col gap-24">
            {groups.map((group) => (
              <section key={group.key}>
                {grouping !== 'none' && (
                  <h3 className="flex flex-wrap items-baseline justify-between gap-8 border-b border-hairline pb-8">
                    <span className="text-body-sm font-semibold text-ink-navy">{group.label}</span>
                    <span className="text-caption text-slate-gray tabular-nums">
                      {group.rows.length} {group.rows.length === 1 ? 'deal' : 'deals'} ·{' '}
                      {compactMoney(group.rows.reduce((sum, row) => sum + row.value, 0))}
                    </span>
                  </h3>
                )}
                <ol className="flex flex-col">
                  {group.rows.map((row) => (
                    <RiskRow
                      key={row.dealId}
                      row={row}
                      showOwner={grouping !== 'owner'}
                      showStage={grouping !== 'stage'}
                      onOpen={onOpenDeal}
                    />
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}
      </ChartPanel>
    </div>
  )
}

/**
 * One deal, with everything needed to act on it.
 *
 * The row is a button opening the application's own deal drawer, because the point of the report is to be
 * acted on and a dead-end list would make somebody go and search for the deal by name.
 *
 * The next action is given its own line rather than a column, and it is the only line in the row that is not
 * a measurement. An administrator scanning this is looking for what to ask the rep to do, and that sentence
 * should not be competing with four numbers for the same horizontal space.
 */
function RiskRow({
  row,
  showOwner,
  showStage,
  onOpen,
}: {
  row: DealRisk
  showOwner: boolean
  showStage: boolean
  onOpen: (id: string) => void
}) {
  return (
    <li className="border-b border-hairline last:border-0">
      <button
        type="button"
        onClick={() => onOpen(row.dealId)}
        aria-label={`${row.dealName} at ${row.accountName} — open this deal`}
        className={cn(
          '-mx-8 grid w-[calc(100%+16px)] gap-x-16 gap-y-8 rounded-lg px-8 py-16 text-left',
          'transition-colors duration-(--duration-hover) ease-ui hover:bg-cloud',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-blue',
          // One column on a phone, two from a tablet: the ageing bar needs real width to be readable, and
          // stacking it under the name is better than shrinking it to a stub.
          'sm:grid-cols-[minmax(0,1fr)_200px]',
        )}
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-8">
            <HealthDot health={row.health} />
            <span className="text-body-sm font-semibold text-ink-navy">{row.dealName}</span>
            {showStage && (
              <span className="rounded-md bg-pebble px-8 text-caption font-semibold text-slate-gray">
                {row.stageShortName}
              </span>
            )}
          </span>

          <span className="mt-[2px] block truncate text-caption text-slate-gray">
            {row.accountName}
            {showOwner && ` · ${row.ownerName}`} · {compactMoney(row.value)} · closes{' '}
            {shortDate(row.expectedCloseDate)}
          </span>

          <span className="mt-8 flex flex-wrap gap-[4px]">
            {row.reasons.map((reason) => (
              <span
                key={reason.code}
                title={reason.detail}
                className={cn(
                  'rounded-md border px-8 text-caption font-semibold',
                  REASON_STYLE[reason.code].className,
                )}
              >
                {REASON_STYLE[reason.code].label}
              </span>
            ))}
          </span>

          {/* The answer to "what action is required", in the words the rep already has on their checklist. */}
          <span className="mt-8 block text-body-sm text-ink-navy">
            {row.nextAction ? (
              <>
                <span className="font-semibold">Next:</span> {row.nextAction}
                {row.actionsTotal > 0 && (
                  <span className="text-caption text-mist-gray tabular-nums">
                    {' '}
                    ({row.actionsDone} of {row.actionsTotal} done)
                  </span>
                )}
              </>
            ) : (
              <span className="text-slate-gray">
                {row.reasons.find((reason) => reason.code === 'no-actions-defined')?.action ??
                  'Agree a dated next step with the customer.'}
              </span>
            )}
          </span>
        </span>

        <span className="sm:pt-[2px]">
          <AgeingBar ageing={row.ageing} stageName={row.stageName} />
        </span>
      </button>
    </li>
  )
}

function riskTable(rows: DealRisk[]) {
  return (
    <DataTable
      columns={['Deal', 'Owner', 'Stage', 'Days over', 'Next action', 'Value']}
      rows={rows.map((row) => ({
        key: row.dealId,
        cells: [
          row.dealName,
          row.ownerName,
          row.stageShortName,
          row.ageing.daysOver > 0 ? `${row.ageing.daysOver}` : '—',
          row.nextAction ?? 'No deliverables defined',
          compactMoney(row.value),
        ],
      }))}
    />
  )
}
