import { useState, type ReactNode } from 'react'
import { useLemlist } from '@/hooks/useLemlist'
import { relativeToNow } from '@/lib/format'
import { routes, useRouter } from '@/app/router'
import { cn } from '@/lib/cn'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'

/**
 * The services this workspace is connected to.
 *
 * Built as a **ledger** rather than a grid of marketing cards. An app-store grid is the reflex for an
 * integrations page and it is the wrong shape here for two reasons: there is one integration, so a grid of
 * one is a lonely tile in an ocean; and the useful information is not "what could I connect" but "is the
 * thing I connected actually working". A ledger row can carry a state, a set of numbers and its actions at
 * once, and it stays right when there are eight of them.
 *
 * Per user, not per workspace: a lemlist API key belongs to the person who generated it, and everything
 * imported with it is their outreach. There is deliberately no administrator view of somebody else's
 * connection — there is no version of that which is not reading their mailbox over their shoulder.
 *
 * The one uncommon element is the **delivery meter**: what share of engagement arrived live by webhook
 * rather than by import. It is here because "connected" and "live" are different states that every other
 * integration UI conflates — a webhook can be registered and never fire, and no amount of green ticks would
 * reveal it. The meter is the only thing on this page that can.
 */
export function Integrations() {
  const lemlist = useLemlist()
  const { navigate } = useRouter()
  const [expanded, setExpanded] = useState(true)
  const [apiKey, setApiKey] = useState('')
  const [confirmingDisconnect, setConfirmingDisconnect] = useState(false)

  const { status } = lemlist
  const state = lemlist.loading
    ? 'loading'
    : status.connected
      ? status.lastSyncError
        ? 'attention'
        : 'connected'
      : 'available'

  return (
    <div className="mx-auto max-w-page px-24 pb-96">
      <div className="py-32">
        <p className="text-caption font-semibold tracking-wide text-slate-gray uppercase">Settings</p>
        <h1 className="mt-8 text-heading-sm font-bold text-ink-navy">Integrations</h1>
        <p className="mt-8 max-w-[620px] text-body text-slate-gray">
          Connect the tools you already work in. What comes across is stored here and read from here, so your
          screens stay fast whatever the other service is doing.
        </p>
      </div>

      {/* The ledger. One row per service; the header names what each column of the row means so the state
          words are not left to be inferred. */}
      <div className="overflow-hidden rounded-3xl border border-hairline bg-paper shadow-sm">
        <div className="flex items-center justify-between gap-16 border-b border-hairline bg-pebble px-24 py-8">
          <span className="text-caption font-semibold tracking-wide text-slate-gray uppercase">Service</span>
          <span className="text-caption font-semibold tracking-wide text-slate-gray uppercase">State</span>
        </div>

        <LedgerRow
          name="lemlist"
          role="Cold outreach and sequences"
          state={state}
          expanded={expanded}
          onToggle={() => setExpanded((current) => !current)}
        >
          {lemlist.loading ? (
            <Skeleton className="h-96" />
          ) : status.connected ? (
            <Connected
              lemlist={lemlist}
              onDisconnect={() => setConfirmingDisconnect(true)}
              onSeeProspects={() => navigate(routes.contacts)}
            />
          ) : (
            <form
              className="max-w-[520px] space-y-16"
              onSubmit={async (event) => {
                event.preventDefault()
                if (await lemlist.connect(apiKey)) setApiKey('')
              }}
            >
              <Field
                label="API key"
                hint="In lemlist: Settings → Integrations → Generate. It is shown once, so paste it straight in."
              >
                <TextInput
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  disabled={lemlist.busy}
                  placeholder="Paste your lemlist API key"
                  onChange={(event) => setApiKey(event.target.value)}
                />
              </Field>

              <ul className="space-y-[2px] text-caption text-slate-gray">
                <li>· Checked against lemlist before anything is saved, then stored encrypted.</li>
                <li>· Never shown again, here or anywhere else.</li>
                <li>· lemlist needs a paid plan for API access; a free one is refused with a 403.</li>
                <li>· Nothing is written back to lemlist. This reads.</li>
              </ul>

              <div aria-live="polite">
                {lemlist.error && (
                  <p className="rounded-lg border border-risk bg-risk-fill px-16 py-8 text-body-sm text-ink-navy">
                    {lemlist.error}
                  </p>
                )}
              </div>

              <Button type="submit" disabled={apiKey.trim().length < 8 || lemlist.busy}>
                {lemlist.busy ? 'Checking the key…' : 'Connect lemlist'}
              </Button>
            </form>
          )}

          {confirmingDisconnect && (
            <div className="mt-24 rounded-2xl border border-risk bg-risk-fill p-16">
              <p className="text-body-sm font-semibold text-ink-navy">
                Disconnect lemlist and delete what came across?
              </p>
              <p className="mt-[2px] max-w-[560px] text-caption text-slate-gray">
                {status.contacts} {status.contacts === 1 ? 'prospect' : 'prospects'} and their whole history
                go, and the webhook is deregistered. Anyone already filed as a contact stays — those are your
                records now. Reconnecting means pasting the key again, and lemlist only shows a key once.
              </p>
              <div className="mt-16 flex items-center gap-8">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={lemlist.busy}
                  onClick={async () => {
                    if (await lemlist.disconnect()) setConfirmingDisconnect(false)
                  }}
                >
                  {lemlist.busy ? 'Disconnecting…' : 'Disconnect and delete'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingDisconnect(false)}>
                  Keep it
                </Button>
              </div>
            </div>
          )}
        </LedgerRow>
      </div>

      {/* Named honestly rather than dressed as a roadmap. An empty "coming soon" grid promises things
          nobody has committed to; this says what is true, which is that there is one and it is lemlist. */}
      <p className="mt-16 text-caption text-slate-gray">
        lemlist is the only service wired up so far. The shape above takes more when they arrive.
      </p>
    </div>
  )
}

