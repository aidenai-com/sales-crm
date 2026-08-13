import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Id } from '@/types/domain'
import {
  teamApi,
  type OwnershipSummary,
  type TeamMember,
  type UserPatch,
} from '@/api/endpoints'
import { errorMessage } from '@/api/client'
import { useAuth } from '@/app/auth'
import { useToast } from '@/app/toast'
import { useStore } from '@/data/store'
import { cn } from '@/lib/cn'
import { compactMoney } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState, SectionHeader } from '@/components/ui/Card'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'

const MIN_PASSWORD = 8
const MAX_PASSWORD = 72

/** Initials are capped at 4 in the schema and shown in a 32px avatar. */
function suggestInitials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * Managing the people in the workspace. Administrators only.
 *
 * The list is fetched here rather than read from the snapshot. The snapshot's `Person` is deliberately
 * narrow — a name and initials, which is all an owner dropdown needs — and email, permission level and
 * active state are administration. Widening `Person` would make every screen in the app carry a
 * colleague's email address around to render a two-letter avatar.
 *
 * There is no delete. A user owns accounts, deals and logged activity, so removing the row would either
 * destroy that history or leave it pointing at nothing. Deactivating is the real operation: they cannot
 * sign in, their session dies at the next token refresh, and what they did stays legible.
 *
 * Passwords are set here rather than emailed, because this system has no mail service for invitations
 * yet. That is a real limitation and the form says so instead of pretending otherwise: an administrator
 * has to pass the password on out of band, and the person should change it on their profile.
 */
export function Team() {
  const { user, isAdmin } = useAuth()
  const { show } = useToast()
  // Names and titles shown on owner dropdowns and deal cards come from the snapshot, so a rename here
  // has to be pushed back into it — otherwise the deal you open next still shows the old name.
  const { refresh } = useStore()

  const [members, setMembers] = useState<TeamMember[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Id | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      setMembers(await teamApi.list())
      setLoadError(null)
    } catch (caught) {
      setLoadError(errorMessage(caught))
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const { active, inactive } = useMemo(() => {
    const rows = [...(members ?? [])].sort((a, b) => a.name.localeCompare(b.name))
    return {
      active: rows.filter((row) => row.isActive),
      inactive: rows.filter((row) => !row.isActive),
    }
  }, [members])

  function replace(updated: TeamMember) {
    setMembers((current) =>
      (current ?? []).map((row) => (row.id === updated.id ? updated : row)),
    )
    void refresh()
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-page px-24 py-96">
        <EmptyState
          title="Administrators only"
          hint="Managing people is restricted. Your own account is on your profile."
        />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-page px-24 pb-96">
      <div className="py-32">
        <h1 className="text-heading-sm font-bold text-ink-navy">Team</h1>
        <p className="mt-8 text-body text-slate-gray">
          Everyone who can sign in, what they may do, and who is still active.
        </p>
      </div>

      <Card>
        <SectionHeader
          title={members === null ? 'People' : `${active.length} active`}
          subtitle="A person's name and title appear as the owner on every account and deal they hold."
          action={
            !creating && (
              <Button size="sm" onClick={() => setCreating(true)}>
                Add someone
              </Button>
            )
          }
        />

        {creating && (
          <div className="mb-24">
            <CreateRow
              onCancel={() => setCreating(false)}
              onCreated={(created) => {
                setMembers((current) => [...(current ?? []), created])
                setCreating(false)
                void refresh()
                show({
                  title: `${created.name} added`,
                  detail: 'Pass the password on to them — there is no invitation email yet.',
                })
              }}
            />
          </div>
        )}

        {loadError && (
          <div className="mb-16 rounded-lg border border-risk bg-risk-fill px-16 py-8 text-body-sm text-ink-navy">
            {loadError}
          </div>
        )}

        {members === null ? (
          <div className="space-y-8">
            {[0, 1, 2].map((row) => (
              <Skeleton key={row} className="h-56" />
            ))}
          </div>
        ) : (
          <ul className="space-y-8">
            {active.map((member) =>
              editing === member.id ? (
                <li key={member.id}>
                  <EditRow
                    member={member}
                    isSelf={member.id === user?.id}
                    successors={active.filter((row) => row.id !== member.id)}
                    onCancel={() => setEditing(null)}
                    onSaved={(updated) => {
                      replace(updated)
                      setEditing(null)
                      show({ title: `${updated.name} updated`, tone: 'success' })
                    }}
                  />
                </li>
              ) : (
                <li key={member.id}>
                  <MemberRow
                    member={member}
                    isSelf={member.id === user?.id}
                    onEdit={() => setEditing(member.id)}
                  />
                </li>
              ),
            )}
          </ul>
        )}

        {inactive.length > 0 && (
          <div className="mt-32 border-t border-hairline pt-24">
            <h3 className="text-body-sm font-semibold text-ink-navy">
              Deactivated · {inactive.length}
            </h3>
            <p className="mt-[2px] text-caption text-slate-gray">
              They cannot sign in and are no longer offered as an owner. What they own and logged stays
              where it is.
            </p>
            <ul className="mt-16 space-y-8">
              {inactive.map((member) =>
                editing === member.id ? (
                  <li key={member.id}>
                    <EditRow
                      member={member}
                      isSelf={member.id === user?.id}
                      successors={active.filter((row) => row.id !== member.id)}
                      onCancel={() => setEditing(null)}
                      onSaved={(updated) => {
                        replace(updated)
                        setEditing(null)
                        show({ title: `${updated.name} updated`, tone: 'success' })
                      }}
                    />
                  </li>
                ) : (
                  <li key={member.id}>
                    <MemberRow
                      member={member}
                      isSelf={member.id === user?.id}
                      onEdit={() => setEditing(member.id)}
                    />
                  </li>
                ),
              )}
            </ul>
          </div>
        )}
      </Card>
    </div>
  )
}

function MemberRow({
  member,
  isSelf,
  onEdit,
}: {
  member: TeamMember
  isSelf: boolean
  onEdit: () => void
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-16 rounded-2xl border border-hairline px-16 py-12',
        member.isActive ? 'bg-paper' : 'bg-cloud',
      )}
    >
      <span
        className={cn(
          'grid size-32 shrink-0 place-items-center rounded-full text-caption font-bold',
          member.isActive ? 'bg-ink-navy text-paper' : 'bg-mist-gray text-paper',
        )}
      >
        {member.initials}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-8">
          <span className="truncate text-body-sm font-semibold text-ink-navy">{member.name}</span>
          {member.role === 'admin' && (
            <span className="shrink-0 rounded-full bg-badge-fill px-8 py-[2px] text-caption font-semibold text-signal-blue">
              Administrator
            </span>
          )}
          {isSelf && <span className="shrink-0 text-caption text-slate-gray">You</span>}
        </span>
        <span className="mt-[2px] block truncate text-caption text-slate-gray">
          {[member.email, member.jobTitle].filter(Boolean).join(' · ')}
        </span>
      </span>

      <Button size="sm" variant="outline" onClick={onEdit}>
        Edit
      </Button>
    </div>
  )
}

