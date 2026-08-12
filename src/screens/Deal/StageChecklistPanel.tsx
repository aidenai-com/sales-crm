import { useRef, useState } from 'react'
import type { Attachment, DeliverableStatus, Id, Stage, StageChecklist } from '@/types/domain'
import { cn } from '@/lib/cn'
import { fullDate, timeAgo } from '@/lib/format'
import { Button } from '@/components/ui/Button'
import { Card, EmptyState } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import { ALLOWED_UPLOAD_ACCEPT, describeFileSize } from '@/lib/files'

/**
 * One stage's deliverables for one deal: tick them off, file documents against them.
 *
 * Checkboxes are interactive only on the deal's current stage. Ticking a box on a stage the
 * deal has already left has no defensible meaning, and would make the advance rule ambiguous
 * — the API refuses it with a 409, so the UI should not offer it either. On other stages this
 * is a read-only record of what was completed and what was filed, which is exactly what
 * "click across all the statuses and see the documents attached" asks for.
 *
 * Uploading, by contrast, *is* allowed on any stage. A rep chasing up paperwork for an
 * earlier stage is doing their job.
 */
export function StageChecklistPanel({
  stage,
  checklist,
  isCurrentStage,
  canEdit,
  pendingDeliverableId,
  uploadingDeliverableId,
  onToggle,
  onUpload,
  onDownload,
  onRemoveAttachment,
  onMoveDealHere,
  moving,
}: {
  stage: Stage
  checklist: StageChecklist | undefined
  isCurrentStage: boolean
  /** False for a rep viewing somebody else's deal; the API enforces it either way. */
  canEdit: boolean
  pendingDeliverableId: Id | null
  uploadingDeliverableId: Id | null
  onToggle: (deliverableId: Id, complete: boolean) => void
  onUpload: (deliverableId: Id, file: File) => void
  onDownload: (attachmentId: Id, filename: string) => void
  onRemoveAttachment: (attachmentId: Id) => void
  onMoveDealHere: () => void
  moving: boolean
}) {
  const deliverables = checklist?.deliverables ?? []
  const complete = checklist?.completeCount ?? 0
  const total = checklist?.totalCount ?? 0
  const allDone = total > 0 && complete === total

  return (
    <Card>
      <div className="mb-24 flex flex-wrap items-start justify-between gap-16">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-8">
            <span
              className="size-8 shrink-0 rounded-full"
              style={{ backgroundColor: stage.color }}
              aria-hidden="true"
            />
            <h2 className="text-body-lg font-semibold text-ink-navy">{stage.name}</h2>
            {isCurrentStage ? (
              <span className="rounded-full bg-badge-fill px-8 py-[2px] text-caption font-semibold text-signal-blue">
                Current stage
              </span>
            ) : (
              <span className="rounded-full bg-pebble px-8 py-[2px] text-caption font-medium text-slate-gray">
                Viewing
              </span>
            )}
          </div>

          <p className="mt-8 text-body-sm text-slate-gray">
            {total === 0
              ? 'This stage defines no deliverables, so nothing here gates or advances the deal.'
              : isCurrentStage
                ? allDone
                  ? 'All deliverables complete.'
                  : `${complete} of ${total} complete. Completing all of them moves the deal on automatically.`
                : `${complete} of ${total} were completed while the deal was here.`}
          </p>
        </div>

        {!isCurrentStage && canEdit && (
          <Button variant="outline" disabled={moving} onClick={onMoveDealHere}>
            {moving ? 'Moving…' : 'Move deal here'}
          </Button>
        )}
      </div>

      {total > 0 && <ProgressBar complete={complete} total={total} color={stage.color} />}

      {deliverables.length === 0 ? (
        <EmptyState
          title="No deliverables on this stage"
          hint="An administrator can add them in Settings → Pipelines."
        />
      ) : (
        <ul className="mt-24 space-y-8">
          {deliverables.map((deliverable) => (
            <DeliverableRow
              key={deliverable.id}
              deliverable={deliverable}
              // Only the current stage's boxes are live; elsewhere this is a record.
              checkable={isCurrentStage && canEdit}
              canAttach={canEdit}
              pending={pendingDeliverableId === deliverable.id}
              uploading={uploadingDeliverableId === deliverable.id}
              onToggle={(next) => onToggle(deliverable.id, next)}
              onUpload={(file) => onUpload(deliverable.id, file)}
              onDownload={onDownload}
              onRemoveAttachment={onRemoveAttachment}
            />
          ))}
        </ul>
      )}
    </Card>
  )
}

