import { useMemo } from 'react'
import type { Snapshot } from '@/types/domain'
import type { AnalyticsQuery } from '@/api/endpoints'
import { Field, Select, TextInput } from '@/components/ui/Field'

/**
 * The filter row. One row, above the charts, applying to all of them at once.
 *
 * Per-chart filters were the alternative and are worse: five charts with five filter states
 * are five different questions on one screen, and a reader comparing two of them has no way
 * to tell whether a difference is real or a filter they forgot they set.
 *
 * "Filterable by individuals and partners to begin with" is the feedback this exists for.
 * Pipeline and close-date window are here too because a forecast chart without a date
 * window is a chart of every deal that will ever close.
 */
export function AnalyticsFilters({
  snapshot,
  query,
  onChange,
  dealCount,
}: {
  snapshot: Snapshot
  query: AnalyticsQuery
  onChange: (next: AnalyticsQuery) => void
  /** Echoed from the server, so the count describes the data actually drawn. */
  dealCount: number | null
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

  // Empty string is the "All" option's value; the query wants null so the parameter is
  // dropped from the URL entirely rather than sent as an empty filter.
  const set = (patch: Partial<AnalyticsQuery>) => onChange({ ...query, ...patch })
  const blankToNull = (value: string) => (value === '' ? null : value)

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

        <Field label="Closing to">
          <TextInput
            type="date"
            value={query.closeTo ?? ''}
            onChange={(event) => set({ closeTo: blankToNull(event.target.value) })}
          />
        </Field>
      </div>

      <div className="mt-16 flex flex-wrap items-center justify-between gap-16">
        <p className="text-caption text-slate-gray">
          {dealCount === null
            ? 'Loading deals…'
            : `${dealCount} deal${dealCount === 1 ? '' : 's'} in view`}
        </p>
        {active && (
          <button
            type="button"
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
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  )
}
