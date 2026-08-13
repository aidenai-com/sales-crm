import { useState, type ReactNode } from 'react'
import type { Stage, StageKind } from '@/types/domain'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'

/** A palette rather than a free colour picker, so boards stay legible and on-brand. */
const SWATCHES = [
  '#a6bbd1',
  '#7ba7d0',
  '#4a90e2',
  '#0099ff',
  '#006bff',
  '#004eba',
  '#0b3558',
  '#c8324f',
]

const KINDS: Array<{ id: StageKind; label: string; hint: string }> = [
  { id: 'open', label: 'Open', hint: 'Counts toward open pipeline value' },
  { id: 'won', label: 'Won', hint: 'Closed successfully; leaves open pipeline' },
  { id: 'lost', label: 'Lost', hint: 'Closed unsuccessfully; leaves open pipeline' },
]

export interface StageEditorProps {
  stage: Stage
  dealCount: number
  otherStages: Stage[]
  pending: boolean
  /** Reps see the pipeline but cannot change it (spec 6.3). */
  readOnly: boolean
  /** Drag affordance supplied by the sortable wrapper. */
  handle: ReactNode
  dragging: boolean
  onPatch: (
    patch: Partial<
      Pick<
        Stage,
        // No champion field: the gate is a position on the pipeline, fixed at creation, and the API
        // refuses it on an update.
        'name' | 'shortName' | 'probability' | 'color' | 'kind' | 'wipLimit' | 'expectedDays'
      >
    >,
  ) => void
  onDelete: () => Promise<{ deleted: boolean; reason?: string; message?: string }>
  onReassign: (toStageId: string) => Promise<void>
}

/**
 * One stage as an expandable node: collapsed it is a draggable row, expanded it is the
 * full configuration for that stage.
 */