/**
 * One service in the ledger: identity on the left, state on the right, detail underneath when opened.
 *
 * The state word is paired with a mark whose *shape* differs per state, not only its colour — a filled disc
 * for connected, a ring for available, a struck disc for attention. Two of those states are blue in this
 * palette, and a reader who cannot separate two blues still reads the shape.
 */
function LedgerRow({
  name,
  role,
  state,
  expanded,
  onToggle,
  children,
}: {
  name: string
  role: string
  state: 'loading' | 'connected' | 'available' | 'attention'
  expanded: boolean
  onToggle: () => void
  children: ReactNode
}) {
  const word =
    state === 'connected'
      ? 'Connected'
      : state === 'attention'
        ? 'Needs attention'
        : state === 'available'
          ? 'Not connected'
          : 'Checking…'

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-16 px-24 py-16">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-16 text-left"
        >
          {/* The mark. A monogram rather than a logo file: we do not ship somebody else's trademark, and a
              letter in the product's own type sits in the page instead of on top of it. */}
          <span
            className={cn(
              'grid size-40 shrink-0 place-items-center rounded-xl border text-body-sm font-bold',
              state === 'connected' || state === 'attention'
                ? 'border-signal-blue bg-badge-fill text-signal-blue'
                : 'border-hairline bg-cloud text-slate-gray',
            )}
          >
            {name.charAt(0)}
          </span>

          <span className="min-w-0">
            <span className="flex items-center gap-8">
              <span className="text-body-lg font-semibold text-ink-navy">{name}</span>
              <svg
                viewBox="0 0 16 16"
                aria-hidden="true"
                className={cn(
                  'size-16 text-mist-gray transition-transform duration-(--duration-hover) ease-ui',
                  expanded && 'rotate-180',
                )}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
              >
                <path d="M4 6.5L8 10.5l4-4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <span className="mt-[2px] block truncate text-caption text-slate-gray">{role}</span>
          </span>
        </button>

        <span className="flex shrink-0 items-center gap-8">
          <StateMark state={state} />
          <span
            className={cn(
              'text-caption font-semibold',
              state === 'attention' ? 'text-risk' : state === 'connected' ? 'text-signal-blue' : 'text-slate-gray',
            )}
          >
            {word}
          </span>
        </span>
      </div>

      {expanded && <div className="border-t border-hairline bg-cloud px-24 py-24">{children}</div>}
    </section>
  )
}