function ProgressBar({
  complete,
  total,
  color,
}: {
  complete: number
  total: number
  color: string
}) {
  const percent = Math.round((complete / total) * 100)
  return (
    <div
      role="progressbar"
      aria-valuenow={complete}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-label={`${complete} of ${total} deliverables complete`}
      className="h-8 w-full overflow-hidden rounded-full bg-pebble"
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </div>
  )
}

function DeliverableRow({
  deliverable,
  checkable,
  canAttach,
  pending,
  uploading,
  onToggle,
  onUpload,
  onDownload,
  onRemoveAttachment,
}: {
  deliverable: DeliverableStatus
  checkable: boolean
  canAttach: boolean
  pending: boolean
  uploading: boolean
  onToggle: (complete: boolean) => void
  onUpload: (file: File) => void
  onDownload: (attachmentId: Id, filename: string) => void
  onRemoveAttachment: (attachmentId: Id) => void
}) {
  const fileInput = useRef<HTMLInputElement>(null)
  const attachments = deliverable.attachments
  // Open when there is something to see, but genuinely collapsible from there. This used to be
  // `expanded || attachments.length > 0`, which made the toggle a dead control on exactly the
  // rows that had anything to collapse.
  const [expanded, setExpanded] = useState(attachments.length > 0)

  return (
    <li
      className={cn(
        'rounded-2xl border p-16 transition-colors',
        deliverable.complete ? 'border-hairline bg-pebble/40' : 'border-hairline bg-paper',
      )}
    >
      <div className="flex items-start gap-12">
        <Checkbox
          checked={deliverable.complete}
          disabled={!checkable || pending}
          pending={pending}
          label={deliverable.text}
          onChange={onToggle}
        />

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-body-sm leading-relaxed',
              deliverable.complete ? 'text-slate-gray' : 'text-ink-navy',
            )}
          >
            {deliverable.text}
          </p>

          {deliverable.complete && deliverable.completedByName && (
            <p className="mt-[2px] text-caption text-mist-gray">
              {deliverable.completedByName}
              {deliverable.completedAt && ` · ${timeAgo(deliverable.completedAt)}`}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-8">
          {/* One slot, three states, so nothing shifts as a row changes. The middle state is
              the point of it: a ticked box with no document behind it used to look identical
              to a row with nothing to say, which is exactly the row worth spotting when you
              are looking for the file to review. */}
          {attachments.length > 0 ? (
            <button
              onClick={() => setExpanded((open) => !open)}
              aria-expanded={expanded}
              className="inline-flex items-center gap-[4px] rounded-lg bg-sky-cyan/12 px-8 py-[4px] text-caption font-semibold text-sky-cyan hover:bg-sky-cyan/20"
            >
              <PaperclipIcon />
              {attachments.length}
              <span className="sr-only">
                {expanded ? ' documents, hide' : ' documents, show'}
              </span>
            </button>
          ) : (
            deliverable.complete && (
              // Quiet, because a document was never required to tick the box — this reports an
              // absence, it does not accuse anyone of one.
              <span className="inline-flex items-center gap-[4px] rounded-lg border border-dashed border-hairline px-8 py-[4px] text-caption text-mist-gray">
                No document
              </span>
            )
          )}

          {canAttach && (
            <>
              <button
                onClick={() => fileInput.current?.click()}
                disabled={uploading}
                className="rounded-lg px-8 py-[4px] text-caption font-semibold text-signal-blue hover:bg-badge-fill disabled:opacity-50"
              >
                {uploading ? 'Uploading…' : 'Attach'}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept={ALLOWED_UPLOAD_ACCEPT}
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onUpload(file)
                  // Cleared so choosing the same file twice fires a change event again.
                  event.target.value = ''
                }}
              />
            </>
          )}
        </div>
      </div>

      {expanded && attachments.length > 0 && (
        <ul className="mt-12 space-y-[4px] border-t border-hairline pt-12">
          {attachments.map((attachment) => (
            <AttachmentRow
              key={attachment.id}
              attachment={attachment}
              canRemove={canAttach}
              onDownload={() => onDownload(attachment.id, attachment.filename)}
              onRemove={() => onRemoveAttachment(attachment.id)}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * A real checkbox input, styled.
 *
 * Not a styled `<button>`: this needs to be reachable by keyboard, announced as a checkbox
 * with its state, and togglable with Space, all of which the platform control does for free.
 */
function Checkbox({
  checked,
  disabled,
  pending,
  label,
  onChange,
}: {
  checked: boolean
  disabled: boolean
  pending: boolean
  label: string
  onChange: (next: boolean) => void
}) {
  if (pending) {
    return (
      <span className="mt-[2px] grid size-24 shrink-0 place-items-center">
        <Spinner label="Saving" />
      </span>
    )
  }

  return (
    <input
      type="checkbox"
      checked={checked}
      disabled={disabled}
      aria-label={label}
      onChange={(event) => onChange(event.target.checked)}
      title={disabled && !checked ? 'The deal is not in this stage' : undefined}
      className={cn(
        'mt-[2px] size-24 shrink-0 cursor-pointer appearance-none rounded-lg border-2 transition-colors',
        'checked:border-signal-blue checked:bg-signal-blue',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-blue',
        'disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'border-signal-blue' : 'border-mist-gray hover:border-signal-blue',
        // The tick itself, as a background image so no child element is needed.
        checked &&
          "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='white' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3.5 8.5l3 3 6-6'/%3E%3C/svg%3E\")] bg-center bg-no-repeat",
      )}
    />
  )
}

function AttachmentRow({
  attachment,
  canRemove,
  onDownload,
  onRemove,
}: {
  attachment: Attachment
  canRemove: boolean
  onDownload: () => void
  onRemove: () => void
}) {
  return (
    <li className="flex items-center gap-8 rounded-lg px-8 py-[4px] hover:bg-pebble">
      <FileIcon contentType={attachment.contentType} />

      <button
        onClick={onDownload}
        className="min-w-0 flex-1 truncate text-left text-caption font-medium text-ink-navy hover:text-signal-blue hover:underline"
        title={`Download ${attachment.filename}`}
      >
        {attachment.filename}
      </button>

      <span className="shrink-0 text-caption text-mist-gray tabular-nums">
        {describeFileSize(attachment.sizeBytes)}
      </span>
      <span
        className="hidden shrink-0 text-caption text-mist-gray sm:inline"
        title={`Uploaded by ${attachment.uploadedByName}`}
      >
        {fullDate(attachment.createdAt)}
      </span>

      {canRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${attachment.filename}`}
          className="shrink-0 rounded p-[2px] text-mist-gray hover:text-risk"
        >
          <svg
            viewBox="0 0 16 16"
            className="size-16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            aria-hidden="true"
          >
            <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </li>
  )
}

function PaperclipIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <path
        d="M10.5 5.5L6 10a1.75 1.75 0 002.5 2.5l4.5-4.5a3.5 3.5 0 00-5-5L3.5 7.5a5 5 0 007 7"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Two glyphs, not twelve: the filename already says what the file is. */
function FileIcon({ contentType }: { contentType: string }) {
  const isImage = contentType.startsWith('image/')
  return (
    <svg
      viewBox="0 0 16 16"
      className="size-16 shrink-0 text-mist-gray"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {isImage ? (
        <>
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <circle cx="6" cy="6.5" r="1" />
          <path d="M2.5 11l3.5-3 3 2.5 2-1.5 2.5 2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M3.5 2h5L12.5 6v8H3.5z" strokeLinejoin="round" />
          <path d="M8.5 2v4h4" strokeLinejoin="round" />
        </>
      )}
    </svg>
  )
}
