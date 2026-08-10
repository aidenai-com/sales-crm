import { useMemo, useState } from 'react'
import { useStore } from '@/data/store'
import { useCreation } from '@/app/creation'
import { useAuth } from '@/app/auth'
import { buildDealViews, buildTree, filterTree } from '@/lib/rollup'
import { dealRows } from '@/lib/export'
import { TextInput } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { ExportButton } from '@/components/ui/ExportButton'
import { Card, EmptyState } from '@/components/ui/Card'
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton'
import { AccountRow } from './AccountRow'

/**
 * Replaces flat tables with hierarchical navigation: Account -> Lead -> Deal (R3).
 *
 * Expansion state lives here, above the drawer, so opening a record never collapses the
 * tree you were working in (spec 4.3, context preservation).
 */
export function AccountExplorer() {
  const { snapshot, status } = useStore()
  const { openCreate } = useCreation()
  const { isAdmin } = useAuth()
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const views = useMemo(() => buildDealViews(snapshot), [snapshot])
  const tree = useMemo(() => buildTree(snapshot, views), [snapshot, views])
  const filtered = useMemo(() => filterTree(tree, query), [tree, query])

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function expandAll() {
    const ids = new Set<string>()
    for (const account of filtered) {
      ids.add(account.id)
      for (const lead of account.leads) ids.add(lead.id)
    }
    setExpanded(ids)
  }

  // A search should show its matches, not hide them behind a collapsed node.
  const searching = query.trim().length > 0

  const exportViews = useMemo(() => {
    const ids = new Set<string>()
    for (const account of filtered) {
      for (const lead of account.leads) for (const deal of lead.deals) ids.add(deal.id)
      for (const deal of account.directDeals) ids.add(deal.id)
    }
    return views.filter((v) => ids.has(v.deal.id))
  }, [filtered, views])

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-page px-24 pb-96">
        <div className="py-32">
          <Skeleton className="h-40 w-[180px]" />
          <Skeleton className="mt-8 h-16 w-[420px]" />
        </div>
        <Card>
          <SkeletonRows rows={7} />
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-page px-24 pb-96">
      <div className="py-32">
        <h1 className="text-heading-sm font-bold text-ink-navy">Accounts</h1>
        <p className="mt-8 text-body text-slate-gray">
          Every account, its business units, and the deals underneath them.
        </p>
      </div>

      <div className="mb-24 flex flex-wrap items-center justify-between gap-16">
        <TextInput
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search accounts, business units, deals, partners, owners"
          aria-label="Search accounts, leads, and deals"
          className="w-[380px]"
        />
        <div className="flex items-center gap-8">
          {/* Accounts are admin-created; reps add business units and deals within them. */}
          {isAdmin && (
            <Button size="sm" onClick={() => openCreate({ kind: 'account' })}>
              New account
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => openCreate({ kind: 'lead' })}>
            New business unit
          </Button>
          <Button variant="ghost" size="sm" onClick={expandAll}>
            Expand all
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(new Set())}>
            Collapse all
          </Button>
          <ExportButton
            sheets={[{ name: 'Accounts', rows: dealRows(exportViews) }]}
            filenameBase="accounts"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title={`Nothing matches "${query}"`}
          hint="Try an account name, a business unit, a partner, or an owner."
        />
      ) : (
        <ul className="space-y-8">
          {filtered.map((node) => (
            <AccountRow
              key={node.id}
              node={node}
              expanded={expanded}
              onToggle={toggle}
              forceOpen={searching}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
