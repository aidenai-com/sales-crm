import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Id, LemlistEngagement, LemlistProspect } from '@/types/domain'
import { errorMessage } from '@/api/client'
import { lemlistApi } from '@/api/endpoints'
import { useStore } from '@/data/store'
import { useLemlist } from '@/hooks/useLemlist'
import { relativeToNow } from '@/lib/format'
import { routes, useRouter } from '@/app/router'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { DataGrid, GridRow, type GridColumn } from '@/components/ui/DataGrid'
import { Select } from '@/components/ui/Field'
import { SearchField } from '@/components/ui/SearchField'
import { Skeleton } from '@/components/ui/Skeleton'
import { SequenceTrail, SequenceTrailLegend } from '@/components/lemlist/SequenceTrail'
import { TemperatureBands, bandOf, type Band } from '@/components/lemlist/TemperatureBands'

/**
 * People in lemlist campaigns, arranged around one question: **who is worth a call today?**
 *
 * Everything on this screen is bent toward that question rather than toward completeness. A rep opening this
 * has four hundred prospects and forty minutes, so the design's job is triage, not display.
 *
 * Three consequences, each the opposite of the obvious choice:
 *
 * **The census is the filter.** The bands across the top show how many people are at each depth *before* you
 * touch anything, and clicking one filters. A state dropdown hid that distribution behind a click.
 *
 * **Progress is a shape, not a word.** Each row carries a five-mark sequence trail rather than a status pill.
 * Two hundred pills are two hundred words to read; two hundred trails are a pattern with outliers in it.
 *
 * **Warmest first, always.** The default order is depth of engagement, not name and not import date, because
 * the top of this list should be the next call. Alphabetical order is a filing system, and this is not a
 * filing cabinet.
 *
 * **This never queries lemlist.** Everything shown was imported by a sync or delivered by a webhook. A page
 * that called lemlist on load would inherit its latency and spend the workspace's shared rate limit on every
 * tab somebody opened.
 *
 * Kept separate from the contact directory because these are two different kinds of person: a contact is
 * filed against a company somebody decided to work, a prospect is a name in a list, and most never become
 * the first. **File as contact** is the crossing point.
 */

const COLUMNS: GridColumn[] = [
  { key: 'who', label: 'Who' },
  { key: 'where', label: 'Company' },
  { key: 'campaign', label: 'Campaign' },
  { key: 'progress', label: 'Progress', className: 'w-[180px]' },
  { key: 'last', label: 'Last activity', numeric: true, className: 'w-[130px]' },
  { key: 'act', label: 'Actions', hideLabel: true, className: 'w-[130px]' },
]

