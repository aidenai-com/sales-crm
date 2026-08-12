import { useMemo } from 'react'
import { pendingKey, useStore } from '@/data/store'
import { useDebouncedCommit } from '@/hooks/useDebouncedCommit'
import { useSelection } from '@/app/selection'
import { buildDealViews, rollUp } from '@/lib/rollup'
import { compactMoney, relativeToNow } from '@/lib/format'
import { HealthBadge, HealthDot } from '@/components/ui/Badge'
import { Field, TextInput } from '@/components/ui/Field'
import { ActivityLogForm } from './ActivityLogForm'
import { ActivityTimeline } from './ActivityTimeline'
import { NudgeButton } from './NudgeButton'

export function LeadDrawerBody({ leadId }: { leadId: string }) {
  const { snapshot, updateLead, isPending } = useStore()
  const { select } = useSelection()

  const lead = snapshot.leads.find((l) => l.id === leadId)

  const views = useMemo(() => buildDealViews(snapshot), [snapshot])
  const leadViews = useMemo(() => views.filter((v) => v.deal.leadId === leadId), [views, leadId])

  const activities = useMemo(
    () => snapshot.activities.filter((a) => a.subjectType === 'lead' && a.subjectId === leadId),
    [snapshot.activities, leadId],
  )

  // Still used by the business-unit field's disabled state below, even though the owner select that
  // also read it is gone.
  const saving = isPending(pendingKey.lead(leadId))
  const unitField = useDebouncedCommit(lead?.businessUnit ?? '', (businessUnit) =>
    updateLead(leadId, { businessUnit }),
  )

  if (!lead) return null

  const account = snapshot.accounts.find((a) => a.id === lead.accountId)
  const summary = rollUp(leadViews)

  const ownerName = (id: string) =>
    snapshot.people.find((person) => person.id === id)?.name ?? 'the owner'

  // Read through the account: a business unit has no owner column any more.
  const accountOwnerName = account ? ownerName(account.ownerId) : 'Unassigned'

  return (
    <div className="space-y-24">
      <div className="flex flex-wrap items-center gap-8">
        <HealthBadge health={summary.health} />
        <span className="text-caption text-slate-gray">
          {summary.openCount} open · {compactMoney(summary.openValue)} in play
        </span>
      </div>

      <div className="grid grid-cols-2 gap-16">
        <Field label="Business unit">
          <TextInput
            value={unitField.value}
            disabled={saving}
            onChange={(e) => unitField.onChange(e.target.value)}
            onBlur={unitField.onBlur}
          />
        </Field>
        {/* No owner control. A business unit's stewardship follows its account, so the person
            accountable is shown as text and changed on the account itself. */}
        <Field label="Account owner">
          <p className="px-12 py-8 text-body-sm text-slate-gray">{accountOwnerName}</p>
        </Field>
      </div>

      <p className="text-body-sm text-slate-gray">
        Sits under <span className="font-semibold text-ink-navy">{account?.name ?? 'unknown account'}</span>
      </p>

      <div>
        <h3 className="mb-16 text-body-lg font-semibold text-ink-navy">Deals</h3>
        {leadViews.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-hairline bg-cloud px-16 py-24 text-center text-body-sm text-slate-gray">
            No deals under this business unit yet.
          </p>
        ) : (
          <ul className="space-y-8">
            {/* Each row is a flex container rather than one big button: the nudge is a second
                action on the same row, and a button cannot legally contain another. */}
            {leadViews.map((view) => (
              <li
                key={view.deal.id}
                className="flex items-center gap-8 rounded-lg border border-hairline pr-8 transition-colors hover:bg-pebble"
              >
                <button
                  onClick={() => select({ type: 'deal', id: view.deal.id })}
                  className="flex min-w-0 flex-1 items-center gap-16 px-16 py-8 text-left"
                >
                  <HealthDot health={view.health} detail={view.healthDetail} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-semibold text-ink-navy">
                      {view.deal.name}
                    </span>
                    <span className="block text-caption text-slate-gray">
                      {view.stage.name} · {relativeToNow(view.deal.expectedCloseDate)}
                    </span>
                  </span>
                  <span className="text-body-sm font-semibold text-ink-navy">
                    {compactMoney(view.deal.value)}
                  </span>
                </button>
                {/* On the row, so an admin working down a list of at-risk deals can act without
                    opening each one. */}
                <NudgeButton
                  dealId={view.deal.id}
                  ownerId={view.deal.ownerId}
                  ownerName={ownerName(view.deal.ownerId)}
                  detail={view.healthDetail}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ActivityLogForm subjectType="lead" subjectId={lead.id} />

      <div>
        <h3 className="mb-16 text-body-lg font-semibold text-ink-navy">Activity</h3>
        <ActivityTimeline
          activities={activities}
          authorName={(id) => snapshot.people.find((p) => p.id === id)?.name ?? 'Unknown'}
        />
      </div>
    </div>
  )
}
