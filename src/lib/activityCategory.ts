import type { ActivityKind } from '@/types/domain'

/**
 * Activity kinds, grouped into the three things a reader actually distinguishes.
 *
 * A timeline of six undifferentiated entries makes you read every summary to find the one you
 * came for. Grouping answers the scanning question — was this us talking to them, us producing
 * something, or the system recording a consequence — without needing six colours for six kinds,
 * which would spend the whole palette on a single component.
 *
 * Derived from the kind rather than stored on the activity. The mapping has no exceptions, so a
 * column could only ever drift out of step with the enum it duplicates.
 */
export type ActivityCategory = 'touchpoint' | 'document' | 'system'

export const activityCategory: Record<ActivityKind, ActivityCategory> = {
  call: 'touchpoint',
  meeting: 'touchpoint',
  email: 'touchpoint',
  note: 'touchpoint',
  document: 'document',
  'stage-change': 'system',
  // An escalation, not work on the deal. Grouped with the machine-written entries because
  // like them it records that something happened *to* the deal rather than on it.
  nudge: 'system',
}

export const activityKindLabel: Record<ActivityKind, string> = {
  call: 'Call',
  meeting: 'Meeting',
  email: 'Email',
  note: 'Note',
  document: 'Document',
  'stage-change': 'Stage change',
  nudge: 'Nudge',
}

interface CategoryStyle {
  /** The marker's fill. */
  dot: string
  /** Tinted background and text, for the chip form used where a marker is too quiet. */
  chip: string
  /** Shape, so the categories stay separable without relying on hue. */
  glyph: 'dot' | 'paperclip' | 'chevron'
  label: string
}

/**
 * No colour is added to the palette for this.
 *
 * `sky-cyan` and `signal-blue` are both already defined in `styles/theme.css`, and both have
 * dark-mode values. They do sit close together, which is why `glyph` exists: the categories are
 * distinguished by shape as well as fill, so nobody has to resolve two blues from each other —
 * and the distinction survives greyscale, low-quality projection and colour blindness, none of
 * which a hue pair this close would.
 *
 * `system` is deliberately the quietest of the three. Those entries are written by the server,
 * and giving machine bookkeeping the same visual weight as a call somebody made would misreport
 * what the timeline is mostly about.
 */
export const categoryStyle: Record<ActivityCategory, CategoryStyle> = {
  touchpoint: {
    dot: 'bg-signal-blue',
    chip: 'bg-badge-fill text-signal-blue',
    glyph: 'dot',
    label: 'Touchpoint',
  },
  document: {
    dot: 'bg-sky-cyan',
    chip: 'bg-sky-cyan/12 text-sky-cyan',
    glyph: 'paperclip',
    label: 'Document',
  },
  system: {
    dot: 'bg-mist-gray',
    chip: 'bg-pebble text-slate-gray',
    glyph: 'chevron',
    label: 'System',
  },
}

export function styleForKind(kind: ActivityKind): CategoryStyle {
  return categoryStyle[activityCategory[kind]]
}

/**
 * The accessible name for a marker.
 *
 * The category is spoken as well as drawn, because the whole point of the grouping is that a
 * reader can tell a reply from a filed document at a glance — and "at a glance" has to include
 * the reader who is listening rather than looking.
 */
export function markerLabel(kind: ActivityKind): string {
  return `${activityKindLabel[kind]}, ${categoryStyle[activityCategory[kind]].label.toLowerCase()}`
}
