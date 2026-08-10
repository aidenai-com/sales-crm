import { useState } from 'react'
import { useStore } from '@/data/store'
import { useAuth } from '@/app/auth'
import { useSelection } from '@/app/selection'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/Field'

/**
 * A new account: the top-level record, whose name is the customer's name (R1).
 *
 * `isPartner` is a checkbox rather than a separate "create partner" flow because one table
 * holds both — a firm can be a channel partner and a customer at once, and forcing that
 * choice up front would mean two records to keep in sync later.
 */
export function CreateAccountForm({ onDone }: { onDone: () => void }) {
  const { snapshot, createAccount } = useStore()
  const { user } = useAuth()
  const { select } = useSelection()

  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [isPartner, setIsPartner] = useState(false)
  const [ownerId, setOwnerId] = useState(user?.id ?? snapshot.people[0]?.id ?? '')
  const [saving, setSaving] = useState(false)

  const trimmed = name.trim()
  const duplicate = snapshot.accounts.some((a) => a.name.toLowerCase() === trimmed.toLowerCase())
  const canSave = trimmed.length > 0 && !duplicate && ownerId !== '' && !saving

  async function submit() {
    if (!canSave) return
    setSaving(true)
    try {
      const created = await createAccount({
        name: trimmed,
        industry: industry.trim(),
        isPartner,
        ownerId,
      })
      if (created) {
        onDone()
        // Straight into the new record, which is nearly always the next thing wanted.
        select({ type: 'account', id: created.id })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="space-y-16"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Field
        label="Account name"
        hint={duplicate ? 'An account with that name already exists.' : 'The customer’s name (R1).'}
      >
        <TextInput
          autoFocus
          value={name}
          disabled={saving}
          onChange={(e) => setName(e.target.value)}
          placeholder="Barclays"
        />
      </Field>

      <Field label="Industry">
        <TextInput
          value={industry}
          disabled={saving}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="Banking"
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

      <label className="flex cursor-pointer items-start gap-8 rounded-lg border border-hairline bg-cloud p-16">
        <input
          type="checkbox"
          checked={isPartner}
          disabled={saving}
          onChange={(e) => setIsPartner(e.target.checked)}
          className="mt-[2px] size-16 shrink-0 rounded-md accent-signal-blue"
        />
        <span>
          <span className="block text-body-sm font-semibold text-ink-navy">
            This is a channel partner
          </span>
          <span className="mt-[2px] block text-caption text-slate-gray">
            Partners can be named on partner-led deals. They are kept out of the account tree,
            which answers "who are our customers".
          </span>
        </span>
      </label>

      <div className="flex items-center gap-8 pt-8">
        <Button type="submit" loading={saving} disabled={!canSave}>
          {saving ? 'Creating' : 'Create account'}
        </Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
