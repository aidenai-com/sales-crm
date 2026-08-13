import { useMemo } from 'react'
import type { AnalyticsFilters as ResolvedFilters, Snapshot } from '@/types/domain'
import type { AnalyticsQuery } from '@/api/endpoints'
import { Field, Select } from '@/components/ui/Field'
import { shortDate } from '@/lib/format'

/**
 * The global filters. One row, above everything, applying to every tab at once.
 *
 * Per-panel filters were the alternative and are worse: five panels with five filter states are five
 * different questions on one screen, and a reader comparing two of them cannot tell whether a difference is
 * real or a filter they forgot they set. That argument gets stronger with tabs, not weaker — a filter that
 * reset when you switched tab would make two tabs incomparable while looking identical.
 *
 * **Sticky**, because it is the caption for every number below it. Once the reader has scrolled to a chart,
 * "which pipeline is this" is the first thing they cannot answer from memory.
 *
 * The pipeline filter comes first and is the one the whole page turns on: not every deal follows the same
 * process, so a funnel across two pipelines is two different processes drawn as one shape.
 *
 * The close-date range this replaced was two inputs that could be set to something nonsensical, with no
 * answer to "compared with what". A named calendar period has a defined predecessor, which is what the
 * creation figures need in order to mean anything.
 */

const PERIODS: Array<{ id: NonNullable<AnalyticsQuery['period']>; label: string }> = [
  { id: 'week', label: 'This week' },
  { id: 'month', label: 'This month' },
  { id: 'quarter', label: 'This quarter' },
  { id: 'year', label: 'This year' },
]

