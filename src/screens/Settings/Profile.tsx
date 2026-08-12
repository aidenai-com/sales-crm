import { useState } from 'react'
import { authApi } from '@/api/endpoints'
import { errorMessage } from '@/api/client'
import { useAuth } from '@/app/auth'
import { useToast } from '@/app/toast'
import { Button } from '@/components/ui/Button'
import { Card, SectionHeader } from '@/components/ui/Card'
import { Field, FactRow, TextInput } from '@/components/ui/Field'

/** The API's own floor (`min_length=8`). Enforced here so the refusal is not a 422 nobody reads. */
const MIN_LENGTH = 8
/** bcrypt hashes at most 72 bytes; anything past that would be silently ignored, not stored. */
const MAX_LENGTH = 72

/**
 * Your own account: who you are, and changing your password.
 *
 * Name, email and role are read-only here. They are administration — an administrator sets them on the
 * Team screen — and a person renaming themselves would silently rename the owner shown on every account
 * and deal they hold.
 *
 * The password form validates on the client and again on the server, and the two checks are not
 * redundant. The client's job is to catch what it can *know* — too short, the two new entries not
 * matching, the new one identical to the current — so nobody submits a form only to be told what they
 * could have been told while typing. Only the server can check that the current password is right, and
 * it must: a valid session is not proof of knowing the password, so without that check a borrowed
 * laptop is enough to lock the owner out of their own account.
 */
export function Profile() {
  const { user, isAdmin } = useAuth()
  const { show } = useToast()

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Whether the user has left a field, so a half-typed password is not immediately called too short.
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  if (!user) return null

  const tooShort = next.length > 0 && next.length < MIN_LENGTH
  const tooLong = next.length > MAX_LENGTH
  const mismatch = confirm.length > 0 && confirm !== next
  const unchanged = next.length > 0 && next === current

  const valid =
    current.length > 0 &&
    next.length >= MIN_LENGTH &&
    next.length <= MAX_LENGTH &&
    confirm === next &&
    next !== current

  function reset() {
    setCurrent('')
    setNext('')
    setConfirm('')
    setTouched({})
  }

  async function submit() {
    if (!valid || saving) return
    setSaving(true)
    setError(null)
    try {
      await authApi.changePassword(current, next)
      // Cleared on success, always. Leaving a password sitting in three inputs behind a "Saved"
      // message is a password sitting on screen.
      reset()
      show({ title: 'Password changed', tone: 'success' })
    } catch (caught) {
      // Shown in the form rather than as a toast: the commonest failure is a wrong current password,
      // which is a correction to make in the field right above the message, not a notification.
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-page px-24 pb-96">
      <div className="py-32">
        <h1 className="text-heading-sm font-bold text-ink-navy">Your profile</h1>
        <p className="mt-8 text-body text-slate-gray">
          Who you are in this workspace, and your password.
        </p>
      </div>

      <div className="grid items-start gap-24 lg:grid-cols-[320px_1fr]">
        <Card>
          <div className="flex items-center gap-16">
            <span className="grid size-48 shrink-0 place-items-center rounded-full bg-ink-navy text-body-sm font-bold text-paper">
              {user.initials}
            </span>
            <div className="min-w-0">
              <p className="truncate text-body-lg font-semibold text-ink-navy">{user.name}</p>
              <p className="truncate text-caption text-slate-gray">{user.email}</p>
            </div>
          </div>

          <div className="mt-24">
            <FactRow label="Role">{isAdmin ? 'Administrator' : 'Sales rep'}</FactRow>
            <FactRow label="Job title">{user.jobTitle || '—'}</FactRow>
          </div>

          <p className="mt-16 text-caption text-slate-gray">
            {isAdmin
              ? 'Your name, email and title are edited on the Team screen.'
              : 'Ask an administrator to change your name, email or title.'}
          </p>
        </Card>

        <Card>
          <SectionHeader
            title="Change password"
            subtitle="Your current password is checked before the new one is set."
          />

          <form
            className="max-w-[420px] space-y-16"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <Field label="Current password">
              <TextInput
                type="password"
                autoComplete="current-password"
                value={current}
                disabled={saving}
                onChange={(event) => setCurrent(event.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, current: true }))}
              />
            </Field>

            <div className="border-t border-hairline pt-16">
              <Field
                label="New password"
                hint={`At least ${MIN_LENGTH} characters.`}
              >
                <TextInput
                  type="password"
                  autoComplete="new-password"
                  value={next}
                  disabled={saving}
                  aria-invalid={(touched.next && tooShort) || tooLong || unchanged}
                  onChange={(event) => setNext(event.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, next: true }))}
                />
              </Field>

              {touched.next && tooShort && (
                <Problem>{`${MIN_LENGTH - next.length} more character${MIN_LENGTH - next.length === 1 ? '' : 's'} needed.`}</Problem>
              )}
              {tooLong && <Problem>{`Too long — ${MAX_LENGTH} characters at most.`}</Problem>}
              {unchanged && <Problem>That is your current password.</Problem>}
            </div>

            <div>
              <Field label="Retype new password">
                <TextInput
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  disabled={saving}
                  aria-invalid={mismatch}
                  onChange={(event) => setConfirm(event.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
                />
              </Field>
              {mismatch && <Problem>The two entries do not match.</Problem>}
            </div>

            {/* aria-live: a server refusal arrives after the button is pressed, so nothing else would
                announce it. */}
            <div aria-live="polite">
              {error && (
                <p className="rounded-lg border border-risk bg-risk-fill px-16 py-8 text-body-sm text-ink-navy">
                  {error}
                </p>
              )}
            </div>

            <div className="flex items-center gap-8">
              <Button type="submit" disabled={!valid || saving}>
                {saving ? 'Changing…' : 'Change password'}
              </Button>
              {(current || next || confirm) && (
                <Button type="button" variant="ghost" disabled={saving} onClick={reset}>
                  Clear
                </Button>
              )}
            </div>
          </form>
        </Card>
      </div>
    </div>
  )
}

/** A field-level problem: stated plainly, in place, without an icon or an apology. */
function Problem({ children }: { children: string }) {
  return <p className="mt-8 text-caption font-medium text-risk">{children}</p>
}
