import type { ActivityKind } from '@/types/domain'
import { cn } from '@/lib/cn'
import { markerLabel, styleForKind } from '@/lib/activityCategory'

/**
 * The coloured glyph that opens an activity entry, shared by every surface that lists activity.
 *
 * Shape as well as colour. The document category's `sky-cyan` and the touchpoint category's
 * `signal-blue` are two blues from the same palette — close enough that hue alone would fail a
 * colour-blind reader, a greyscale print, and anyone glancing at a projected screen. The glyph
 * carries the same distinction the fill does, so either channel is sufficient on its own.
 */
export function ActivityMarker({ kind, className }: { kind: ActivityKind; className?: string }) {
  const style = styleForKind(kind)

  if (style.glyph === 'dot') {
    return (
      <span
        role="img"
        aria-label={markerLabel(kind)}
        className={cn('mt-[3px] grid size-16 shrink-0 place-items-center', className)}
      >
        <span aria-hidden className={cn('size-8 rounded-full', style.dot)} />
      </span>
    )
  }

  return (
    <span
      role="img"
      aria-label={markerLabel(kind)}
      className={cn(
        'mt-[2px] grid size-16 shrink-0 place-items-center rounded-full',
        style.chip,
        className,
      )}
    >
      {style.glyph === 'paperclip' ? <PaperclipGlyph /> : <ChevronGlyph />}
    </span>
  )
}

function PaperclipGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-[10px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <path
        d="M10.5 5.5L6 10a1.75 1.75 0 002.5 2.5l4.5-4.5a3.5 3.5 0 00-5-5L3.5 7.5a5 5 0 007 7"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** A step forward, for the stage changes the server writes. */
function ChevronGlyph() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-[10px]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M6 3.5l5 4.5-5 4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
