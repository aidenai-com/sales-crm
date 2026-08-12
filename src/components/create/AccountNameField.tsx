import { useEffect, useRef, useState } from 'react'
import type { SimilarAccount } from '@/types/domain'
import { contactApi } from '@/api/endpoints'
import { cn } from '@/lib/cn'
import { Field, TextInput } from '@/components/ui/Field'

/**
 * The account-name field, with duplicate detection as you type.
 *
 * The problem it solves: `Citi`, `CITI`, `Citi Bank` and `Citibank, N.A.` are one company and would
 * otherwise become four accounts, each holding a fraction of the relationship.
 *
 * Two severities, deliberately styled apart rather than ranked by score:
 *
 *   blocking   the same company once legal forms are stripped. Creation is refused, here and by the
 *              API, which holds a unique index on the normalized name. The only sensible next action
 *              is to open the account that already exists, so that is what is offered.
 *   advisory   a resemblance — a prefix or a trigram match. Shown, never blocking. `Citibank` and
 *              `Citigroup` resemble each other and are different companies.
 *
 * Each match says which of the two it is and why it matched, because an unexplained list of
 * near-misses reads as noise and gets dismissed — which is how the duplicate gets created.
 *
 * Known gap, worth stating: acronyms do not match. `BofA` shares almost no letter sequences with
 * `Bank of America`, so no threshold catches it without flooding the list with false positives.
 */

/** Long enough that a name is recognisable, short enough that the list is there before you stop typing. */
const DEBOUNCE_MS = 250
const MIN_CHARS = 2

const REASON_LABEL: Record<SimilarAccount['reason'], string> = {
  exact: 'Already exists',
  normalized: 'Same company',
  prefix: 'Starts the same',
  fuzzy: 'Looks similar',
}

export function AccountNameField({
  value,
  onChange,
  disabled,
  label = 'Account name',
  autoFocus = true,
  onBlockingChange,
  onPickExisting,
}: {
  value: string
  onChange: (next: string) => void
  disabled?: boolean
  /** "Account name" on the account form; "Company name" where a company is being filed to hold a person. */
  label?: string
  /**
   * On the account form this is the first field and should take focus. Inside the contact form it is
   * revealed part-way down by choosing "a company not listed", and stealing focus there would scroll
   * the name somebody had already typed off the screen.
   */
  autoFocus?: boolean
  /** Told whether a blocking match is present, so the form can disable its submit button. */
  onBlockingChange: (blocked: boolean) => void
  /** Opening the account that already exists — the useful action when creation is refused. */
  onPickExisting: (account: SimilarAccount) => void
}) {
  const [matches, setMatches] = useState<SimilarAccount[]>([])
  const [searching, setSearching] = useState(false)

  // Kept in a ref so a slow response for an earlier keystroke cannot overwrite the results of a
  // later one. Without this, typing "citi" quickly can end up displaying the matches for "cit".
  const requestId = useRef(0)

  const trimmed = value.trim()

  useEffect(() => {
    if (trimmed.length < MIN_CHARS) {
      setMatches([])
      setSearching(false)
      onBlockingChange(false)
      return
    }

    const id = ++requestId.current
    const controller = new AbortController()
    setSearching(true)

    const timer = setTimeout(() => {
      contactApi
        .similarAccounts(trimmed, controller.signal)
        .then((found) => {
          if (id !== requestId.current) return
          setMatches(found)
          onBlockingChange(found.some((match) => match.blocksCreation))
        })
        .catch(() => {
          // Silent. The duplicate check is an assistance layer over a guarantee the API keeps
          // regardless — a failed lookup must not block someone from filing a legitimate account, and
          // the server still refuses a real collision with a message naming the existing record.
          if (id === requestId.current) {
            setMatches([])
            onBlockingChange(false)
          }
        })
        .finally(() => {
          if (id === requestId.current) setSearching(false)
        })
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [trimmed, onBlockingChange])

  const blocking = matches.filter((match) => match.blocksCreation)
  const advisory = matches.filter((match) => !match.blocksCreation)

  return (
    <div className="space-y-8">
      <Field
        label={label}
        hint={
          blocking.length > 0
            ? 'This company is already on record.'
            : 'Existing matches appear as you type.'
        }
      >
        <TextInput
          autoFocus={autoFocus}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Barclays"
          aria-invalid={blocking.length > 0}
          aria-describedby={matches.length > 0 ? 'account-name-matches' : undefined}
        />
      </Field>

      {/* aria-live so a screen reader hears the match arrive; it appears after the field is typed in,
          not in response to focus, so it would otherwise go unannounced. */}
      <div id="account-name-matches" aria-live="polite">
        {blocking.length > 0 && (
          <ul className="space-y-8">
            {blocking.map((match) => (
              <li key={match.id}>
                <MatchRow match={match} onPick={onPickExisting} />
              </li>
            ))}
          </ul>
        )}

        {advisory.length > 0 && (
          <div className={cn(blocking.length > 0 && 'mt-12')}>
            <p className="text-caption font-semibold tracking-wide text-slate-gray uppercase">
              {blocking.length > 0 ? 'Also similar' : 'Already on record'}
            </p>
            <ul className="mt-8 space-y-[4px]">
              {advisory.map((match) => (
                <li key={match.id}>
                  <MatchRow match={match} onPick={onPickExisting} compact />
                </li>
              ))}
            </ul>
          </div>
        )}

        {searching && matches.length === 0 && trimmed.length >= MIN_CHARS && (
          <p className="text-caption text-mist-gray">Checking for existing accounts…</p>
        )}
      </div>
    </div>
  )
}

function MatchRow({
  match,
  onPick,
  compact,
}: {
  match: SimilarAccount
  onPick: (account: SimilarAccount) => void
  compact?: boolean
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(match)}
      className={cn(
        'flex w-full items-center gap-8 rounded-lg border text-left transition-colors',
        compact
          ? 'border-hairline bg-paper px-12 py-8 hover:border-signal-blue hover:bg-cloud'
          : 'border-risk bg-risk-fill px-16 py-12 hover:border-signal-blue',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-8">
          <span
            className={cn(
              'truncate font-semibold text-ink-navy',
              compact ? 'text-caption' : 'text-body-sm',
            )}
          >
            {match.name}
          </span>
        </span>
        <span className="mt-[2px] block truncate text-caption text-slate-gray">
          {/* The owner is named because the next step is usually to go and ask them, and on a
              company-wide account list the owner is the only thing that distinguishes who to ask. */}
          {[match.industry, `Owned by ${match.ownerName}`].filter(Boolean).join(' · ')}
        </span>
      </span>

      <span className="shrink-0 text-caption font-semibold text-signal-blue">
        {REASON_LABEL[match.reason]}
      </span>
    </button>
  )
}
