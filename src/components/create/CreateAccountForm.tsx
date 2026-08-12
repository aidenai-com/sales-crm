import { useCallback, useState } from 'react'
import { useStore } from '@/data/store'
import { useSelection } from '@/app/selection'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'
import { AccountNameField } from './AccountNameField'

/**
 * A new account: the top-level record, whose name is the customer's name (R1).
 *
 * Two fields, and neither is a choice about what kind of company this is.
 *
 * There was a "this is a channel partner" checkbox. It is gone with the column behind it: an account is
 * an account, and whether a company acted as a partner is a fact about a particular deal.
 *
 * There is no owner picker either. Whoever creates an account owns it — that is the answer in almost
 * every case, a rep is not permitted to choose anyone else anyway, and an administrator can hand it
 * over from the account itself afterwards.
 *
 * Duplicate detection lives in `AccountNameField`, which searches every account in the company rather
 * than the local snapshot. That distinction is the point: the account someone is about to duplicate is
 * usually one they have never opened.
 */
export function CreateAccountForm({ onDone }: { onDone: () => void }) {
  const { createAccount } = useStore()
  const { select } = useSelection()

  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [saving, setSaving] = useState(false)

  // Reported by the name field from the server's answer, not computed from `snapshot.accounts`: a
  // local check only sees loaded accounts and only catches an exact repeat, which is the one spelling
  // nobody types.
  const [blocked, setBlocked] = useState(false)

  const trimmed = name.trim()
  const canSave = trimmed.length > 0 && !blocked && !saving

  const handleBlockingChange = useCallback((next: boolean) => setBlocked(next), [])

  async function submit() {
    if (!canSave) return
    setSaving(true)
    try {
      // No `ownerId`: the API assigns the caller.
      const created = await createAccount({ name: trimmed, industry: industry.trim() })
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
      <AccountNameField
        value={name}
        onChange={setName}
        disabled={saving}
        onBlockingChange={handleBlockingChange}
        onPickExisting={(match) => {
          // Straight to the account that already exists. Refusing the name without offering a way to
          // reach the record it clashes with leaves somebody stuck with a form they cannot submit.
          onDone()
          select({ type: 'account', id: match.id })
        }}
      />

      <Field label="Industry">
        <TextInput
          value={industry}
          disabled={saving}
          onChange={(e) => setIndustry(e.target.value)}
          placeholder="Banking"
        />
      </Field>

      {/* Stated rather than asked. The rule is short enough to say outright, and saying it is what
          stops "who owns this?" being a question somebody has to go and find the answer to. */}
      <p className="text-caption text-slate-gray">
        You will own this account. An administrator can hand it to someone else later.
      </p>

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
