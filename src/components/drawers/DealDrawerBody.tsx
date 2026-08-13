import { useMemo } from 'react'
import { pendingKey, useStore } from '@/data/store'
import { assignableOwners } from '@/lib/people'
import { ChampionWarning, useChampionGap } from '@/components/ui/ChampionWarning'
import { useSelection } from '@/app/selection'
import { Link, routes } from '@/app/router'
import { dealHealthDetail } from '@/lib/health'
import { fullMoney, relativeToNow } from '@/lib/format'
import { HealthBadge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Field, Select } from '@/components/ui/Field'
import { ActivityLogForm } from './ActivityLogForm'
import { ActivityTimeline } from './ActivityTimeline'
import { DealCloseDateField, DealValueField } from './DealFields'

/**
 * Deal detail and quick edit. Edits save on change and stay in place — no Save button
 * and no navigation, so a rep can adjust a value and carry on (spec 4.4).
 */
export function DealDrawerBody({ dealId }: { dealId: string }) {
  const { snapshot, updateDeal, isPending } = useStore()
  const { clear } = useSelection()
  const saving = isPending(pendingKey.deal(dealId))

  const deal = snapshot.deals.find((d) => d.id === dealId)
  const pipeline = snapshot.pipelines.find((p) => p.id === deal?.pipelineTemplateId)

  const activities = useMemo(
    () => snapshot.activities.filter((a) => a.subjectType === 'deal' && a.subjectId === dealId),
    [snapshot.activities, dealId],
  )

  if (!deal || !pipeline) return null

  const account = snapshot.accounts.find((a) => a.id === deal.accountId)
  const lead = deal.leadId ? snapshot.leads.find((l) => l.id === deal.leadId) : null
  const stage = pipeline.stages.find((s) => s.id === deal.stageId)
  const healthDetail = dealHealthDetail(deal, snapshot.activities)
  const championGap = useChampionGap(deal.id)

  return (
    <div className="space-y-24">
      {championGap && <ChampionWarning gap={championGap} />}

      <div className="flex flex-wrap items-center justify-between gap-8">
        <div className="flex flex-wrap items-center gap-8">
          <HealthBadge health={healthDetail.health} detail={healthDetail} />
          <span className="text-caption text-slate-gray">
            {pipeline.name} · closes {relativeToNow(deal.expectedCloseDate)}
          </span>
          {/* Sits next to the status so a save is visible without a layout shift. */}
          {saving && (
            <span className="inline-flex items-center gap-8 text-caption text-signal-blue">
              <Spinner label="Saving" />
              Saving
            </span>
          )}
        </div>

        {/*
          The drawer stays the quick-edit surface (spec 7.1). This is the deliberate exit
          to the full page for a proper review, and it is a real link so it can be copied
          and shared.
        */}
        <Link
          to={routes.deal(deal.id)}
          onClick={clear}
          className="inline-flex shrink-0 items-center gap-8 text-body-sm font-semibold text-ink-navy underline decoration-hairline underline-offset-4 hover:decoration-signal-blue"
        >
          Open full view
          <svg viewBox="0 0 16 16" className="size-16" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M6 3h7v7M13 3L6.5 9.5M11 13H3V5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </div>

      <div className="rounded-2xl bg-cloud p-16">
        <p className="text-caption font-semibold tracking-wide text-slate-gray uppercase">Value</p>
        <p className="mt-8 text-subheading font-bold text-ink-navy">
          {fullMoney(deal.value)}
        </p>
        <p className="mt-8 text-caption text-slate-gray">
          {stage?.probability ?? 0}% probability at {stage?.name ?? 'unknown stage'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-16">
        <Field label="Stage">
          <Select
            value={deal.stageId}
            disabled={saving}
            onChange={(e) => void updateDeal(deal.id, { stageId: e.target.value })}
          >
            {[...pipeline.stages]
              .sort((a, b) => a.position - b.position)
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
          </Select>
        </Field>

        <Field label="Owner">
          <Select
            value={deal.ownerId}
            disabled={saving}
            onChange={(e) => void updateDeal(deal.id, { ownerId: e.target.value })}
          >
            {assignableOwners(snapshot.people, deal.ownerId).map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </Field>

        <DealValueField deal={deal} />
        <DealCloseDateField deal={deal} />
      </div>

      {/* No Partner row. A deal has no partner field — who else is involved shows in its people, on the
          deal page's People panel, where each person's own company is named. */}

      <div className="rounded-2xl border border-hairline p-16">
        <dl className="space-y-8">
          <Row label="Customer" value={account?.name ?? '—'} />
          <Row label="Business unit" value={lead?.businessUnit ?? 'Not tied to a lead'} />
          <Row label="Industry" value={account?.industry ?? '—'} />
        </dl>
      </div>

      <ActivityLogForm subjectType="deal" subjectId={deal.id} />

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-16">
      <dt className="text-body-sm text-slate-gray">{label}</dt>
      <dd className="text-right text-body-sm font-semibold text-ink-navy">{value}</dd>
    </div>
  )
}
