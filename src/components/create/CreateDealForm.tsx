import { useMemo, useState } from 'react'
import type { DealContactAssignment, Id } from '@/types/domain'
import { useStore } from '@/data/store'
import { assignableOwners } from '@/lib/people'
import { useAuth } from '@/app/auth'
import { routes, useRouter } from '@/app/router'
import { Button } from '@/components/ui/Button'
import { Field, Select, TextInput } from '@/components/ui/Field'
import { DealContactPicker } from './DealContactPicker'

/** A sensible default close date: far enough out to be plausible, near enough to be real. */
function defaultCloseDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 60)
  return date.toISOString().slice(0, 10)
}

/**
 * A new deal.
 *
 * The stage list is derived from the chosen pipeline, never from a fixed list: a deal
 * belongs to exactly one pipeline and can only sit in that pipeline's stages, and the API
 * rejects any other combination with a 422. Choosing a pipeline therefore resets the stage.
 *
 * The Partner field appears only when the pipeline tracks one (R8), which is the same rule
 * the board card and the deal page follow.
 */
export function CreateDealForm({
  defaultAccountId,
  defaultLeadId,
  defaultPipelineId,
  defaultStageId,
  onDone,
}: {
  defaultAccountId?: Id
  defaultLeadId?: Id
  defaultPipelineId?: Id
  defaultStageId?: Id
  onDone: () => void
}) {
  const { snapshot, createDeal } = useStore()
  const { user } = useAuth()
  const { navigate } = useRouter()

  // Every account. There is no partner field on a deal any more, so there is no second list — anybody
  // involved from any company is attached below as a person.
  const customers = snapshot.accounts

  const [name, setName] = useState('')
  const [accountId, setAccountId] = useState(defaultAccountId ?? customers[0]?.id ?? '')
  const [leadId, setLeadId] = useState<string>(defaultLeadId ?? '')
  const [pipelineId, setPipelineId] = useState(defaultPipelineId ?? snapshot.pipelines[0]?.id ?? '')
  const [stageId, setStageId] = useState(defaultStageId ?? '')
  const [value, setValue] = useState(0)
  const [closeDate, setCloseDate] = useState(defaultCloseDate)
  const [ownerId, setOwnerId] = useState(user?.id ?? snapshot.people[0]?.id ?? '')
  const [contacts, setContacts] = useState<DealContactAssignment[]>([])
  //: The roles this deal will track. Chosen here so the deal starts with the questions it needs
  //: answered — the people who fill them are identified as it progresses.
  const [roleIds, setRoleIds] = useState<Id[]>([])
  const [saving, setSaving] = useState(false)

  const pipeline = snapshot.pipelines.find((p) => p.id === pipelineId)

  const stages = useMemo(
    () => (pipeline ? [...pipeline.stages].sort((a, b) => a.position - b.position) : []),
    [pipeline],
  )

  // Default to the first open stage: a deal is rarely created already won or lost.
  const effectiveStageId =
    stages.find((s) => s.id === stageId)?.id ?? stages.find((s) => s.kind === 'open')?.id ?? stages[0]?.id ?? ''

  const leadsForAccount = snapshot.leads.filter((l) => l.accountId === accountId)

  const trimmed = name.trim()
  // Why the form cannot be submitted yet, in the order somebody fills the fields in.
  //
  // A single reason rather than a list: fixing the first one usually reveals whether there is a second,
  // and a form that reports four problems at once reads as broken rather than incomplete.
  //
  // This is the *only* place the "a deal needs at least one contact" rule is enforced — the API accepts
  // a payload without contacts so that it stays compatible and so that a missing contact cannot mask an
  // ownership error. That makes the guard below load-bearing, not a convenience.
  const blockedBecause =
    trimmed.length === 0
      ? 'Give the opportunity a name.'
      : accountId === ''
        ? 'Choose the customer.'
        : effectiveStageId === ''
          ? 'Choose a stage.'
          : contacts.length === 0
            ? 'Add at least one contact, so there is a route to the customer.'
            : null

  const canSave = blockedBecause === null && !saving

  function changeAccount(nextId: string) {
    setAccountId(nextId)
    setLeadId('')
    // Contacts are *not* cleared. They used to be, because a deal's people had to work at its customer
    // or its partner and changing the customer could invalidate them. That rule is gone with the partner
    // column — anybody from any company can be on a deal — so clearing them would now just discard work
    // somebody had already done.
  }

  function changePipeline(nextId: string) {
    setPipelineId(nextId)
    // The old stage belongs to the old pipeline; keeping it would be a guaranteed 422.
    setStageId('')
  }

  async function submit() {
    if (!canSave) return
    setSaving(true)
    try {
      const created = await createDeal({
        name: trimmed,
        accountId,
        leadId: leadId || null,
        pipelineTemplateId: pipelineId,
        stageId: effectiveStageId,
        value,
        expectedCloseDate: closeDate,
        ownerId,
        contacts,
        roles: roleIds,
      })
      if (created) {
        onDone()
        navigate(routes.deal(created.id))
      }
    } finally {
      setSaving(false)
    }
  }

  if (customers.length === 0 || snapshot.pipelines.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-hairline bg-cloud px-24 py-32 text-center">
        <p className="text-body-lg font-semibold text-ink-navy">
          {customers.length === 0 ? 'Create an account first' : 'Create a pipeline first'}
        </p>
        <p className="mt-8 text-body-sm text-slate-gray">
          {customers.length === 0
            ? 'A deal rolls up to an account, so there needs to be one to attach it to.'
            : 'A deal sits in a stage, and stages belong to a pipeline.'}
        </p>
      </div>
    )
  }

  return (
    <form
      className="space-y-16"
      onSubmit={(e) => {
        e.preventDefault()
        void submit()
      }}
    >
      <Field label="Opportunity name">
        <TextInput
          autoFocus
          value={name}
          disabled={saving}
          onChange={(e) => setName(e.target.value)}
          placeholder="Core Banking AI Modernization"
        />
      </Field>

      <Field label="Customer">
        <Select
          value={accountId}
          disabled={saving}
          onChange={(e) => changeAccount(e.target.value)}
        >
          {customers.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name}
            </option>
          ))}
        </Select>
      </Field>

      <Field label="Business unit" hint="Optional. A deal can roll up to the account directly.">
        <Select value={leadId} disabled={saving} onChange={(e) => setLeadId(e.target.value)}>
          <option value="">Not tied to a business unit</option>
          {leadsForAccount.map((lead) => (
            <option key={lead.id} value={lead.id}>
              {lead.businessUnit}
            </option>
          ))}
        </Select>
      </Field>

      <div className="grid grid-cols-2 gap-16">
        <Field label="Pipeline">
          <Select value={pipelineId} disabled={saving} onChange={(e) => changePipeline(e.target.value)}>
            {snapshot.pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Stage">
          <Select
            value={effectiveStageId}
            disabled={saving}
            onChange={(e) => setStageId(e.target.value)}
          >
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name} — {stage.probability}%
              </option>
            ))}
          </Select>
        </Field>
      </div>


      <div className="grid grid-cols-2 gap-16">
        <Field label="Value" hint="In USD.">
          <TextInput
            type="number"
            min={0}
            step={10_000}
            value={value}
            disabled={saving}
            onChange={(e) => setValue(Number(e.target.value) || 0)}
          />
        </Field>

        <Field label="Expected close">
          <TextInput
            type="date"
            value={closeDate}
            disabled={saving}
            onChange={(e) => e.target.value && setCloseDate(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Owner">
        <Select value={ownerId} disabled={saving} onChange={(e) => setOwnerId(e.target.value)}>
          {assignableOwners(snapshot.people, ownerId).map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </Select>
      </Field>

      <DealContactPicker
        accountId={accountId}
        contacts={contacts}
        onContactsChange={setContacts}
        roleIds={roleIds}
        onRolesChange={setRoleIds}
        disabled={saving}
      />

      <div className="pt-8">
        {/* A disabled button with no stated reason is a dead end. `aria-live` because the message
            changes as fields are filled in, and a screen-reader user would otherwise never learn that
            the reason had moved on. */}
        {blockedBecause && !saving && (
          <p aria-live="polite" className="mb-8 text-caption text-slate-gray">
            {blockedBecause}
          </p>
        )}

        <div className="flex items-center gap-8">
          <Button type="submit" loading={saving} disabled={!canSave}>
            {saving ? 'Creating' : 'Create deal'}
          </Button>
          <Button type="button" variant="ghost" disabled={saving} onClick={onDone}>
            Cancel
          </Button>
        </div>
      </div>
    </form>
  )
}
