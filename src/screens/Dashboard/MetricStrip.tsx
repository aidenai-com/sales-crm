import type { DashboardMetrics } from '@/lib/rollup'
import { compactMoney } from '@/lib/format'
import { cn } from '@/lib/cn'

/**
 * Four numbers, each answering a question a rep actually has at 9am. Deliberately not a
 * vanity strip: no totals-to-date, no win rates, nothing you cannot act on today.
 */
export function MetricStrip({ metrics }: { metrics: DashboardMetrics }) {
  const tiles = [
    { label: 'Open pipeline', value: compactMoney(metrics.openPipelineValue), hint: 'Across both pipelines' },
    { label: 'Advanced stage', value: String(metrics.advancedStageCount), hint: '55% probability or higher' },
    { label: 'Closing this week', value: String(metrics.closingThisWeekCount), hint: 'Within seven days' },
    {
      label: 'Needs attention',
      value: String(metrics.needsAttentionCount),
      hint: 'Overdue or untouched for 21 days',
      alarm: metrics.needsAttentionCount > 0,
    },
  ]

  return (
    <dl className="grid grid-cols-2 gap-16 md:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="rounded-2xl border border-hairline bg-paper p-24 shadow-sm"
        >
          <dt className="text-caption font-semibold tracking-wide text-slate-gray uppercase">{tile.label}</dt>
          <dd
            className={cn(
              'mt-8 text-heading-sm font-bold tabular-nums',
              tile.alarm ? 'text-risk' : 'text-ink-navy',
            )}
          >
            {tile.value}
          </dd>
          <dd className="mt-8 text-caption text-slate-gray">{tile.hint}</dd>
        </div>
      ))}
    </dl>
  )
}
