import { cn } from '@/lib/cn'

/**
 * Placeholder shapes for a first load.
 *
 * Skeletons rather than a single centred spinner, because these screens have a strong,
 * predictable layout: showing its shape while the data arrives means the page does not
 * jump when it does. The shimmer is a slow sweep, not a flash — it should read as
 * "arriving", not demand attention.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block rounded-lg bg-pebble',
        'motion-safe:animate-[shimmer_1400ms_ease-in-out_infinite]',
        className,
      )}
    />
  )
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <span className={cn('block space-y-8', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton
          key={index}
          // The last line runs short, the way a real paragraph does.
          className={cn('h-16', index === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </span>
  )
}

/** Mirrors the dashboard's four-tile metric strip. */
export function SkeletonMetricStrip() {
  return (
    <div className="grid grid-cols-2 gap-16 md:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="rounded-2xl border border-hairline bg-paper p-24 shadow-sm">
          <Skeleton className="h-[12px] w-2/3" />
          <Skeleton className="mt-16 h-32 w-1/2" />
          <Skeleton className="mt-16 h-[12px] w-3/4" />
        </div>
      ))}
    </div>
  )
}

/** Mirrors a stage column of deal cards. */
export function SkeletonBoard({ columns = 5, cards = 3 }: { columns?: number; cards?: number }) {
  return (
    <div className="flex items-stretch gap-16">
      {Array.from({ length: columns }, (_, column) => (
        <section
          key={column}
          className="flex w-[260px] shrink-0 flex-col rounded-2xl border border-hairline bg-cloud"
        >
          <div className="border-b border-hairline px-16 py-16">
            <Skeleton className="h-16 w-3/4" />
            <Skeleton className="mt-8 h-[12px] w-1/2" />
          </div>
          <div className="flex flex-col gap-8 p-8">
            {Array.from({ length: Math.max(1, cards - column) }, (_, card) => (
              <div key={card} className="rounded-2xl border border-hairline bg-paper p-16">
                <Skeleton className="h-[12px] w-1/2" />
                <Skeleton className="mt-8 h-16 w-full" />
                <Skeleton className="mt-16 h-16 w-1/3" />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="divide-y divide-hairline">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-16 py-16">
          <Skeleton className="size-24 shrink-0 rounded-full" />
          <span className="min-w-0 flex-1">
            <Skeleton className="h-16 w-2/5" />
            <Skeleton className="mt-8 h-[12px] w-1/4" />
          </span>
          <Skeleton className="h-16 w-[72px] shrink-0" />
        </div>
      ))}
    </div>
  )
}
