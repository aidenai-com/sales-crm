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
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  loading={store.isPending(pendingKey.pipeline(pipeline.id))}
                  onClick={() => void store.addStage(pipeline.id)}
                >
                  Add stage
                </Button>
              )}
            </div>

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