export function ProspectsPanel() {
  const lemlist = useLemlist()
  const { navigate } = useRouter()

  const [prospects, setProspects] = useState<LemlistProspect[] | null>(null)
  const [campaignId, setCampaignId] = useState('')
  const [band, setBand] = useState<Band>('all')
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [openRow, setOpenRow] = useState<Id | null>(null)

  /**
   * Only campaigns that have been imported.
   *
   * An un-imported campaign has no prospects here, so offering it in the filter would offer a choice that
   * can only return nothing — the same reason an empty temperature band is shown but not clickable.
   */
  const campaigns = useMemo(
    () => lemlist.campaigns.filter((campaign) => campaign.importedAt !== null),
    [lemlist.campaigns],
  )
  const selected = campaigns.find((campaign) => campaign.id === campaignId) ?? null

  /**
   * The campaign filter and the search go to the server; the band filter does not.
   *
   * Deliberate split. The band counts have to describe the whole book to be worth showing, so they are
   * computed from what is loaded — which means the band has to filter locally or the counts would describe a
   * set the rows no longer match.
   */
  const load = useCallback(async () => {
    if (!lemlist.status.connected) {
      setProspects([])
      return
    }
    try {
      setProspects(
        await lemlistApi.prospects({
          campaignId: campaignId || undefined,
          search: search.trim() || undefined,
        }),
      )
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }, [lemlist.status.connected, campaignId, search])

  // Debounced: the search filters server-side, so a request per keystroke would be a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => void load(), 250)
    return () => clearTimeout(timer)
  }, [load])


  const visible = useMemo(() => {
    const pool = band === 'all' ? (prospects ?? []) : (prospects ?? []).filter((p) => bandOf(p) === band)
    return [...pool].sort(
      (a, b) =>
        // Warmest first, then most recently active, then by name so the order is stable between reloads.
        b.funnelStep - a.funnelStep ||
        (b.lastActivityAt ?? '').localeCompare(a.lastActivityAt ?? '') ||
        a.fullName.localeCompare(b.fullName),
    )
  }, [prospects, band])

  if (lemlist.loading) return <Skeleton className="h-[280px] rounded-2xl" />

  if (!lemlist.status.connected) {
    return (
      <div className="rounded-3xl border border-dashed border-hairline bg-cloud px-24 py-64 text-center">
        <p className="text-subheading font-bold text-ink-navy">Your outreach, in the CRM</p>
        <p className="mx-auto mt-8 max-w-[480px] text-body-sm text-slate-gray">
          Connect lemlist to import your campaigns and the people in them. Opens, clicks and replies then
          land here as they happen, next to the accounts and deals they belong to.
        </p>
        <div className="mt-24">
          <Button onClick={() => navigate(routes.integrations)}>Connect lemlist</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-16">
      {prospects !== null && prospects.length > 0 && (
        <TemperatureBands prospects={prospects} value={band} onChange={setBand} />
      )}

      <div className="flex flex-wrap items-center gap-12">
        <div className="min-w-[240px] flex-1">
          <SearchField
            value={search}
            onValueChange={setSearch}
            placeholder="Search by name, company or email"
            aria-label="Search prospects"
          />
        </div>

        <Select
          value={campaignId}
          onChange={(event) => setCampaignId(event.target.value)}
          aria-label="Campaign"
          className="h-40! w-auto! min-w-[200px] py-0!"
        >
          <option value="">All campaigns</option>
          {campaigns.map((campaign) => (
            <option key={campaign.id} value={campaign.id}>
              {campaign.name} · {campaign.leadCount}
            </option>
          ))}
        </Select>

        {/* Refreshing is per campaign, so it is offered only once one is picked. A blanket "check for
            updates" here used to re-read the entire workspace — minutes of paced requests started from a
            filter bar, which is not what a filter bar should be able to do. */}
        {selected && (
          <Button
            variant="ghost"
            size="sm"
            disabled={lemlist.importingId !== null}
            onClick={() => void lemlist.importCampaign(selected.id, false).then(() => load())}
          >
            {lemlist.importingId === selected.id ? 'Refreshing…' : `Refresh ${selected.name}`}
          </Button>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-risk bg-risk-fill px-16 py-8 text-body-sm text-ink-navy">
          {error}
        </p>
      )}

      {prospects === null ? (
        <Skeleton className="h-[280px] rounded-2xl" />
      ) : visible.length === 0 ? (
        <Empty
          nothingImported={lemlist.status.contacts === 0}
          filtered={band !== 'all' || search.trim() !== '' || campaignId !== ''}
          onClear={() => {
            setBand('all')
            setSearch('')
            setCampaignId('')
          }}
        />
      ) : (
        <>
          <DataGrid columns={COLUMNS}>
            {visible.map((prospect) => (
              <ProspectRow
                key={prospect.id}
                prospect={prospect}
                expanded={openRow === prospect.id}
                onToggle={() => setOpenRow((current) => (current === prospect.id ? null : prospect.id))}
                onChanged={() => void load()}
              />
            ))}
          </DataGrid>

          <p className="text-caption text-slate-gray">
            {visible.length} of {prospects?.length ?? 0} shown, warmest first.
          </p>
        </>
      )}
    </div>
  )
}

