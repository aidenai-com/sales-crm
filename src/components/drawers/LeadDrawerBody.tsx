import { useMemo } from 'react'
import { pendingKey, useStore } from '@/data/store'
import { useDebouncedCommit } from '@/hooks/useDebouncedCommit'
import { useSelection } from '@/app/selection'
import { buildDealViews, rollUp } from '@/lib/rollup'
import { compactMoney, relativeToNow } from '@/lib/format'
import { HealthBadge, HealthDot } from '@/components/ui/Badge'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { ActivityLogForm } from './ActivityLogForm'
import { ActivityTimeline } from './ActivityTimeline'

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

  const saving = isPending(pendingKey.lead(leadId))
  const unitField = useDebouncedCommit(lead?.businessUnit ?? '', (businessUnit) =>
    updateLead(leadId, { businessUnit }),
  )

  if (!lead) return null

  const account = snapshot.accounts.find((a) => a.id === lead.accountId)
  const summary = rollUp(leadViews)

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
            onChange={(e) => unitField.onChange(e.target.value)}
            onBlur={unitField.onBlur}
          />
        </Field>
        <Field label="Owner">
          <Select
            value={lead.ownerId}
            disabled={saving}
            onChange={(e) => void updateLead(lead.id, { ownerId: e.target.value })}
          >
            {snapshot.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
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
            {leadViews.map((view) => (
              <li key={view.deal.id}>
                <button
                  onClick={() => select({ type: 'deal', id: view.deal.id })}
                  className="flex w-full items-center gap-16 rounded-lg border border-hairline px-16 py-8 text-left transition-colors hover:bg-pebble"
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
