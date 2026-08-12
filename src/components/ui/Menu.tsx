import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * A small popover menu anchored to its trigger.
 *
 * Closes on Escape, on outside click, and after a selection. Focus returns to the
 * trigger so keyboard users are not dropped at the top of the document.
 */
export function Menu({
  label,
  trigger,
  children,
  align = 'right',
  className,
  triggerClassName = 'size-24 rounded-md',
}: {
  label: string
  trigger: ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  className?: string
  /**
   * The trigger button's geometry — size and radius.
   *
   * A default rather than something layered on top, because `cn` is a plain join with no
   * tailwind-merge: passing `size-32` alongside a hardcoded `size-24` would leave both classes on the
   * element and let CSS source order pick the winner. Replacing the value is the only safe way.
   *
   * 24px suits a menu hanging off a dense list row, which is where this component started. The header
   * needs 32px to line up with the rest of the bar.
   */
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        setOpen(false)
        triggerRef.current?.focus()
      }
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'grid place-items-center text-mist-gray transition-colors hover:bg-pebble hover:text-slate-gray',
          triggerClassName,
        )}
      >
        {trigger}
      </button>

      {open && (
        <div
          role="menu"
          aria-label={label}
          className={cn(
            'absolute top-full z-30 mt-8 min-w-[240px] overflow-hidden rounded-2xl border border-hairline bg-paper py-8 shadow-sm-2',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {children(() => {
            setOpen(false)
            triggerRef.current?.focus()
          })}
        </div>
      )}
    </div>
  )
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-16 py-8 text-caption font-semibold tracking-wide text-slate-gray uppercase">
      {children}
    </p>
  )
}

export function MenuItem({
  onSelect,
  selected,
  disabled,
  children,
}: {
  onSelect: () => void
  selected?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-8 px-16 py-8 text-left text-body-sm transition-colors',
        disabled ? 'cursor-not-allowed text-mist-gray' : 'text-ink-navy hover:bg-pebble',
        selected && 'font-semibold',
      )}
    >
      {children}
    </button>
  )
}

export function MenuDivider() {
  return <hr className="my-8 border-hairline" />
}
