import { useState } from 'react'
import { useStore } from '@/data/store'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/Field'

/** Matches the API's `min_length=8`; anything shorter is rejected with a 422. */
const MIN_PASSWORD = 8

/** Initials are capped at 4 characters in the schema and shown in a 24px avatar. */
function suggestInitials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Adds a person to the team. Admin only — the API returns 403 for anyone else.
 *
 * The password is set here rather than emailed, because there is no mail service in this
 * system yet. That means an administrator has to pass it on out of band, and the new user
 * should change it; the change-password endpoint already exists. An invite flow is the
 * right answer once there is somewhere to send mail.
 */
export function CreateUserForm({ onDone }: { onDone: () => void }) {
  const { createUser } = useStore()

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [initials, setInitials] = useState('')
  const [jobTitle, setJobTitle] = useState('Enterprise AE')
  const [role, setRole] = useState<'admin' | 'rep'>('rep')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  // Auto-filled from the name, but editable — plenty of people go by something else.
  const effectiveInitials = initials || suggestInitials(fullName)

  const canSave =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    effectiveInitials.length > 0 &&
    password.length >= MIN_PASSWORD &&
    !saving

  async function submit() {
    if (!canSave) return
    setSaving(true)
    try {
      const created = await createUser({
        email: email.trim(),
        fullName: fullName.trim(),
        initials: effectiveInitials.slice(0, 4).toUpperCase(),
        jobTitle: jobTitle.trim(),
        role,
        password,
      })
      if (created) onDone()
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
      <Field label="Full name">
        <TextInput
          autoFocus
          value={fullName}
          disabled={saving}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Jordan Okafor"
        />
      </Field>

      <div className="grid grid-cols-[1fr_96px] gap-16">
        <Field label="Email" hint="Used to sign in.">
          <TextInput
            type="email"
            value={email}
            disabled={saving}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jordan.okafor@aidenai.com"
          />
        </Field>

        <Field label="Initials">
          <TextInput
            maxLength={4}
            value={effectiveInitials}
            disabled={saving}
            onChange={(e) => setInitials(e.target.value.toUpperCase())}
          />
        </Field>
      </div>

      <Field label="Job title">
        <TextInput
          value={jobTitle}
          disabled={saving}
          onChange={(e) => setJobTitle(e.target.value)}
          placeholder="Enterprise AE"
        />
      </Field>

      <Field
        label="Role"
        hint={
          role === 'admin'
            ? 'Administrators see every rep’s deals, edit pipelines, and create accounts and users.'
            : 'Reps see and move only the deals they own.'
        }
      >
        <Select
          value={role}
          disabled={saving}
          onChange={(e) => setRole(e.target.value as 'admin' | 'rep')}
        >
          <option value="rep">Sales rep</option>
          <option value="admin">Administrator</option>
        </Select>
      </Field>

      <Field
        label="Temporary password"
        hint={`At least ${MIN_PASSWORD} characters. Share it with them directly and ask them to change it.`}
      >
        <TextInput
          type="password"
          autoComplete="new-password"
          value={password}
          disabled={saving}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>

      {role === 'admin' && (
        <p className="rounded-lg bg-badge-fill px-16 py-8 text-caption text-deep-cobalt">
          Administrators can see and change every record in the system, including other
          people’s deals. Only grant this deliberately.
        </p>
      )}

      <div className="flex items-center gap-8 pt-8">
        <Button type="submit" loading={saving} disabled={!canSave}>
          {saving ? 'Creating' : 'Create user'}
        </Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
