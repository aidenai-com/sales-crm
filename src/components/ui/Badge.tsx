import type { ReactNode } from 'react'
import type { Health } from '@/types/domain'
import { HEALTH_LABEL, REASON_LABEL, reasonDetail, type HealthDetail } from '@/lib/health'
import { cn } from '@/lib/cn'

/** design.md's Pill Badge: 12px weight 500, fully rounded, 4px/8px padding. */
export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-8 py-[4px] text-caption font-medium whitespace-nowrap',
        'bg-badge-fill text-deep-cobalt',
        className,
      )}
    >
      {children}
    </span>
  )
}

const healthStyles: Record<Health, string> = {
  healthy: 'bg-pebble text-slate-gray',
  'closing-soon': 'bg-badge-fill text-deep-cobalt',
  'at-risk': 'bg-risk-fill text-risk',
}

/**
 * Pass `detail` for a single deal and the badge names the *cause* — "Overdue" or
 * "Stalled" rather than a second thing labelled "At risk". Both keep the at-risk colour,
 * because the severity is the same; only the fix differs.
 *
 * Omit it for a rolled-up node (an account, a lead), where several deals with different
 * causes sit underneath and only the worst-case bucket is meaningful.
 */
export function HealthBadge({
  health,
  detail,
  className,
}: {
  health: Health
  detail?: HealthDetail
  className?: string
}) {
  const label = detail ? REASON_LABEL[detail.reason] : HEALTH_LABEL[health]

  return (
    <span
      title={detail ? reasonDetail(detail) : undefined}
      className={cn(
        'inline-flex items-center gap-[6px] rounded-full px-8 py-[4px] text-caption font-medium whitespace-nowrap',
        healthStyles[health],
        className,
      )}
    >
      <span className="size-[6px] shrink-0 rounded-full bg-current" aria-hidden="true" />
      {label}
      {detail && <span className="sr-only"> — {reasonDetail(detail)}</span>}
    </span>
  )
}

/**
 * A bare status dot for dense rows where a full badge would crowd the line. With
 * `detail`, the cause travels in the tooltip and the accessible name — the only place a
 * dot has room to say anything.
 */
export function HealthDot({ health, detail }: { health: Health; detail?: HealthDetail }) {
  const color: Record<Health, string> = {
    healthy: 'bg-mist-gray',
    'closing-soon': 'bg-signal-blue',
    'at-risk': 'bg-risk',
  }

  const label = detail
    ? `${REASON_LABEL[detail.reason]} — ${reasonDetail(detail)}`
    : HEALTH_LABEL[health]

  return (
    <span
      className={cn('inline-block size-8 shrink-0 rounded-full', color[health])}
      title={label}
      aria-label={label}
      role="img"
    />
  )
}
