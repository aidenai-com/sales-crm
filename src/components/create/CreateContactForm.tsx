import { useMemo, useState } from 'react'
import type { ContactType, Id } from '@/types/domain'
import { useStore } from '@/data/store'
import { useSelection } from '@/app/selection'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { AccountNameField } from './AccountNameField'

/** The Company select's value for "file a company that is not on this list yet". */
const NEW_COMPANY = '__new__'

/**
 * A new contact: a person at a customer or a partner.
 *
 * Its own object, not a field on a deal — the same human is often on three deals, and filing them per
 * deal is how a CRM ends up with three phone numbers for one person and no way to tell which is
 * current.
 *
 * Email, phone and LinkedIn are optional here but marked. Those three are exactly what a stage will
 * demand before it accepts a deal with this person as its champion, so the form says so at the point
 * the details are being typed rather than leaving it to be discovered as a refused stage move weeks
 * later. Optional rather than required because a name and a company is often genuinely all that is
 * known on first contact, and refusing to record that just means it goes unrecorded.
 *
 * `contactType` records which side of a deal this person sits on. It defaults to the customer side and
 * is always editable: an account is no longer flagged as a partner, so there is nothing to infer it
 * from, and the same company can be the customer on one deal and the partner on another.
 *
 * The company can be filed from here. Every contact belongs to an account — that is what lets the
 * directory group by company, what puts people on the account page, and what makes "Sarah Whitfield —
 * Citibank" readable in a deal picker — but requiring the company to exist *first* meant abandoning
 * this form, going to Accounts, and coming back, which in practice means picking the nearest wrong
 * company instead. So "a company not listed" files one inline, with the same duplicate detection the
 * account form uses.
 *
 * Filing a company here is not a claim that it is bringing business. An account is a name, an industry
 * and an owner; leads and deals are what make it an account somebody is working, and the Accounts tab
 * shows only those by default. So there is no owner picker and no lead prompt here — this is filing a
 * name, and the form asks for nothing that would suggest otherwise.
 */
