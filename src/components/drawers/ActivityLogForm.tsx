import { useState } from 'react'
import type { ActivitySubjectType, Id, LoggableActivityKind } from '@/types/domain'
import { pendingKey, useStore } from '@/data/store'
import { useAuth } from '@/app/auth'
import { Button } from '@/components/ui/Button'
import { Field, Select, Textarea } from '@/components/ui/Field'

const kinds: Array<{ id: LoggableActivityKind; label: string }> = [
  { id: 'call', label: 'Call' },
  { id: 'meeting', label: 'Meeting' },
  { id: 'email', label: 'Email' },
  { id: 'note', label: 'Note' },
]

/** Logs an activity against an account, lead, or deal (R4) — same form at all three levels. */
export function ActivityLogForm({
  subjectType,
  subjectId,
}: {
  subjectType: ActivitySubjectType
  subjectId: Id
}) {
  const { snapshot, logActivity, isPending } = useStore()
  const { user } = useAuth()

  const [kind, setKind] = useState<LoggableActivityKind>('call')
  // Defaults to whoever is signed in — the common case is logging your own call.
  const [authorId, setAuthorId] = useState<Id>(user?.id ?? snapshot.people[0]?.id ?? '')
  const [summary, setSummary] = useState('')

  const saving = isPending(pendingKey.activity(subjectId))
  const canSave = summary.trim().length > 0 && !saving

  async function save() {
    if (!canSave) return
    const text = summary.trim()
    await logActivity({ subjectType, subjectId, kind, summary: text, authorId })
    // Cleared only after the request resolves, so a failure does not lose what was typed.
    setSummary('')
  }

  return (
    <div className="rounded-2xl border border-hairline bg-cloud p-16">
      <p className="mb-16 text-body-sm font-semibold text-ink-navy">Log an activity</p>

      <div className="grid grid-cols-2 gap-16">
        <Field label="Type">
          <Select
            value={kind}
            disabled={saving}
            onChange={(e) => setKind(e.target.value as LoggableActivityKind)}
          >
            {kinds.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Logged by">
          <Select value={authorId} disabled={saving} onChange={(e) => setAuthorId(e.target.value)}>
            {snapshot.people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="mt-16">
        <Field label="What happened">
          <Textarea
            value={summary}
            disabled={saving}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Procurement asked for the full-environment ROI before sign-off."
          />
        </Field>
      </div>

      <div className="mt-16 flex justify-end">
        <Button size="sm" onClick={() => void save()} loading={saving} disabled={!canSave}>
          {saving ? 'Logging' : 'Log activity'}
        </Button>
      </div>
    </div>
  )
}
