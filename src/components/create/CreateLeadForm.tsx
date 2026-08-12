import { useState } from 'react'
import type { Id } from '@/types/domain'
import { useStore } from '@/data/store'
import { useSelection } from '@/app/selection'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/Field'

/**
 * A new lead: a business unit under an account.
 *
 * No owner field. Only accounts and deals have an owner — a business unit's stewardship follows its
 * account, so there is nothing to choose here and offering a choice would imply otherwise.
 *
 * The account is a field rather than fixed even when opened from an account, because
 * picking the wrong starting point is easy and re-opening the form to fix it is not the
 * behaviour anyone wants. It just arrives prefilled.
 */
export function CreateLeadForm({
  defaultAccountId,
  onDone,
}: {
  defaultAccountId?: Id
  onDone: () => void
}) {
  const { snapshot, createLead } = useStore()
  const { select } = useSelection()

  // Every account. A business unit can sit under any company we deal with.
  const customers = snapshot.accounts

  const [accountId, setAccountId] = useState(defaultAccountId ?? customers[0]?.id ?? '')
  const [businessUnit, setBusinessUnit] = useState('')
  const [saving, setSaving] = useState(false)

  const trimmed = businessUnit.trim()
  const duplicate = snapshot.leads.some(
    (l) => l.accountId === accountId && l.businessUnit.toLowerCase() === trimmed.toLowerCase(),
  )
  const canSave = trimmed.length > 0 && accountId !== '' && !duplicate && !saving

  async function submit() {
    if (!canSave) return
    setSaving(true)
    try {
      const created = await createLead({ accountId, businessUnit: trimmed })
      if (created) {
        onDone()
        select({ type: 'lead', id: created.id })
      }
    } finally {
      setSaving(false)
    }
  }

  if (customers.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-hairline bg-cloud px-24 py-32 text-center">
        <p className="text-body-lg font-semibold text-ink-navy">Create an account first</p>
        <p className="mt-8 text-body-sm text-slate-gray">
          A business unit sits under an account, so there needs to be one to attach it to.
        </p>
      </div>
    )
  }

  return (
    <form
      className="space-y-16"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Field label="Account">
        <Select value={accountId} disabled={saving} onChange={(e) => setAccountId(e.target.value)}>
          {customers.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field
        label="Business unit"
        hint={
          duplicate
            ? 'That business unit already exists on this account.'
            : 'The function or division this lead covers.'
        }
      >
        <TextInput
          autoFocus
          value={businessUnit}
          disabled={saving}
          onChange={(e) => setBusinessUnit(e.target.value)}
          placeholder="Wealth & Asset Management"
        />
      </Field>

      {/* No owner field: see the note above the component. */}

      <div className="flex items-center gap-8 pt-8">
        <Button type="submit" loading={saving} disabled={!canSave}>
          {saving ? 'Creating' : 'Create business unit'}
        </Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
