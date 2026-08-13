import { useState } from 'react'
import type { PipelineTemplate, StageKind } from '@/types/domain'
import type { NewStage } from '@/api/endpoints'
import { useStore } from '@/data/store'

import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/Field'

/**
 * Creating a pipeline, at the top of the page rather than buried under the stage list.
 *
 * It starts collapsed behind a primary button: creating a pipeline is a rare, deliberate act, and a
 * permanently open form would compete with the editor for attention. Opening it pushes the editor down,
 * which is the point — while you are creating, that is the task.
 *
 * **The champion gate is decided here, and only here.** It cannot be changed once the pipeline exists, and
 * that is a deliberate restriction: a pipeline being created holds no deals, so whatever the gate says is
 * true of every deal that will ever run through it. Moving a gate later would make deals that were
 * compliant yesterday non-compliant today, retroactively, in somebody else's book.
 *
 * **One gate, not one per stage.** The rule is positional — from the gate stage onward a deal needs a
 * champion to move forward — so the control is a single choice down the stage list rather than a row of
 * independent toggles. Toggles could express two gates, or a gap where the requirement lapses and returns,
 * and neither is a thing a sales process can mean.
 *
 * "Copy stages from" carries the original's gate, because copying a working pipeline that you then have to
 * re-gate by hand is not copying a working pipeline.
 */

/**
 * What the form starts with — an opinionated draft, not the server's bare defaults.
 *
 * Expected durations are filled in rather than left blank for the same reason the gate defaults to
 * qualification: a form that starts empty makes "no answer" the path of least resistance. Every value is
 * editable before creating, which is the point.
 */
const DEFAULT_DRAFT: DraftStage[] = [
  { name: 'Prospecting', probability: 10, kind: 'open', expectedDays: 14, color: '#a6bbd1' },
  { name: 'Qualify', probability: 25, kind: 'open', expectedDays: 30, color: '#7ba7d0' },
  { name: 'Propose', probability: 60, kind: 'open', expectedDays: 21, color: '#4a90e2' },
  { name: 'Closed Won', probability: 100, kind: 'won', expectedDays: null, color: '#004eba' },
  { name: 'Closed Lost', probability: 0, kind: 'lost', expectedDays: null, color: '#c8324f' },
]

/** Qualification: stage 1 is research, where a rep legitimately has nobody yet. 1-based, like the API. */
const DEFAULT_GATE = 2

interface DraftStage {
  name: string
  probability: number
  kind: StageKind
  /** Null on terminal stages, where the question has no meaning. */
  expectedDays: number | null
  color: string
}

