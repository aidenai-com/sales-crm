import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/**
 * design.md's Elevated Product Card, adapted to hold content instead of a screenshot:
 * white surface, 24px radius for feature panels, three-layer blue-tinted shadow.
 */
export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <div
      className={cn(
        'rounded-3xl border border-hairline bg-paper shadow-sm',
        padded && 'p-24',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** Section header block: design.md specifies H2 at 38px+ in Ink Navy with Slate subtext. */
export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-24 flex flex-wrap items-end justify-between gap-16">
      <div>
        <h2 className="text-heading-sm font-bold text-ink-navy">{title}</h2>
        {subtitle && <p className="mt-8 max-w-[640px] text-body text-slate-gray">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/** Empty states are an invitation to act, not an apology. */
export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-hairline bg-cloud px-24 py-32 text-center">
      <p className="text-body-lg font-semibold text-ink-navy">{title}</p>
      {hint && <p className="mt-8 text-body-sm text-slate-gray">{hint}</p>}
    </div>
  )
}
