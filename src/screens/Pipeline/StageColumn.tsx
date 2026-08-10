import { useDroppable } from '@dnd-kit/core'
import type { StageBucket } from '@/lib/rollup'
import { useSelection } from '@/app/selection'
import { compactMoney } from '@/lib/format'
import { cn } from '@/lib/cn'
import { DealCard } from './DealCard'

/**
 * One stage column, rendered from the active pipeline template — the stage list is never
 * hardcoded, so a new pipeline type needs no change here (spec 9).
 *
 * Columns collapse to a narrow rail. Collapsing the stages you are not working in pulls
 * the two you care about next to each other, which turns a long cross-board drag into a
 * short one.
 */
export function StageColumn({
  bucket,
  collapsed,
  onToggleCollapse,
  onMoveDeal,
  isDealPending,
  canMoveDeal,
  onAddDeal,
}: {
  bucket: StageBucket
  collapsed: boolean
  onToggleCollapse: () => void
  onMoveDeal: (dealId: string, stageId: string) => void
  isDealPending: (dealId: string) => boolean
  canMoveDeal: (ownerId: string) => boolean
  /** Creates a deal that lands in this stage. Absent when creation is not offered. */
  onAddDeal?: () => void
}) {
  const { select } = useSelection()
  const { setNodeRef, isOver } = useDroppable({ id: bucket.stage.id })

  const overLimit = bucket.stage.wipLimit !== null && bucket.views.length > bucket.stage.wipLimit

  if (collapsed) {
    return (
      <section
        ref={setNodeRef}
        aria-label={`${bucket.stage.name}, ${bucket.views.length} deals, collapsed`}
        className={cn(
          'flex w-40 shrink-0 flex-col items-center rounded-2xl border py-16 transition-colors',
          isOver ? 'border-signal-blue bg-badge-fill' : 'border-hairline bg-cloud',
        )}
      >
        <button
          onClick={onToggleCollapse}
          aria-label={`Expand ${bucket.stage.name}`}
          className="flex flex-1 flex-col items-center gap-16"
        >
          <span
            className="size-8 shrink-0 rounded-full"
            style={{ backgroundColor: bucket.stage.color }}
            aria-hidden="true"
          />
          <span className="text-caption font-semibold text-ink-navy tabular-nums">
            {bucket.views.length}
          </span>
          <span
            className="text-caption font-semibold whitespace-nowrap text-slate-gray"
            style={{ writingMode: 'vertical-rl' }}
          >
            {bucket.stage.shortName}
          </span>
        </button>
      </section>
    )
  }

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex w-[260px] shrink-0 flex-col rounded-2xl border transition-colors',
        isOver ? 'border-signal-blue bg-badge-fill' : 'border-hairline bg-cloud',
      )}
      aria-label={`${bucket.stage.name}, ${bucket.views.length} deals`}
    >
      {/* Colour is admin-set data, so it has to be an inline style, not a class. */}
      <div className="h-[3px] rounded-t-2xl" style={{ backgroundColor: bucket.stage.color }} />

      <header className="border-b border-hairline px-16 py-16">
        <div className="flex items-start justify-between gap-8">
          <h3 className="text-body-sm leading-snug font-semibold text-ink-navy">{bucket.stage.name}</h3>
          <div className="flex shrink-0 items-center gap-8">
            <span
              className={cn(
                'rounded-full px-8 py-[2px] text-caption font-semibold tabular-nums',
                overLimit ? 'bg-risk-fill text-risk' : 'bg-pebble text-slate-gray',
              )}
              title={overLimit ? `Over the limit of ${bucket.stage.wipLimit}` : undefined}
            >
              {bucket.views.length}
              {bucket.stage.wipLimit !== null && `/${bucket.stage.wipLimit}`}
            </span>
            <button
              onClick={onToggleCollapse}
              aria-label={`Collapse ${bucket.stage.name}`}
              className="grid size-24 place-items-center rounded-md text-mist-gray hover:bg-pebble hover:text-slate-gray"
            >
              <svg viewBox="0 0 16 16" className="size-16" fill="none" stroke="currentColor" strokeWidth="1.75">
                <path d="M10 4L6 8l4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
        <p className="mt-8 text-caption text-slate-gray tabular-nums">
          {compactMoney(bucket.value)} · {bucket.stage.probability}%
        </p>
      </header>

      <div className="flex min-h-[120px] flex-1 flex-col gap-8 p-8">
        {bucket.views.length === 0 ? (
          <div className="m-auto px-8 text-center">
            <p className="text-caption text-mist-gray">{isOver ? 'Drop to move here' : 'No deals'}</p>
            {!isOver && onAddDeal && (
              <button
                onClick={onAddDeal}
                className="mt-8 text-caption font-semibold text-signal-blue transition-colors duration-(--duration-hover) ease-ui hover:text-deep-cobalt"
              >
                Add one
              </button>
            )}
          </div>
        ) : (
          bucket.views.map((view) => (
            <DealCard
              key={view.deal.id}
              view={view}
              pending={isDealPending(view.deal.id)}
              canMove={canMoveDeal(view.deal.ownerId)}
              onOpen={() => select({ type: 'deal', id: view.deal.id })}
              onMove={(stageId) => onMoveDeal(view.deal.id, stageId)}
            />
          ))
        )}
      </div>
    </section>
  )
}