export function CreatePipelinePanel({
  pipelines,
  onCreated,
}: {
  pipelines: PipelineTemplate[]
  onCreated: (name: string) => void
}) {
  const { createTemplate } = useStore()

  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [tracksPartner, setTracksPartner] = useState(false)
  const [copyFrom, setCopyFrom] = useState('')
  const [stages, setStages] = useState<DraftStage[]>(DEFAULT_DRAFT)
  const [gate, setGate] = useState<number | null>(DEFAULT_GATE)
  const [saving, setSaving] = useState(false)

  const taken = pipelines.some((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())
  const named = stages.every((stage) => stage.name.trim().length > 0)
  const canSave = name.trim().length > 0 && !taken && !saving && (copyFrom !== '' || named)

  function patchStage(index: number, patch: Partial<DraftStage>) {
    setStages((current) => current.map((stage, i) => (i === index ? { ...stage, ...patch } : stage)))
  }

  async function create() {
    if (!canSave) return
    setSaving(true)
    try {
      const created = name.trim()
<<<<<<< Updated upstream
      await createTemplate(created, tracksPartner, copyFrom || undefined)
=======
      // Either a copy or an explicit stage list, never both — the API refuses both rather than choosing,
      // because each is a complete description of the pipeline. A copy also brings its own gate, so none is
      // sent alongside one.
      await createTemplate(
        created,
        copyFrom
          ? { copyStagesFrom: copyFrom }
          : {
              stages: stages.map<NewStage>((stage) => ({
                name: stage.name.trim(),
                probability: stage.probability,
                kind: stage.kind,
                color: stage.color,
                expectedDays: stage.expectedDays,
              })),
              championGatePosition: gate,
            },
      )
>>>>>>> Stashed changes
      setName('')
      setTracksPartner(false)
      setCopyFrom('')
      setStages(DEFAULT_DRAFT)
      setGate(DEFAULT_GATE)
      setOpen(false)
      onCreated(created)
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <svg viewBox="0 0 16 16" className="size-16" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M8 3.5v9M3.5 8h9" strokeLinecap="round" />
        </svg>
        New pipeline
      </Button>
    )
  }

  // A gate is only placeable on an open stage that has another open stage after it: the rule applies to
  // moving *past* the gate, so a gate on the last open stage could never fire. The API refuses those, and
  // offering them here would be offering a setting that does nothing.
  const gatePositions = stages
    .map((stage, index) => ({ stage, position: index + 1 }))
    .filter(({ stage }) => stage.kind === 'open')
  const gateChoices = gatePositions.slice(0, Math.max(0, gatePositions.length - 1))
  const gateStage = stages[(gate ?? 0) - 1]

  return (
    <section
      aria-label="New pipeline"
      className="mb-24 rounded-3xl border border-signal-blue bg-paper p-24 shadow-sm-2 motion-safe:animate-[fade-in_180ms_ease-out]"
    >
      <div className="mb-24 flex items-start justify-between gap-16">
        <div>
          <h2 className="text-subheading font-bold text-ink-navy">New pipeline</h2>
          <p className="mt-8 max-w-[560px] text-body-sm text-slate-gray">
            Every pipeline has its own stages, and this is where their champion requirements are set — they
            cannot be changed once the pipeline exists.
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          aria-label="Cancel"
          className="grid size-32 shrink-0 place-items-center rounded-lg text-slate-gray transition-colors duration-(--duration-hover) ease-ui hover:bg-pebble hover:text-ink-navy"
        >
          <svg viewBox="0 0 20 20" className="size-16" fill="none" stroke="currentColor" strokeWidth="1.75">
            <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      <div className="grid gap-16 md:grid-cols-2">
        <Field
          label="Name"
          hint={taken ? 'A pipeline with that name already exists.' : 'What this sales motion is called.'}
        >
          <TextInput
            autoFocus
            value={name}
            disabled={saving}
            onChange={(e) => setName(e.target.value)}
            placeholder="Reseller, Renewals, Public Sector…"
          />
        </Field>

        <Field
          label="Start from"
          hint="A copy keeps the original's stages and their champion requirements."
        >
          <Select value={copyFrom} disabled={saving} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">Define the stages below</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                Copy stages from {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

<<<<<<< Updated upstream
      <label className="mt-16 flex cursor-pointer items-start gap-8 rounded-lg border border-hairline bg-cloud p-16">
        <input
          type="checkbox"
          checked={tracksPartner}
          disabled={saving}
          onChange={(e) => setTracksPartner(e.target.checked)}
          className="mt-[2px] size-16 shrink-0 rounded-md accent-signal-blue"
        />
        <span>
          <span className="block text-body-sm font-semibold text-ink-navy">
            Deals on this pipeline involve a partner
          </span>
          <span className="mt-[2px] block text-caption text-slate-gray">
            Adds a Partner field alongside the Customer on every deal, and shows it on board
            cards (R8). Leave off for a direct sales motion.
          </span>
        </span>
      </label>

      <div className="mt-24 flex items-center gap-8">
=======
      {copyFrom === '' && (
        <div className="mt-24">
          <h3 className="text-body-sm font-semibold text-ink-navy">Stages</h3>
          <p className="mt-[2px] max-w-[640px] text-caption text-slate-gray">
            Each stage carries how long a deal is expected to spend there. Nothing is refused for running
            over — it is what makes a stalled deal visible.
          </p>

          <ul className="mt-16 space-y-8">
            {stages.map((stage, index) => (
              <li
                key={index}
                className="flex flex-wrap items-center gap-12 rounded-xl border border-hairline bg-cloud px-16 py-12"
              >
                <span
                  aria-hidden="true"
                  className="size-8 shrink-0 rounded-full"
                  style={{ backgroundColor: stage.color }}
                />

                <TextInput
                  value={stage.name}
                  disabled={saving}
                  aria-label={`Stage ${index + 1} name`}
                  onChange={(e) => patchStage(index, { name: e.target.value })}
                  className="h-32! w-auto min-w-[180px] flex-1 py-0! text-body-sm!"
                />

                <label className="flex shrink-0 items-center gap-8 text-caption text-slate-gray">
                  <span>Win %</span>
                  <TextInput
                    type="number"
                    min={0}
                    max={100}
                    value={stage.probability}
                    disabled={saving}
                    aria-label={`${stage.name || `Stage ${index + 1}`} probability`}
                    onChange={(e) =>
                      patchStage(index, { probability: Math.max(0, Math.min(100, Number(e.target.value))) })
                    }
                    className="h-32! w-64 py-0! text-caption!"
                  />
                </label>

                {/* Only on open stages: nothing is expected to leave Closed Won, so a duration there would
                    be a number with no meaning. */}
                {stage.kind === 'open' ? (
                  <label className="flex shrink-0 items-center gap-8 text-caption text-slate-gray">
                    <span>Days</span>
                    <TextInput
                      type="number"
                      min={1}
                      max={365}
                      value={stage.expectedDays ?? ''}
                      disabled={saving}
                      aria-label={`Expected days in ${stage.name || `stage ${index + 1}`}`}
                      onChange={(e) =>
                        patchStage(index, {
                          // Empty means "no expectation" rather than zero, which the API refuses.
                          expectedDays: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      className="h-32! w-64 py-0! text-caption!"
                    />
                  </label>
                ) : (
                  <span className="shrink-0 text-caption text-mist-gray">
                    {stage.kind === 'won' ? 'Closed won' : 'Closed lost'}
                  </span>
                )}

                {/* Where the gate sits, marked on the row rather than only in the control above, so the
                    stage list and the rule read as one thing. */}
                {gate === index + 1 && (
                  <span className="shrink-0 rounded-md bg-badge-fill px-8 py-[2px] text-caption font-semibold text-signal-blue">
                    Champion gate
                  </span>
                )}

                {/* Terminal stages cannot be removed: a pipeline needs somewhere for deals to finish. */}
                {stage.kind === 'open' && stages.filter((s) => s.kind === 'open').length > 1 && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setStages((current) => current.filter((_, i) => i !== index))}
                    aria-label={`Remove ${stage.name || `stage ${index + 1}`}`}
                    className="shrink-0 rounded-md px-8 py-[2px] text-caption font-semibold text-slate-gray transition-colors hover:bg-pebble hover:text-risk"
                  >
                    Remove
                  </button>
                )}
              </li>
            ))}
          </ul>

          {/* The gate, after the stages, because it names one of them. A single select rather than a toggle
              per row: the rule is one position, and the copy under it states the consequence in the words a
              refusal will use, since this decision cannot be revisited. */}
          <div className="mt-24 rounded-2xl border border-hairline bg-cloud p-16">
            <div className="flex flex-wrap items-end justify-between gap-16">
              <div className="min-w-[240px] flex-1">
                <Field
                  label="Champion gate"
                  hint="Set once. It cannot be moved after the pipeline is created."
                >
                  <Select
                    value={gate === null ? '' : String(gate)}
                    disabled={saving}
                    onChange={(e) => setGate(e.target.value === '' ? null : Number(e.target.value))}
                  >
                    <option value="">No champion required anywhere</option>
                    {gateChoices.map(({ stage, position }) => (
                      <option key={position} value={position}>
                        From {stage.name.trim() || `stage ${position}`} onward
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </div>

            <p className="mt-8 max-w-[640px] text-caption text-slate-gray">
              {gate === null ? (
                'No stage will ask for a champion. Deals can be moved to the end of this pipeline without anybody on the inside being named.'
              ) : (
                <>
                  A deal can reach <strong className="font-semibold text-ink-navy">
                    {gateStage?.name.trim() || `stage ${gate}`}
                  </strong>{' '}
                  freely, and cannot move past it — or past any stage after it — until somebody on the deal
                  holds the Champion role with their email, phone and LinkedIn on record. If that champion is
                  removed at stage four, the deal stops at stage four until another is found.
                </>
              )}
            </p>
          </div>

          <div className="mt-16">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() =>
                setStages((current) => {
                  // Inserted before the terminal stages, matching where the server puts a new stage.
                  const openCount = current.filter((stage) => stage.kind === 'open').length
                  const fresh: DraftStage = {
                    name: '',
                    probability: 50,
                    kind: 'open',
                    expectedDays: 21,
                    color: '#4a90e2',
                  }
                  return [...current.slice(0, openCount), fresh, ...current.slice(openCount)]
                })
              }
            >
              Add a stage
            </Button>
          </div>
        </div>
      )}

      <div className="mt-24 flex items-center gap-8 border-t border-hairline pt-16">
>>>>>>> Stashed changes
        <Button loading={saving} disabled={!canSave} onClick={() => void create()}>
          {saving ? 'Creating' : 'Create pipeline'}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={() => setOpen(false)}>
          Cancel
        </Button>
        {!named && copyFrom === '' && (
          <span className="text-caption text-slate-gray">Every stage needs a name.</span>
        )}
      </div>
    </section>
  )
}
