import { useEffect, useState } from 'react'
import { teamApi, type RepPerformance, type TeamOverview } from '@/api/team'
import { errorMessage } from '@/api/client'
import { useSelection } from '@/app/selection'
import { useCreation } from '@/app/creation'
import { Button } from '@/components/ui/Button'
import { compactMoney } from '@/lib/format'
import { Card } from '@/components/ui/Card'
import { HealthBadge } from '@/components/ui/Badge'
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'

/**
 * The admin-only view of the team.
 *
 * This is BRD R11 — per-rep deal counts — which spec.md deferred and which has now been
 * asked for. It loads separately from the dashboard rather than being folded into
 * /dashboard/summary, because that endpoint is scoped to the caller and this one
 * deliberately is not: keeping them apart keeps the "reps see only their own" rule from
 * having an exception carved into it.
 */
export function TeamPerformance() {
  const { openCreate } = useCreation()
  const [overview, setOverview] = useState<TeamOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    teamApi
      .overview()
      .then((data) => !cancelled && setOverview(data))
      .catch((caught) => !cancelled && setError(errorMessage(caught)))
    return () => {
      cancelled = true
    }
  }, [])

  if (error) {
    return (
      <Card>
        <h2 className="text-subheading font-bold text-ink-navy">Team</h2>
        <p className="mt-8 text-body-sm text-risk">{error}</p>
      </Card>
    )
  }

  if (!overview) {
    return (
      <Card>
        <Skeleton className="h-24 w-[180px]" />
        <div className="mt-24">
          <SkeletonRows rows={4} />
        </div>
      </Card>
    )
  }

  return (
    <section className="mt-48">
      <div className="mb-24 flex flex-wrap items-end justify-between gap-16">
        <div>
          <h2 className="text-heading-sm font-bold text-ink-navy">Team</h2>
          <p className="mt-8 text-body text-slate-gray">
            Visible to administrators only. Everyone else sees just their own pipeline.
          </p>
        </div>
        <div className="flex items-end gap-32">
          <Button size="sm" onClick={() => openCreate({ kind: 'user' })}>
            New user
          </Button>
        <dl className="flex items-end gap-32">
          <Total label="Open" value={compactMoney(overview.totalOpenValue)} />
          <Total label="At risk" value={String(overview.totalAtRisk)} alarm={overview.totalAtRisk > 0} />
        </dl>
        </div>
      </div>

      <Card padded={false} className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] border-collapse text-left">
            <thead>
              <tr className="border-b border-hairline bg-cloud">
                <Th>Rep</Th>
                <Th align="right">Open</Th>
                <Th align="right">Value</Th>
                <Th align="right">At risk</Th>
                <Th align="right">Stalled</Th>
                <Th align="right">Closing</Th>
                <Th align="right">Won</Th>
                <Th align="right">Activity 30d</Th>
              </tr>
            </thead>
            <tbody>
              {overview.reps.map((rep) => (
                <RepRow key={rep.userId} rep={rep} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-24">
        <Card>
          <h3 className="text-body-lg font-semibold text-ink-navy">Nobody is on these</h3>
          <p className="mt-8 mb-16 text-body-sm text-slate-gray">
            Open deals with nothing logged for over three weeks, longest first.
          </p>

          {overview.staleDeals.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-hairline bg-cloud px-16 py-24 text-center text-body-sm text-slate-gray">
              Every open deal has been touched recently.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {overview.staleDeals.map((deal) => (
                <StaleRow key={deal.id} deal={deal} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </section>
  )
}

function Total({ label, value, alarm }: { label: string; value: string; alarm?: boolean }) {
  return (
    <div className="text-right">
      <dt className="text-caption font-semibold tracking-wide text-slate-gray uppercase">{label}</dt>
      <dd className={cn('mt-8 text-subheading font-bold tabular-nums', alarm ? 'text-risk' : 'text-ink-navy')}>
        {value}
      </dd>
    </div>
  )
}

function Th({ children, align = 'left' }: { children: string; align?: 'left' | 'right' }) {
  return (
    <th
      scope="col"
      className={cn(
        'px-16 py-8 text-caption font-semibold tracking-wide text-slate-gray uppercase whitespace-nowrap',
        align === 'right' && 'text-right',
      )}
    >
      {children}
    </th>
  )
}

function RepRow({ rep }: { rep: RepPerformance }) {
  const empty = rep.openCount === 0

  return (
    <tr className="border-b border-hairline last:border-0 hover:bg-cloud">
      <td className="px-16 py-8">
        <span className="flex items-center gap-8">
          <span className="grid size-24 shrink-0 place-items-center rounded-full bg-ink-navy text-caption font-bold text-paper">
            {rep.initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-body-sm font-semibold text-ink-navy">{rep.name}</span>
            <span className="block truncate text-caption text-slate-gray">
              {rep.role === 'admin' ? 'Administrator' : rep.jobTitle}
            </span>
          </span>
        </span>

        {/* Where their pipeline actually sits — an admin can see at a glance that someone
            has nothing early-stage, which the counts alone would not show. */}
        {rep.stageSlices.length > 0 && (
          <span className="mt-8 flex h-8 w-full max-w-[220px] gap-[2px] overflow-hidden rounded-full">
            {rep.stageSlices.map((slice) => (
              <span
                key={slice.stageId}
                title={`${slice.stageName}: ${slice.count}`}
                style={{ backgroundColor: slice.color, flexGrow: slice.count, flexBasis: 0 }}
              />
            ))}
          </span>
        )}
      </td>

      <Td right muted={empty}>{rep.openCount}</Td>
      <Td right muted={empty}>{compactMoney(rep.openValue)}</Td>
      <Td right alarm={rep.atRiskCount > 0}>{rep.atRiskCount}</Td>
      <Td right alarm={rep.stalledCount > 0}>{rep.stalledCount}</Td>
      <Td right muted={rep.closingThisWeekCount === 0}>{rep.closingThisWeekCount}</Td>
      <Td right muted={rep.wonCount === 0}>{rep.wonCount}</Td>
      <Td right muted={rep.recentActivityCount === 0}>{rep.recentActivityCount}</Td>
    </tr>
  )
}

function Td({
  children,
  right,
  alarm,
  muted,
}: {
  children: React.ReactNode
  right?: boolean
  alarm?: boolean
  muted?: boolean
}) {
  return (
    <td
      className={cn(
        'px-16 py-8 text-body-sm tabular-nums',
        right && 'text-right',
        alarm ? 'font-semibold text-risk' : muted ? 'text-mist-gray' : 'text-ink-navy',
      )}
    >
      {children}
    </td>
  )
}

function StaleRow({ deal }: { deal: TeamOverview['staleDeals'][number] }) {
  const { select } = useSelection()

  return (
    <li>
      <button
        onClick={() => select({ type: 'deal', id: deal.id })}
        className="flex w-full items-center gap-16 py-8 text-left transition-colors hover:bg-cloud"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm font-semibold text-ink-navy">{deal.name}</span>
          <span className="block truncate text-caption text-slate-gray">
            {deal.accountName} · {deal.stageName} · {deal.ownerName}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block text-body-sm font-semibold text-ink-navy tabular-nums">
            {compactMoney(deal.value)}
          </span>
          <span className="block text-caption text-slate-gray">
            {deal.daysSinceTouch === null ? 'never touched' : `${deal.daysSinceTouch}d quiet`}
          </span>
        </span>

        <HealthBadge health={deal.health} />
      </button>
    </li>
  )
}
