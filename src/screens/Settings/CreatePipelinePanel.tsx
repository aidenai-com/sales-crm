import { useState } from 'react'
import type { PipelineTemplate } from '@/types/domain'
import { useStore } from '@/data/store'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/Field'

/**
 * Creating a pipeline, at the top of the page rather than buried under the stage list.
 *
 * It starts collapsed behind a primary button: creating a pipeline is a rare, deliberate
 * act, and a permanently open form would compete with the editor for attention. Opening it
 * pushes the editor down, which is the point — while you are creating, that is the task.
 *
 * "Copy stages from" is offered because most new pipelines are a variation on one that
 * already works; starting from three placeholder stages means retyping a process you
 * already have.
 */
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
  const [copyFrom, setCopyFrom] = useState('')
  const [saving, setSaving] = useState(false)

  const taken = pipelines.some((p) => p.name.trim().toLowerCase() === name.trim().toLowerCase())
  const canSave = name.trim().length > 0 && !taken && !saving

  async function create() {
    if (!canSave) return
    setSaving(true)
    try {
      const created = name.trim()
      await createTemplate(created, copyFrom || undefined)
      setName('')
      setCopyFrom('')
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

  return (
    <section
      aria-label="New pipeline"
      className="mb-24 rounded-3xl border border-signal-blue bg-paper p-24 shadow-sm-2 motion-safe:animate-[fade-in_180ms_ease-out]"
    >
      <div className="mb-24 flex items-start justify-between gap-16">
        <div>
          <h2 className="text-subheading font-bold text-ink-navy">New pipeline</h2>
          <p className="mt-8 max-w-[560px] text-body-sm text-slate-gray">
            Every pipeline has its own stages. Deals belong to exactly one, so a deal on this
            pipeline can only move between the stages you define here.
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
            onKeyDown={(e) => {
              if (e.key === 'Enter') void create()
            }}
            placeholder="Reseller, Renewals, Public Sector…"
          />
        </Field>

        <Field label="Start from" hint="Copy an existing pipeline's stages, or start fresh.">
          <Select value={copyFrom} disabled={saving} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">Blank — one open stage, plus Won and Lost</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                Copy stages from {p.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-24 flex items-center gap-8">
        <Button loading={saving} disabled={!canSave} onClick={() => void create()}>
          {saving ? 'Creating' : 'Create pipeline'}
        </Button>
        <Button variant="ghost" disabled={saving} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </section>
  )
}
