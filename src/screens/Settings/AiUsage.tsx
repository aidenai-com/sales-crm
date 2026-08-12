import { useCallback, useEffect, useState } from 'react'
import { api } from '@/api/client'
import { useAuth } from '@/app/auth'
import { count, timeAgo } from '@/lib/format'
import { Skeleton } from '@/components/ui/Skeleton'
import { Button } from '@/components/ui/Button'
import { ChartPanel, DataTable, StatTile } from '@/components/viz/primitives'

/**
 * What the assistant has cost, for administrators.
 *
 * Reads the same viz primitives the Analytics screen uses rather than inventing a second set of
 * tiles and tables, so an admin moving between the two is reading the same components in a
 * different context.
 *
 * The screen's most important behaviour is refusing to state a cost it cannot know. Until a
 * per-token rate is configured, every money figure is absent and the page says why — a dashboard
 * that prints $0.00 for real spend is worse than one that admits it has no rate.
 */

interface UsageTotals {
  calls: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number | null
  errors: number
  windowDays: number
}

interface UsageSummary {
  totals: UsageTotals
  model: string
  providerConfigured: boolean
  pricingConfigured: boolean
  inputCostPer1m: number
  outputCostPer1m: number
  byUser: Array<{
    userId: string
    userName: string
    calls: number
    totalTokens: number
    costUsd: number | null
  }>
  daily: Array<{ day: string; calls: number; totalTokens: number; costUsd: number | null }>
  recent: Array<{
    id: string
    userName: string
    model: string
    promptTokens: number
    completionTokens: number
    costUsd: number | null
    toolCalls: number
    latencyMs: number
    questionPreview: string
    error: string | null
    createdAt: string
  }>
}

const WINDOWS = [7, 30, 90] as const

