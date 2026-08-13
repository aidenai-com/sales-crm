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
  // Contacts sits beside Accounts, not inside it. A contact is its own object, and the question it
  // answers — "who do we know at this company, and who is on which deal" — is asked without an
  // account in mind at least as often as with one.
  { to: routes.contacts, label: 'Contacts', match: ['contacts'] },
  // Analytics is the reporting surface the Dashboard used to try to be. Flat, alongside the
  // others rather than nested under them, so spec 4.5 still holds.
  { to: routes.analytics, label: 'Analytics', match: ['analytics'] },
]

/**
 * Flat top-level navigation, no nesting (spec 4.5). design.md specifies a 64px sticky bar: logo left,
 * menu centre, action cluster right.
 *
 * Search is the fourth nav item from spec 4.5, presented as an action rather than a destination — it
 * opens over the current screen so a search never costs you your place.
 *
 * ---
 *
 * Every control in this bar is **32px tall**, and the classes that make that true live in the three
 * constants below rather than on each element.
 *
 * That is not tidiness for its own sake. Before this, the bar held five different heights — nav pills
 * at 35.6px (`py-8` around 14px/1.4 text), the search button at 37.6px because its border added two
 * more, the assistant and icon buttons at 32px, and the avatar at 24px. Nothing shared an edge. The
 * cause was that each control specified its own geometry inline, so every one of them was free to
 * disagree with its neighbours, and each addition drifted a little further.
 *
 * Note that a bordered control and an unbordered one only stay the same height because the height is
 * *explicit*: `box-sizing: border-box` puts the border inside 32px. Sizing by padding, as the search
 * button used to, makes a border a height change.
 *
 * A caution for anyone editing spacing here: this theme defines `--spacing-*` for
 * 8/16/24/32/40/48/56/64/72/96 and nothing else, with no `--spacing` base. So `gap-8` is 8px, but
 * `gap-12` is **48px** — Tailwind falls back to its own 0.25rem scale for the gaps this theme leaves
 * undefined. Anything off-scale is written as `gap-[2px]` and similar on purpose.
 */

/** Geometry shared by every interactive control in the bar. */
const CONTROL = 'h-32 shrink-0 rounded-lg transition-colors duration-hover ease-ui'

const FOCUS =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-blue'

/** A square icon button: theme, settings. 32×32 with a 16px glyph. */
const ICON_BUTTON = cn(CONTROL, FOCUS, 'grid w-32 place-items-center')

/** A control with a leading glyph and a word. Less padding on the icon side, which is where the eye
 *  reads the edge from — symmetrical padding makes an icon look adrift. */
const LABELLED = cn(CONTROL, FOCUS, 'inline-flex items-center gap-8 pl-12 pr-16 text-body-sm')

