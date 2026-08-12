import { useMemo, useState } from 'react'
import type { Id } from '@/types/domain'
import { useStore } from '@/data/store'
import { useAuth } from '@/app/auth'
import { useSelection } from '@/app/selection'
import { routes, useRouter } from '@/app/router'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { ContactLinks, SideBadge } from '@/components/ui/ContactBits'

/**
 * One contact: how to reach them, and which deals they are on.
 *
 * Editable in place rather than behind a separate edit screen. The reason a contact is opened is
 * usually that something about them has changed — a new number, a promotion, a LinkedIn profile
 * somebody finally found — and a read-only panel with an Edit button makes the common case two clicks
 * longer than it needs to be.
 *
 * The company cannot be changed. Moving somebody between companies is not an edit: their designation
 * belongs to the old company and so does every deal they are attached to. That is a new contact.
 */
export function ContactDrawerBody({ contactId }: { contactId: Id }) {
  const { snapshot, updateContact, deleteContact, isPending } = useStore()
  const { isAdmin } = useAuth()
  const { select, clear } = useSelection()
  const { navigate } = useRouter()

  const contact = snapshot.contacts.find((c) => c.id === contactId)

  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Deals this person is on, resolved locally. The deal list is already loaded, and the alternative —
  // a fetch per drawer open — would show a spinner for data sitting in memory.
  //
  // Only deals the *viewer* can see appear here, which is why the count can be lower than the
  // `dealCount` the server reported: deals stay owner-scoped even though contacts are not.
  const deals = useMemo(
    () =>
      // Their company's own deals. A contact can also be attached to a deal at another company — a
      // partner-side person on the customer's deal — and those are not listed here, because the deal
      // list in the snapshot is owner-scoped and this panel cannot tell "not yours" from "not linked".
      // The count below reports the difference rather than hiding it.
      snapshot.deals.filter((deal) => deal.accountId === contact?.accountId),
    [snapshot.deals, contact?.accountId],
  )

  if (!contact) {
    return <p className="text-body-sm text-slate-gray">This contact is no longer available.</p>
  }

  const busy = isPending(`contact:${contact.id}`)
  const hidden = contact.dealCount - deals.length

  return (
    <div className="space-y-24">
      <div className="flex flex-wrap items-center gap-8">
        <SideBadge type={contact.contactType} />
        {contact.designation && (
          <span className="text-body-sm text-slate-gray">{contact.designation}</span>
        )}
        <button
          type="button"
          onClick={() => select({ type: 'account', id: contact.accountId })}
          className="text-body-sm font-semibold text-signal-blue hover:underline"
        >
          {contact.accountName}
        </button>
      </div>

      {contact.missingDetails.length > 0 && (
        <div className="rounded-2xl border border-risk bg-risk-fill p-16">
          <p className="text-body-sm font-semibold text-ink-navy">
            No {contact.missingDetails.join(', ')} on record
          </p>
          <p className="mt-[2px] text-caption text-slate-gray">
            A champion needs an email, a phone number and a LinkedIn profile. Until all three are
            here, this person cannot be the champion on a deal that is moving forward.
          </p>
        </div>
      )}

      {editing ? (
        <EditForm
          contact={contact}
          busy={busy}
          onCancel={() => setEditing(false)}
          onSave={async (patch) => {
            const saved = await updateContact(contact.id, patch)
            if (saved) setEditing(false)
          }}
        />
      ) : (
        <section className="space-y-12">
          <h3 className="text-caption font-semibold tracking-wide text-slate-gray uppercase">
            How to reach them
          </h3>

          <dl className="space-y-8">
            <DetailRow label="Email" value={contact.email} />
            <DetailRow label="Phone" value={contact.phone} />
            <DetailRow label="LinkedIn" value={contact.linkedinUrl} />
          </dl>

          <ContactLinks
            email={contact.email}
            phone={contact.phone}
            linkedinUrl={contact.linkedinUrl}
          />

          <div className="pt-8">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              Edit details
            </Button>
          </div>
        </section>
      )}

      <section className="space-y-12">
        <h3 className="text-caption font-semibold tracking-wide text-slate-gray uppercase">
          Deals at {contact.accountName}
        </h3>

        {deals.length === 0 ? (
          <p className="text-body-sm text-slate-gray">
            {contact.dealCount > 0
              ? 'This person is on deals you cannot see.'
              : 'No deals at this company yet.'}
          </p>
        ) : (
          <ul className="space-y-[4px]">
            {deals.map((deal) => (
              <li key={deal.id}>
                <button
                  type="button"
                  onClick={() => {
                    clear()
                    navigate(routes.deal(deal.id))
                  }}
                  className="w-full rounded-lg border border-hairline px-12 py-8 text-left text-body-sm text-ink-navy transition-colors hover:border-signal-blue hover:bg-cloud"
                >
                  {deal.name}
                </button>
              </li>
            ))}
          </ul>
        )}

        {hidden > 0 && deals.length > 0 && (
          <p className="text-caption text-slate-gray">
            {/* Stated rather than quietly omitted: a panel that shows two of five deals without saying
                so reads as a bug in the count. */}
            On {hidden} further {hidden === 1 ? 'deal' : 'deals'} you cannot see.
          </p>
        )}
      </section>

      {isAdmin && (
        <section className="border-t border-hairline pt-16">
          {confirmDelete ? (
            <div className="rounded-2xl border border-risk bg-risk-fill p-16">
              <p className="text-body-sm font-semibold text-ink-navy">
                Delete {contact.fullName}?
              </p>
              <p className="mt-[2px] text-caption text-slate-gray">
                They will be removed from every deal they are on, including as a champion. This
                cannot be undone.
              </p>
              <div className="mt-16 flex items-center gap-8">
                <Button
                  size="sm"
                  variant="danger"
                  loading={busy}
                  onClick={async () => {
                    if (await deleteContact(contact.id)) clear()
                  }}
                >
                  Delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
              Delete contact
            </Button>
          )}
        </section>
      )}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-12">
      <dt className="shrink-0 text-caption text-slate-gray">{label}</dt>
      <dd
        className={
          value
            ? 'min-w-0 truncate text-body-sm text-ink-navy'
            : 'text-body-sm text-mist-gray'
        }
        title={value || undefined}
      >
        {value || 'Not recorded'}
      </dd>
    </div>
  )
}

