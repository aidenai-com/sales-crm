import { cn } from '@/lib/cn'

/**
 * The one spinner in the app.
 *
 * A rotating arc rather than a pulsing dot: an arc communicates "working" without
 * implying progress it cannot measure. Sized in em so it matches whatever text it sits
 * beside, which is what keeps button labels from shifting when one appears.
 */
export function Spinner({
  className,
  label = 'Loading',
}: {
  className?: string
  label?: string
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn('inline-flex shrink-0 items-center justify-center', className)}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[1em] animate-[spin_700ms_linear_infinite]"
        fill="none"
        aria-hidden="true"
      >
        {/* The full ring stays faint so the moving arc reads against it. */}
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.2" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  )
}

/** Centred spinner with a caption, for a panel that has nothing to show yet. */
export function LoadingPanel({ message = 'Loading' }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-16 px-24 py-48 text-slate-gray">
      <Spinner className="text-signal-blue" label={message} />
      <p className="text-body-sm">{message}</p>
    </div>
  )
}
