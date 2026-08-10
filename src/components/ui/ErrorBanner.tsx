/**
 * A failed mutation, shown without destroying the screen.
 *
 * Sits under the nav as a dismissible strip rather than a modal or a toast that vanishes:
 * the store has already rolled the optimistic change back, so the user needs to know *why*
 * what they just did did not stick, and needs it to stay put until they have read it.
 *
 * The message is the API's own `detail`, which is written for people — "3 deals are still
 * in this stage" — not a status code.
 */
export function ErrorBanner({
  message,
  onDismiss,
}: {
  message: string | null
  onDismiss: () => void
}) {
  if (!message) return null

  return (
    <div className="sticky top-64 z-30 border-b border-risk/20 bg-risk-fill">
      <div
        role="alert"
        className="mx-auto flex max-w-page items-start gap-16 px-24 py-8 motion-safe:animate-[fade-in_160ms_ease-out]"
      >
        <svg
          viewBox="0 0 20 20"
          className="mt-[2px] size-16 shrink-0 text-risk"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <circle cx="10" cy="10" r="7.25" />
          <path d="M10 6.5v4.5M10 13.5v.5" strokeLinecap="round" />
        </svg>

        <p className="min-w-0 flex-1 text-body-sm text-risk">{message}</p>

        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-mr-8 grid size-24 shrink-0 place-items-center rounded-md text-risk transition-colors duration-(--duration-hover) ease-ui hover:bg-risk/10"
        >
          <svg viewBox="0 0 20 20" className="size-16" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  )
}