function ProspectRow({
  prospect,
  expanded,
  onToggle,
  onChanged,
}: {
  prospect: LemlistProspect
  expanded: boolean
  onToggle: () => void
  onChanged: () => void
}) {
  // Only the rows that matter get an edge. A colour on every row is a colour on no row.
  const accent =
    prospect.funnelStep >= 5
      ? 'var(--color-deep-cobalt)'
      : prospect.funnelStep === 4
        ? 'var(--color-signal-blue)'
        : undefined

  return (
    <GridRow
      columnCount={COLUMNS.length}
      expanded={expanded}
      accent={accent}
      detail={<ProspectDetail prospect={prospect} onChanged={onChanged} />}
      cells={[
        <button
          key="who"
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="text-left"
        >
          <span className="flex items-center gap-8">
            <span className="text-body-sm font-semibold text-ink-navy hover:text-signal-blue">
              {prospect.fullName}
            </span>
            {/* Filed in the directory. Beside the name because it is a fact about the person, not an
                action — it used to sit in the actions column, where it was quietly standing in for the
                control and leaving filed prospects with no way to open. */}
            {prospect.contactId && (
              <span className="shrink-0 rounded-md bg-pebble px-[6px] py-[1px] text-caption font-semibold text-slate-gray">
                Filed
              </span>
            )}
          </span>
          <span className="mt-[2px] block truncate text-caption text-slate-gray">{prospect.email}</span>
        </button>,

        <span key="where" className="block">
          <span className="block truncate text-body-sm text-ink-navy">
            {prospect.companyName || '—'}
          </span>
          {prospect.jobTitle && (
            <span className="mt-[2px] block truncate text-caption text-slate-gray">
              {prospect.jobTitle}
            </span>
          )}
        </span>,

        <span key="campaign" className="block truncate text-caption text-slate-gray">
          {prospect.campaignName}
        </span>,

        <span key="progress" className="flex flex-col gap-[4px]">
          <SequenceTrail step={prospect.funnelStep} dead={prospect.deadEnd} />
          {/* The word, under the shape. The shape is what you scan; this is what confirms it. */}
          <span
            className={cn(
              'text-caption',
              prospect.deadEnd ? 'font-semibold text-risk' : 'text-slate-gray',
            )}
          >
            {humanState(prospect.state) || 'Not contacted'}
          </span>
        </span>,

        <span key="last" className="block text-right text-caption whitespace-nowrap text-slate-gray">
          {prospect.lastActivityAt ? relativeToNow(prospect.lastActivityAt) : '—'}
        </span>,

        <span key="act" className="flex items-center justify-end gap-8">
          <Button size="sm" variant={expanded ? 'ghost' : 'outline'} onClick={onToggle}>
            {expanded ? 'Close' : 'Open'}
          </Button>
        </span>,
      ]}
    />
  )
}

/**
 * The expanded row: the sequence named, the timeline, and the two things you might do next.
 *
 * Everything here is what the compact row deliberately left out. It loads on expansion rather than with the
 * list, because a timeline per row would be four hundred requests to render a page nobody has scrolled.
 */
