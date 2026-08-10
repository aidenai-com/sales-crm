import { useMemo, useState } from 'react'
import { useStore } from '@/data/store'
import { routes, useRouter } from '@/app/router'
import { useAuth } from '@/app/auth'
import {
  bucketByStage,
  buildActivityViews,
  buildDealViews,
  dashboardMetrics,
  highPriorityDeals,
} from '@/lib/rollup'
import { activityRows, dealRows } from '@/lib/export'
import { Card } from '@/components/ui/Card'
import { Skeleton, SkeletonMetricStrip, SkeletonRows } from '@/components/ui/Skeleton'
import { ExportButton } from '@/components/ui/ExportButton'
import { Tabs } from '@/components/ui/Tabs'
import { DashboardHero } from './DashboardHero'
import { ReminderInbox } from './ReminderInbox'
import { MetricStrip } from './MetricStrip'
import { HighPriorityDeals } from './HighPriorityDeals'
import { PipelineHealth } from './PipelineHealth'
import { RecentActivity } from './RecentActivity'
import { TeamPerformance } from './TeamPerformance'

const RECENT_ACTIVITY_LIMIT = 8

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-page px-24 pb-96">
      <section className="grid items-center gap-48 py-32 lg:grid-cols-[1fr_400px]">
        <div>
          <Skeleton className="h-[12px] w-[64px]" />
          <Skeleton className="mt-16 h-48 w-4/5" />
          <Skeleton className="mt-24 h-24 w-3/5" />
          <Skeleton className="mt-32 h-40 w-[180px]" />
        </div>
        <Skeleton className="h-[220px] w-full rounded-2xl" />
      </section>

      <SkeletonMetricStrip />

      <div className="mt-48 grid gap-24 lg:grid-cols-[1fr_360px]">
        <Card>
          <Skeleton className="h-24 w-[220px]" />
          <div className="mt-24">
            <SkeletonRows rows={5} />
          </div>
        </Card>
        <Card>
          <Skeleton className="h-24 w-[140px]" />
          <div className="mt-24 space-y-16">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i}>
                <Skeleton className="h-16 w-3/4" />
                <Skeleton className="mt-8 h-8 w-full rounded-full" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

/**
 * An action surface, not a reporting surface (spec 4.1). Order follows what a rep needs
 * first: what needs me, then the numbers, then what is where, then what changed.
 */
export function Dashboard() {
  const { snapshot, status } = useStore()
  const { navigate } = useRouter()
  const { isAdmin } = useAuth()
  const [healthPipelineId, setHealthPipelineId] = useState(snapshot.pipelines[0]?.id ?? '')

  const views = useMemo(() => buildDealViews(snapshot), [snapshot])
  const metrics = useMemo(() => dashboardMetrics(views), [views])
  const priority = useMemo(() => highPriorityDeals(views), [views])
  // Uncapped: the hero walks the whole queue, while the card list below stays at six.
  const attentionQueue = useMemo(() => highPriorityDeals(views, Number.POSITIVE_INFINITY), [views])
  const activityViews = useMemo(() => buildActivityViews(snapshot), [snapshot])
  const recent = useMemo(() => activityViews.slice(0, RECENT_ACTIVITY_LIMIT), [activityViews])

  const healthPipeline =
    snapshot.pipelines.find((p) => p.id === healthPipelineId) ?? snapshot.pipelines[0]

  const buckets = useMemo(
    () =>
      healthPipeline
        ? bucketByStage(
            healthPipeline,
            views.filter((v) => v.pipeline.id === healthPipeline.id),
          )
        : [],
    [healthPipeline, views],
  )

  // The dashboard's layout is fixed and known, so a skeleton of that layout beats a
  // spinner: the page does not jump when the data lands.
  if (status === 'loading') return <DashboardSkeleton />

  return (
    <div className="mx-auto max-w-page px-24 pb-96">
      <DashboardHero
        queue={attentionQueue}
        onViewDeals={() => navigate(routes.deals)}
      />

      {/* Dated work outranks the queue below it: something due today has to be seen today,
          while the largest at-risk deal will still be at-risk in an hour. */}
      <ReminderInbox />

      <MetricStrip metrics={metrics} />

      <div className="mt-48 grid gap-24 lg:grid-cols-[1fr_360px]">
        <Card>
          <div className="mb-8 flex flex-wrap items-center justify-between gap-16">
            <div>
              <h2 className="text-subheading font-bold text-ink-navy">High priority deals</h2>
              <p className="mt-8 text-body-sm text-slate-gray">
                Overdue or untouched for more than {21} days, largest first.
              </p>
            </div>
            <ExportButton
              sheets={[{ name: 'High priority', rows: dealRows(priority) }]}
              filenameBase="high-priority-deals"
              label="Download"
            />
          </div>
          <HighPriorityDeals views={priority} />
        </Card>

        <Card>
          <div className="mb-24 flex items-center justify-between gap-16">
            <h2 className="text-body-lg font-semibold text-ink-navy">Pipeline health</h2>
          </div>

          <div className="mb-24">
            <Tabs
              ariaLabel="Pipeline for health breakdown"
              activeId={healthPipeline?.id ?? ''}
              onChange={setHealthPipelineId}
              items={snapshot.pipelines.map((p) => ({ id: p.id, label: p.name }))}
            />
          </div>

          {healthPipeline && <PipelineHealth pipeline={healthPipeline} buckets={buckets} />}
        </Card>
      </div>

      <div className="mt-24">
        <Card>
          <div className="mb-8 flex flex-wrap items-center justify-between gap-16">
            <div>
              <h2 className="text-subheading font-bold text-ink-navy">Recent activity</h2>
              <p className="mt-8 text-body-sm text-slate-gray">
                Logged against accounts, leads, and deals.
              </p>
            </div>
            <ExportButton
              sheets={[{ name: 'Activity', rows: activityRows(activityViews) }]}
              filenameBase="activity-log"
              label="Download"
            />
          </div>
          <RecentActivity views={recent} />
        </Card>
      </div>

      {/* Admin-only. The endpoint behind it returns 403 for a rep, so this is presentation
          rather than the boundary itself. */}
      {isAdmin && <TeamPerformance />}
    </div>
  )
}
