import { useMemo } from 'react'
import { useStore } from '@/data/store'
import { buildDealViews } from '@/lib/rollup'
import { compactMoney, relativeToNow } from '@/lib/format'
import { HealthDot } from '@/components/ui/Badge'
import type { ScreenContext } from '@/hooks/useScreenContext'

/**
 * The record the assistant is reading, drawn the way the rest of the app draws it.
 *
 * Not a "context: deal-123" chip. The value of showing this is that the user can confirm the
 * assistant means the thing they mean *before* asking, and a label alone does not do that — two
 * deals at one account can share most of a name. So it carries the same four facts the deal rows
 * everywhere else carry: health dot, stage with its own colour, value, close date.
 *
 * It also answers the question the user would otherwise have to ask first. Half of "why is this at
 * risk?" is visible here, which is a reasonable outcome: an assistant that makes its own opening
 * question unnecessary is doing better than one that answers it.
 */
export function ContextCard({ context }: { context: ScreenContext }) {
  const { snapshot } = useStore()

  const deal = useMemo(() => {
    if (context.type !== 'deal') return null
    return buildDealViews(snapshot).find((view) => view.deal.id === context.id) ?? null
  }, [context, snapshot])

  return (
    <div className="rounded-2xl border border-hairline bg-cloud p-16">
      <div className="flex items-start justify-between gap-12">
        <div className="min-w-0">
          <p className="text-caption font-semibold tracking-wide text-slate-gray uppercase">
            Reading {context.kindLabel}
          </p>
          <p className="mt-8 flex items-center gap-8 text-body-sm font-semibold text-ink-navy">
            {deal && <HealthDot health={deal.health} detail={deal.healthDetail} />}
            <span className="truncate">{deal ? deal.deal.name : context.label}</span>
          </p>
        </div>

        {deal && (
          <span className="shrink-0 text-body-sm font-semibold text-ink-navy tabular-nums">
            {compactMoney(deal.deal.value)}
          </span>
        )}
      </div>

      {deal ? (
        <div className="mt-12 flex flex-wrap items-center gap-x-12 gap-y-8 text-caption text-slate-gray">
          <span className="inline-flex items-center gap-8">
            <span
              aria-hidden
              className="size-8 shrink-0 rounded-full"
              style={{ backgroundColor: deal.stage.color }}
            />
            {deal.stage.name}
          </span>
          <span className="text-mist-gray">·</span>
          <span>{deal.account.name}</span>
          <span className="text-mist-gray">·</span>
          <span>Closes {relativeToNow(deal.deal.expectedCloseDate)}</span>
          <span className="text-mist-gray">·</span>
          <span>{deal.ownerName}</span>
        </div>
      ) : (
        <p className="mt-8 text-caption text-slate-gray">{context.label}</p>
      )}

      <p className="mt-12 text-caption text-mist-gray">
        Say “this {context.type}” and I will know what you mean.
      </p>
    </div>
  )
}
