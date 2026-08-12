import type { ContactType } from '@/types/domain'
import { cn } from '@/lib/cn'

/**
 * The small pieces every contact surface reuses: side badge, role chip, reachability, and links out.
 *
 * Shared because a contact appears in four places — the Contacts tab, the contact drawer, the deal's
 * People panel, and the deal creation form — and four copies of "how do we show a partner contact"
 * would drift into four different answers.
 */

/**
 * Customer or partner, as a badge.
 *
 * Distinguished by weight and surface rather than by hue alone. `viz-1` and `signal-blue` are close
 * enough that a colourblind reader could not separate them, and this pair appears side by side in the
 * same list constantly.
 */
export function SideBadge({ type, className }: { type: ContactType; className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 rounded-md px-[6px] py-[1px] text-caption font-semibold',
        type === 'partner'
          ? 'bg-viz-2/12 text-viz-2'
          : 'bg-pebble text-slate-gray',
        className,
      )}
    >
      {type === 'partner' ? 'Partner' : 'Customer'}
    </span>
  )
}

/**
 * A contact's role on a deal.
 *
 * The champion is emphasised and everything else is quiet, because the champion is the only role the
 * application enforces — treating all roles alike on screen would hide which one blocks a stage move.
 */
export function RoleChip({ roleKey, roleName }: { roleKey: string; roleName: string }) {
  const champion = roleKey === 'champion'
  return (
    <span
      className={cn(
        'shrink-0 rounded-md px-8 py-[2px] text-caption font-semibold',
        champion ? 'bg-signal-blue text-paper' : 'bg-pebble text-slate-gray',
      )}
    >
      {roleName}
    </span>
  )
}

/**
 * What is missing before this person could be a champion.
 *
 * Renders nothing when they are complete: a green tick on every reachable contact would be noise on a
 * list where most people are fine, and would drown the few that are not.
 */
export function MissingDetails({
  missing,
  className,
}: {
  missing: string[]
  className?: string
}) {
  if (missing.length === 0) return null
  return (
    <span className={cn('text-caption text-risk', className)}>
      No {missing.join(', ')}
    </span>
  )
}

/**
 * Email, phone and LinkedIn as actual links.
 *
 * `mailto:` and `tel:` rather than text to copy. The reason a phone number is stored is to call it, and
 * on a laptop with a softphone or on a tablet these work; where they do not, the number is still
 * readable in the drawer.
 */
export function ContactLinks({
  email,
  phone,
  linkedinUrl,
  onActivate,
}: {
  email: string
  phone: string
  linkedinUrl: string
  /** Lets a row swallow the click so following a link does not also open the record drawer. */
  onActivate?: () => void
}) {
  const items = [
    email ? { key: 'email', label: 'Email', href: `mailto:${email}`, external: false } : null,
    phone ? { key: 'phone', label: 'Call', href: `tel:${phone.replace(/[^\d+]/g, '')}`, external: false } : null,
    linkedinUrl
      ? { key: 'linkedin', label: 'LinkedIn', href: normalizeLinkedIn(linkedinUrl), external: true }
      : null,
  ].filter(Boolean) as Array<{ key: string; label: string; href: string; external: boolean }>

  if (items.length === 0) return null

  return (
    <span className="flex items-center gap-[4px]">
      {items.map((item) => (
        <a
          key={item.key}
          href={item.href}
          {...(item.external ? { target: '_blank', rel: 'noreferrer noopener' } : {})}
          onClick={(event) => {
            event.stopPropagation()
            onActivate?.()
          }}
          className="rounded-md px-8 py-[2px] text-caption font-semibold text-signal-blue transition-colors hover:bg-pebble"
        >
          {item.label}
        </a>
      ))}
    </span>
  )
}

/**
 * People paste LinkedIn URLs with and without the scheme, and a bare `linkedin.com/in/x` in an `href`
 * is read as a relative path — which navigates inside the app and 404s instead of leaving it.
 */
function normalizeLinkedIn(url: string): string {
  const trimmed = url.trim()
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
}
