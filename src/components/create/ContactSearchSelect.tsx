import { useEffect, useMemo, useRef, useState } from 'react'
import type { Contact, Id } from '@/types/domain'
import { cn } from '@/lib/cn'
import { SideBadge } from '@/components/ui/ContactBits'

/**
 * Search-and-pick for one person out of the directory.
 *
 * A `<select>` was the wrong control the moment the directory stopped being small. A native select
 * offers no search worth the name — type-ahead matches the *start* of the option text, so looking for
 * somebody by company or by surname means scrolling a list of every contact in the business. This
 * matches on name, company, job title and email, and it matches anywhere in them.
 *
 * Deliberately not a `<select>` replacement in general: it is built to the combobox pattern with the
 * keyboard behaviour people expect from one — arrows to move, Enter to take, Escape to abandon — because
 * a picker that can only be used with a mouse is slower than the select it replaced.
 *
 * People already on the deal are labelled, not hidden and not disabled. Hidden would be a lie — a name
 * missing from a search reads as "not in the directory", which sends somebody off to create a duplicate.
 * Disabled would be wrong too: the same person can legitimately hold two roles on one deal, and the exact
 * duplicate is caught where it belongs, on the Add button.
 */

/** Enough of the list to scan without the dropdown covering the form underneath it. */
const MAX_RESULTS = 8

export function ContactSearchSelect({
  contacts,
  value,
  onChange,
  disabled,
  alreadyOn,
  placeholder = 'Search people by name, company or title…',
  emptyAction,
}: {
  contacts: Contact[]
  value: Id | null
  onChange: (contactId: Id | null) => void
  disabled?: boolean
  /** Ids already on the deal. Labelled as such, and still selectable — a person can hold two roles. */
  alreadyOn?: Set<Id>
  placeholder?: string
  /** Offered when a search finds nobody — usually "file this person instead". */
  emptyAction?: { label: string; onSelect: (query: string) => void }
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(0)

  const wrapper = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  const selected = useMemo(
    () => (value ? (contacts.find((contact) => contact.id === value) ?? null) : null),
    [contacts, value],
  )

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const pool = needle
      ? contacts.filter((contact) =>
          [contact.fullName, contact.accountName, contact.designation, contact.email]
            .join(' ')
            .toLowerCase()
            .includes(needle),
        )
      : contacts
    return pool.slice(0, MAX_RESULTS)
  }, [contacts, query])

  // The highlight follows the results rather than surviving them: after typing two more letters, index 4
  // is usually a different person, and Enter would take somebody nobody looked at.
  useEffect(() => setHighlighted(0), [query])

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: PointerEvent) {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  function take(contact: Contact) {
    onChange(contact.id)
    setQuery('')
    setOpen(false)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      // Wraps, so holding one arrow key reaches everything without also having to know which end you are at.
      setHighlighted((current) => (current + step + matches.length) % Math.max(matches.length, 1))
      return
    }

    if (event.key === 'Enter') {
      // Only when the list is open with something under the highlight. Otherwise Enter belongs to the
      // form, and swallowing it here would break submitting from the keyboard.
      const candidate = matches[highlighted]
      if (open && candidate) {
        event.preventDefault()
        take(candidate)
      }
      return
    }

    if (event.key === 'Escape' && open) {
      event.preventDefault()
      setOpen(false)
    }
  }

  if (selected) {
    return (
      <div className="flex items-center gap-8 rounded-lg border border-hairline bg-paper px-12 py-8">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-8">
            <span className="truncate text-body-sm font-semibold text-ink-navy">
              {selected.fullName}
            </span>
            <SideBadge type={selected.contactType} />
          </span>
          <span className="mt-[2px] block truncate text-caption text-slate-gray">
            {[selected.designation, selected.accountName].filter(Boolean).join(' · ')}
          </span>
        </span>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange(null)
            // Focus returns to the field it came from, so changing your mind twice does not need the mouse.
            requestAnimationFrame(() => input.current?.focus())
          }}
          aria-label={`Clear ${selected.fullName}`}
          className="shrink-0 rounded-md px-8 py-[2px] text-caption font-semibold text-slate-gray transition-colors hover:bg-pebble hover:text-ink-navy"
        >
          Change
        </button>
      </div>
    )
  }

  const listId = 'contact-search-results'

  return (
    <div ref={wrapper} className="relative">
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[highlighted] ? `contact-${matches[highlighted].id}` : undefined}
        value={query}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={cn(
          'w-full rounded-lg border border-hairline bg-pebble px-16 py-8 text-body-sm text-ink-navy',
          'placeholder:text-mist-gray focus:border-signal-blue focus:bg-paper focus:outline-none',
        )}
      />

      {open && (
        <div
          id={listId}
          role="listbox"
          className="absolute top-[calc(100%+4px)] left-0 z-30 max-h-[280px] w-full overflow-y-auto rounded-lg border border-hairline bg-paper p-[4px] shadow-sm-3"
        >
          {matches.length === 0 ? (
            <div className="px-12 py-16 text-center">
              <p className="text-caption text-slate-gray">
                {contacts.length === 0
                  ? 'Nobody is filed in the directory yet.'
                  : `Nobody matches "${query.trim()}".`}
              </p>
              {emptyAction && (
                <button
                  type="button"
                  onClick={() => emptyAction.onSelect(query.trim())}
                  className="mt-8 rounded-md px-12 py-[4px] text-caption font-semibold text-signal-blue transition-colors hover:bg-pebble"
                >
                  {emptyAction.label}
                </button>
              )}
            </div>
          ) : (
            <ul>
              {matches.map((contact, index) => {
                const onDeal = alreadyOn?.has(contact.id) ?? false
                return (
                  <li key={contact.id}>
                    <button
                      id={`contact-${contact.id}`}
                      type="button"
                      role="option"
                      aria-selected={index === highlighted}

                      // Pointer-move rather than mouse-enter: it follows the cursor without fighting the
                      // keyboard when somebody is arrowing through with the mouse sitting still on the list.
                      onPointerMove={() => setHighlighted(index)}
                      onClick={() => take(contact)}
                      className={cn(
                        'flex w-full items-center gap-8 rounded-md px-12 py-8 text-left transition-colors',
                        index === highlighted ? 'bg-cloud' : 'hover:bg-cloud',
                      )}
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
                      {onDeal && (
                        <span className="shrink-0 text-caption text-slate-gray">On the deal</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
