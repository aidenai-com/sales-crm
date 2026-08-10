import type { Stage } from '@/types/domain'
import { Menu, MenuDivider, MenuItem, MenuLabel } from '@/components/ui/Menu'
import { Link, routes } from '@/app/router'
import { cn } from '@/lib/cn'

/**
 * Moves a deal to any stage in one click.
 *
 * This exists because dragging across a six-stage board means scrolling: getting a deal
 * from stage 1 to stage 6 was a long horizontal drag through columns you do not care
 * about. Picking the destination by name is faster, works on a phone, and is the only
 * path that works without a pointer at all.
 */
export function MoveToStageMenu({
  dealId,
  dealName,
  stages,
  currentStageId,
  onMove,
  canMove = true,
  ownerName,
}: {
  dealId: string
  dealName: string
  stages: Stage[]
  currentStageId: string
  onMove: (stageId: string) => void
  /** Reps move only their own deals; the menu still opens, but without the stage list. */
  canMove?: boolean
  ownerName?: string
}) {
  const ordered = [...stages].sort((a, b) => a.position - b.position)

  return (
    <Menu
      label={`Actions for ${dealName}`}
      trigger={
        <svg viewBox="0 0 16 16" className="size-16" fill="currentColor" aria-hidden="true">
          <circle cx="8" cy="3" r="1.3" />
          <circle cx="8" cy="8" r="1.3" />
          <circle cx="8" cy="13" r="1.3" />
        </svg>
      }
    >
      {(close) => (
        <>
          {!canMove && (
            <p className="px-16 py-8 text-caption text-slate-gray">
              Owned by {ownerName ?? 'another rep'}. Only they can move it.
            </p>
          )}

          {canMove && <MenuLabel>Move to stage</MenuLabel>}
          {canMove && ordered.map((stage) => {
            const current = stage.id === currentStageId
            return (
              <MenuItem
                key={stage.id}
                selected={current}
                disabled={current}
                onSelect={() => {
                  onMove(stage.id)
                  close()
                }}
              >
                <span
                  className="size-8 shrink-0 rounded-full"
                  style={{ backgroundColor: stage.color }}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{stage.name}</span>
                <span className={cn('shrink-0 text-caption tabular-nums', current ? 'text-slate-gray' : 'text-mist-gray')}>
                  {current ? 'Current' : `${stage.probability}%`}
                </span>
              </MenuItem>
            )
          })}

          {canMove && <MenuDivider />}

          <Link
            to={routes.deal(dealId)}
            role="menuitem"
            onClick={close}
            className="flex w-full items-center gap-8 px-16 py-8 text-body-sm text-ink-navy transition-colors hover:bg-pebble"
          >
            Open full view
            <svg viewBox="0 0 16 16" className="size-16" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M6 3h7v7M13 3L6.5 9.5M11 13H3V5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </>
      )}
    </Menu>
  )
}