export function StageEditor({
  stage,
  dealCount,
  otherStages,
  pending,
  readOnly,
  handle,
  dragging,
  onPatch,
  onDelete,
  onReassign,
}: StageEditorProps) {
  const [open, setOpen] = useState(false)
  const [blocked, setBlocked] = useState<string | null>(null)
  const [reassignTo, setReassignTo] = useState(otherStages[0]?.id ?? '')
  const [working, setWorking] = useState(false)

  const busy = pending || working

  async function attemptDelete() {
    setWorking(true)
    try {
      const result = await onDelete()
      // A refusal because deals are still here is the spec 6.3 guard working, so it opens
      // the reassignment offer rather than showing an error.
      if (!result.deleted && result.reason === 'has-deals') {
        setBlocked(result.message ?? `${dealCount} deals are still in this stage.`)
      }
    } finally {
      setWorking(false)
    }
  }

  async function reassignAndDelete() {
    setWorking(true)
    try {
      await onReassign(reassignTo)
      setBlocked(null)
    } finally {
      setWorking(false)
    }
  }

  return (
    <div
      className={cn(
        'rounded-2xl border bg-paper',
        'transition-[border-color,box-shadow] duration-(--duration-hover) ease-ui',
        dragging ? 'border-signal-blue shadow-sm-2' : 'border-hairline',
        busy && 'opacity-70',
      )}
    >
      <div className="flex items-center gap-16 p-16">
        {handle}

        <span
          className="size-24 shrink-0 rounded-lg"
          style={{ backgroundColor: stage.color }}
          aria-hidden="true"
        />

        <button
          onClick={() => setOpen((v) => !v)}
          className="min-w-0 flex-1 text-left"
          aria-expanded={open}
        >
          <span className="flex items-center gap-8">
            <span className="truncate text-body-sm font-semibold text-ink-navy">{stage.name}</span>
            {busy && <Spinner className="text-signal-blue" label="Saving" />}
          </span>
          <span className="mt-[2px] block text-caption text-slate-gray">
            {stage.probability}% · {KINDS.find((k) => k.id === stage.kind)?.label} · {dealCount}{' '}
            {dealCount === 1 ? 'deal' : 'deals'}
            {stage.wipLimit !== null && ` · limit ${stage.wipLimit}`}
            {stage.expectedDays !== null && ` · ${stage.expectedDays}d expected`}
            {stage.isChampionGate
              ? ' · champion gate'
              : stage.championRequired && ' · champion required'}
          </span>
        </button>

        <button
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? `Hide ${stage.name} settings` : `Edit ${stage.name}`}
          className="grid size-24 shrink-0 place-items-center rounded-md text-slate-gray transition-colors duration-(--duration-hover) ease-ui hover:bg-pebble"
        >
          <svg
            viewBox="0 0 16 16"
            className={cn('size-16 transition-transform duration-(--duration-hover) ease-ui', open && 'rotate-180')}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {open && (
        <div className="border-t border-hairline p-16">
          {readOnly && (
            <p className="mb-16 rounded-lg bg-pebble px-16 py-8 text-caption text-slate-gray">
              Only an administrator can change pipeline stages.
            </p>
          )}

          <div className="grid gap-16 sm:grid-cols-2">
            <Field label="Stage name">
              <TextInput
                value={stage.name}
                disabled={readOnly}
                onChange={(e) => onPatch({ name: e.target.value })}
              />
            </Field>
            <Field label="Short name" hint="Used in narrow board columns.">
              <TextInput
                value={stage.shortName}
                disabled={readOnly}
                onChange={(e) => onPatch({ shortName: e.target.value })}
              />
            </Field>
            <Field label="Probability %">
              <TextInput
                type="number"
                min={0}
                max={100}
                value={stage.probability}
                disabled={readOnly}
                onChange={(e) =>
                  onPatch({ probability: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })
                }
              />
            </Field>
            <Field label="Deal limit" hint="Blank for no limit.">
              <TextInput
                type="number"
                min={0}
                value={stage.wipLimit ?? ''}
                disabled={readOnly}
                onChange={(e) => onPatch({ wipLimit: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </Field>
            {/* Editable, unlike the gate below, and the difference is the point: this is an expectation
                nothing is refused for, so revising it re-reads history rather than rewriting it. */}
            <Field label="Expected days" hint="How long a deal should take here. Blank for no expectation.">
              <TextInput
                type="number"
                min={1}
                max={365}
                value={stage.expectedDays ?? ''}
                disabled={readOnly}
                onChange={(e) =>
                  onPatch({
                    expectedDays:
                      e.target.value === ''
                        ? null
                        : Math.max(1, Math.min(365, Number(e.target.value) || 1)),
                  })
                }
              />
            </Field>
          </div>

          {/* The only enforced gate in the app. Everything else on a stage is either reporting
              configuration or reference content nothing checks, so it is set apart rather than sitting
              in the grid of numbers above. */}
          {/* Read-only, and the only thing on this stage that is. The gate is a position on the *pipeline*,
              decided when the pipeline was created: moving it would make deals that were compliant
              yesterday non-compliant today. Shown rather than hidden because "does this stage need a
              champion" is exactly what somebody opening a stage's settings wants to know. */}
          <div className="mt-16 flex items-start gap-12 rounded-lg border border-hairline bg-cloud p-16">
            <span
              aria-hidden="true"
              className={cn(
                'mt-[2px] grid size-16 shrink-0 place-items-center rounded-md border',
                stage.championRequired
                  ? 'border-signal-blue bg-signal-blue text-paper'
                  : 'border-mist-gray',
              )}
            >
              {stage.championRequired && (
                <svg viewBox="0 0 12 12" className="size-8" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M2.5 6.5l2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
            <span>
              <span className="block text-body-sm font-semibold text-ink-navy">
                {stage.isChampionGate
                  ? 'The champion gate starts here'
                  : stage.championRequired
                    ? 'Needs a champion'
                    : 'No champion required'}
              </span>
              <span className="mt-[2px] block text-caption text-slate-gray">
                {stage.isChampionGate
                  ? 'A deal can arrive here without a champion, and cannot leave without one. The same applies to every stage after this.'
                  : stage.championRequired
                    ? 'This stage is past the gate, so a deal cannot move on from here until somebody on it holds the Champion role with their email, phone and LinkedIn recorded.'
                    : 'Deals move in and out of this stage without a champion on record.'}
              </span>
              <span className="mt-8 block text-caption text-mist-gray">
                Set when this pipeline was created and fixed from then on. To change it, create a new
                pipeline with the gate where you want it.
              </span>
            </span>
          </div>


          <div className="mt-16">
            <Field label="Counts as" hint="Only Open stages count toward pipeline value and forecasts.">
              <Select
                value={stage.kind}
                disabled={readOnly}
                onChange={(e) => onPatch({ kind: e.target.value as StageKind })}
              >
                {KINDS.map((kind) => (
                  <option key={kind.id} value={kind.id}>
                    {kind.label} — {kind.hint}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-16">
            <span className="mb-8 block text-caption font-semibold tracking-wide text-slate-gray uppercase">
              Colour
            </span>
            <div className="flex flex-wrap gap-8">
              {SWATCHES.map((swatch) => (
                <button
                  key={swatch}
                  disabled={readOnly}
                  onClick={() => onPatch({ color: swatch })}
                  aria-label={`Use colour ${swatch}`}
                  aria-pressed={stage.color === swatch}
                  className={cn(
                    'size-24 rounded-lg border-2',
                    'transition-transform duration-(--duration-hover) ease-ui',
                    stage.color === swatch ? 'border-ink-navy' : 'border-transparent',
                    !readOnly && 'motion-safe:hover:scale-110',
                    readOnly && 'cursor-not-allowed opacity-60',
                  )}
                  style={{ backgroundColor: swatch }}
                />
              ))}
            </div>
          </div>

          {(stage.entryCriteria || stage.exitCriteria || stage.keyActivities || stage.deliverables) && (
            <p className="mt-16 rounded-lg bg-pebble px-16 py-8 text-caption text-slate-gray">
              This stage carries methodology detail, shown as a read-only playbook on deal pages.
            </p>
          )}

          {!readOnly && (
            <div className="mt-16 border-t border-hairline pt-16">
              {blocked === null ? (
                <Button variant="danger" size="sm" loading={busy} onClick={() => void attemptDelete()}>
                  {busy ? 'Working' : 'Delete stage'}
                </Button>
              ) : (
                <div className="rounded-2xl border border-hairline bg-risk-fill p-16">
                  <p className="text-body-sm font-semibold text-ink-navy">Cannot delete {stage.name}</p>
                  <p className="mt-8 text-caption text-slate-gray">{blocked}</p>
                  <div className="mt-16 flex flex-wrap items-end gap-8">
                    <div className="min-w-50 flex-1">
                      <Field label="Move them to">
                        <Select
                          value={reassignTo}
                          disabled={busy}
                          onChange={(e) => setReassignTo(e.target.value)}
                        >
                          {otherStages.map((other) => (
                            <option key={other.id} value={other.id}>
                              {other.name}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    </div>
                    <Button size="sm" loading={busy} onClick={() => void reassignAndDelete()}>
                      {busy ? 'Moving' : 'Move and delete'}
                    </Button>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => setBlocked(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