export function AnalyticsFilters({
  snapshot,
  query,
  onChange,
  resolved,
}: {
  snapshot: Snapshot
  query: AnalyticsQuery
  onChange: (next: AnalyticsQuery) => void
  /** Echoed from the server, so the caption describes the data actually drawn. Null while loading. */
  resolved: ResolvedFilters | null
}) {
  // Only accounts flagged as partners. Offering every account here would let someone filter
  // by a customer that can never appear in the partner column and read the empty result as
  // "this partner brought nothing".
  const partners = useMemo(
    () => snapshot.accounts.filter((account) => account.isPartner),
    [snapshot.accounts],
  )

  const owners = useMemo(
    () => [...snapshot.people].sort((a, b) => a.name.localeCompare(b.name)),
    [snapshot.people],
  )

  // Empty string is the "All" option's value; the query wants null so the parameter is dropped from the URL
  // entirely rather than sent as an empty filter.
  const set = (patch: Partial<AnalyticsQuery>) => onChange({ ...query, ...patch })
  const blankToNull = (value: string) => (value === '' ? null : value)

<<<<<<< Updated upstream
  const active =
    query.pipelineId || query.ownerId || query.partnerId || query.closeFrom || query.closeTo

  return (
    <div className="rounded-3xl border border-hairline bg-paper p-24 shadow-sm">
      <div className="grid gap-16 sm:grid-cols-2 lg:grid-cols-5">
        <Field label="Pipeline">
          <Select
            value={query.pipelineId ?? ''}
            onChange={(event) => set({ pipelineId: blankToNull(event.target.value) })}
          >
            <option value="">All pipelines</option>
            {snapshot.pipelines.map((pipeline) => (
              <option key={pipeline.id} value={pipeline.id}>
                {pipeline.name}
              </option>
            ))}
          </Select>
        </Field>
=======
  const filtered = Boolean(query.pipelineId || query.ownerId)

  return (
    // Sticky under the app's own 64px header, not at the very top, or it would slide beneath the nav.
    // The negative margin lets the bar's background run the full width while its contents stay on the
    // page's gutter — and it has to match the page gutter at every breakpoint, hence the pair.
    <div className="sticky top-64 z-30 -mx-16 border-b border-hairline bg-cloud/95 px-16 py-16 backdrop-blur sm:-mx-24 sm:px-24">
      {/* Grid rather than flex wrap: three selects that wrap unevenly leave one stranded on its own row at
          exactly the width a tablet is. Two-up on a tablet, one per row on a phone. */}
      <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
        <div className="min-w-0">
          <Field label="Pipeline">
            <Select
              value={query.pipelineId ?? ''}
              onChange={(event) => set({ pipelineId: blankToNull(event.target.value) })}
            >
              <option value="">All pipelines</option>
              {snapshot.pipelines.map((pipeline) => (
                <option key={pipeline.id} value={pipeline.id}>
                  {pipeline.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
>>>>>>> Stashed changes

        <div className="min-w-0">
          <Field label="Individual">
            <Select
              value={query.ownerId ?? ''}
              onChange={(event) => set({ ownerId: blankToNull(event.target.value) })}
            >
              <option value="">Everyone</option>
              {owners.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

<<<<<<< Updated upstream
        <Field label="Partner">
          <Select
            value={query.partnerId ?? ''}
            onChange={(event) => set({ partnerId: blankToNull(event.target.value) })}
          >
            <option value="">All sources</option>
            {partners.map((partner) => (
              <option key={partner.id} value={partner.id}>
                {partner.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Closing from">
          <TextInput
            type="date"
            value={query.closeFrom ?? ''}
            onChange={(event) => set({ closeFrom: blankToNull(event.target.value) })}
          />
        </Field>
=======
        <div className="min-w-0">
          <Field label="Created in">
            <Select
              value={query.period ?? 'year'}
              onChange={(event) =>
                set({ period: event.target.value as NonNullable<AnalyticsQuery['period']> })
              }
            >
              {PERIODS.map((period) => (
                <option key={period.id} value={period.id}>
                  {period.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
>>>>>>> Stashed changes

        {filtered && (
          <button
            type="button"
<<<<<<< Updated upstream
            onClick={() =>
              onChange({
                pipelineId: null,
                ownerId: null,
                partnerId: null,
                closeFrom: null,
                closeTo: null,
              })
            }
            className="rounded-lg px-8 py-[2px] text-caption font-semibold text-signal-blue hover:bg-pebble"
=======
            onClick={() => onChange({ pipelineId: null, ownerId: null, period: query.period })}
            // Left-aligned and full-width-shrunk on a phone, where it sits under the selects rather than
            // beside them: a lone right-aligned control on its own row reads as unrelated to them.
            className="justify-self-start rounded-lg px-8 py-8 text-caption font-semibold text-signal-blue transition-colors duration-(--duration-hover) ease-ui hover:bg-pebble focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-blue"
>>>>>>> Stashed changes
          >
            Clear filters
          </button>
        )}
      </div>

      <p className="mt-8 flex flex-wrap items-center gap-x-8 text-caption text-slate-gray">
        {resolved === null ? (
          'Loading deals…'
        ) : (
          <>
            <span>
              {resolved.dealCount} {resolved.dealCount === 1 ? 'deal' : 'deals'} created{' '}
              {shortDate(resolved.periodFrom)} – {shortDate(resolved.periodTo)}
            </span>
            {/* The omission, stated. Scoping the whole page by creation date hides open deals that started
                earlier, and a funnel quietly missing live pipeline is worse than one that says so. Not
                dressed as a warning: it is a fact about the window, and the window was chosen. */}
            {resolved.excludedOpenCount > 0 && (
              <>
                <span aria-hidden="true" className="text-mist-gray">
                  ·
                </span>
                <span className="text-mist-gray">
                  {resolved.excludedOpenCount} open{' '}
                  {resolved.excludedOpenCount === 1 ? 'deal' : 'deals'} created earlier{' '}
                  {resolved.excludedOpenCount === 1 ? 'is' : 'are'} not shown
                </span>
              </>
            )}
          </>
        )}
      </p>
    </div>
  )
}
