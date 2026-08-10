import type { StageBucket } from '@/lib/rollup'
import type { PipelineTemplate } from '@/types/domain'
import { compactMoney } from '@/lib/format'

/**
 * Deal counts per stage for the current pipeline (R5), with a bar so the shape of the
 * funnel is readable without comparing numbers.
 */
export function PipelineHealth({
  pipeline,
  buckets,
}: {
  pipeline: PipelineTemplate
  buckets: StageBucket[]
}) {
  const maxCount = Math.max(1, ...buckets.map((b) => b.views.length))

  return (
    <div>
      <p className="mb-16 text-caption font-semibold tracking-wide text-slate-gray uppercase">
        {pipeline.name} pipeline
      </p>
      <ul className="space-y-16">
        {buckets.map((bucket) => (
          <li key={bucket.stage.id}>
            <div className="flex items-baseline justify-between gap-16">
              <span className="min-w-0 truncate text-body-sm font-semibold text-ink-navy">
                {bucket.stage.name}
              </span>
              <span className="shrink-0 text-caption text-slate-gray tabular-nums">
                {bucket.views.length} · {compactMoney(bucket.value)}
              </span>
            </div>
            <div className="mt-8 h-8 overflow-hidden rounded-full bg-pebble">
              <div
                className="h-full rounded-full bg-signal-blue"
                style={{ width: `${(bucket.views.length / maxCount) * 100}%` }}
              />
            </div>
            <span className="mt-8 block text-caption text-mist-gray">
              {bucket.stage.probability}% probability
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