function StateMark({ state }: { state: 'loading' | 'connected' | 'available' | 'attention' }) {
  if (state === 'attention') {
    return (
      <span aria-hidden="true" className="grid size-16 place-items-center">
        <span className="size-8 rounded-full bg-risk" />
      </span>
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'size-8 rounded-full',
        state === 'connected' ? 'bg-signal-blue' : 'border border-mist-gray bg-transparent',
      )}
    />
  )
}

function Connected({
  lemlist,
  onDisconnect,
  onSeeProspects,
}: {
  lemlist: ReturnType<typeof useLemlist>
  onDisconnect: () => void
  onSeeProspects: () => void
}) {
  const { status, lastSync } = lemlist

  return (
    <div className="space-y-24">
      {/* Two counts, not three. An engagement total was here and came out again: the delivery meter below
          already prints live and imported, which sum to it, and a number stated twice on one panel is a
          number somebody has to check against itself. */}
      <div className="grid gap-16 sm:grid-cols-2">
        <Count label="Campaigns imported" value={status.importedCampaigns} of={status.campaigns} />
        <Count label="Prospects" value={status.contacts} />
      </div>

      <CampaignList lemlist={lemlist} />

      <DeliveryMeter
        total={status.engagements}
        live={status.liveEngagements}
        registered={status.webhookRegistered}
        targetUrl={status.webhookTargetUrl}
        busy={lemlist.busy}
        onRegister={() => void lemlist.registerWebhook()}
      />

      <dl className="grid gap-x-24 gap-y-8 sm:grid-cols-2">
        <Fact label="Workspace">{status.teamName || status.teamId || 'Unnamed'}</Fact>
        <Fact label="Last import">
          {status.lastSyncAt ? relativeToNow(status.lastSyncAt) : 'Never'}
        </Fact>
        <Fact label="Connected">
          {status.connectedAt ? relativeToNow(status.connectedAt) : '—'}
        </Fact>
        <Fact label="Key">
          {/* The fingerprint, never the key. Enough to tell two keys apart, useless as a credential. */}
          <span className="font-mono">…{status.keyFingerprint}</span>
        </Fact>
      </dl>

      {status.lastSyncError && (
        <div className="rounded-xl border border-risk bg-risk-fill px-16 py-12">
          <p className="text-body-sm font-semibold text-ink-navy">The last import hit a problem</p>
          <p className="mt-[2px] text-caption text-slate-gray">{status.lastSyncError}</p>
        </div>
      )}

      {lastSync && (
        <div className="rounded-xl border border-signal-blue bg-badge-fill px-16 py-12">
          <p className="text-body-sm font-semibold text-ink-navy">
            {lastSync.contactsCreated > 0
              ? `${lastSync.contactsCreated} new ${lastSync.contactsCreated === 1 ? 'prospect' : 'prospects'}`
              : 'Nothing new'}
            {lastSync.engagements > 0 && `, ${lastSync.engagements} new events`}
          </p>
          <p className="mt-[2px] text-caption text-slate-gray">
            Across {lastSync.campaigns} {lastSync.campaigns === 1 ? 'campaign' : 'campaigns'};{' '}
            {lastSync.contactsUpdated} existing {lastSync.contactsUpdated === 1 ? 'prospect' : 'prospects'}{' '}
            refreshed.
          </p>
          {lastSync.failures.length > 0 && (
            <ul className="mt-8 space-y-[2px]">
              {lastSync.failures.map((failure) => (
                <li key={failure} className="text-caption text-risk">
                  {failure}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div aria-live="polite">
        {lemlist.error && (
          <p className="rounded-lg border border-risk bg-risk-fill px-16 py-8 text-body-sm text-ink-navy">
            {lemlist.error}
          </p>
        )}
      </div>

      {/* No "import everything" button. It was the whole bug: thirty-three campaigns paced under lemlist's
          rate limit is a request no browser waits out, and the one that got interrupted left the workspace
          refusing every later attempt. Importing is per campaign now, in the list above. */}
      <div className="flex flex-wrap items-center gap-8 border-t border-hairline pt-16">
        {status.contacts > 0 && <Button onClick={onSeeProspects}>See the prospects</Button>}
        <span className="flex-1" />
        <Button
          variant="ghost"
          disabled={lemlist.busy || lemlist.importingId !== null}
          onClick={onDisconnect}
        >
          Disconnect
        </Button>
      </div>
    </div>
  )
}

/**
 * The workspace's campaigns, and which of them have been mirrored.
 *
 * This is the page's centre of gravity now, because it is where the expensive decision is made. Listing a
 * campaign costs one request; importing its leads and history costs many, paced under lemlist's rate limit.
 * Putting that choice in front of the user is what replaced a single "import everything" button that spent
 * the whole workspace's budget on data nobody had asked for, in a request the browser did not wait out.
 *
 * The state per row is deliberately three-way rather than a checkbox: never imported, mirrored, or importing
 * now. A mirrored campaign keeps a *secondary* refresh rather than going inert — leads change state and
 * activity keeps arriving, so a row with no way to update would freeze the mirror at whatever it first
 * caught. Nothing re-fetches unless asked.
 */
function CampaignList({ lemlist }: { lemlist: ReturnType<typeof useLemlist> }) {
  const { campaigns, importingId } = lemlist
  const anyImporting = importingId !== null

  return (
    <section className="overflow-hidden rounded-2xl border border-hairline bg-paper">
      <header className="flex flex-wrap items-center justify-between gap-8 border-b border-hairline bg-pebble px-16 py-8">
        <h3 className="text-caption font-semibold tracking-wide text-slate-gray uppercase">Campaigns</h3>
        <Button
          size="sm"
          variant="ghost"
          disabled={lemlist.busy || anyImporting}
          onClick={() => void lemlist.refreshCampaigns()}
        >
          {lemlist.busy ? 'Checking lemlist…' : 'Check for new campaigns'}
        </Button>
      </header>

      {campaigns.length === 0 ? (
        <p className="px-16 py-24 text-body-sm text-slate-gray">
          No campaigns yet. Check for new campaigns to read the list from lemlist — that costs one request and
          imports nothing.
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {campaigns.map((campaign) => {
            const importing = campaign.importing || importingId === campaign.id
            const imported = campaign.importedAt !== null
            return (
              <li
                key={campaign.id}
                className={cn(
                  'flex flex-wrap items-center gap-x-16 gap-y-8 px-16 py-12',
                  // A left edge rather than a filled row: it marks the mirrored ones down the list without
                  // tinting a whole band of the panel.
                  imported ? 'border-l-2 border-l-signal-blue' : 'border-l-2 border-l-transparent',
                )}
              >
                <div className="min-w-[180px] flex-1">
                  <p className="truncate text-body-sm font-semibold text-ink-navy">
                    {campaign.name || campaign.lemlistId}
                  </p>
                  <p className="mt-[2px] flex flex-wrap items-center gap-x-8 text-caption text-slate-gray">
                    {/* lemlist's own word for the campaign's state, not ours. Paraphrasing it would invent a
                        vocabulary the user would then have to map back to the tool they came from. */}
                    <span className="capitalize">{campaign.status || 'unknown'}</span>
                    {imported && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">
                          {campaign.leadCount} {campaign.leadCount === 1 ? 'lead' : 'leads'}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>imported {relativeToNow(campaign.importedAt!)}</span>
                      </>
                    )}
                  </p>
                  {campaign.importError && (
                    <p className="mt-[2px] text-caption text-risk">{campaign.importError}</p>
                  )}
                </div>

                {/* The action states what happens, and keeps the same word through the flow: Import →
                    Importing… → then the row reads imported and offers Refresh. */}
                <Button
                  size="sm"
                  variant={imported ? 'ghost' : 'outline'}
                  // Only this row's own import blocks it. Another campaign importing would merely be sharing
                  // the workspace's request budget, and spending it on two at once is the user's call.
                  disabled={importing || lemlist.busy}
                  onClick={() => void lemlist.importCampaign(campaign.id, !imported)}
                >
                  {importing ? 'Importing…' : imported ? 'Refresh' : 'Import leads'}
                </Button>
              </li>
            )
          })}
        </ul>
      )}

      <p aria-live="polite" className="border-t border-hairline px-16 py-8 text-caption text-slate-gray">
        {anyImporting
          ? 'Reading leads and history for that campaign. lemlist allows twenty requests every two seconds, so a large campaign takes a moment — leaving this page stops it.'
          : 'Importing reads one campaign at a time. Nothing is fetched until you ask for it.'}
      </p>
    </section>
  )
}

/**
 * The share of engagement that arrived live.
 *
 * The uncommon element on this page, and the argument for it is that **connected and live are different
 * states.** A registered webhook that never fires looks identical to a working one on every integrations
 * screen I have seen; the only evidence is whether events are actually arriving that way. This turns that
 * into one bar and one sentence.
 *
 * Drawn as a single split bar rather than two numbers, because the comparison *is* the message: a sliver of
 * blue against a long grey run says "everything you have came from imports" faster than "3 of 412" does.
 */
function DeliveryMeter({
  total,
  live,
  registered,
  targetUrl,
  busy,
  onRegister,
}: {
  total: number
  live: number
  registered: boolean
  targetUrl: string
  busy: boolean
  onRegister: () => void
}) {
  const share = total > 0 ? Math.round((live / total) * 100) : 0

  const headline = !registered
    ? 'Updates arrive only when you ask'
    : live === 0
      ? 'Registered, but nothing has arrived live yet'
      : `${share}% of events arrived live`

  const explanation = !registered
    ? targetUrl
      ? 'No webhook is registered, so lemlist has no reason to tell us anything. Register one and opens, clicks and replies land here as they happen.'
      : 'No public callback URL is configured, so lemlist has nowhere to send events. Imports still work — you will just need to check for updates to see changes.'
    : live === 0
      ? 'The webhook is registered and lemlist has not called it yet. That is expected on a quiet campaign, and worth a second look if the campaign is busy.'
      : 'The rest came in with imports, which is normal — the first import backfills history that predates the webhook.'

  return (
    <div className="rounded-2xl border border-hairline bg-paper p-16">
      <div className="flex flex-wrap items-baseline justify-between gap-8">
        <h3 className="text-body-sm font-semibold text-ink-navy">{headline}</h3>
        {registered && total > 0 && (
          <span className="text-caption tabular-nums text-slate-gray">
            {live} live · {total - live} imported
          </span>
        )}
      </div>

      <div
        className="mt-8 flex h-8 overflow-hidden rounded-full bg-pebble"
        role="img"
        aria-label={
          total === 0
            ? 'No engagement recorded yet'
            : `${live} of ${total} events arrived live; the rest came in with imports`
        }
      >
        {/* Two segments with a hairline of surface between them, matching how stacked marks are separated
            everywhere else in the app. */}
        {live > 0 && (
          <span
            className="h-full bg-signal-blue transition-[width] duration-(--duration-hover) ease-ui"
            style={{ width: `${Math.max(share, 2)}%` }}
          />
        )}
        {total - live > 0 && (
          <span
            className="ml-[2px] h-full flex-1 bg-mist-gray"
          />
        )}
      </div>

      <p className="mt-8 max-w-[600px] text-caption text-slate-gray">{explanation}</p>

      {!registered && targetUrl && (
        <div className="mt-16">
          <Button size="sm" variant="outline" disabled={busy} onClick={onRegister}>
            Turn on live updates
          </Button>
        </div>
      )}
    </div>
  )
}

/** `of` prints the count as a fraction, for the one number whose meaning is the gap: imported of listed. */
function Count({ label, value, of }: { label: string; value: number; of?: number }) {
  return (
    <div className="rounded-2xl border border-hairline bg-paper px-16 py-12">
      <p className="text-caption font-semibold tracking-wide text-slate-gray uppercase">{label}</p>
      <p className="mt-[2px] text-subheading leading-none font-bold tabular-nums text-ink-navy">
        {value}
        {of !== undefined && <span className="text-body font-semibold text-mist-gray"> / {of}</span>}
      </p>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-16 border-b border-hairline py-8">
      <dt className="text-caption text-slate-gray">{label}</dt>
      <dd className="text-caption font-semibold text-ink-navy">{children}</dd>
    </div>
  )
}