function ProspectDetail({
  prospect,
  onChanged,
}: {
  prospect: LemlistProspect
  onChanged: () => void
}) {
  const [events, setEvents] = useState<LemlistEngagement[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    lemlistApi
      .timeline(prospect.id)
      .then(setEvents)
      .catch((caught) => setError(errorMessage(caught)))
  }, [prospect.id])

  const variables = Object.entries(prospect.variables).filter(([, value]) => value !== null && value !== '')

  return (
    <div className="grid gap-24 rounded-2xl border border-hairline bg-paper p-16 lg:grid-cols-[1fr_280px]">
      <div className="min-w-0">
        <SequenceTrailLegend step={prospect.funnelStep} dead={prospect.deadEnd} />

        <div className="mt-16 flex flex-wrap items-center gap-16">
          <Stat label="Engagement" value={`${prospect.engagementScore}`} suffix="/100" />
          <Stat label="Events" value={`${prospect.engagementCount}`} />
          {prospect.phone && <Stat label="Phone" value={prospect.phone} />}
          {prospect.linkedinUrl && (
            <a
              href={prospect.linkedinUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="text-caption font-semibold text-signal-blue hover:underline"
            >
              LinkedIn ↗
            </a>
          )}
        </div>

        {variables.length > 0 && (
          <div className="mt-16">
            <h4 className="text-caption font-semibold tracking-wide text-slate-gray uppercase">
              From lemlist
            </h4>
            <dl className="mt-8 flex flex-wrap gap-x-24 gap-y-8">
              {variables.map(([key, value]) => (
                <div key={key}>
                  <dt className="text-caption text-mist-gray">{key}</dt>
                  <dd className="text-caption text-ink-navy">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        <div className="mt-16 border-t border-hairline pt-16">
          <PromoteRow prospect={prospect} onDone={onChanged} />
        </div>
      </div>

      <div className="min-w-0">
        <h4 className="text-caption font-semibold tracking-wide text-slate-gray uppercase">History</h4>

        {error ? (
          <p className="mt-8 text-caption text-risk">{error}</p>
        ) : events === null ? (
          <Skeleton className="mt-8 h-96" />
        ) : events.length === 0 ? (
          <p className="mt-8 text-caption text-slate-gray">
            Nothing has happened to this prospect yet.
          </p>
        ) : (
          <ol className="mt-8 max-h-[220px] space-y-8 overflow-y-auto pr-8">
            {events.map((event) => (
              <li key={event.id} className="flex items-baseline gap-8">
                {/* Which route it arrived by, as a mark rather than a word: a filled dot is live, a hollow
                    one was imported. That distinction is how you tell webhook delivery actually works. */}
                <span
                  aria-hidden="true"
                  title={event.fromWebhook ? 'Arrived live' : 'Came in with an import'}
                  className={cn(
                    'mt-[6px] size-8 shrink-0 rounded-full border',
                    event.fromWebhook
                      ? 'border-signal-blue bg-signal-blue'
                      : 'border-mist-gray bg-transparent',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-caption font-medium text-ink-navy">
                    {humanState(event.kind)}
                  </span>
                  <span className="block text-caption text-mist-gray">
                    {relativeToNow(event.occurredAt)}
                    <span className="sr-only">
                      {event.fromWebhook ? ', arrived live' : ', came in with an import'}
                    </span>
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, suffix }: { label: string; value: string; suffix?: string }) {
  return (
    <span className="block">
      <span className="block text-caption text-mist-gray">{label}</span>
      <span className="text-body-sm font-semibold tabular-nums text-ink-navy">
        {value}
        {suffix && <span className="text-caption font-normal text-slate-gray">{suffix}</span>}
      </span>
    </span>
  )
}

/**
 * Filing a prospect as a real contact, at an account the user names.
 *
 * The account is chosen rather than matched from the company name. "Acme" in an export and "Acme
 * Corporation" in the accounts table are a judgement call, and guessing it attaches somebody to the wrong
 * company — the mistake the duplicate-account search exists to prevent. A likely match is offered first; the
 * confirmation is still a person's.
 */
function PromoteRow({ prospect, onDone }: { prospect: LemlistProspect; onDone: () => void }) {
  const { snapshot, refresh } = useStore()
  const [accountId, setAccountId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const accounts = useMemo(
    () => [...snapshot.accounts].sort((a, b) => a.name.localeCompare(b.name)),
    [snapshot.accounts],
  )

  const suggested = useMemo(() => {
    const needle = prospect.companyName.trim().toLowerCase()
    if (!needle) return null
    return (
      accounts.find(
        (account) =>
          account.name.toLowerCase() === needle ||
          account.name.toLowerCase().startsWith(needle) ||
          needle.startsWith(account.name.toLowerCase()),
      ) ?? null
    )
  }, [accounts, prospect.companyName])

  if (prospect.contactId) {
    return (
      <p className="text-caption text-slate-gray">
        Filed in the directory. They can go on a deal and hold a role like anybody else.
      </p>
    )
  }

  const chosen = accountId || suggested?.id || ''

  return (
    <div className="space-y-8">
      <div>
        <h4 className="text-body-sm font-semibold text-ink-navy">File as a contact</h4>
        <p className="mt-[2px] text-caption text-slate-gray">
          Pick the company they belong to. Once filed they can be attached to a deal and given a role.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-8">
        <Select
          value={chosen}
          disabled={saving}
          onChange={(event) => setAccountId(event.target.value)}
          aria-label="Account"
          className="h-32! w-auto! min-w-[220px] py-0! text-caption!"
        >
          <option value="">Choose an account…</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
              {suggested?.id === account.id ? ' — likely match' : ''}
            </option>
          ))}
        </Select>

        <Button
          size="sm"
          disabled={!chosen || saving}
          onClick={async () => {
            setSaving(true)
            setError(null)
            try {
              await lemlistApi.promote(prospect.id, chosen)
              // The new contact belongs in the directory tab, which reads from the snapshot.
              await refresh()
              onDone()
            } catch (caught) {
              setError(errorMessage(caught))
            } finally {
              setSaving(false)
            }
          }}
        >
          {saving ? 'Filing…' : 'File contact'}
        </Button>
      </div>

      {error && <p className="text-caption font-medium text-risk">{error}</p>}
    </div>
  )
}

function Empty({
  nothingImported,
  filtered,
  onClear,
}: {
  nothingImported: boolean
  filtered: boolean
  onClear: () => void
}) {
  return (
    <div className="rounded-2xl border border-dashed border-hairline bg-cloud px-24 py-48 text-center">
      <p className="text-body-lg font-semibold text-ink-navy">
        {nothingImported ? 'Nothing imported yet' : 'No prospects match'}
      </p>
      <p className="mx-auto mt-8 max-w-[420px] text-body-sm text-slate-gray">
        {nothingImported
          ? 'Run an import from Integrations to bring your campaigns and their people across.'
          : 'Widen the search, pick a different band, or clear the campaign filter.'}
      </p>
      {filtered && !nothingImported && (
        <div className="mt-16">
          <Button size="sm" variant="outline" onClick={onClear}>
            Clear filters
          </Button>
        </div>
      )}
    </div>
  )
}

/** lemlist's camelCase event names, spaced out: `emailsOpened` reads as "Emails opened". */
function humanState(state: string): string {
  if (!state) return ''
  const spaced = state.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
