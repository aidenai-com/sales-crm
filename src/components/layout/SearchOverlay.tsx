import { useEffect, useMemo, useRef, useState } from 'react'
import type { ActivitySubjectType } from '@/types/domain'
import { useStore } from '@/data/store'
import { useSelection } from '@/app/selection'
import { buildDealViews } from '@/lib/rollup'
import { compactMoney } from '@/lib/format'
import { TextInput } from '@/components/ui/Field'
import { cn } from '@/lib/cn'

interface Hit {
  type: ActivitySubjectType
  id: string
  title: string
  context: string
  trailing: string
}

const RESULT_LIMIT = 12

/**
 * Global search, the fourth nav item in spec 4.5. It opens over the current screen and
 * hands off to the drawer, so finding something never costs you your place.
 */
export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { snapshot } = useStore()
  const { select } = useSelection()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const views = useMemo(() => buildDealViews(snapshot), [snapshot])

  const hits = useMemo<Hit[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []

    const results: Hit[] = []

    for (const account of snapshot.accounts) {
      if (!account.name.toLowerCase().includes(q) && !account.industry.toLowerCase().includes(q)) continue
      results.push({
        type: 'account',
        id: account.id,
        title: account.name,
        context: account.isPartner ? 'Partner' : `Account · ${account.industry}`,
        trailing: '',
      })
    }

    for (const lead of snapshot.leads) {
      if (!lead.businessUnit.toLowerCase().includes(q)) continue
      const account = snapshot.accounts.find((a) => a.id === lead.accountId)
      results.push({
        type: 'lead',
        id: lead.id,
        title: lead.businessUnit,
        context: `Business unit · ${account?.name ?? 'Unknown'}`,
        trailing: '',
      })
    }

    for (const view of views) {
      const matches =
        view.deal.name.toLowerCase().includes(q) ||
        view.ownerName.toLowerCase().includes(q) ||
        (view.partner?.name.toLowerCase().includes(q) ?? false)
      if (!matches) continue
      results.push({
        type: 'deal',
        id: view.deal.id,
        title: view.deal.name,
        context: `Deal · ${view.account.name} · ${view.stage.name}`,
        trailing: compactMoney(view.deal.value),
      })
    }

    return results.slice(0, RESULT_LIMIT)
  }, [query, snapshot, views])

  useEffect(() => {
    setCursor(0)
  }, [query])

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else setQuery('')
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setCursor((c) => Math.min(c + 1, Math.max(hits.length - 1, 0)))
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setCursor((c) => Math.max(c - 1, 0))
      }
      if (event.key === 'Enter') {
        const hit = hits[cursor]
        if (hit) {
          select({ type: hit.type, id: hit.id })
          onClose()
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, hits, cursor, select, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-scrim/25" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="absolute inset-x-0 top-64 mx-auto w-[calc(100%-48px)] max-w-[620px] overflow-hidden rounded-3xl bg-paper shadow-sm-2"
      >
        <div className="border-b border-hairline p-16">
          <TextInput
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search accounts, business units, deals, partners, owners"
            aria-label="Search"
          />
        </div>

        {query.trim() === '' ? (
          <p className="px-24 py-32 text-center text-body-sm text-slate-gray">
            Type to search across accounts, business units, and deals.
          </p>
        ) : hits.length === 0 ? (
          <p className="px-24 py-32 text-center text-body-sm text-slate-gray">
            Nothing matches "{query}".
          </p>
        ) : (
          <ul className="max-h-[380px] overflow-y-auto py-8">
            {hits.map((hit, index) => (
              <li key={`${hit.type}-${hit.id}`}>
                <button
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => {
                    select({ type: hit.type, id: hit.id })
                    onClose()
                  }}
                  className={cn(
                    'flex w-full items-center gap-16 px-24 py-8 text-left',
                    index === cursor ? 'bg-pebble' : 'bg-transparent',
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-semibold text-ink-navy">
                      {hit.title}
                    </span>
                    <span className="block truncate text-caption text-slate-gray">{hit.context}</span>
                  </span>
                  {hit.trailing && (
                    <span className="shrink-0 text-body-sm font-semibold text-ink-navy tabular-nums">
                      {hit.trailing}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center gap-16 border-t border-hairline bg-cloud px-24 py-8 text-caption text-slate-gray">
          <span>↑↓ to move</span>
          <span>Enter to open</span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  )
}
