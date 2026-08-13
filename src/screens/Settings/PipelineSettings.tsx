import { useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable'
import type { NewStage } from '@/api/endpoints'
import { pendingKey, useStore } from '@/data/store'
import { useAuth } from '@/app/auth'
import { useDebouncedCommit } from '@/hooks/useDebouncedCommit'
import { Link, routes } from '@/app/router'
import { bucketByStage, buildDealViews } from '@/lib/rollup'
import { compactMoney } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Field, TextInput } from '@/components/ui/Field'
import { Skeleton } from '@/components/ui/Skeleton'
import { cn } from '@/lib/cn'
import { StageEditor } from './StageEditor'
import { SortableStage } from './SortableStage'
import { CreatePipelinePanel } from './CreatePipelinePanel'

/**
 * Settings -> Pipelines (spec 6.3).
 *
 * Pipelines are data, so this screen is why no board hardcodes a stage list: add, rename,
 * reorder, recolour or delete a stage here and every board, table and deal page follows
 * without a code change (spec 9).
 *
 * Laid out as a rail plus an editor rather than tabs, because there is no longer a fixed
 * number of pipelines to tab between — the rail takes an arbitrary list without overflowing
 * and shows each pipeline's size at a glance.
 */
export function PipelineSettings() {
  const store = useStore()
  const { snapshot, status } = store
  const { isAdmin } = useAuth()

  const [activeId, setActiveId] = useState('')
  const [addingStage, setAddingStage] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )

  const views = useMemo(() => buildDealViews(snapshot), [snapshot])
  const pipeline = snapshot.pipelines.find((p) => p.id === activeId) ?? snapshot.pipelines[0]

  const ordered = useMemo(
    () => (pipeline ? [...pipeline.stages].sort((a, b) => a.position - b.position) : []),
    [pipeline],
  )

  const buckets = useMemo(
    () => (pipeline ? bucketByStage(pipeline, views.filter((v) => v.pipeline.id === pipeline.id)) : []),
    [pipeline, views],
  )

  const nameField = useDebouncedCommit(pipeline?.name ?? '', (name) => {
    if (pipeline) void store.updateTemplate(pipeline.id, { name })
  })

  // Once the snapshot arrives, settle on a selection rather than leaving the rail unlit.
  useEffect(() => {
    if (!activeId && snapshot.pipelines.length > 0) setActiveId(snapshot.pipelines[0].id)
  }, [activeId, snapshot.pipelines])

  const dealCountFor = (stageId: string) =>
    buckets.find((b) => b.stage.id === stageId)?.views.length ?? 0

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !pipeline) return

    const to = ordered.findIndex((s) => s.id === over.id)
    if (to !== -1) void store.reorderStage(pipeline.id, String(active.id), to)
  }

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-page px-24 pb-96">
        <div className="py-32">
          <Skeleton className="h-40 w-[180px]" />
          <Skeleton className="mt-8 h-16 w-[420px]" />
        </div>
        <div className="grid gap-24 lg:grid-cols-[260px_1fr]">
          <Skeleton className="h-[280px] rounded-3xl" />
          <Skeleton className="h-[420px] rounded-3xl" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-page px-24 pb-96">
      <div className="flex flex-wrap items-end justify-between gap-16 py-32">
        <div>
          <h1 className="text-heading-sm font-bold text-ink-navy">Pipelines</h1>
          <p className="mt-8 max-w-[640px] text-body text-slate-gray">
            Each pipeline has its own stages, and a deal belongs to exactly one. Anything you
            change here reshapes the board, the deals table and every deal page immediately.
          </p>
        </div>

        <div className="flex items-center gap-16">
          <Link
            to={routes.pipeline}
            className="text-body-sm font-semibold text-ink-navy underline decoration-hairline underline-offset-4 hover:decoration-signal-blue"
          >
            Back to the board
          </Link>
          {isAdmin && (
            <CreatePipelinePanel pipelines={snapshot.pipelines} onCreated={() => setActiveId('')} />
          )}
        </div>
      </div>

      {!isAdmin && (
        <p className="mb-24 rounded-2xl border border-hairline bg-pebble px-24 py-16 text-body-sm text-slate-gray">
          You are signed in as a sales rep, so this page is read-only. Pipelines are managed by an
          administrator.
        </p>
      )}

      {!pipeline ? (
        <Card className="text-center">
          <h2 className="text-subheading font-bold text-ink-navy">No pipelines yet</h2>
          <p className="mx-auto mt-8 max-w-[420px] text-body-sm text-slate-gray">
            A pipeline defines the stages a deal moves through. Create one to start tracking
            opportunities.
          </p>
        </Card>
      ) : (
        <div className="grid gap-24 lg:grid-cols-[260px_1fr]">
          <PipelineRail
            pipelines={snapshot.pipelines}
            activeId={pipeline.id}
            onSelect={setActiveId}
            dealCount={(id) => views.filter((v) => v.pipeline.id === id).length}
          />

          <Card>
            <div className="mb-24 flex flex-wrap items-end justify-between gap-16">
              <div className="min-w-[240px] flex-1">
                <Field label="Pipeline name">
                  <TextInput
                    value={nameField.value}
                    disabled={!isAdmin}
                    onChange={(e) => nameField.onChange(e.target.value)}
                    onBlur={nameField.onBlur}
                  />
                </Field>
              </div>

              {isAdmin && (
                <label className="flex cursor-pointer items-center gap-8 text-body-sm text-slate-gray">
                  <input
                    type="checkbox"
                    checked={pipeline.tracksPartner}
                    onChange={(e) =>
                      void store.updateTemplate(pipeline.id, { tracksPartner: e.target.checked })
                    }
                    className="size-16 rounded-md accent-signal-blue"
                  />
                  Involves a partner
                </label>
              )}
            </div>

            <div className="mb-16 flex items-center justify-between gap-16">
              <h2 className="text-body-lg font-semibold text-ink-navy">
                Stages <span className="text-body-sm font-medium text-mist-gray">{ordered.length}</span>
              </h2>
              {isAdmin && !addingStage && (
                <Button variant="outline" size="sm" onClick={() => setAddingStage(true)}>
                  Add stage
                </Button>
              )}
            </div>

            {/* A form rather than a one-click add, because a new stage's champion requirement can only be
                set now. One click that silently created an ungated stage would make the only moment the
                decision is available the one moment nobody is asked to make it. */}
            {addingStage && (
              <AddStageForm
                saving={store.isPending(pendingKey.pipeline(pipeline.id))}
                onCancel={() => setAddingStage(false)}
                onAdd={async (stage) => {
                  await store.addStage(pipeline.id, stage)
                  setAddingStage(false)
                }}
              />
            )}

            {isAdmin && (
              <p className="mb-16 text-caption text-slate-gray">
                Drag a stage by its handle to reorder, or focus the handle and use the arrow keys.
              </p>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={ordered.map((s) => s.id)} strategy={verticalListSortingStrategy}>
                <ol className="space-y-8">
                  {ordered.map((stage) => (
                    <SortableStage key={stage.id} id={stage.id} disabled={!isAdmin}>
                      {(handle, dragging) => (
                        <StageEditor
                          stage={stage}
                          dealCount={dealCountFor(stage.id)}
                          otherStages={ordered.filter((s) => s.id !== stage.id)}
                          pending={store.isPending(pendingKey.stage(stage.id))}
                          readOnly={!isAdmin}
                          handle={handle}
                          dragging={dragging}
                          onPatch={(patch) => void store.updateStage(pipeline.id, stage.id, patch)}
                          onDelete={() => store.deleteStage(pipeline.id, stage.id)}
                          onReassign={async (toStageId) => {
                            // Sequential: the delete only succeeds once the stage is empty.
                            await store.reassignDeals(pipeline.id, stage.id, toStageId)
                            await store.deleteStage(pipeline.id, stage.id)
                          }}
                        />
                      )}
                    </SortableStage>
                  ))}
                </ol>
              </SortableContext>
            </DndContext>

            <div className="mt-24 flex flex-wrap items-center justify-between gap-16 border-t border-hairline pt-24">
              <p className="text-caption text-slate-gray">
                {compactMoney(buckets.reduce((sum, b) => sum + b.value, 0))} across{' '}
                {views.filter((v) => v.pipeline.id === pipeline.id).length} deals
              </p>
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={store.isPending(pendingKey.pipeline(pipeline.id))}
                  onClick={() => void store.duplicateTemplate(pipeline.id, `${pipeline.name} copy`)}
                >
                  Duplicate this pipeline
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

/** The list of pipelines. Scales to any number without the overflow a tab strip would hit. */
function PipelineRail({
  pipelines,
  activeId,
  onSelect,
  dealCount,
}: {
  pipelines: Array<{ id: string; name: string; tracksPartner: boolean; stages: unknown[] }>
  activeId: string
  onSelect: (id: string) => void
  dealCount: (id: string) => number
}) {
  return (
    <nav aria-label="Pipelines" className="lg:sticky lg:top-96 lg:self-start">
      <ul className="space-y-8">
        {pipelines.map((p) => {
          const active = p.id === activeId
          return (
            <li key={p.id}>
              <button
                onClick={() => onSelect(p.id)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'w-full rounded-2xl border px-16 py-16 text-left',
                  'transition-[background-color,border-color,box-shadow] duration-(--duration-hover) ease-ui',
                  active
                    ? 'border-signal-blue bg-badge-fill shadow-sm'
                    : 'border-hairline bg-paper hover:border-mist-gray hover:bg-pebble',
                )}
              >
                <span className="block truncate text-body-sm font-semibold text-ink-navy">
                  {p.name}
                </span>
                <span className="mt-[2px] block text-caption text-slate-gray">
                  {p.stages.length} stages · {dealCount(p.id)} deals
                </span>
                {p.tracksPartner && (
                  <span className="mt-8 inline-flex rounded-full bg-pebble px-8 py-[2px] text-caption font-medium text-slate-gray">
                    Partner
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}


/**
 * Adding a stage to a pipeline that already exists.
 *
 * **No champion setting here, and there cannot be one.** The gate is a *position* on the pipeline, so a
 * stage inserted into the middle would change what that position means for every deal already past it — a
 * deal at stage 4 would find itself at stage 5 under a rule it was never judged against. The gate is fixed
 * when the pipeline is created, and this form deliberately cannot reach it.
 *
 * `expectedDays` is here, because an expectation carries none of that weight: nothing is refused for
 * exceeding it, so adding or revising one re-reads history rather than rewriting it.
 */
function AddStageForm({
  saving,
  onCancel,
  onAdd,
}: {
  saving: boolean
  onCancel: () => void
  onAdd: (stage: NewStage) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [probability, setProbability] = useState(50)
  const [expectedDays, setExpectedDays] = useState(21)

  const trimmed = name.trim()

  return (
    <form
      className="mb-16 rounded-xl border border-signal-blue bg-cloud p-16"
      onSubmit={(event) => {
        event.preventDefault()
        if (!trimmed || saving) return
        void onAdd({ name: trimmed, probability, expectedDays })
      }}
    >
      <div className="flex flex-wrap items-end gap-12">
        <label className="min-w-[200px] flex-1">
          <span className="mb-[4px] block text-caption font-semibold text-slate-gray">Stage name</span>
          <TextInput
            autoFocus
            value={name}
            disabled={saving}
            placeholder="Technical validation"
            onChange={(event) => setName(event.target.value)}
          />
        </label>

        <label className="w-96">
          <span className="mb-[4px] block text-caption font-semibold text-slate-gray">Win %</span>
          <TextInput
            type="number"
            min={0}
            max={100}
            value={probability}
            disabled={saving}
            onChange={(event) =>
              setProbability(Math.max(0, Math.min(100, Number(event.target.value))))
            }
          />
        </label>
      </div>

      <label className="mt-16 block">
        <span className="mb-[4px] block text-caption font-semibold text-slate-gray">
          Expected days in this stage
        </span>
        <TextInput
          type="number"
          min={1}
          max={365}
          value={expectedDays}
          disabled={saving}
          onChange={(event) =>
            setExpectedDays(Math.max(1, Math.min(365, Number(event.target.value))))
          }
          className="w-96!"
        />
        <span className="mt-[4px] block max-w-[520px] text-caption text-slate-gray">
          How long a deal should take to clear this stage. Nothing is refused for running over — it is what
          makes a stalled deal visible. Editable later, unlike the champion gate.
        </span>
      </label>

      <div className="mt-16 flex items-center gap-8">
        <Button type="submit" size="sm" loading={saving} disabled={!trimmed || saving}>
          Add stage
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