function EditForm({
  contact,
  busy,
  onCancel,
  onSave,
}: {
  contact: {
    fullName: string
    email: string
    phone: string
    linkedinUrl: string
    designation: string
    contactType: 'customer' | 'partner'
  }
  busy: boolean
  onCancel: () => void
  onSave: (patch: {
    fullName: string
    email: string
    phone: string
    linkedinUrl: string
    designation: string
    contactType: 'customer' | 'partner'
  }) => void
}) {
  const [fullName, setFullName] = useState(contact.fullName)
  const [designation, setDesignation] = useState(contact.designation)
  const [email, setEmail] = useState(contact.email)
  const [phone, setPhone] = useState(contact.phone)
  const [linkedinUrl, setLinkedinUrl] = useState(contact.linkedinUrl)
  const [contactType, setContactType] = useState(contact.contactType)

  const canSave = fullName.trim().length > 0 && !busy

  return (
    <form
      className="space-y-12"
      onSubmit={(e) => {
        e.preventDefault()
        if (!canSave) return
        onSave({
          fullName: fullName.trim(),
          designation: designation.trim(),
          email: email.trim(),
          phone: phone.trim(),
          linkedinUrl: linkedinUrl.trim(),
          contactType,
        })
      }}
    >
      <Field label="Full name">
        <TextInput value={fullName} disabled={busy} onChange={(e) => setFullName(e.target.value)} />
      </Field>

      <div className="grid grid-cols-2 gap-12">
        <Field label="Designation">
          <TextInput
            value={designation}
            disabled={busy}
            onChange={(e) => setDesignation(e.target.value)}
          />
        </Field>
        <Field label="Side">
          <Select
            value={contactType}
            disabled={busy}
            onChange={(e) => setContactType(e.target.value as 'customer' | 'partner')}
          >
            <option value="customer">End customer</option>
            <option value="partner">Partner</option>
          </Select>
        </Field>
      </div>

      <Field label="Email">
        <TextInput
          type="email"
          value={email}
          disabled={busy}
          onChange={(e) => setEmail(e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-12">
        <Field label="Phone">
          <TextInput type="tel" value={phone} disabled={busy} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <Field label="LinkedIn">
          <TextInput
            value={linkedinUrl}
            disabled={busy}
            onChange={(e) => setLinkedinUrl(e.target.value)}
          />
        </Field>
      </div>

      <div className="flex items-center gap-8 pt-8">
        <Button type="submit" size="sm" loading={busy} disabled={!canSave}>
          Save
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
