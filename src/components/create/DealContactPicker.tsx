import { useMemo, useState } from 'react'
import type { DealContactAssignment, Id } from '@/types/domain'
import { useStore } from '@/data/store'
import { useCreation } from '@/app/creation'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Field'
import { ContactSearchSelect } from './ContactSearchSelect'
import { RoleChip, SideBadge } from '@/components/ui/ContactBits'

/**
 * The two halves of "who is on this deal", set at creation.
 *
 * **Roles** are the questions the deal needs answered — a champion, an exec sponsor, whoever else
 * matters here. They are chosen now and can sit unanswered: tracking a role nobody fills yet is the
 * point, because it turns "we never found an exec sponsor" from something remembered into something
 * shown.
 *
 * **People** come from the directory, and a role for each is optional. Attaching somebody before you
 * know what they are is the ordinary opening move, and forcing a role here would only make people guess
 * one — a guessed champion is worse than an unmapped contact, because a stage gate will believe it.
 *
 * Every contact is offered, from any company. There is no partner field on a deal any more, so the old
 * "customer or partner only" rule had nothing left to check against — and a partner-side person works at
 * a third company by definition. Each option names its company so a wrong pick is visible.
 */
export function DealContactPicker({
  accountId,
  contacts,
  onContactsChange,
  roleIds,
  onRolesChange,
  disabled,
}: {
  accountId: Id
  contacts: DealContactAssignment[]
  onContactsChange: (next: DealContactAssignment[]) => void
  roleIds: Id[]
  onRolesChange: (next: Id[]) => void
  disabled?: boolean
}) {
  const { snapshot } = useStore()
  const { openCreate } = useCreation()

  const allRoles = useMemo(
    () => [...snapshot.contactRoles].sort((a, b) => a.position - b.position),
    [snapshot.contactRoles],
  )

  const available = useMemo(
    () => [...snapshot.contacts].sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [snapshot.contacts],
  )

  const contactById = useMemo(() => new Map(available.map((c) => [c.id, c])), [available])
  const roleById = useMemo(() => new Map(allRoles.map((r) => [r.id, r])), [allRoles])

  const [pickedContact, setPickedContact] = useState('')
  const [pickedRole, setPickedRole] = useState('')

  const alreadyAdded = contacts.some(
    (entry) => entry.contactId === pickedContact && (entry.roleId ?? '') === pickedRole,
  )
  const canAdd = pickedContact !== '' && !alreadyAdded && !disabled

  function addPerson() {
    if (!canAdd) return
    onContactsChange([...contacts, { contactId: pickedContact, roleId: pickedRole || null }])
    // The role named here is tracked too, so the deal never shows somebody under a heading missing from
    // its own list of roles. The server does the same on its side.
    if (pickedRole && !roleIds.includes(pickedRole)) onRolesChange([...roleIds, pickedRole])
    setPickedContact('')
  }

  function toggleRole(roleId: Id) {
    if (roleIds.includes(roleId)) {
      onRolesChange(roleIds.filter((id) => id !== roleId))
      // Anybody mapped to it becomes unmapped rather than being dropped: untracking a role should not
      // quietly remove a person somebody deliberately attached.
      onContactsChange(
        contacts.map((entry) => (entry.roleId === roleId ? { ...entry, roleId: null } : entry)),
      )
    } else {
      onRolesChange([...roleIds, roleId])
    }
  }

  return (
    <section className="space-y-16 rounded-2xl border border-hairline bg-cloud p-16">
      {/* Roles first. They are the frame — what this deal needs to know — and the people fill it in. */}
      <div>
        <div className="flex flex-wrap items-baseline justify-between gap-8">
          <h3 className="text-body-sm font-semibold text-ink-navy">Roles to track</h3>
          <span className="text-caption text-slate-gray">
            {roleIds.length === 0 ? 'Optional' : `${roleIds.length} selected`}
          </span>
        </div>
        <p className="mt-[2px] text-caption text-slate-gray">
          A role can be tracked with nobody in it — that is how an unanswered question stays visible.
        </p>

        <div className="mt-8 flex flex-wrap gap-[4px]">
          {allRoles.map((role) => {
            const on = roleIds.includes(role.id)
            return (
              <button
                key={role.id}
                type="button"
                disabled={disabled}
                aria-pressed={on}
                onClick={() => toggleRole(role.id)}
                className={
                  on
                    ? 'rounded-lg border border-signal-blue bg-badge-fill px-12 py-8 text-caption font-semibold text-signal-blue'
                    : 'rounded-lg border border-hairline bg-paper px-12 py-8 text-caption font-semibold text-slate-gray transition-colors hover:border-mist-gray hover:text-ink-navy'
                }
              >
                {role.name}
              </button>
            )
          })}
        </div>
      </div>

      <div className="border-t border-hairline pt-16">
        <div className="flex flex-wrap items-baseline justify-between gap-8">
          <h3 className="text-body-sm font-semibold text-ink-navy">People on the deal</h3>
          <span className="text-caption text-slate-gray">
            {contacts.length === 0 ? 'At least one is required' : `${contacts.length} added`}
          </span>
        </div>

        {available.length === 0 ? (
          <div className="mt-8 rounded-lg border border-dashed border-hairline bg-paper px-16 py-24 text-center">
            <p className="text-body-sm font-semibold text-ink-navy">
              Nobody is filed in the directory yet
            </p>
            <p className="mx-auto mt-[2px] max-w-[380px] text-caption text-slate-gray">
              A deal needs at least one person. Add the contact you are dealing with, then come back —
              this form keeps what you have typed.
            </p>
            <div className="mt-16">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => openCreate({ kind: 'contact', accountId })}
              >
                New contact
              </Button>
            </div>
          </div>
        ) : (
          <>
            {contacts.length > 0 && (
              <ul className="mt-8 space-y-[4px]">
                {contacts.map((entry, index) => {
                  const contact = contactById.get(entry.contactId)
                  const role = entry.roleId ? roleById.get(entry.roleId) : null
                  if (!contact) return null
                  return (
                    <li
                      key={`${entry.contactId}:${entry.roleId ?? 'none'}`}
                      className="flex items-center gap-8 rounded-lg border border-hairline bg-paper px-12 py-8"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-8">
                          <span className="truncate text-caption font-semibold text-ink-navy">
                            {contact.fullName}
                          </span>
                          <SideBadge type={contact.contactType} />
                        </span>
                        <span className="mt-[2px] block truncate text-caption text-slate-gray">
                          {[contact.designation, contact.accountName].filter(Boolean).join(' · ')}
                        </span>
                      </span>

                      {role ? (
                        <RoleChip roleKey={role.key} roleName={role.name} />
                      ) : (
                        <span className="shrink-0 rounded-md border border-dashed border-mist-gray px-8 py-[2px] text-caption text-slate-gray">
                          No role yet
                        </span>
                      )}

                      <button
                        type="button"
                        disabled={disabled}
                        onClick={() => onContactsChange(contacts.filter((_, i) => i !== index))}
                        aria-label={`Remove ${contact.fullName}`}
                        className="shrink-0 rounded-md px-8 py-[2px] text-caption font-semibold text-slate-gray transition-colors hover:bg-pebble hover:text-risk"
                      >
                        Remove
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="mt-8 flex flex-wrap items-end gap-8">
              <label className="min-w-[240px] flex-1">
                <span className="mb-[4px] block text-caption font-semibold text-slate-gray">
                  Person
                </span>
                <ContactSearchSelect
                  contacts={available}
                  value={pickedContact || null}
                  onChange={(id) => setPickedContact(id ?? '')}
                  disabled={disabled}
                  // Labelled, not blocked: the same person can hold two roles here.
                  alreadyOn={new Set(contacts.map((entry) => entry.contactId))}
                  emptyAction={{
                    label: 'File a new contact instead',
                    onSelect: () => openCreate({ kind: 'contact', accountId }),
                  }}
                />
              </label>

              <label className="min-w-[150px]">
                <span className="mb-[4px] block text-caption font-semibold text-slate-gray">
                  Role
                </span>
                <Select
                  value={pickedRole}
                  disabled={disabled}
                  onChange={(e) => setPickedRole(e.target.value)}
                >
                  <option value="">No role yet</option>
                  {allRoles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name}
                    </option>
                  ))}
                </Select>
              </label>

              <Button type="button" size="sm" variant="outline" disabled={!canAdd} onClick={addPerson}>
                Add
              </Button>
            </div>

            {alreadyAdded && pickedContact !== '' && (
              <p className="mt-8 text-caption text-slate-gray">
                {contactById.get(pickedContact)?.fullName} is already on the deal like that. Pick a
                different role to add them twice.
              </p>
            )}
          </>
        )}
      </div>
    </section>
  )
}
