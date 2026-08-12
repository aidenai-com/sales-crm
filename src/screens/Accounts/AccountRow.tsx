import type { AccountNode, DealNode, LeadNode } from '@/lib/rollup'
import { useSelection } from '@/app/selection'
import { compactMoney, relativeToNow } from '@/lib/format'
import { HealthBadge, HealthDot } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn('size-16 shrink-0 text-slate-gray transition-transform', open && 'rotate-90')}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden="true"
    >
      <path d="M6 3.5L10.5 8L6 12.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function AccountRow({
  node,
  expanded,
  onToggle,
  forceOpen,
}: {
  node: AccountNode
  expanded: Set<string>
  onToggle: (id: string) => void
  forceOpen: boolean
}) {
  const { select } = useSelection()
  const open = forceOpen || expanded.has(node.id)
  const childCount = node.leads.length + node.directDeals.length

  return (
    <li className="overflow-hidden rounded-2xl border border-hairline bg-paper shadow-sm">
      <div className="flex items-center gap-16 px-16 py-16">
        <button
          onClick={() => onToggle(node.id)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${node.account.name}` : `Expand ${node.account.name}`}
          className="grid size-24 shrink-0 place-items-center rounded-md hover:bg-pebble"
          disabled={childCount === 0}
        >
          {childCount > 0 && <Chevron open={open} />}
        </button>

        <button onClick={() => select({ type: 'account', id: node.id })} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-body-lg font-semibold text-ink-navy">
            {node.account.name}
          </span>
          <span className="mt-[2px] block text-caption text-slate-gray">
            {node.account.industry} · {node.ownerName} · {node.leads.length}{' '}
            {node.leads.length === 1 ? 'business unit' : 'business units'}
          </span>
        </button>

        <span className="hidden shrink-0 text-right sm:block">
          <span className="block text-body-sm font-bold text-ink-navy tabular-nums">
            {compactMoney(node.rollUp.openValue)}
          </span>
          <span className="block text-caption text-slate-gray">{node.rollUp.openCount} open</span>
        </span>

        <HealthBadge health={node.rollUp.health} />
      </div>

      {open && childCount > 0 && (
        <ul className="border-t border-hairline bg-cloud">
          {node.leads.map((lead) => (
            <LeadRow
              key={lead.id}
              node={lead}
              expanded={expanded}
              onToggle={onToggle}
              forceOpen={forceOpen}
            />
          ))}
          {node.directDeals.map((deal) => (
            <DealRow key={deal.id} node={deal} indent={2} note="Not tied to a business unit" />
          ))}
        </ul>
      )}
    </li>
  )
}

function LeadRow({
  node,
  expanded,
  onToggle,
  forceOpen,
}: {
  node: LeadNode
  expanded: Set<string>
  onToggle: (id: string) => void
  forceOpen: boolean
}) {
  const { select } = useSelection()
  const open = forceOpen || expanded.has(node.id)

  return (
    <li className="border-b border-hairline last:border-0">
      <div className="flex items-center gap-16 py-8 pr-16 pl-32">
        <button
          onClick={() => onToggle(node.id)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${node.lead.businessUnit}` : `Expand ${node.lead.businessUnit}`}
          className="grid size-24 shrink-0 place-items-center rounded-md hover:bg-pebble"
          disabled={node.deals.length === 0}
        >
          {node.deals.length > 0 && <Chevron open={open} />}
        </button>

        <button onClick={() => select({ type: 'lead', id: node.id })} className="min-w-0 flex-1 text-left">
          <span className="block truncate text-body-sm font-semibold text-ink-navy">
            {node.lead.businessUnit}
          </span>
          <span className="mt-[2px] block text-caption text-slate-gray">
            {node.ownerName} · {node.deals.length} {node.deals.length === 1 ? 'deal' : 'deals'}
          </span>
        </button>

        <span className="shrink-0 text-body-sm font-semibold text-ink-navy tabular-nums">
          {compactMoney(node.rollUp.openValue)}
        </span>

        <HealthBadge health={node.rollUp.health} />
      </div>

      {open && node.deals.length > 0 && (
        <ul className="border-t border-hairline bg-paper">
          {node.deals.map((deal) => (
            <DealRow key={deal.id} node={deal} indent={3} />
          ))}
        </ul>
      )}
    </li>
  )
}

function DealRow({ node, indent, note }: { node: DealNode; indent: 2 | 3; note?: string }) {
  const { select } = useSelection()
  const view = node.view

  return (
    <li className="border-b border-hairline last:border-0">
      <button
        onClick={() => select({ type: 'deal', id: node.id })}
        className={cn(
          'flex w-full items-center gap-16 py-8 pr-16 text-left transition-colors hover:bg-pebble',
          indent === 2 ? 'pl-32' : 'pl-56',
        )}
      >
        <HealthDot health={view.health} detail={view.healthDetail} />

        <span className="min-w-0 flex-1">
          <span className="block truncate text-body-sm font-medium text-ink-navy">{view.deal.name}</span>
          <span className="mt-[2px] block truncate text-caption text-slate-gray">
            {view.stage.name}
            {note && ` · ${note}`}
          </span>
        </span>

        <span className="shrink-0 text-right">
          <span className="block text-body-sm font-semibold text-ink-navy tabular-nums">
            {compactMoney(view.deal.value)}
          </span>
          <span className="block text-caption text-slate-gray">
            {relativeToNow(view.deal.expectedCloseDate)}
          </span>
        </span>
      </button>
    </li>
  )
}
