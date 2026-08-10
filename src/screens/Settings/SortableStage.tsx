import type { ReactNode } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/lib/cn'

/**
 * Makes one stage row draggable within its pipeline.
 *
 * The handle is separate from the row body so that dragging and expanding a stage to edit
 * it are different gestures — with the whole row as a drag target, every attempt to open
 * the settings would start a drag instead.
 *
 * dnd-kit's sortable also gives keyboard reordering for free (tab to the handle, space to
 * lift, arrows to move, space to drop), which arrow buttons alone never provided to
 * pointer users and drag alone never provides to keyboard users.
 */
export function SortableStage({
  id,
  disabled,
  children,
}: {
  id: string
  disabled: boolean
  children: (handle: ReactNode, dragging: boolean) => ReactNode
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled })

  const handle = (
    <button
      ref={setActivatorNodeRef}
      {...listeners}
      {...attributes}
      disabled={disabled}
      aria-label="Reorder stage"
      className={cn(
        'grid size-24 shrink-0 place-items-center rounded-md text-mist-gray',
        'transition-colors duration-(--duration-hover) ease-ui',
        disabled
          ? 'cursor-not-allowed opacity-40'
          : 'cursor-grab hover:bg-pebble hover:text-slate-gray active:cursor-grabbing',
      )}
    >
      <svg viewBox="0 0 16 16" className="size-16" fill="currentColor" aria-hidden="true">
        <circle cx="6" cy="3" r="1.2" />
        <circle cx="10" cy="3" r="1.2" />
        <circle cx="6" cy="8" r="1.2" />
        <circle cx="10" cy="8" r="1.2" />
        <circle cx="6" cy="13" r="1.2" />
        <circle cx="10" cy="13" r="1.2" />
      </svg>
    </button>
  )

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn('list-none', isDragging && 'z-10 opacity-80')}
    >
      {children(handle, isDragging)}
    </li>
  )
}
