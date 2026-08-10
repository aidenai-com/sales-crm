import { cn } from '@/lib/cn'

/**
 * A thin bar under the nav that appears whenever a request is in flight.
 *
 * This is the catch-all signal: individual buttons show their own spinner, but a
 * background refetch after a save has no button to attach to, and silence there reads as
 * "nothing happened". It is indeterminate on purpose — the app cannot know how long a
 * request will take, and a fake progress bar that stalls at 90% is worse than an honest
 * sweep.
 */
export function ActivityBar({ active }: { active: boolean }) {
  return (
    <div
      className="pointer-events-none fixed top-64 right-0 left-0 z-30 h-[2px] overflow-hidden"
      role="status"
      aria-live="polite"
      aria-label={active ? 'Loading' : ''}
    >
      <div
        className={cn(
          'h-full w-full origin-left bg-signal-blue transition-opacity duration-200',
          active
            ? 'opacity-100 motion-safe:animate-[indeterminate_1100ms_ease-in-out_infinite]'
            : 'opacity-0',
        )}
      />
    </div>
  )
}
