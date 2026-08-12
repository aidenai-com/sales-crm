import { useEffect, useMemo, useState } from 'react'
import { pendingKey, useStore } from '@/data/store'
import { assignableOwners } from '@/lib/people'
import { useSelection } from '@/app/selection'
import { useAuth } from '@/app/auth'
import { Link, routes, useRouter } from '@/app/router'
import { buildDealViews } from '@/lib/rollup'
import { fullDate, fullMoney, relativeToNow, timeAgo } from '@/lib/format'
import { useChecklist } from '@/hooks/useChecklist'
import { HealthBadge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Field, Select } from '@/components/ui/Field'
import { Spinner, LoadingPanel } from '@/components/ui/Spinner'
import { DealCloseDateField, DealNameField, DealValueField } from '@/components/drawers/DealFields'
import { ActivityLogForm } from '@/components/drawers/ActivityLogForm'
import { ActivityTimeline } from '@/components/drawers/ActivityTimeline'
import { StageRail } from './StageRail'
import { StagePlaybook } from './StagePlaybook'
import { StageChecklistPanel } from './StageChecklistPanel'
import { DealPeoplePanel } from './DealPeoplePanel'

/**
 * Full deal view at /deals/:dealId.
 *
 * The drawer stays the quick-edit surface for in-flow changes (spec 7.1); this page is
 * for a proper review — deep-linkable, shareable, and roomy enough for the stage rail,
 * the methodology playbook, and the whole activity history at once.
 */