function money(value: number | null): string {
  // An em dash, not "$0.00". The distinction between "nothing was spent" and "we do not know
  // the rate" is the whole point of this screen being honest.
  if (value === null) return '—'
  return value < 1 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`
}

export function AiUsage() {
  const { isAdmin } = useAuth()
  const [days, setDays] = useState<number>(30)
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setSummary(await api.get<UsageSummary>(`/assistant/usage?days=${days}`))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load usage.')
    } finally {
      setLoading(false)
    }
  }, [days])

  useEffect(() => {
    void load()
  }, [load])

  // The API refuses a rep anyway; this stops the app rendering a door that will not open.
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-page px-24 py-96">
        <p className="text-body text-slate-gray">This page is for administrators.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-page px-24 pb-96">
      <header className="flex flex-wrap items-end justify-between gap-16 py-32">
        <div>
          <p className="text-caption font-semibold tracking-wide text-slate-gray uppercase">
            Settings
          </p>
          <h1 className="mt-8 text-heading-sm font-bold text-ink-navy">Assistant usage</h1>
          <p className="mt-8 max-w-[640px] text-body text-slate-gray">
            Every model call the assistant has made, who made it, and what it cost.
          </p>
        </div>

        <div className="flex items-center gap-8" role="group" aria-label="Time window">
          {WINDOWS.map((window) => (
            <button
              key={window}
              onClick={() => setDays(window)}
              aria-pressed={days === window}
              className={
                days === window
                  ? 'rounded-lg bg-pebble px-16 py-8 text-body-sm font-semibold text-signal-blue'
                  : 'rounded-lg px-16 py-8 text-body-sm font-semibold text-slate-gray hover:bg-pebble'
              }
            >
              {window} days
            </button>
          ))}
        </div>
      </header>

      {summary && !summary.pricingConfigured && (
        <div className="mb-24 rounded-2xl border border-dashed border-hairline bg-cloud p-24">
          <p className="text-body-sm font-semibold text-ink-navy">No token rate is set</p>
          <p className="mt-8 text-body-sm text-slate-gray">
            Token counts below are exact. Costs are blank because no price per token is
            configured — set <code>OPENAI_INPUT_COST_PER_1M</code> and{' '}
            <code>OPENAI_OUTPUT_COST_PER_1M</code> in <code>backend/.env</code> from OpenAI's
            current pricing, and spend from that point on will be costed.
          </p>
        </div>
      )}

      {error && (
        <div className="mb-24 rounded-2xl border border-risk bg-risk-fill p-24">
          <p className="text-body-sm font-semibold text-ink-navy">Could not load usage</p>
          <p className="mt-8 text-body-sm text-slate-gray">{error}</p>
          <div className="mt-16">
            <Button size="sm" onClick={() => void load()}>
              Try again
            </Button>
          </div>
        </div>
      )}

      {loading && !summary ? (
        <UsageSkeleton />
      ) : (
        summary && (
          <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            <div className="grid gap-16 sm:grid-cols-2 lg:grid-cols-4">
              <StatTile
                label="Spend"
                value={money(summary.totals.costUsd)}
                hint={
                  summary.pricingConfigured
                    ? `Over ${summary.totals.windowDays} days`
                    : 'No rate configured'
                }
                emphasis
              />
              <StatTile
                label="Tokens"
                value={count(summary.totals.totalTokens)}
                hint={`${count(summary.totals.promptTokens)} in · ${count(summary.totals.completionTokens)} out`}
                emphasis
              />
              <StatTile
                label="Calls"
                value={count(summary.totals.calls)}
                hint={`Model: ${summary.model}`}
                emphasis
              />
              <StatTile
                label="Failed calls"
                value={count(summary.totals.errors)}
                hint={
                  summary.providerConfigured
                    ? 'Provider errors and cut-off answers'
                    : 'No API key set — replies are canned'
                }
                emphasis
              />
            </div>

            <div className="mt-24 space-y-24">
              <ChartPanel
                title="By person"
                subtitle="Who is using the assistant, and what their questions cost."
                table={
                  <DataTable
                    columns={['Person', 'Calls', 'Tokens', 'Cost']}
                    rows={summary.byUser.map((row) => ({
                      key: row.userId,
                      cells: [
                        row.userName,
                        count(row.calls),
                        count(row.totalTokens),
                        money(row.costUsd),
                      ],
                    }))}
                  />
                }
              >
                <DataTable
                  columns={['Person', 'Calls', 'Tokens', 'Cost']}
                  rows={summary.byUser.map((row) => ({
                    key: row.userId,
                    cells: [
                      row.userName,
                      count(row.calls),
                      count(row.totalTokens),
                      money(row.costUsd),
                    ],
                  }))}
                />
              </ChartPanel>

              {/* Days run oldest-first here, unlike the questions below. A spend trend is read
                  left to right; a log is read newest-first. */}
              <ChartPanel
                title="By day"
                subtitle="Days with no calls are omitted. Dates are UTC."
                table={<DailyTable rows={summary.daily} />}
              >
                <DailyTable rows={summary.daily} />
              </ChartPanel>

              <ChartPanel
                title="Recent questions"
                subtitle="Newest first. Questions are truncated, and no answer is stored."
                table={<RecentTable rows={summary.recent} />}
              >
                <RecentTable rows={summary.recent} />
              </ChartPanel>
            </div>
          </div>
        )
      )}
    </div>
  )
}

function DailyTable({ rows }: { rows: UsageSummary['daily'] }) {
  return (
    <DataTable
      columns={['Day', 'Calls', 'Tokens', 'Cost']}
      rows={rows.map((row) => ({
        key: row.day,
        cells: [
          new Date(`${row.day}T00:00:00Z`).toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          count(row.calls),
          count(row.totalTokens),
          money(row.costUsd),
        ],
      }))}
    />
  )
}

function RecentTable({ rows }: { rows: UsageSummary['recent'] }) {
  return (
    <DataTable
      columns={['When', 'Question', 'Person', 'Model', 'In / out', 'Tools', 'Latency', 'Cost']}
      rows={rows.map((row) => ({
        key: row.id,
        cells: [
          <span key="when" className="whitespace-nowrap" title={new Date(row.createdAt).toISOString()}>
            {timeAgo(row.createdAt)}
          </span>,
          // The failure text is the detail that matters most when something breaks, and it is
          // usually the provider explaining exactly what it rejected — so it is shown, not
          // reduced to the word "failed".
          <span key="q" className="block max-w-[280px]">
            <span className="block truncate" title={row.questionPreview}>
              {row.questionPreview || '—'}
            </span>
            {row.error && (
              <span className="mt-[2px] block truncate text-caption text-risk" title={row.error}>
                {row.error}
              </span>
            )}
          </span>,
          row.userName,
          <span key="model" className="whitespace-nowrap">
            {row.model}
          </span>,
          // Split rather than summed: a runaway prompt and a runaway answer are different
          // problems, and the totals above already carry the combined figure.
          `${count(row.promptTokens)} / ${count(row.completionTokens)}`,
          count(row.toolCalls),
          `${(row.latencyMs / 1000).toFixed(1)}s`,
          money(row.costUsd),
        ],
      }))}
    />
  )
}

function UsageSkeleton() {
  return (
    <>
      <div className="grid gap-16 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[108px] rounded-2xl" />
        ))}
      </div>
      <div className="mt-24 space-y-24">
        <Skeleton className="h-[260px] rounded-3xl" />
        <Skeleton className="h-[320px] rounded-3xl" />
      </div>
    </>
  )
}
