import { useMemo, useState } from 'react'
import type { DealContact, DealRole, Id } from '@/types/domain'
import { useStore } from '@/data/store'
import { useCreation } from '@/app/creation'
import { useSelection } from '@/app/selection'
import { useDealPeople } from '@/hooks/useDealPeople'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { LoadingPanel } from '@/components/ui/Spinner'
import { ContactLinks, RoleChip, SideBadge } from '@/components/ui/ContactBits'

/**
 * Who is involved on this deal, and which roles it is still looking to fill.
 *
 * The panel is organised around **role slots**, not around people, because that is the shape of the work:
 * a deal declares the roles it needs, people arrive from the directory, and the mapping between them
 * fills in as things progress. Two states drive the design and neither existed in the previous version:
 *
 *   an unfilled role     the deal tracks it, nobody found yet — an open question, shown as one
 *   an unmapped person   attached before anyone worked out what they are — shown at the bottom
 *
 * A list built from the contacts alone could show neither, which is why `deal_roles` is its own table.
 *
 * The champion is the one role the application enforces, so it reports its own readiness here: a stage
 * further on will refuse this deal without a champion who has an email, a phone number and a LinkedIn
 * profile. Saying which of those is missing *here* is the difference between a fixable gap and a stage
 * move that fails for no visible reason.
 */