export function CreateContactForm({
  defaultAccountId,
  defaultContactType,
  onDone,
}: {
  defaultAccountId?: Id
  defaultContactType?: ContactType
  onDone: (createdId?: Id) => void
}) {
  const { snapshot, createContact, createAccount } = useStore()
  const { select } = useSelection()

  const accounts = useMemo(
    () => [...snapshot.accounts].sort((a, b) => a.name.localeCompare(b.name)),
    [snapshot.accounts],
  )

  // With nothing on record the form opens straight into filing a company, rather than showing an
  // empty dropdown and a dead end.
  const [accountId, setAccountId] = useState(
    defaultAccountId ?? accounts[0]?.id ?? NEW_COMPANY,
  )
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyIndustry, setNewCompanyIndustry] = useState('')
  // Set by the name field when the company already exists under a different spelling. The API holds a
  // unique index on the normalized name, so submitting anyway would be submitting a known 409.
  const [companyBlocked, setCompanyBlocked] = useState(false)
  const [fullName, setFullName] = useState('')
  const [designation, setDesignation] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [linkedinUrl, setLinkedinUrl] = useState('')
  // Held separately from the account so an explicit choice is not undone by changing accounts.
  const [typeOverride, setTypeOverride] = useState<ContactType | null>(defaultContactType ?? null)
  const [saving, setSaving] = useState(false)

  // Defaults to the customer side. It used to be inferred from the account's partner flag, which is
  // gone — a company is no longer permanently one or the other, so there is nothing to infer from and
  // the honest default is the commoner case.
  const contactType: ContactType = typeOverride ?? 'customer'

  const filingCompany = accountId === NEW_COMPANY
  const trimmedCompany = newCompanyName.trim()

  const trimmedName = fullName.trim()
  const duplicate = snapshot.contacts.some(
    (c) =>
      c.accountId === accountId &&
      c.email !== '' &&
      c.email.toLowerCase() === email.trim().toLowerCase(),
  )
  const companyReady = filingCompany ? trimmedCompany.length > 0 && !companyBlocked : accountId !== ''
  const canSave = trimmedName.length > 0 && companyReady && !duplicate && !saving

  const missing = [
    email.trim() ? null : 'email',
    phone.trim() ? null : 'phone',
    linkedinUrl.trim() ? null : 'LinkedIn',
  ].filter(Boolean) as string[]

  async function submit() {
    if (!canSave) return
    setSaving(true)
    try {
      // Two writes, one gesture. If the company fails — a collision the typed-ahead check did not
      // catch, or the network — the contact is not attempted: it has nowhere to go, and the error is
      // already on screen from the store. Everything typed here survives, so the fix is one edit away.
      let targetAccountId = accountId
      if (filingCompany) {
        const account = await createAccount({
          name: trimmedCompany,
          industry: newCompanyIndustry.trim(),
        })
        if (!account) return
        targetAccountId = account.id
        // Moved off the new-company branch, so a retry after a later failure does not try to file the
        // same company twice.
        setAccountId(account.id)
      }

      const created = await createContact({
        accountId: targetAccountId,
        fullName: trimmedName,
        email: email.trim(),
        phone: phone.trim(),
        linkedinUrl: linkedinUrl.trim(),
        designation: designation.trim(),
        contactType,
      })
      if (created) {
        onDone(created.id)
        select({ type: 'contact', id: created.id })
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
      <Field label="Full name">
        <TextInput
          autoFocus
          value={fullName}
          disabled={saving}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Priya Raghavan"
        />
      </Field>

      <div className="grid grid-cols-2 gap-16">
        <Field label="Company">
          <Select
            value={accountId}
            disabled={saving}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.length === 0 && <option value="">Choose a company…</option>}
            {accounts.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
            {/* Last, and separated: filing a company is the exception, and putting it first would
                invite it over the account somebody already has. */}
            <option disabled>──────────</option>
            <option value={NEW_COMPANY}>A company not listed…</option>
          </Select>
        </Field>

        <Field label="Side" hint="Which side of a deal they sit on.">
          <Select
            value={contactType}
            disabled={saving}
            onChange={(e) => setTypeOverride(e.target.value as ContactType)}
          >
            <option value="customer">End customer</option>
            <option value="partner">Partner</option>
          </Select>
        </Field>
      </div>

      {filingCompany && (
        <div className="space-y-16 rounded-2xl border border-hairline bg-cloud p-16">
          <div>
            <h3 className="text-body-sm font-semibold text-ink-navy">File the company too</h3>
            <p className="mt-[2px] text-caption text-slate-gray">
              Just the name. It appears under All companies until it has a business unit or a deal.
            </p>
          </div>

          <AccountNameField
            label="Company name"
            autoFocus={false}
            value={newCompanyName}
            onChange={setNewCompanyName}
            disabled={saving}
            onBlockingChange={setCompanyBlocked}
            // Picking a match is the point of showing it: the company was on record after all, so this
            // switches the form back to that account rather than filing a second one.
            onPickExisting={(account) => {
              setAccountId(account.id)
              setNewCompanyName('')
              setCompanyBlocked(false)
            }}
          />

          <Field label="Industry" hint="Optional.">
            <TextInput
              value={newCompanyIndustry}
              disabled={saving}
              onChange={(e) => setNewCompanyIndustry(e.target.value)}
              placeholder="Financial services"
            />
          </Field>
        </div>
      )}

      <Field label="Designation" hint="Their job title, as they would give it.">
        <TextInput
          value={designation}
          disabled={saving}
          onChange={(e) => setDesignation(e.target.value)}
          placeholder="Head of Digital Transformation"
        />
      </Field>

      <div className="rounded-2xl border border-hairline bg-cloud p-16">
        <p className="text-body-sm font-semibold text-ink-navy">How to reach them</p>
        <p className="mt-[2px] text-caption text-slate-gray">
          All three are needed before this person can be a deal’s champion. You can fill them in
          later.
        </p>

        <div className="mt-16 space-y-12">
          <Field
            label="Email"
            hint={duplicate ? 'Somebody with that email is already filed under this company.' : undefined}
          >
            <TextInput
              type="email"
              value={email}
              disabled={saving}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="priya.raghavan@example.com"
              aria-invalid={duplicate}
            />
          </Field>

          <div className="grid grid-cols-2 gap-12">
            <Field label="Phone">
              <TextInput
                type="tel"
                value={phone}
                disabled={saving}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+44 20 7946 0958"
              />
            </Field>

            <Field label="LinkedIn">
              <TextInput
                value={linkedinUrl}
                disabled={saving}
                onChange={(e) => setLinkedinUrl(e.target.value)}
                placeholder="linkedin.com/in/priyaraghavan"
              />
            </Field>
          </div>
        </div>

        {missing.length > 0 && trimmedName.length > 0 && (
          <p className="mt-12 text-caption text-slate-gray">
            No {missing.join(', ')} yet — they can be added, but not made a champion until then.
          </p>
        )}
      </div>

      <div className="flex items-center gap-8 pt-8">
        <Button type="submit" loading={saving} disabled={!canSave}>
          {saving ? 'Creating' : 'Create contact'}
        </Button>
        <Button type="button" variant="ghost" disabled={saving} onClick={() => onDone()}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
