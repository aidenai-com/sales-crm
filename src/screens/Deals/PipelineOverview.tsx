import type { PipelineTemplate } from '@/types/domain'
import type { DealView } from '@/lib/rollup'
import { bucketByStage } from '@/lib/rollup'
import { compactMoney } from '@/lib/format'
import { cn } from '@/lib/cn'

/**
 * The whole pipeline as one proportional bar per template: every stage, its count, its
 * value, and its share of the total. Answers "where does everything sit" in a glance,
 * which the board cannot do while it is scrolled.
 */
export function PipelineOverview({
  pipelines,
  views,
  activeStageId,
  onSelectStage,
}: {
  pipelines: PipelineTemplate[]
  views: DealView[]
  activeStageId: string | null
  onSelectStage: (stageId: string | null) => void
}) {
  return (
    <div className="space-y-24">
      {pipelines.map((pipeline) => {
        const own = views.filter((v) => v.pipeline.id === pipeline.id)
        const buckets = bucketByStage(pipeline, own).filter((b) => b.views.length > 0)
        const total = own.length

        return (
          <section key={pipeline.id}>
            <div className="mb-8 flex flex-wrap items-baseline justify-between gap-8">
              <h3 className="text-body-sm font-semibold text-ink-navy">{pipeline.name}</h3>
              <span className="text-caption text-slate-gray tabular-nums">
                {total} {total === 1 ? 'deal' : 'deals'} ·{' '}
                {compactMoney(own.filter((v) => v.isOpen).reduce((sum, v) => sum + v.deal.value, 0))} open
              </span>
            </div>

            {total === 0 ? (
              <p className="rounded-lg bg-pebble px-16 py-8 text-caption text-slate-gray">
                No deals on this pipeline yet.
              </p>
            ) : (
              <>
                <div className="flex h-24 gap-[2px] overflow-hidden rounded-lg">
                  {buckets.map((bucket) => {
                    const active = bucket.stage.id === activeStageId
                    return (
                      <button
                        key={bucket.stage.id}
                        onClick={() => onSelectStage(active ? null : bucket.stage.id)}
                        title={`${bucket.stage.name}: ${bucket.views.length} deals, ${compactMoney(bucket.value)}`}
                        aria-pressed={active}
                        className={cn(
                          'grid place-items-center text-caption font-semibold text-paper transition-opacity',
                          activeStageId && !active ? 'opacity-40' : 'opacity-100',
                        )}
                        style={{
                          backgroundColor: bucket.stage.color,
                          flexGrow: bucket.views.length,
                          flexBasis: 0,
                        }}
                      >
                        {bucket.views.length}
                      </button>
                    )
                  })}
                </div>

                <ul className="mt-8 flex flex-wrap gap-x-16 gap-y-8">
                  {buckets.map((bucket) => (
                    <li key={bucket.stage.id}>
                      <button
                        onClick={() =>
                          onSelectStage(bucket.stage.id === activeStageId ? null : bucket.stage.id)
                        }
                        className="flex items-center gap-8 text-caption text-slate-gray hover:text-ink-navy"
                      >
                        <span
                          className="size-8 shrink-0 rounded-full"
                          style={{ backgroundColor: bucket.stage.color }}
                          aria-hidden="true"
                        />
                        <span className={cn(bucket.stage.id === activeStageId && 'font-semibold text-ink-navy')}>
                          {bucket.stage.shortName}
                        </span>
                        <span className="tabular-nums text-mist-gray">{compactMoney(bucket.value)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}
