const dayMs = 86_400_000

/**
 * All values are USD, in US number formatting: comma thousands separators, period decimal.
 *
 * None of these take a currency argument any more, and that is deliberate. The database
 * refuses to store anything but USD and the API refuses to set it, because roll-ups, the
 * pipeline totals and the Excel export all sum values *without converting* — one euro row
 * would silently corrupt every total on the dashboard. A currency parameter would advertise
 * a flexibility that does not exist.
 */
const USD = { style: 'currency', currency: 'USD' } as const

/** Compact, for dense surfaces: $4.2M, $890K, $0. */
export function compactMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    ...USD,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)
}

/** Whole dollars, for headers and drawers: $1,250,000. */
export function fullMoney(value: number): string {
  return new Intl.NumberFormat('en-US', { ...USD, maximumFractionDigits: 0 }).format(value)
}

/** Cents visible, for exports and anywhere a rounded figure would be misread: $1,250.50. */
export function preciseMoney(value: number): string {
  return new Intl.NumberFormat('en-US', {
    ...USD,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

/** Plain integer with US grouping, for counts: 1,204. */
export function count(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(value)
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function fullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/** Date input value (yyyy-mm-dd) from an ISO timestamp. */
export function dateInputValue(iso: string): string {
  return new Date(iso).toISOString().slice(0, 10)
}

/**
 * Relative time, phrased for a pipeline. Reads "3 days overdue" rather than
 * "-3 days" — the interface should say what is true, not make the reader do math.
 */
export function relativeToNow(iso: string, now: number = Date.now()): string {
  const days = Math.round((new Date(iso).getTime() - now) / dayMs)
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return '1 day overdue'
  if (days < 0) return `${Math.abs(days)} days overdue`
  return `in ${days} days`
}

/** Elapsed time, for activity feeds. */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const days = Math.floor((now - new Date(iso).getTime()) / dayMs)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 14) return 'last week'
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`
  return `${Math.floor(days / 30)} months ago`
}