export function DealPeoplePanel({
  dealId,
  accountId,
  accountName,
  canEdit,
}: {
  dealId: Id
  accountId: Id
  accountName: string
  canEdit: boolean
}) {
  const { snapshot } = useStore()
  const { openCreate } = useCreation()
  const { select } = useSelection()
  const { people, ...deals } = useDealPeople(dealId)

  const [addingRole, setAddingRole] = useState(false)
  const [addingContact, setAddingContact] = useState(false)

  const allRoles = useMemo(
    () => [...snapshot.contactRoles].sort((a, b) => a.position - b.position),
    [snapshot.contactRoles],
  )

  // Roles this deal does not already track — the only ones worth offering.
  const untracked = useMemo(() => {
    const tracked = new Set(people.roles.map((slot) => slot.roleId))
    return allRoles.filter((role) => !tracked.has(role.id))
  }, [allRoles, people.roles])

  const byRole = useMemo(() => {
    const map = new Map<Id, DealContact[]>()
    for (const entry of people.contacts) {
      if (!entry.roleId) continue
      const existing = map.get(entry.roleId)
      if (existing) existing.push(entry)
      else map.set(entry.roleId, [entry])
    }
    return map
  }, [people.contacts])

  const unmapped = people.contacts.filter((entry) => !entry.roleId)

  const championSlot = people.roles.find((slot) => slot.roleKey === 'champion')
  const champions = championSlot ? (byRole.get(championSlot.roleId) ?? []) : []
  const readyChampion = champions.find((entry) => entry.missingDetails.length === 0)

  const nothingYet = people.roles.length === 0 && people.contacts.length === 0

  return (
    <Card>
      <div className="mb-16 flex flex-wrap items-baseline justify-between gap-8">
        <h2 className="text-body-lg font-semibold text-ink-navy">People</h2>
        {canEdit && !nothingYet && (
          <div className="flex items-center gap-8">
            <Button size="sm" variant="ghost" onClick={() => setAddingContact((v) => !v)}>
              Add someone
            </Button>
            {untracked.length > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setAddingRole((v) => !v)}>
                Add a role
              </Button>
            )}
          </div>
        )}
      </div>

      <p className="mb-16 text-caption text-slate-gray">
        Client{' '}
        <button
          type="button"
          onClick={() => select({ type: 'account', id: accountId })}
          className="font-semibold text-signal-blue hover:underline"
        >
          {accountName}
        </button>
        {/* No Partner line. A deal has no partner field — anybody on the partner side appears below as a
            person, with their own company named on their row, which is more use than a company alone. */}
      </p>

      <ErrorBanner message={deals.error} onDismiss={deals.clearError} />

      {championSlot && champions.length === 0 && (
        <Callout tone="quiet" title="No champion identified yet">
          This deal tracks a Champion but nobody fills it. A stage marked as requiring one will not
          accept the deal until somebody does.
        </Callout>
      )}

      {championSlot && champions.length > 0 && !readyChampion && (
        <Callout tone="risk" title="Champion is not reachable yet">
          {champions.length === 1
            ? `${champions[0].fullName} has no ${champions[0].missingDetails.join(', ')} on record.`
            : 'None of the named champions has all three of email, phone and LinkedIn.'}{' '}
          Advancing this deal will be refused until that is filled in.
        </Callout>
      )}

      {deals.loading && nothingYet ? (
        <LoadingPanel message="Loading this deal's people" />
      ) : nothingYet ? (
        <div className="rounded-xl border border-dashed border-hairline bg-cloud px-16 py-24 text-center">
          <p className="text-body-sm font-semibold text-ink-navy">Nobody attached</p>
          <p className="mx-auto mt-[2px] max-w-[300px] text-caption text-slate-gray">
            Add the roles this deal needs and the people you are dealing with. You can attach somebody
            before you know what they are.
          </p>
          {canEdit && (
            <div className="mt-16 flex items-center justify-center gap-8">
              <Button size="sm" variant="outline" onClick={() => setAddingContact(true)}>
                Add someone
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingRole(true)}>
                Add a role
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-16">
          {people.roles.map((slot) => (
            <RoleSlot
              key={slot.id}
              slot={slot}
              entries={byRole.get(slot.roleId) ?? []}
              roles={allRoles}
              canEdit={canEdit}
              saving={deals.saving}
              onOpenContact={(contactId) => select({ type: 'contact', id: contactId })}
              onRemap={deals.remapContact}
              onDetach={deals.removeContact}
              onStopTracking={() => void deals.removeRole(slot.id)}
            />
          ))}

          {unmapped.length > 0 && (
            <section>
              <div className="mb-8 flex items-center gap-8">
                <span className="rounded-md border border-dashed border-mist-gray px-8 py-[2px] text-caption font-semibold text-slate-gray">
                  No role yet
                </span>
                <span className="text-caption text-slate-gray">{unmapped.length}</span>
              </div>
              <ul className="space-y-[4px]">
                {unmapped.map((entry) => (
                  <li key={entry.id}>
                    <PersonRow
                      entry={entry}
                      roles={allRoles}
                      canEdit={canEdit}
                      saving={deals.saving}
                      onOpen={() => select({ type: 'contact', id: entry.contactId })}
                      onRemap={(roleId) => void deals.remapContact(entry.id, roleId)}
                      onDetach={() => void deals.removeContact(entry.id)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {canEdit && addingRole && untracked.length > 0 && (
        <div className="mt-16 rounded-xl border border-hairline bg-cloud p-16">
          <p className="mb-8 text-caption font-semibold text-slate-gray">Track another role</p>
          <div className="flex flex-wrap gap-[4px]">
            {untracked.map((role) => (
              <button
                key={role.id}
                type="button"
                disabled={deals.saving}
                onClick={async () => {
                  if (await deals.addRole(role.id)) setAddingRole(false)
                }}
                className="rounded-lg border border-hairline bg-paper px-12 py-8 text-caption font-semibold text-ink-navy transition-colors hover:border-signal-blue hover:bg-cloud"
              >
                {role.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {canEdit && addingContact && (
        <AddPerson
          roles={allRoles}
          existing={people.contacts}
          saving={deals.saving}
          onCancel={() => setAddingContact(false)}
          onAdd={async (contactId, roleId) => {
            if (await deals.addContact(contactId, roleId)) setAddingContact(false)
          }}
          onCreateContact={() => openCreate({ kind: 'contact', accountId })}
        />
      )}
    </Card>
  )
}

function Callout({
  tone,
  title,
  children,
}: {
  tone: 'quiet' | 'risk'
  title: string
  children: React.ReactNode
}) {
  return (
    <div
      className={
        tone === 'risk'
          ? 'mb-16 rounded-xl border border-risk bg-risk-fill px-16 py-12'
          : 'mb-16 rounded-xl border border-dashed border-hairline bg-cloud px-16 py-12'
      }
    >
      <p className="text-body-sm font-semibold text-ink-navy">{title}</p>
      <p className="mt-[2px] text-caption text-slate-gray">{children}</p>
    </div>
  )
}

/**
 * One tracked role and whoever fills it.
 *
 * An empty slot renders as a prompt rather than as nothing. That is the whole point of tracking roles
 * separately: "we need an executive sponsor and have not found one" is information, and a list built
 * from the people present could never show it.
 */
function RoleSlot({
  slot,
  entries,
  roles,
  canEdit,
  saving,
  onOpenContact,
  onRemap,
  onDetach,
  onStopTracking,
}: {
  slot: DealRole
  entries: DealContact[]
  roles: Array<{ id: Id; name: string; position: number }>
  canEdit: boolean
  saving: boolean
  onOpenContact: (contactId: Id) => void
  onRemap: (linkId: Id, roleId: Id | null) => Promise<boolean>
  onDetach: (linkId: Id) => Promise<boolean>
  onStopTracking: () => void
}) {
  return (
    <section>
      <div className="mb-8 flex items-center gap-8">
        <RoleChip roleKey={slot.roleKey} roleName={slot.roleName} />
        {entries.length > 1 && <span className="text-caption text-slate-gray">{entries.length}</span>}
        {canEdit && (
          <button
            type="button"
            disabled={saving}
            onClick={onStopTracking}
            aria-label={`Stop tracking ${slot.roleName} on this deal`}
            className="ml-auto rounded-md px-8 py-[2px] text-caption text-slate-gray transition-colors hover:bg-pebble hover:text-risk"
          >
            Stop tracking
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="rounded-lg border border-dashed border-hairline px-12 py-8 text-caption text-slate-gray">
          Nobody in this role yet.
        </p>
      ) : (
        <ul className="space-y-[4px]">
          {entries.map((entry) => (
            <li key={entry.id}>
              <PersonRow
                entry={entry}
                roles={roles}
                canEdit={canEdit}
                saving={saving}
                onOpen={() => onOpenContact(entry.contactId)}
                onRemap={(roleId) => void onRemap(entry.id, roleId)}
                onDetach={() => void onDetach(entry.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function PersonRow({
  entry,
  roles,
  canEdit,
  saving,
  onOpen,
  onRemap,
  onDetach,
}: {
  entry: DealContact
  roles: Array<{ id: Id; name: string }>
  canEdit: boolean
  saving: boolean
  onOpen: () => void
  onRemap: (roleId: Id | null) => void
  onDetach: () => void
}) {
  return (
    <div className="rounded-lg border border-hairline px-12 py-8 transition-colors hover:border-mist-gray">
      <div className="flex items-start gap-8">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-8">
            <span className="truncate text-body-sm font-semibold text-ink-navy">
              {entry.fullName}
            </span>
            <SideBadge type={entry.contactType} />
          </span>
          <span className="mt-[2px] block truncate text-caption text-slate-gray">
            {/* Their own company, always. With no partner field on the deal, this row is the only place
                that says which organisation somebody belongs to. */}
            {[entry.designation, entry.accountName].filter(Boolean).join(' · ')}
          </span>
          {entry.missingDetails.length > 0 && (
            <span className="mt-[2px] block text-caption text-risk">
              No {entry.missingDetails.join(', ')}
            </span>
          )}
        </button>

        {canEdit && (
          <div className="flex shrink-0 items-center gap-[2px]">
            {/* Remapping is a select rather than a menu because it is the operation this panel exists
                for — roles get corrected as a deal progresses, and burying it a click deep would make
                the common case the slow one. The blank option unmaps without detaching. */}
            <Select
              value={entry.roleId ?? ''}
              disabled={saving}
              aria-label={`Role for ${entry.fullName}`}
              onChange={(e) => onRemap(e.target.value || null)}
              // Suffix `!`, which is Tailwind v4's important modifier. Needed because `cn` is a plain
              // join with no tailwind-merge: without it, `Select`'s own height and text size would both
              // remain on the element and stylesheet order would pick the winner.
              className="h-24! py-0! text-caption!"
            >
              <option value="">No role</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
            <button
              type="button"
              disabled={saving}
              onClick={onDetach}
              aria-label={`Remove ${entry.fullName} from this deal`}
              className="rounded-md px-8 py-[2px] text-caption font-semibold text-slate-gray transition-colors hover:bg-pebble hover:text-risk"
            >
              Remove
            </button>
          </div>
        )}
      </div>

      <div className="mt-[2px]">
        <ContactLinks
          email={entry.email}
          phone={entry.phone}
          linkedinUrl={entry.linkedinUrl}
        />
      </div>
    </div>
  )
}

/**
 * Attaching somebody from the directory.
 *
 * Every contact is offered, not just those at the customer. There is no partner column any more, so the
 * old "customer or partner only" rule had nothing to check against — and a partner-side person works at
 * a third company by definition. Their company shows on every option so a mistake is visible.
 */
function AddPerson({
  roles,
  existing,
  saving,
  onCancel,
  onAdd,
  onCreateContact,
}: {
  roles: Array<{ id: Id; name: string }>
  existing: DealContact[]
  saving: boolean
  onCancel: () => void
  onAdd: (contactId: Id, roleId: Id | null) => void
  onCreateContact: () => void
}) {
  const { snapshot } = useStore()
  const [contactId, setContactId] = useState('')
  const [roleId, setRoleId] = useState('')

  const available = useMemo(
    () => [...snapshot.contacts].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [snapshot.contacts],
  )

  const duplicate = existing.some(
    (entry) => entry.contactId === contactId && (entry.roleId ?? '') === roleId,
  )
  const canAdd = contactId !== '' && !duplicate && !saving

  if (available.length === 0) {
    return (
      <div className="mt-16 rounded-xl border border-hairline bg-cloud px-16 py-12">
        <p className="text-caption text-slate-gray">Nobody is filed in the directory yet.</p>
        <div className="mt-8 flex items-center gap-8">
          <Button size="sm" variant="outline" onClick={onCreateContact}>
            New contact
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-16 space-y-8 rounded-xl border border-hairline bg-cloud p-16">
      <Select
        value={contactId}
        disabled={saving}
        onChange={(e) => setContactId(e.target.value)}
        aria-label="Person"
      >
        <option value="">Choose someone…</option>
        {available.map((contact) => (
          <option key={contact.id} value={contact.id}>
            {contact.fullName} — {contact.accountName}
            {contact.designation ? ` · ${contact.designation}` : ''}
          </option>
        ))}
      </Select>

      <Select
        value={roleId}
        disabled={saving}
        onChange={(e) => setRoleId(e.target.value)}
        aria-label="Role"
      >
        {/* Default. Attaching somebody before you know what they are is the normal opening move, and
            forcing a role here would make people guess one. */}
        <option value="">No role yet</option>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {role.name}
          </option>
        ))}
      </Select>

      {duplicate && (
        <p className="text-caption text-slate-gray">
          They are already on this deal like that.
        </p>
      )}

      <div className="flex items-center gap-8">
        <Button
          size="sm"
          loading={saving}
          disabled={!canAdd}
          onClick={() => onAdd(contactId, roleId || null)}
        >
          Add
        </Button>
        <Button size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
