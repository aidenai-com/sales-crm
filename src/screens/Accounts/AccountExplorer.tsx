import { useMemo, useState, type ReactNode } from 'react'
import { useStore } from '@/data/store'
import { cn } from '@/lib/cn'
import { useCreation } from '@/app/creation'
import { buildDealViews, buildTree, filterTree, type AccountNode } from '@/lib/rollup'
import { dealRows } from '@/lib/export'
import { TextInput } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { ExportButton } from '@/components/ui/ExportButton'
import { Card, EmptyState } from '@/components/ui/Card'
import { Skeleton, SkeletonRows } from '@/components/ui/Skeleton'
import { AccountRow } from './AccountRow'

type Scope = 'active' | 'all'

/** One of two mutually exclusive views of the same list, so a tab rather than a checkbox. */
function ScopeTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'rounded-md px-12 py-[4px] text-caption font-semibold transition-colors duration-hover ease-ui',
        active
          ? 'bg-paper text-ink-navy shadow-sm'
          : 'text-slate-gray hover:text-ink-navy',
      )}
    >
      {children}
    </button>
  )
}

/**
 * Whether this company is one somebody is actually working.
 *
 * Derived, never stored. An account row carries only a name, an industry and an owner; a business unit
 * or a deal underneath it is what makes it business. That means a company filed purely to hold a
 * contact — somebody you know at a firm that is not buying anything — is a legitimate row that simply
 * has nothing under it, and this list stops presenting it as an account being worked.
 *
 * A flag on the account would be the same mistake `is_partner` was: something a person has to remember
 * to set, which goes stale the day the first deal is created. This cannot go stale, because it *is* the
 * condition.
 */
function hasBusiness(node: AccountNode): boolean {
  return node.leads.length > 0 || node.directDeals.length > 0
}

/**
 * Replaces flat tables with hierarchical navigation: Account -> Lead -> Deal (R3).
 *
 * Expansion state lives here, above the drawer, so opening a record never collapses the
 * tree you were working in (spec 4.3, context preservation).
 */
export function AccountExplorer() {
  const { snapshot, status } = useStore()
  const { openCreate } = useCreation()
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<Scope>('active')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const views = useMemo(() => buildDealViews(snapshot), [snapshot])
  const tree = useMemo(() => buildTree(snapshot, views), [snapshot, views])

  const scoped = useMemo(() => (scope === 'all' ? tree : tree.filter(hasBusiness)), [tree, scope])
  const filtered = useMemo(() => filterTree(scoped, query), [scoped, query])
  const directoryOnly = useMemo(() => tree.filter((node) => !hasBusiness(node)).length, [tree])

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
        <div className="flex flex-wrap items-center gap-16">
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search accounts, business units, deals, owners"
            aria-label="Search accounts, leads, and deals"
            className="w-[380px]"
          />

          {/* Only shown once there is something to hide. With nothing filed but working accounts, a
              filter offering to reveal none of them is a control that does nothing. */}
          {directoryOnly > 0 && (
            <div
              role="group"
              aria-label="Which companies to show"
              className="flex items-center gap-[2px] rounded-lg border border-hairline bg-pebble p-[2px]"
            >
              <ScopeTab active={scope === 'active'} onClick={() => setScope('active')}>
                Active
              </ScopeTab>
              <ScopeTab active={scope === 'all'} onClick={() => setScope('all')}>
                All companies
                <span className="ml-8 text-slate-gray">{tree.length}</span>
              </ScopeTab>
            </div>
          )}
        </div>
        <div className="flex items-center gap-8">
          {/* Anybody may file a company; whoever does becomes its owner, and an admin can reassign it.
              Gating this on admin was a leftover from when accounts were created centrally, and it made
              filing a contact at a new company impossible for the person actually meeting them. */}
          <Button size="sm" onClick={() => openCreate({ kind: 'account' })}>
            New account
          </Button>
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
        searching ? (
          <EmptyState
            title={`Nothing matches "${query}"`}
            hint={
              scope === 'active' && directoryOnly > 0
                ? 'Companies with no business unit or deal are hidden. Try All companies.'
                : 'Try an account name, a business unit, or an owner.'
            }
          />
        ) : (
          <EmptyState
            title="No accounts being worked yet"
            hint={
              directoryOnly > 0
                ? `${directoryOnly} ${directoryOnly === 1 ? 'company is' : 'companies are'} on record with nothing under them. Add a business unit or a deal, or switch to All companies.`
                : 'File a company, then add a business unit or a deal underneath it.'
            }
          />
        )
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
