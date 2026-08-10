import { useCallback, useMemo, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import { pendingKey, useStore } from '@/data/store'
import { useCreation } from '@/app/creation'
import { useAuth } from '@/app/auth'
import { bucketByStage, buildDealViews } from '@/lib/rollup'
import { dealRows } from '@/lib/export'
import { compactMoney } from '@/lib/format'
import { Tabs } from '@/components/ui/Tabs'
import { Button } from '@/components/ui/Button'
import { ExportButton } from '@/components/ui/ExportButton'
import { TextInput } from '@/components/ui/Field'
import { Skeleton, SkeletonBoard } from '@/components/ui/Skeleton'
import { Link, routes } from '@/app/router'
import { StageColumn } from './StageColumn'

/**
 * The primary daily workspace (spec 4.2).
 *
 * Stage advancement is a plain manual move — no exit-criteria gating, per spec 6.4, even
 * though every stage record carries its criteria from the AidenAI methodology.
 */
export function PipelineBoard() {
  const { snapshot, moveDealToStage, status, isPending } = useStore()
  const { openCreate } = useCreation()
  const { user, isAdmin } = useAuth()
  const [pipelineId, setPipelineId] = useState('')
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor),
  )

  const views = useMemo(() => buildDealViews(snapshot), [snapshot])
  const pipeline = snapshot.pipelines.find((p) => p.id === pipelineId) ?? snapshot.pipelines[0]

  const visible = useMemo(() => {
    if (!pipeline) return []
    const inPipeline = views.filter((v) => v.pipeline.id === pipeline.id)
    const q = query.trim().toLowerCase()
    if (!q) return inPipeline
    return inPipeline.filter(
      (v) =>
        v.deal.name.toLowerCase().includes(q) ||
        v.account.name.toLowerCase().includes(q) ||
        v.ownerName.toLowerCase().includes(q) ||
        (v.partner?.name.toLowerCase().includes(q) ?? false),
    )
  }, [views, pipeline, query])

  const buckets = useMemo(() => (pipeline ? bucketByStage(pipeline, visible) : []), [pipeline, visible])

  const openValue = visible.filter((v) => v.isOpen).reduce((sum, v) => sum + v.deal.value, 0)

  const toggleCollapse = useCallback((stageId: string) => {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(stageId)) next.delete(stageId)
      else next.add(stageId)
      return next
    })
  }, [])

  /** Collapses every stage holding no deals — the common case on a wide board. */
  const collapseEmpty = useCallback(() => {
    setCollapsed(new Set(buckets.filter((b) => b.views.length === 0).map((b) => b.stage.id)))
  }, [buckets])

  function onDragEnd(event: DragEndEvent) {
    const dealId = String(event.active.id)
    const stageId = event.over ? String(event.over.id) : null
    if (stageId) moveDealToStage(dealId, stageId)
  }

  if (status === 'loading') {
    return (
      <div className="mx-auto max-w-page px-24 pb-96">
        <div className="py-32">
          <Skeleton className="h-40 w-[180px]" />
          <Skeleton className="mt-8 h-16 w-[420px]" />
        </div>
        <div className="mb-24 flex items-center justify-between gap-16">
          <Skeleton className="h-40 w-[280px] rounded-lg" />
          <Skeleton className="h-40 w-[300px] rounded-lg" />
        </div>
        <div className="-mx-24 overflow-hidden px-24">
          <SkeletonBoard />
        </div>
      </div>
    )
  }

  if (!pipeline) return null

  const emptyCount = buckets.filter((b) => b.views.length === 0).length

  return (
    <div className="mx-auto max-w-page px-24 pb-96">
      <div className="flex flex-wrap items-end justify-between gap-16 py-32">
        <div>
          <h1 className="text-heading-sm font-bold text-ink-navy">Pipeline</h1>
          <p className="mt-8 text-body text-slate-gray">
            Drag a card, or use its menu to send it straight to any stage.
          </p>
        </div>
        <Link
          to={routes.pipelines}
          className="text-body-sm font-semibold text-ink-navy underline decoration-hairline underline-offset-4 hover:decoration-signal-blue"
        >
          Edit pipelines
        </Link>
      </div>

      <div className="mb-24 flex flex-wrap items-center justify-between gap-16">
        {/* R6: two separate pipelines, each with its own stages. */}
        <Tabs
          ariaLabel="Pipeline"
          activeId={pipeline.id}
          onChange={(id) => {
            setPipelineId(id)
            setCollapsed(new Set())
          }}
          items={snapshot.pipelines.map((p) => ({
            id: p.id,
            label: p.name,
            count: views.filter((v) => v.pipeline.id === p.id).length,
          }))}
        />

        <div className="flex flex-wrap items-center gap-16">
          <TextInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by deal, customer, partner, or owner"
            aria-label="Filter deals on this board"
            className="w-[300px]"
          />
          <ExportButton
            sheets={[{ name: pipeline.name, rows: dealRows(visible) }]}
            filenameBase={`pipeline-${pipeline.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
          />
          <Button
            size="sm"
            onClick={() => openCreate({ kind: 'deal', pipelineId: pipeline.id })}
          >
            New deal
          </Button>
        </div>
      </div>

      <div className="mb-16 flex flex-wrap items-center justify-between gap-16">
        <p className="text-body-sm text-slate-gray">
          {visible.length} {visible.length === 1 ? 'deal' : 'deals'} ·{' '}
          <span className="font-semibold text-ink-navy">{compactMoney(openValue)}</span> open value
          {query && ' in this filter'}
        </p>

        <div className="flex items-center gap-8">
          {emptyCount > 0 && (
            <Button variant="ghost" size="sm" onClick={collapseEmpty}>
              Collapse {emptyCount} empty
            </Button>
          )}
          {collapsed.size > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setCollapsed(new Set())}>
              Expand all
            </Button>
          )}
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        {/*
          design.md caps the page at 1200px. Six stages do not fit at a readable width, so
          the stage strip scrolls horizontally inside that container rather than widening
          it. Collapsing columns and the per-card move menu are what keep that bearable.
        */}
        <div className="-mx-24 overflow-x-auto px-24 pb-16">
          <div className="flex items-stretch gap-16">
            {buckets.map((bucket) => (
              <StageColumn
                key={bucket.stage.id}
                bucket={bucket}
                collapsed={collapsed.has(bucket.stage.id)}
                onToggleCollapse={() => toggleCollapse(bucket.stage.id)}
                onMoveDeal={(dealId, stageId) => void moveDealToStage(dealId, stageId)}
                isDealPending={(dealId) => isPending(pendingKey.deal(dealId))}
                canMoveDeal={(ownerId) => isAdmin || ownerId === user?.id}
                onAddDeal={() =>
                  openCreate({ kind: 'deal', pipelineId: pipeline.id, stageId: bucket.stage.id })
                }
              />
            ))}
          </div>
        </div>
      </DndContext>
    </div>
  )
}
