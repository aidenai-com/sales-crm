import { useDraggable } from '@dnd-kit/core'
import type { DealView } from '@/lib/rollup'
import { compactMoney, relativeToNow } from '@/lib/format'
import { HealthDot } from '@/components/ui/Badge'
import { ChampionBadge, useChampionGap } from '@/components/ui/ChampionWarning'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { MoveToStageMenu } from './MoveToStageMenu'

/**
 * Deal card: customer, opportunity, value, owner, status (spec 4.2). On the partner
 * pipeline it also shows the Partner alongside the Customer (R8).
 *
 * Three ways to act on a card, because dragging alone is not enough on a wide board:
 * click the body to edit in the drawer, drag the handle to a nearby stage, or use the
 * menu to jump to any stage without scrolling.
 */
export function DealCard({
  view,
  onOpen,
  onMove,
  pending = false,
  canMove = true,
}: {
  view: DealView
  onOpen: () => void
  onMove: (stageId: string) => void
  /** A write for this deal is in flight; the card shows it rather than looking settled. */
  pending?: boolean
  /** Reps move only deals they own. The API enforces it; this stops the UI offering it. */
  canMove?: boolean
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: view.deal.id,
    disabled: !canMove,
  })

<<<<<<< Updated upstream
  const isPartnerDeal = view.pipeline.tracksPartner
=======
  const championGap = useChampionGap(view.deal.id)

>>>>>>> Stashed changes

  return (
    <div
      ref={setNodeRef}
      style={transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined}
      className={cn('relative', isDragging && 'z-20 opacity-90')}
    >
      <div
        className={cn(
          'rounded-2xl border bg-paper p-16',
          'transition-[box-shadow,border-color,opacity] duration-(--duration-hover) ease-ui',
          isDragging ? 'shadow-sm-2' : 'shadow-sm hover:shadow-sm-3',
          // Dimmed and outlined while saving: the optimistic move already showed, so this
          // says "not confirmed yet" without moving the card a second time.
          pending ? 'border-signal-blue opacity-70' : 'border-hairline',
        )}
      >
        <div className="flex items-start gap-8">
          {pending ? (
            <Spinner className="mt-[2px] text-signal-blue" label="Saving" />
          ) : (
            <HealthDot health={view.health} detail={view.healthDetail} />
          )}

          <button onClick={onOpen} className="min-w-0 flex-1 text-left" aria-label={`Open ${view.deal.name}`}>
            <span className="block truncate text-caption font-semibold text-slate-gray">
              {view.account.name}
            </span>
            <span className="mt-[2px] block text-body-sm leading-snug font-semibold text-ink-navy">
              {view.deal.name}
            </span>
          </button>

          <div className="-mt-[2px] -mr-8 flex shrink-0 items-center">
            {/* Drag handle kept separate so clicking the card body still opens the drawer. */}
            <button
              ref={setActivatorNodeRef}
              {...listeners}
              {...attributes}
              disabled={!canMove}
              aria-label={
                canMove
                  ? `Drag ${view.deal.name}`
                  : `${view.deal.name} is owned by ${view.ownerName}`
              }
              title={canMove ? undefined : `Only ${view.ownerName} can move this deal`}
              className={cn(
                'grid size-24 place-items-center rounded-md text-mist-gray',
                canMove
                  ? 'cursor-grab hover:bg-pebble hover:text-slate-gray active:cursor-grabbing'
                  : 'cursor-not-allowed opacity-30',
              )}
            >
              <svg viewBox="0 0 16 16" className="size-16" fill="currentColor" aria-hidden="true">
                <circle cx="6" cy="4" r="1.2" />
                <circle cx="10" cy="4" r="1.2" />
                <circle cx="6" cy="8" r="1.2" />
                <circle cx="10" cy="8" r="1.2" />
                <circle cx="6" cy="12" r="1.2" />
                <circle cx="10" cy="12" r="1.2" />
              </svg>
            </button>

            <MoveToStageMenu
              dealId={view.deal.id}
              dealName={view.deal.name}
              stages={view.pipeline.stages}
              currentStageId={view.deal.stageId}
              canMove={canMove}
              ownerName={view.ownerName}
              onMove={onMove}
            />
          </div>
        </div>

        {isPartnerDeal && (
          <p className="mt-8 truncate text-caption text-slate-gray">
            <span className="text-mist-gray">Partner</span> {view.partner?.name ?? 'Not set'}
          </p>
        )}

        <div className="mt-16 flex items-end justify-between gap-8">
          <span className="text-body-sm font-bold text-ink-navy tabular-nums">
            {compactMoney(view.deal.value)}
          </span>
          <span className="text-caption text-slate-gray">{relativeToNow(view.deal.expectedCloseDate)}</span>
        </div>

        <div className="mt-8 flex items-center justify-between gap-8">
          <p className="truncate text-caption text-mist-gray">{view.ownerName}</p>
          {/* Below the money, not beside the health dot: the dot says whether the deal is in trouble,
              and this says whether it is allowed to move. Two different questions. */}
          {championGap && <ChampionBadge gap={championGap} />}
        </div>
      </div>
    </div>
  )
}
