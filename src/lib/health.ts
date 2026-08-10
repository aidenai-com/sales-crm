import type { Activity, Deal, Health } from '@/types/domain'

/** A deal with no activity for this many days is treated as at risk. */
export const STALE_AFTER_DAYS = 21

/** A deal closing within this many days is treated as closing soon. */
export const CLOSING_SOON_WITHIN_DAYS = 7

const dayMs = 86_400_000

/**
 * Health is derived, never stored. A stored flag drifts the moment a date passes;
 * deriving it means the dashboard is always telling the truth.
 *
 * Precedence is deliberate: at-risk beats closing-soon. A deal that is both overdue
 * and imminent is a problem, not an opportunity.
 */
/**
 * Why a deal has the health it has.
 *
 * `at-risk` has two entirely different causes and they need different responses: an
 * overdue deal needs a new close date, a stalled one needs a phone call. Reporting both
 * as "At risk" tells a rep something is wrong without telling them what to do about it.
 *
 * This is a label on top of `Health`, not a fourth status — filters, roll-ups and the
 * needs-attention count still work in three buckets, because for those purposes both
 * causes mean the same thing.
 */
export type HealthReason = 'overdue' | 'stalled' | 'closing-soon' | 'on-track'

export interface HealthDetail {
  health: Health
  reason: HealthReason
  /** Whole days past the close date. Only meaningful when the reason is `overdue`. */
  daysOverdue: number
  /** Whole days since the last activity, or since creation if there is none. */
  daysSinceTouch: number
}

export function dealHealthDetail(
  deal: Deal,
  activities: Activity[],
  now: number = Date.now(),
): HealthDetail {
  const closesAt = new Date(deal.expectedCloseDate).getTime()
  const daysUntilClose = (closesAt - now) / dayMs

  // Creation counts as a touch. Without this a deal is at risk the instant it is
  // created, which is both wrong and the first thing a new user would see.
  const lastTouch = lastActivityAt(deal.id, activities) ?? new Date(deal.createdAt).getTime()
  const daysSinceTouch = Number.isNaN(lastTouch) ? Infinity : Math.floor((now - lastTouch) / dayMs)
  const daysOverdue = Math.max(0, Math.ceil(-daysUntilClose))

  if (daysUntilClose < 0) {
    return { health: 'at-risk', reason: 'overdue', daysOverdue, daysSinceTouch }
  }

  if (daysSinceTouch > STALE_AFTER_DAYS) {
    return { health: 'at-risk', reason: 'stalled', daysOverdue: 0, daysSinceTouch }
  }

  if (daysUntilClose <= CLOSING_SOON_WITHIN_DAYS) {
    return { health: 'closing-soon', reason: 'closing-soon', daysOverdue: 0, daysSinceTouch }
  }

  return { health: 'healthy', reason: 'on-track', daysOverdue: 0, daysSinceTouch }
}

export function dealHealth(deal: Deal, activities: Activity[], now: number = Date.now()): Health {
  return dealHealthDetail(deal, activities, now).health
}

/** Most recent activity timestamp for a deal, or null when it has never been touched. */
export function lastActivityAt(dealId: string, activities: Activity[]): number | null {
  let latest: number | null = null
  for (const activity of activities) {
    if (activity.subjectType !== 'deal' || activity.subjectId !== dealId) continue
    const at = new Date(activity.occurredAt).getTime()
    if (latest === null || at > latest) latest = at
  }
  return latest
}

/**
 * Rolls a set of deal healths up to a single badge for a parent node.
 * Worst-case wins — a parent should never look calmer than its children.
 */
export function rollUpHealth(healths: Health[]): Health {
  if (healths.includes('at-risk')) return 'at-risk'
  if (healths.includes('closing-soon')) return 'closing-soon'
  return 'healthy'
}

/** The three-bucket label. Correct for roll-ups and filters, where cause doesn't matter. */
export const HEALTH_LABEL: Record<Health, string> = {
  healthy: 'Healthy',
  'closing-soon': 'Closing soon',
  'at-risk': 'At risk',
}

/** The label for a single deal, where the cause is the useful part. */
export const REASON_LABEL: Record<HealthReason, string> = {
  overdue: 'Overdue',
  stalled: 'Stalled',
  'closing-soon': 'Closing soon',
  'on-track': 'On track',
}

/** The one-line explanation behind the badge, shown on hover and to screen readers. */
export function reasonDetail(detail: HealthDetail): string {
  const days = (count: number) => `${count} day${count === 1 ? '' : 's'}`

  switch (detail.reason) {
    case 'overdue':
      return `Close date passed ${days(detail.daysOverdue)} ago`
    case 'stalled':
      return `No activity for ${days(detail.daysSinceTouch)}`
    case 'closing-soon':
      return `Closing within ${days(CLOSING_SOON_WITHIN_DAYS)}`
    case 'on-track':
      return `Last touched ${days(detail.daysSinceTouch)} ago`
  }
}
