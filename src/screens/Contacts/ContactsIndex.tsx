import { useMemo, useState } from 'react'
import type { Contact, ContactType, Id } from '@/types/domain'
import { useStore } from '@/data/store'
import { useCreation } from '@/app/creation'
import { useSelection } from '@/app/selection'
import { Button } from '@/components/ui/Button'
import { SearchField } from '@/components/ui/SearchField'
import { Segmented } from '@/components/ui/Segmented'
import { Skeleton } from '@/components/ui/Skeleton'
import { ContactRow } from './ContactRow'
import { ProspectsPanel } from './ProspectsPanel'

/**
 * Every person we know, across every company.
 *
 * Grouped by company rather than listed flat. A contact's company is the single most useful thing
 * about them — "who do we know at Barclays" is the question people actually arrive with — and a flat
 * alphabetical list of two hundred names answers it only by scanning.
 *
 * The side filter is customer versus partner, because those two are answered differently: a customer
 * contact is somebody to sell to, a partner contact somebody to sell *with*.
 *
 * Two tabs, because there are two kinds of person here and they are not interchangeable. **Directory** is
 * people filed against a company somebody decided to work — they can go on a deal and hold a role.
 * **Prospects** is the outreach list imported from lemlist, most of which will never become the first kind.
 * Merging them would fill the directory with cold names and make the champion gate meaningless; a prospect
 * crosses over only when somebody files them, which is what "File as contact" does.
 */

type SideFilter = 'all' | ContactType
type Tab = 'directory' | 'prospects'

export function ContactsIndex() {
  const { snapshot, status } = useStore()
  const { openCreate } = useCreation()
  const { select } = useSelection()

  const [tab, setTab] = useState<Tab>('directory')
  const [search, setSearch] = useState('')
  const [side, setSide] = useState<SideFilter>('all')
  const [onlyIncomplete, setOnlyIncomplete] = useState(false)

  const query = search.trim().toLowerCase()

  const filtered = useMemo(() => {
    return snapshot.contacts.filter((contact) => {
      if (side !== 'all' && contact.contactType !== side) return false
      if (onlyIncomplete && contact.missingDetails.length === 0) return false
      if (!query) return true
      return (
        contact.fullName.toLowerCase().includes(query) ||
        contact.email.toLowerCase().includes(query) ||
        contact.designation.toLowerCase().includes(query) ||
        contact.accountName.toLowerCase().includes(query)
      )
    })
  }, [snapshot.contacts, side, onlyIncomplete, query])

  const grouped = useMemo(() => {
    const byAccount = new Map<Id, { name: string; partnerSide: boolean; contacts: Contact[] }>()
    for (const contact of filtered) {
      const existing = byAccount.get(contact.accountId)
      if (existing) {
        existing.contacts.push(contact)
      } else {
        byAccount.set(contact.accountId, {
          name: contact.accountName,
          // Which side the *first* contact filed here sits on, used only to prefill the add form.
          partnerSide: contact.contactType === 'partner',
          contacts: [contact],
        })
      }
    }
    return [...byAccount.entries()]
      .map(([id, group]) => ({ id, ...group }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [filtered])

  const incompleteCount = snapshot.contacts.filter((c) => c.missingDetails.length > 0).length

  return (
    <div className="mx-auto max-w-page px-24 pb-96">
      <header className="flex flex-wrap items-end justify-between gap-16 py-32">
        <div>
          <p className="text-caption font-semibold tracking-wide text-slate-gray uppercase">
            People
          </p>
          <h1 className="mt-8 text-heading-sm font-bold text-ink-navy">Contacts</h1>
          <p className="mt-8 max-w-[640px] text-body font-normal text-slate-gray">
            Everyone we know at our customers and partners. A contact is filed once per company and
            can be attached to any number of deals.
          </p>
        </div>

        <Button onClick={() => openCreate({ kind: 'contact' })}>New contact</Button>
      </header>

      <div className="pb-24">
        <Segmented
          label="Which people"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'directory', label: 'Directory', count: snapshot.contacts.length },
            { value: 'prospects', label: 'Prospects' },
          ]}
        />
      </div>

      {tab === 'prospects' ? (
        <ProspectsPanel />
      ) : (
        <DirectoryView />
      )}
    </div>
  )

  // Kept as a closure rather than a separate component: it reads a dozen pieces of the state above, and
  // threading all of them through props would be more code saying less.
  function DirectoryView() {
    return (
      <>
      <div className="flex flex-wrap items-center gap-12 pb-24">
        <div className="min-w-[240px] flex-1">
          <SearchField
            value={search}
            onValueChange={setSearch}
            placeholder="Name, email, title or company"
            aria-label="Search contacts"
          />
        </div>

        <Segmented
          label="Which side"
          value={side}
          onChange={setSide}
          options={[
            { value: 'all', label: 'Everyone' },
            { value: 'customer', label: 'Customer' },
            { value: 'partner', label: 'Partner' },
          ]}
        />

        {/* Offered only when it would find something. A filter that always returns nothing teaches
            people to ignore it. */}
        {incompleteCount > 0 && (
          <button
            type="button"
            onClick={() => setOnlyIncomplete((current) => !current)}
            aria-pressed={onlyIncomplete}
            className={
              onlyIncomplete
                ? 'rounded-lg bg-pebble px-16 py-8 text-body-sm font-semibold text-signal-blue'
                : 'rounded-lg px-16 py-8 text-body-sm font-semibold text-slate-gray hover:bg-pebble'
            }
          >
            Missing details ({incompleteCount})
          </button>
        )}
      </div>

      {status === 'loading' && snapshot.contacts.length === 0 ? (
        <div className="space-y-16">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-[132px] rounded-2xl" />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <EmptyState
          hasAny={snapshot.contacts.length > 0}
          onCreate={() => openCreate({ kind: 'contact' })}
        />
      ) : (
        <div className="space-y-24">
          {grouped.map((group) => (
            <section key={group.id} className="rounded-2xl border border-hairline bg-paper">
              <header className="flex items-center justify-between gap-12 border-b border-hairline px-24 py-16">
                <div className="flex items-center gap-8">
                  <h2 className="text-body-lg font-semibold text-ink-navy">{group.name}</h2>
                  <span className="text-caption text-slate-gray">
                    {group.contacts.length} {group.contacts.length === 1 ? 'person' : 'people'}
                  </span>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    openCreate({
                      kind: 'contact',
                      accountId: group.id,
                      contactType: group.partnerSide ? 'partner' : 'customer',
                    })
                  }
                >
                  Add here
                </Button>
              </header>

              <ul>
                {group.contacts.map((contact) => (
                  <li key={contact.id} className="border-b border-hairline last:border-b-0">
                    <ContactRow
                      contact={contact}
                      onOpen={() => select({ type: 'contact', id: contact.id })}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      </>
    )
  }
}

function EmptyState({ hasAny, onCreate }: { hasAny: boolean; onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-hairline bg-cloud px-24 py-64 text-center">
      <p className="text-body-lg font-semibold text-ink-navy">
        {hasAny ? 'Nothing matches those filters' : 'No contacts yet'}
      </p>
      <p className="mx-auto mt-8 max-w-[420px] text-body-sm text-slate-gray">
        {hasAny
          ? 'Try a different search, or clear the side and completeness filters.'
          : 'Add the people you deal with at your customers and partners. You can then attach them to deals and give them a role.'}
      </p>
      {!hasAny && (
        <div className="mt-24">
          <Button onClick={onCreate}>New contact</Button>
        </div>
      )}
    </div>
  )
}
