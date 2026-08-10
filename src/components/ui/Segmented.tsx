import { cn } from '@/lib/cn'

/**
 * A segmented control: a small, closed set of choices where every option is worth seeing.
 *
 * Preferred over a `<select>` when there are two to four options, because the current
 * value and the alternatives are both visible without a click — which is the whole point
 * of a filter bar. Beyond four options a select is still the right control.
 *
 * The active segment is a raised Paper surface on the Pebble track, which is the same
 * elevation language design.md uses for cards on the canvas.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  /** Names the group for assistive tech, since the buttons alone have no shared context. */
  label: string
  value: T
  options: Array<{ value: T; label: string; count?: number }>
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('inline-flex items-center gap-[2px] rounded-lg bg-pebble p-[2px]', className)}
    >
      {options.map((option) => {
        const active = option.value === value

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center gap-8 rounded-md px-16 py-[6px] text-body-sm font-semibold whitespace-nowrap',
              'transition-colors duration-(--duration-hover) ease-(--ease-ui)',
              active
                ? 'bg-paper text-ink-navy shadow-sm'
                : 'text-slate-gray hover:text-ink-navy',
            )}
          >
            {option.label}
            {option.count !== undefined && (
              <span
                className={cn(
                  'text-caption tabular-nums',
                  active ? 'text-slate-gray' : 'text-mist-gray',
                )}
              >
                {option.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * A single on/off filter, styled as a chip so it sits naturally beside the segmented
 * groups. `aria-pressed` rather than a checkbox: it reads as a toggle button, which is
 * what it looks like.
 */
export function ToggleChip({
  pressed,
  onChange,
  children,
}: {
  pressed: boolean
  onChange: (pressed: boolean) => void
  children: string
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!pressed)}
      aria-pressed={pressed}
      className={cn(
        'inline-flex items-center gap-8 rounded-lg border px-16 py-8 text-body-sm font-semibold whitespace-nowrap',
        'transition-colors duration-(--duration-hover) ease-(--ease-ui)',
        pressed
          ? 'border-signal-blue bg-badge-fill text-deep-cobalt'
          : 'border-hairline bg-paper text-slate-gray hover:border-mist-gray hover:text-ink-navy',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'grid size-16 place-items-center rounded-sm border',
          pressed ? 'border-signal-blue bg-signal-blue text-paper' : 'border-mist-gray',
        )}
      >
        {pressed && (
          <svg viewBox="0 0 12 12" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      {children}
    </button>
  )
}

/** A removable summary of one active filter. Clicking it clears that filter. */
export function FilterPill({ label, value, onClear }: { label: string; value: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      className={cn(
        'inline-flex items-center gap-8 rounded-full bg-badge-fill py-[4px] pr-8 pl-16 text-caption font-medium text-deep-cobalt',
        'transition-colors duration-(--duration-hover) ease-(--ease-ui) hover:bg-pebble hover:text-ink-navy',
      )}
    >
      <span className="text-mist-gray">{label}</span>
      {value}
      <span aria-hidden="true" className="grid size-16 place-items-center rounded-full bg-paper/60">
        <svg viewBox="0 0 12 12" className="size-8" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 3l6 6M9 3l-6 6" strokeLinecap="round" />
        </svg>
      </span>
      <span className="sr-only">Clear {label} filter</span>
    </button>
  )
}
