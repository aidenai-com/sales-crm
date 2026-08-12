import { useMemo } from 'react'
import { pendingKey, useStore } from '@/data/store'
import { assignableOwners } from '@/lib/people'
import { useDebouncedCommit } from '@/hooks/useDebouncedCommit'
import { useAuth } from '@/app/auth'
import { useSelection } from '@/app/selection'
import { useCreation } from '@/app/creation'
import { Button } from '@/components/ui/Button'
import { buildDealViews, rollUp } from '@/lib/rollup'
import { compactMoney } from '@/lib/format'
import { HealthBadge } from '@/components/ui/Badge'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { ActivityLogForm } from './ActivityLogForm'
import { ActivityTimeline } from './ActivityTimeline'

export function AccountDrawerBody({ accountId }: { accountId: string }) {
  const { snapshot, updateAccount, isPending } = useStore()
  const { isAdmin } = useAuth()
  const { select } = useSelection()
  const { openCreate } = useCreation()

  const account = snapshot.accounts.find((a) => a.id === accountId)

  const views = useMemo(() => buildDealViews(snapshot), [snapshot])
  const accountViews = useMemo(
    () => views.filter((v) => v.deal.accountId === accountId),
    [views, accountId],
  )

  const activities = useMemo(
    () => snapshot.activities.filter((a) => a.subjectType === 'account' && a.subjectId === accountId),
    [snapshot.activities, accountId],
  )

  const saving = isPending(pendingKey.account(accountId))
  const nameField = useDebouncedCommit(account?.name ?? '', (name) =>
    updateAccount(accountId, { name }),
  )
  const industryField = useDebouncedCommit(account?.industry ?? '', (industry) =>
    updateAccount(accountId, { industry }),
  )

  if (!account) return null

  const leads = snapshot.leads.filter((l) => l.accountId === accountId)
  const summary = rollUp(accountViews)

  return (
    <div className="space-y-24">
      <div className="flex flex-wrap items-center gap-8">
        <HealthBadge health={summary.health} />
        <span className="text-caption text-slate-gray">
          {summary.openCount} open deals · {compactMoney(summary.openValue)} in play
        </span>
      </div>

      <div className="grid grid-cols-2 gap-16">
        <Field label="Account name">
          <TextInput
            value={nameField.value}
            onChange={(e) => nameField.onChange(e.target.value)}
            onBlur={nameField.onBlur}
          />
        </Field>
        <Field label="Industry">
          <TextInput
            value={industryField.value}
            onChange={(e) => industryField.onChange(e.target.value)}
            onBlur={industryField.onBlur}
          />
        </Field>
      </div>

      {/* Reassignment is an administrator's call — `require_no_owner_change` refuses anyone else. The
          select used to be shown to everybody, so a rep changing it got a 403 for using a control the
          app had offered them. Reps see who owns it instead, which is the part they actually need. */}
      <Field label="Owner">
        {isAdmin ? (
          <Select
            value={account.ownerId}
            disabled={saving}
            onChange={(e) => void updateAccount(account.id, { ownerId: e.target.value })}
          >
            {assignableOwners(snapshot.people, account.ownerId).map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        ) : (
          <p className="px-12 py-8 text-body-sm text-slate-gray">
            {snapshot.people.find((person) => person.id === account.ownerId)?.name ?? 'Unassigned'}
          </p>
        )}
      </Field>

      <div>
        <div className="mb-16 flex items-center justify-between gap-16">
          <h3 className="text-body-lg font-semibold text-ink-navy">
            Leads <span className="text-body-sm font-medium text-mist-gray">{leads.length}</span>
          </h3>
          <div className="flex items-center gap-8">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openCreate({ kind: 'lead', accountId: account.id })}
            >
              Add unit
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => openCreate({ kind: 'deal', accountId: account.id })}
            >
              New deal
            </Button>
          </div>
        </div>
        {leads.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-hairline bg-cloud px-16 py-24 text-center text-body-sm text-slate-gray">
            No leads on this account yet.
          </p>
        ) : (
          <ul className="space-y-8">
            {leads.map((lead) => {
              const leadSummary = rollUp(accountViews.filter((v) => v.deal.leadId === lead.id))
              return (
                <li key={lead.id}>
                  <button
                    onClick={() => select({ type: 'lead', id: lead.id })}
                    className="flex w-full items-center gap-16 rounded-lg border border-hairline px-16 py-8 text-left transition-colors hover:bg-pebble"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-semibold text-ink-navy">
                        {lead.businessUnit}
                      </span>
                      <span className="block text-caption text-slate-gray">
                        {leadSummary.openCount} open · {compactMoney(leadSummary.openValue)}
                      </span>
                    </span>
                    <HealthBadge health={leadSummary.health} />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <ActivityLogForm subjectType="account" subjectId={account.id} />

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
