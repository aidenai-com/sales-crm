import { useEffect, useRef, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * The right-side drawer is the only detail surface in the app (spec 7.1: never lose
 * context). It overlays the workspace instead of replacing it, so the board or tree
 * behind it keeps its scroll position, tab, and expansion state.
 */
export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  eyebrow?: string
  children: ReactNode
  footer?: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)

    const previouslyFocused = document.activeElement as HTMLElement | null
    panelRef.current?.focus()

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused?.focus()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-scrim/25 motion-safe:animate-[fade-in_140ms_ease-out]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col bg-paper shadow-sm-2',
          'motion-safe:animate-[slide-in_180ms_cubic-bezier(0.22,1,0.36,1)]',
        )}
      >
        <header className="flex items-start justify-between gap-16 border-b border-hairline px-24 py-24">
          <div className="min-w-0">
            {eyebrow && (
              <p className="mb-8 text-caption font-semibold tracking-wide text-slate-gray uppercase">
                {eyebrow}
              </p>
            )}
            <h2 className="text-subheading font-bold text-ink-navy">{title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="-mr-8 grid size-32 shrink-0 place-items-center rounded-lg text-slate-gray transition-colors hover:bg-pebble hover:text-ink-navy"
          >
            <svg viewBox="0 0 20 20" className="size-16" fill="none" stroke="currentColor" strokeWidth="1.75">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-24 py-24">{children}</div>

        {footer && <footer className="border-t border-hairline px-24 py-16">{footer}</footer>}
      </div>
    </div>
  )
}
