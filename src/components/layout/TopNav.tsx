import { Link, routes, useRouter, type RouteName } from '@/app/router'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { cn } from '@/lib/cn'
import { useAuth } from '@/app/auth'
import { UserMenu } from './UserMenu'

const links: Array<{ to: string; label: string; match: RouteName[] }> = [
  { to: routes.dashboard, label: 'Dashboard', match: ['dashboard'] },
  { to: routes.pipeline, label: 'Pipeline', match: ['pipeline'] },
  { to: routes.deals, label: 'Deals', match: ['deals', 'deal'] },
  { to: routes.accounts, label: 'Accounts', match: ['accounts'] },
  // Analytics is the reporting surface the Dashboard used to try to be. Flat, alongside the
  // others rather than nested under them, so spec 4.5 still holds.
  { to: routes.analytics, label: 'Analytics', match: ['analytics'] },
]

/**
 * Flat top-level navigation, no nesting (spec 4.5). design.md specifies a 64px sticky
 * bar: logo left, menu centre, action cluster right.
 *
 * Search is the fourth nav item from spec 4.5, presented as an action rather than a
 * destination — it opens over the current screen so a search never costs you your place.
 */
export function TopNav({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { match } = useRouter()
  const { isAdmin } = useAuth()

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-64 max-w-page items-center gap-24 px-24">
        <Link to={routes.dashboard} className="flex items-center gap-8">
          <span className="grid size-32 place-items-center rounded-lg bg-ink-navy text-body-sm font-bold text-paper">
            A
          </span>
          <span className="text-body-lg font-bold text-ink-navy">Sales CRM</span>
        </Link>

        <nav aria-label="Main" className="flex flex-1 items-center gap-8">
          {links.map((link) => {
            const active = link.match.includes(match.name)
            return (
              <Link
                key={link.to}
                to={link.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-lg px-16 py-8 text-body-sm font-semibold transition-colors',
                  active ? 'bg-pebble text-signal-blue' : 'text-ink-navy hover:bg-pebble',
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        <button
          onClick={onOpenSearch}
          className="flex items-center gap-8 rounded-lg border border-hairline bg-pebble px-16 py-8 text-body-sm text-slate-gray transition-colors hover:bg-paper"
        >
          <svg viewBox="0 0 20 20" className="size-16" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="9" cy="9" r="5.25" />
            <path d="M12.9 12.9L16.5 16.5" strokeLinecap="round" />
          </svg>
          Search
          <kbd className="ml-8 rounded-md border border-hairline bg-paper px-8 py-[2px] text-caption font-medium text-mist-gray">
            Ctrl K
          </kbd>
        </button>

        <ThemeToggle />

        <UserMenu />

        {/* Hidden for reps. The API refuses them anyway; this stops the app offering a
            door that will not open. */}
        {isAdmin && (
        <Link
          to={routes.pipelines}
          aria-label="Pipeline settings"
          title="Pipeline settings"
          aria-current={match.name === 'pipelines' ? 'page' : undefined}
          className={cn(
            'grid size-32 shrink-0 place-items-center rounded-lg transition-colors',
            match.name === 'pipelines'
              ? 'bg-pebble text-signal-blue'
              : 'text-slate-gray hover:bg-pebble hover:text-ink-navy',
          )}
        >
          <svg viewBox="0 0 20 20" className="size-16" fill="none" stroke="currentColor" strokeWidth="1.75">
            <circle cx="10" cy="10" r="2.5" />
            <path d="M10 2.5v2M10 15.5v2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M2.5 10h2M15.5 10h2M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" strokeLinecap="round" />
          </svg>
        </Link>
        )}
      </div>
    </header>
  )
}
