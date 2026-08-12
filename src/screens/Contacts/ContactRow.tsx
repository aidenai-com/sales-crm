import type { Contact } from '@/types/domain'
import { ContactLinks, MissingDetails, SideBadge } from '@/components/ui/ContactBits'

/**
 * One person in the contacts list.
 *
 * The row itself opens the drawer, but the reach-out links inside it do not — they stop propagation, so
 * clicking Email sends an email rather than opening a panel about the person you were about to email.
 * That is why this is a div with a button inside rather than one big button: a link inside a button is
 * invalid HTML and browsers resolve it unpredictably.
 */
export function ContactRow({ contact, onOpen }: { contact: Contact; onOpen: () => void }) {
  return (
    <div className="flex items-center gap-12 px-24 py-12 transition-colors hover:bg-cloud">
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left"
        aria-label={`Open ${contact.fullName}`}
      >
        <span className="flex items-center gap-8">
          <span className="truncate text-body-sm font-semibold text-ink-navy">
            {contact.fullName}
          </span>
          <SideBadge type={contact.contactType} />
        </span>

        <span className="mt-[2px] flex flex-wrap items-center gap-8">
          {contact.designation && (
            <span className="truncate text-caption text-slate-gray">{contact.designation}</span>
          )}
          {contact.dealCount > 0 && (
            <span className="text-caption text-slate-gray">
              On {contact.dealCount} {contact.dealCount === 1 ? 'deal' : 'deals'}
            </span>
          )}
          <MissingDetails missing={contact.missingDetails} />
        </span>
      </button>

      <ContactLinks
        email={contact.email}
        phone={contact.phone}
        linkedinUrl={contact.linkedinUrl}
      />
    </div>
  )
}