/**
 * Editing one person, in place in the list.
 *
 * Only changed fields are sent. That is not an optimisation: the API treats an omitted field as
 * untouched, so two administrators editing different things about the same person do not overwrite each
 * other, and an empty password box is never mistaken for "set the password to nothing".
 */
/** How much work is at stake, in a phrase rather than a table. */
function describeBook(ownership: OwnershipSummary): string {
  const parts: string[] = []
  if (ownership.openDeals > 0) {
    parts.push(
      `${ownership.openDeals} open ${ownership.openDeals === 1 ? 'deal' : 'deals'}` +
        (ownership.openDealValue > 0 ? ` worth ${compactMoney(ownership.openDealValue)}` : ''),
    )
  }
  if (ownership.accounts > 0) {
    parts.push(`${ownership.accounts} ${ownership.accounts === 1 ? 'account' : 'accounts'}`)
  }
  return parts.join(' and ')
}

function EditRow({
  member,
  isSelf,
  successors,
  onCancel,
  onSaved,
}: {
  member: TeamMember
  isSelf: boolean
  /** Active colleagues who could take the book over. A deactivated person cannot inherit one. */
  successors: TeamMember[]
  onCancel: () => void
  onSaved: (updated: TeamMember) => void
}) {
  const [fullName, setFullName] = useState(member.name)
  const [email, setEmail] = useState(member.email)
  const [initials, setInitials] = useState(member.initials)
  const [jobTitle, setJobTitle] = useState(member.jobTitle)
  const [role, setRole] = useState(member.role)
  const [isActive, setIsActive] = useState(member.isActive)
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  //: Who inherits the book. Empty means "leave it with them", which is a real choice and not a default
  //: somebody fell into — the panel below says what it costs.
  const [reassignTo, setReassignTo] = useState('')
  const [ownership, setOwnership] = useState<OwnershipSummary | null>(null)

  const deactivating = member.isActive && !isActive

  // Asked only when it matters. Loading it for every row opened would be a request per edit to answer a
  // question most edits never ask.
  useEffect(() => {
    if (!deactivating || ownership) return
    let live = true
    teamApi
      .ownership(member.id)
      .then((found) => {
        if (live) setOwnership(found)
      })
      .catch(() => {
        // Non-fatal: the handover is still offered, just without the numbers behind it.
      })
    return () => {
      live = false
    }
  }, [deactivating, ownership, member.id])

  const patch: UserPatch = {}
  if (fullName.trim() !== member.name) patch.fullName = fullName.trim()
  if (email.trim() !== member.email) patch.email = email.trim()
  if (initials.trim().toUpperCase() !== member.initials) {
    patch.initials = initials.trim().toUpperCase()
  }
  if (jobTitle.trim() !== member.jobTitle) patch.jobTitle = jobTitle.trim()
  if (role !== member.role) patch.role = role
  if (isActive !== member.isActive) patch.isActive = isActive
  if (password.length > 0) patch.password = password
  // Only on the way out. Reassigning without deactivating is a separate operation, and folding it in
  // here would let an edit to somebody's job title quietly move their whole book.
  if (deactivating && reassignTo) patch.reassignTo = reassignTo

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD
  const passwordTooLong = password.length > MAX_PASSWORD

  const changed = Object.keys(patch).length > 0
  const valid =
    changed &&
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    initials.trim().length > 0 &&
    !passwordTooShort &&
    !passwordTooLong

  async function save() {
    if (!valid || saving) return
    setSaving(true)
    setError(null)
    try {
      onSaved(await teamApi.update(member.id, patch))
    } catch (caught) {
      // Kept in the row. The two refusals worth reading — an email already in use, and the two
      // self-lockout guards — are both corrections to make right here.
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="space-y-16 rounded-2xl border border-signal-blue bg-paper p-16"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <div className="grid gap-16 sm:grid-cols-2">
        <Field label="Full name">
          <TextInput
            autoFocus
            value={fullName}
            disabled={saving}
            onChange={(event) => setFullName(event.target.value)}
          />
        </Field>
        <Field label="Email">
          <TextInput
            type="email"
            value={email}
            disabled={saving}
            onChange={(event) => setEmail(event.target.value)}
          />
        </Field>
        <Field label="Job title">
          <TextInput
            value={jobTitle}
            disabled={saving}
            onChange={(event) => setJobTitle(event.target.value)}
            placeholder="Enterprise AE"
          />
        </Field>
        <Field label="Initials" hint="Shown on avatars. Up to four characters.">
          <TextInput
            value={initials}
            maxLength={4}
            disabled={saving}
            onChange={(event) => setInitials(event.target.value)}
          />
        </Field>
        <Field
          label="Permission"
          hint={
            isSelf
              ? 'You cannot remove your own administrator role.'
              : 'Administrators manage people, pipelines and ownership.'
          }
        >
          <Select
            value={role}
            disabled={saving || isSelf}
            onChange={(event) => setRole(event.target.value as TeamMember['role'])}
          >
            <option value="rep">Sales rep</option>
            <option value="admin">Administrator</option>
          </Select>
        </Field>
        <Field
          label="Access"
          hint={isSelf ? 'You cannot deactivate your own account.' : undefined}
        >
          <Select
            value={isActive ? 'active' : 'inactive'}
            disabled={saving || isSelf}
            onChange={(event) => setIsActive(event.target.value === 'active')}
          >
            <option value="active">Active</option>
            <option value="inactive">Deactivated</option>
          </Select>
        </Field>
      </div>

      {deactivating && (
        <div className="rounded-lg border border-signal-blue bg-badge-fill p-16">
          <p className="text-body-sm font-semibold text-ink-navy">
            {ownership === null
              ? `What happens to ${member.name}'s work`
              : ownership.openDeals === 0 && ownership.accounts === 0
                ? `${member.name} owns nothing that needs a new home`
                : `${member.name} owns ${describeBook(ownership)}`}
          </p>
          <p className="mt-[2px] text-caption text-slate-gray">
            Deals stay with their owner unless you move them, and a deal belonging to a deactivated person
            is visible only to administrators — while still counting in the forecast. Closed deals keep
            their owner either way, so who won what stays accurate.
          </p>

          {(ownership === null || ownership.openDeals > 0 || ownership.accounts > 0) && (
            <div className="mt-16">
              <Field label="Hand the book over to">
                <Select
                  value={reassignTo}
                  disabled={saving}
                  onChange={(event) => setReassignTo(event.target.value)}
                >
                  <option value="">Leave it assigned to them</option>
                  {successors.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
        </div>
      )}

      <div className="border-t border-hairline pt-16">
        <Field
          label="Reset password"
          hint={`Leave blank to keep it. At least ${MIN_PASSWORD} characters, and you will have to pass it on.`}
        >
          <TextInput
            type="password"
            autoComplete="new-password"
            value={password}
            disabled={saving}
            aria-invalid={passwordTooShort || passwordTooLong}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        {passwordTooShort && (
          <p className="mt-8 text-caption font-medium text-risk">
            {`${MIN_PASSWORD - password.length} more character${MIN_PASSWORD - password.length === 1 ? '' : 's'} needed.`}
          </p>
        )}
        {passwordTooLong && (
          <p className="mt-8 text-caption font-medium text-risk">
            {`Too long — ${MAX_PASSWORD} characters at most.`}
          </p>
        )}
      </div>

      <div aria-live="polite">
        {error && (
          <p className="rounded-lg border border-risk bg-risk-fill px-16 py-8 text-body-sm text-ink-navy">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center gap-8">
        <Button type="submit" size="sm" disabled={!valid || saving}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
        {!changed && <span className="text-caption text-slate-gray">Nothing changed yet.</span>}
      </div>
    </form>
  )
}

/** Adding a person. The password is set here because there is nowhere to send an invitation. */
function CreateRow({
  onCancel,
  onCreated,
}: {
  onCancel: () => void
  onCreated: (created: TeamMember) => void
}) {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [initials, setInitials] = useState('')
  const [jobTitle, setJobTitle] = useState('Enterprise AE')
  const [role, setRole] = useState<TeamMember['role']>('rep')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filled in from the name, and still editable — plenty of people go by something else.
  const effectiveInitials = initials || suggestInitials(fullName)
  const tooShort = password.length > 0 && password.length < MIN_PASSWORD

  const valid =
    fullName.trim().length > 0 &&
    email.trim().length > 0 &&
    effectiveInitials.length > 0 &&
    password.length >= MIN_PASSWORD &&
    password.length <= MAX_PASSWORD

  async function save() {
    if (!valid || saving) return
    setSaving(true)
    setError(null)
    try {
      onCreated(
        await teamApi.create({
          email: email.trim(),
          fullName: fullName.trim(),
          initials: effectiveInitials.slice(0, 4).toUpperCase(),
          jobTitle: jobTitle.trim(),
          role,
          password,
        }),
      )
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      className="space-y-16 rounded-2xl border border-signal-blue bg-cloud p-16"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <h3 className="text-body-sm font-semibold text-ink-navy">Add someone to the team</h3>

      <div className="grid gap-16 sm:grid-cols-2">
        <Field label="Full name">
          <TextInput
            autoFocus
            value={fullName}
            disabled={saving}
            onChange={(event) => setFullName(event.target.value)}
            placeholder="Priya Raghavan"
          />
        </Field>
        <Field label="Email" hint="This is how they sign in.">
          <TextInput
            type="email"
            value={email}
            disabled={saving}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="priya@example.com"
          />
        </Field>
        <Field label="Job title">
          <TextInput
            value={jobTitle}
            disabled={saving}
            onChange={(event) => setJobTitle(event.target.value)}
          />
        </Field>
        <Field label="Initials" hint="Filled in from the name.">
          <TextInput
            value={effectiveInitials}
            maxLength={4}
            disabled={saving}
            onChange={(event) => setInitials(event.target.value)}
          />
        </Field>
        <Field label="Permission">
          <Select
            value={role}
            disabled={saving}
            onChange={(event) => setRole(event.target.value as TeamMember['role'])}
          >
            <option value="rep">Sales rep</option>
            <option value="admin">Administrator</option>
          </Select>
        </Field>
        <Field
          label="Password"
          hint={`At least ${MIN_PASSWORD} characters. Pass it on to them.`}
        >
          <TextInput
            type="password"
            autoComplete="new-password"
            value={password}
            disabled={saving}
            aria-invalid={tooShort}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
      </div>

      {tooShort && (
        <p className="text-caption font-medium text-risk">
          {`${MIN_PASSWORD - password.length} more character${MIN_PASSWORD - password.length === 1 ? '' : 's'} needed.`}
        </p>
      )}

      <div aria-live="polite">
        {error && (
          <p className="rounded-lg border border-risk bg-risk-fill px-16 py-8 text-body-sm text-ink-navy">
            {error}
          </p>
        )}
      </div>

      <div className="flex items-center gap-8">
        <Button type="submit" size="sm" disabled={!valid || saving}>
          {saving ? 'Adding…' : 'Add to team'}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