export function TopNav({
  onOpenSearch,
  onOpenAssistant,
}: {
  onOpenSearch: () => void
  /** The assistant is an action, like search — it opens over whatever you are reading. */
  onOpenAssistant: () => void
}) {
  const { match } = useRouter()
  const { isAdmin } = useAuth()

  return (
    <header className="sticky top-0 z-40 border-b border-hairline bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-64 max-w-page items-center px-24">
        <Link
          to={routes.dashboard}
          className={cn(
            'mr-24 flex shrink-0 items-center gap-8 rounded-lg',
            FOCUS,
          )}
        >
          <span className="grid size-32 place-items-center rounded-lg bg-ink-navy text-body-sm font-bold text-paper">
            A
          </span>
          <span className="text-body-lg font-bold text-ink-navy">Sales CRM</span>
        </Link>

        {/* 2px between pills, not 8. They are one group of six, and a gap wide enough to read as
            separation makes six destinations look like six unrelated buttons. */}
        <nav aria-label="Main" className="flex items-center gap-[2px]">
          {links.map((link) => {
            const active = link.match.includes(match.name)
            return (
              <Link
                key={link.to}
                to={link.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  CONTROL,
                  FOCUS,
                  'inline-flex items-center px-16 text-body-sm font-semibold',
                  active ? 'bg-pebble text-signal-blue' : 'text-ink-navy hover:bg-pebble',
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        {/* `ml-auto` rather than `flex-1` on the nav. Both push this cluster right, but stretching the
            nav gave it a width nothing was using and made its own spacing hard to reason about. */}
        <div className="ml-auto flex items-center gap-8">
          <button
            onClick={onOpenSearch}
            aria-label="Search records"
            className={cn(
              LABELLED,
              // Filled and bordered, unlike the nav pills. Search is the one control here that behaves
              // like a field, and looking like one is what tells you so — the height is what makes it
              // belong, not the fill.
              'border border-hairline bg-pebble pr-8 text-slate-gray hover:border-mist-gray hover:bg-paper hover:text-ink-navy',
            )}
          >
            <SearchIcon />
            <span className="hidden md:inline">Search</span>
            {/* Dropped first when space is short: the shortcut is a convenience for people who already
                know it, and they do not need reminding. */}
            <kbd className="ml-8 hidden rounded-md border border-hairline bg-paper px-[6px] py-[1px] text-caption font-medium text-mist-gray lg:inline-block">
              Ctrl K
            </kbd>
          </button>

          {/* Administrators only.
              The assistant answers across the whole book — "which deals are at risk", "what is in
              Qualify" — and a rep asking it should not be able to read past their own scope. The server
              already scopes every tool call to the caller, so this is not the security boundary; it is
              the honest one. Offering a rep a control that answers a narrower question than it appears
              to is worse than not offering it, and hiding it here means they never learn to reach for
              something that will not serve them.

              The one filled control in the header. Every other action up here is an icon in slate —
              search, theme, settings — because they are utilities you already know are there. This is
              new, so it carries the badge fill and its own word. A spark alone would be a fifth grey
              glyph nobody clicks. */}
          {isAdmin && (
            <button
              onClick={onOpenAssistant}
              title="Ask about your pipeline"
              className={cn(
                LABELLED,
                'border border-signal-blue/25 bg-badge-fill font-semibold text-signal-blue',
                'hover:border-signal-blue hover:bg-signal-blue hover:text-paper',
              )}
            >
              <SparkIcon />
              <span className="hidden sm:inline">Ask AI</span>
            </button>
          )}

          {/* A hairline, not a gap, between the labelled actions and the icon utilities. Spacing alone
              would need to be wide enough to read as a break, which would push the utilities away from
              the edge they belong to. Only drawn when there is something on both sides of it. */}
          {isAdmin && <span aria-hidden className="mx-8 h-24 w-px shrink-0 bg-hairline" />}

          <div className="flex items-center gap-[2px]">
            {/* Only the classes it lacks. ThemeToggle already renders 32px and `rounded-lg`, and `cn`
                does not merge — handing it ICON_BUTTON as well would put two size utilities on one
                element and leave the outcome to stylesheet order. */}
            <ThemeToggle className={cn(FOCUS, 'duration-hover ease-ui')} />

            {/* Hidden for reps. The API refuses them anyway; this stops the app offering a
                door that will not open. */}
            {isAdmin && (
              <Link
                to={routes.pipelines}
                aria-label="Pipeline settings"
                title="Pipeline settings"
                aria-current={match.name === 'pipelines' ? 'page' : undefined}
                className={cn(
                  ICON_BUTTON,
                  match.name === 'pipelines'
                    ? 'bg-pebble text-signal-blue'
                    : 'text-slate-gray hover:bg-pebble hover:text-ink-navy',
                )}
              >
                <GearIcon />
              </Link>
            )}

            <UserMenu />
          </div>
        </div>
      </div>
    </header>
  )
}

/** All three glyphs are 16px on a 20-unit grid, so their stroke weights match at render size. */
function SearchIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-16 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <circle cx="9" cy="9" r="5.25" />
      <path d="M12.9 12.9L16.5 16.5" strokeLinecap="round" />
    </svg>
  )
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="size-16 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="2.5" />
      <path
        d="M10 2.5v2M10 15.5v2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M2.5 10h2M15.5 10h2M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * A four-pointed spark.
 *
 * Not a speech bubble, and not a robot. A bubble would claim there is a person on the other end;
 * a robot is a cliché the rest of this interface would not tolerate. The spark reads as
 * "something computed for you", which is what this actually is.
 */
function SparkIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-16 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M8 1.5l1.3 3.2L12.5 6 9.3 7.3 8 10.5 6.7 7.3 3.5 6l3.2-1.3z" strokeLinejoin="round" />
      <path d="M12.5 10.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z" strokeLinejoin="round" />
    </svg>
  )
}
