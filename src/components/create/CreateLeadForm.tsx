import { useState } from 'react'
import type { Id } from '@/types/domain'
import { useStore } from '@/data/store'
import { useAuth } from '@/app/auth'
import { useSelection } from '@/app/selection'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/Field'

/**
 * A new lead: a business unit under an account, with its own owner (R2).
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
  const { user } = useAuth()
  const { select } = useSelection()

  const customers = snapshot.accounts.filter((a) => !a.isPartner)

  const [accountId, setAccountId] = useState(defaultAccountId ?? customers[0]?.id ?? '')
  const [businessUnit, setBusinessUnit] = useState('')
  const [ownerId, setOwnerId] = useState(user?.id ?? snapshot.people[0]?.id ?? '')
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
      const created = await createLead({ accountId, businessUnit: trimmed, ownerId })
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

      <Field label="Owner">
        <Select value={ownerId} disabled={saving} onChange={(e) => setOwnerId(e.target.value)}>
          {snapshot.people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>
      </Field>

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