export function DealPage({ dealId }: { dealId: string }) {
  const { snapshot, updateDeal, moveDealToStage, status, isPending } = useStore()
  const { select } = useSelection()
  const { navigate } = useRouter()
  const { user, isAdmin } = useAuth()

  const views = useMemo(() => buildDealViews(snapshot), [snapshot])
  const view = views.find((v) => v.deal.id === dealId)
  const saving = isPending(pendingKey.deal(dealId))

  const checklist = useChecklist(dealId)

  /**
   * Which stage the checklist panel is showing, independent of where the deal is.
   *
   * Starts on the deal's current stage, which is what a rep opening the page wants to see,
   * and follows it when the deal moves — after an auto-advance, leaving the panel on the
   * stage just completed would hide the checklist that now needs work.
   */
  const [selectedStageId, setSelectedStageId] = useState(view?.deal.stageId ?? '')
  const currentStageId = view?.deal.stageId

  useEffect(() => {
    if (currentStageId) setSelectedStageId(currentStageId)
  }, [currentStageId])

  const activities = useMemo(
    () => snapshot.activities.filter((a) => a.subjectType === 'deal' && a.subjectId === dealId),
    [snapshot.activities, dealId],
  )

  /** Per-stage progress for the rail, so each stage shows how much of it is done. */
  const completion = useMemo(() => {
    const map: Record<string, { complete: number; total: number }> = {}
    for (const stage of checklist.checklist?.stages ?? []) {
      map[stage.stageId] = { complete: stage.completeCount, total: stage.totalCount }
    }
    return map
  }, [checklist.checklist])

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-page px-24 py-96">
        <LoadingPanel message="Loading this deal" />
      </div>
    )
  }

  if (!view) {
    return (
      <div className="mx-auto max-w-page px-24 py-96">
        <EmptyState
          title="That deal no longer exists"
          hint="It may have been removed. Head back to the pipeline to find what you need."
        />
        <div className="mt-24 flex justify-center">
          <Button onClick={() => navigate(routes.deals)}>Back to all deals</Button>
        </div>
      </div>
    )
  }

  const { deal, account, lead, stage, pipeline } = view
  const weighted = (deal.value * stage.probability) / 100

  // Falls back to the deal's own stage: the selection is only ever a stage of this pipeline,
  // but a pipeline edited in another tab could remove the one being viewed.
  const selectedStage =
    pipeline.stages.find((s) => s.id === selectedStageId) ?? stage
  const selectedChecklist = checklist.checklist?.stages.find(
    (s) => s.stageId === selectedStage.id,
  )

  return (
    <div className="mx-auto max-w-page px-24 pb-96">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-8 pt-24 text-body-sm">
        <Link to={routes.deals} className="text-slate-gray hover:text-signal-blue">
          Deals
        </Link>
        <span className="text-mist-gray" aria-hidden="true">
          /
        </span>
        <button
          onClick={() => select({ type: 'account', id: account.id })}
          className="text-slate-gray hover:text-signal-blue"
        >
          {account.name}
        </button>
        <span className="text-mist-gray" aria-hidden="true">
          /
        </span>
        <span className="font-semibold text-ink-navy">{deal.name}</span>
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-24 pt-24 pb-32">
        <div className="min-w-0">
          <div className="mb-16 flex flex-wrap items-center gap-8">
            <HealthBadge health={view.health} detail={view.healthDetail} />
            <span className="rounded-full bg-pebble px-8 py-[4px] text-caption font-medium text-slate-gray">
              {pipeline.name}
            </span>
            <span className="text-caption text-slate-gray">
              Closes {fullDate(deal.expectedCloseDate)} · {relativeToNow(deal.expectedCloseDate)}
            </span>
            {saving && (
              <span className="inline-flex items-center gap-8 text-caption text-signal-blue">
                <Spinner label="Saving" />
                Saving
              </span>
            )}
          </div>

          <h1 className="text-heading-sm font-bold text-ink-navy">{deal.name}</h1>

          <p className="mt-8 text-body-lg text-slate-gray">
            <button
              onClick={() => select({ type: 'account', id: account.id })}
              className="font-semibold text-ink-navy hover:text-signal-blue"
            >
              {account.name}
            </button>
            {lead && (
              <>
                {' · '}
                <button
                  onClick={() => select({ type: 'lead', id: lead.id })}
                  className="hover:text-signal-blue"
                >
                  {lead.businessUnit}
                </button>
              </>
            )}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-caption font-semibold tracking-wide text-slate-gray uppercase">Value</p>
          <p className="mt-8 text-heading-sm font-bold text-ink-navy tabular-nums">
            {fullMoney(deal.value)}
          </p>
          <p className="mt-8 text-caption text-slate-gray tabular-nums">
            {fullMoney(weighted)} weighted at {stage.probability}%
          </p>
        </div>
      </header>

      <Card className="mb-24">
        <div className="mb-16 flex flex-wrap items-baseline justify-between gap-8">
          <h2 className="text-body-lg font-semibold text-ink-navy">
            Stages
            <span className="ml-8 text-body-sm font-medium text-slate-gray">
              currently {stage.name}
            </span>
          </h2>
          {/* The rail no longer moves the deal, so say what it does. Without this the change
              in behaviour reads as the click having stopped working. */}
          <p className="text-caption text-mist-gray">
            Select a stage to see its checklist and documents
          </p>
        </div>
        <StageRail
          pipeline={pipeline}
          currentStageId={deal.stageId}
          selectedStageId={selectedStageId || deal.stageId}
          onSelect={setSelectedStageId}
          completion={completion}
        />
      </Card>

      <div className="grid gap-24 lg:grid-cols-[1fr_380px]">
        <div className="space-y-24">
          <ErrorBanner message={checklist.error} onDismiss={() => void checklist.reload()} />

          {checklist.loading && !checklist.checklist ? (
            <Card>
              <LoadingPanel message="Loading this deal's checklist" />
            </Card>
          ) : (
            <StageChecklistPanel
              stage={selectedStage}
              checklist={selectedChecklist}
              isCurrentStage={selectedStage.id === deal.stageId}
              // Mirrors the API rule: a rep edits their own deals, an admin edits any.
              canEdit={isAdmin || deal.ownerId === user?.id}
              pendingDeliverableId={checklist.pendingDeliverableId}
              uploadingDeliverableId={checklist.uploadingDeliverableId}
              onToggle={(id, complete) => void checklist.toggle(id, complete)}
              onUpload={(id, file) => void checklist.upload(id, file)}
              onDownload={(id, filename) => void checklist.download(id, filename)}
              onRemoveAttachment={(id) => void checklist.removeAttachment(id)}
              moving={saving}
              onMoveDealHere={async () => {
                await moveDealToStage(deal.id, selectedStage.id)
                await checklist.reload()
              }}
            />
          )}

          {/* Above the playbook and the timeline: who is on the deal is read far more often than the
              stage's reference criteria, and it is now the only place a partner appears at all. */}
          <DealPeoplePanel
            dealId={deal.id}
            accountId={account.id}
            accountName={account.name}
            canEdit={isAdmin || deal.ownerId === user?.id}
          />

          <StagePlaybook stage={selectedStage} />

          <Card>
            <h2 className="mb-16 text-body-lg font-semibold text-ink-navy">Activity</h2>
            <div className="mb-24">
              <ActivityLogForm subjectType="deal" subjectId={deal.id} />
            </div>
            <ActivityTimeline
              activities={activities}
              authorName={(id) => snapshot.people.find((p) => p.id === id)?.name ?? 'Unknown'}
            />
          </Card>
        </div>

        <aside className="space-y-24">
          <Card>
            <h2 className="mb-16 text-body-lg font-semibold text-ink-navy">Details</h2>
            <div className="space-y-16">
              <DealNameField deal={deal} />
              <DealValueField deal={deal} />
              <DealCloseDateField deal={deal} />

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

            </div>
          </Card>

          <Card>
            <h2 className="mb-16 text-body-lg font-semibold text-ink-navy">Context</h2>
            <dl className="space-y-8">
              <Fact label="Customer" value={account.name} />
              <Fact label="Industry" value={account.industry} />
              <Fact label="Business unit" value={lead?.businessUnit ?? 'Not tied to a lead'} />
              <Fact label="Owner" value={view.ownerName} />
              <Fact label="Stage probability" value={`${stage.probability}%`} />
              <Fact
                label="Last touched"
                value={activities[0] ? timeAgo(activities[0].occurredAt) : 'Never'}
              />
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-16 border-b border-hairline pb-8 last:border-0 last:pb-0">
      <dt className="text-body-sm text-slate-gray">{label}</dt>
      <dd className="text-right text-body-sm font-semibold text-ink-navy">{value}</dd>
    </div>
  )
}
