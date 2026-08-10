import { useCallback } from 'react'
import type { Deal } from '@/types/domain'
import { useStore } from '@/data/store'
import { useDebouncedCommit } from '@/hooks/useDebouncedCommit'
import { dateInputValue } from '@/lib/format'
import { Field, TextInput } from '@/components/ui/Field'

/**
 * The free-text and numeric deal fields, shared by the drawer and the full deal page.
 *
 * They live here because they need debouncing and the two surfaces must not each invent
 * their own version of it: typing a deal name is one save when you pause, not one per
 * character. Selects and dates are not here — a discrete choice should commit immediately.
 */

export function DealNameField({ deal }: { deal: Deal }) {
  const { updateDeal } = useStore()
  const commit = useCallback((name: string) => updateDeal(deal.id, { name }), [deal.id, updateDeal])
  const field = useDebouncedCommit(deal.name, commit)

  return (
    <Field label="Opportunity name">
      <TextInput
        value={field.value}
        onChange={(e) => field.onChange(e.target.value)}
        onBlur={field.onBlur}
      />
    </Field>
  )
}

export function DealValueField({ deal }: { deal: Deal }) {
  const { updateDeal } = useStore()
  const commit = useCallback(
    (value: number) => updateDeal(deal.id, { value }),
    [deal.id, updateDeal],
  )
  const field = useDebouncedCommit(deal.value, commit)

  // "US dollars" rather than the old `In ${deal.currency}`: the value cannot vary, so the
  // hint states the unit instead of reading like a field that was configured.
  return (
    <Field label="Value" hint="US dollars">
      <TextInput
        type="number"
        min={0}
        step={10_000}
        value={field.value}
        onChange={(e) => field.onChange(Number(e.target.value) || 0)}
        onBlur={field.onBlur}
      />
    </Field>
  )
}

export function DealCloseDateField({ deal }: { deal: Deal }) {
  const { updateDeal } = useStore()

  return (
    <Field label="Expected close">
      <TextInput
        type="date"
        value={dateInputValue(deal.expectedCloseDate)}
        onChange={(e) => {
          // A cleared date input fires with an empty value; the field is required, so
          // ignore it rather than sending null and getting a 422.
          if (!e.target.value) return
          void updateDeal(deal.id, { expectedCloseDate: e.target.value })
        }}
      />
    </Field>
  )
}
