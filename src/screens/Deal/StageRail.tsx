import type { Ageing, PipelineTemplate, Stage } from '@/types/domain'
import { cn } from '@/lib/cn'

/**
 * The pipeline's stages as a selector for *which stage you are looking at*.
 *
 * This used to move the deal on click. It no longer does, and the split is deliberate:
 * feedback asked to "click across all the statuses and see the documents attached", which
 * makes inspecting a stage the common action and moving the deal the rare one. Leaving both
 * on the same click target is how a rep changes a deal's stage while reaching for a PDF.
 *
 * Moving now lives on an explicit button in the checklist panel below, alongside the board's
 * drag-and-drop. Neither is gated on the checklist — the automatic path is an addition, not
 * a restriction (spec 6.4).
 *
 * Three visual states, not two, because "where the deal is" and "what I am reading" are now
 * different questions:
 *
 *   current   filled with the stage colour — the different colour the feedback asked for
 *   selected  ring, unfilled — what the panel below is showing
 *   neither   muted, with a filled bar if the deal has passed through it
 *
 * Terminal stages sit apart from the open path: they are outcomes, not steps, and putting
 * Closed Lost inline would imply it comes after Closed Won.
 */
export function StageRail({
  pipeline,
  currentStageId,
  selectedStageId,
  onSelect,
  completion,
  ageing,
}: {
  pipeline: PipelineTemplate
  /** Where the deal actually is. */
  currentStageId: string
  /** Which stage the panel below is showing. */
  selectedStageId: string
  onSelect: (stageId: string) => void
  /** Per-stage checklist progress, so the rail shows how much of each stage is done. */
  completion: Record<string, { complete: number; total: number }>
  /**
   * How long the deal has been in its current stage. Replaces the word "Here" on that step.
   *
   * Only on the current one: the rail has no record of how long the deal spent in the stages it has already
   * left, and printing a number under each would invent a history.
   */
  ageing?: Ageing | null
}) {
  const ordered = [...pipeline.stages].sort((a, b) => a.position - b.position)
  const open = ordered.filter((s) => s.kind === 'open')
  const terminal = ordered.filter((s) => s.kind !== 'open')

  const currentIndex = open.findIndex((s) => s.id === currentStageId)
  const currentStage = ordered.find((s) => s.id === currentStageId)
  const isTerminal = currentStage ? currentStage.kind !== 'open' : false

  return (
    <div>
      <ol className="flex flex-wrap items-stretch gap-8">
        {open.map((stage, index) => {
          const isCurrent = stage.id === currentStageId
          const isSelected = stage.id === selectedStageId
          // Once a deal is won or lost, no open stage is "behind" it any more.
          const passed = !isTerminal && currentIndex > index
          const progress = completion[stage.id]

          return (
            <li key={stage.id} className="min-w-[128px] flex-1">
              <button
                onClick={() => onSelect(stage.id)}
                aria-current={isCurrent ? 'step' : undefined}
                aria-pressed={isSelected}
                title={[
                  isCurrent
                    ? `${stage.name} — the deal is here`
                    : `View ${stage.name}'s checklist and documents`,
                  stage.isChampionGate && 'A champion is required to move past this stage',
                  stage.expectedDays !== null && `${stage.expectedDays} days expected`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                className={cn(
                  'group w-full rounded-lg border px-8 py-8 text-left transition-colors',
                  isCurrent
                    ? 'border-transparent bg-badge-fill'
                    : 'border-hairline bg-paper hover:border-mist-gray hover:bg-pebble',
                  // The ring marks what is being read, and is drawn over either fill so the
                  // two states compose rather than compete.
                  isSelected && 'ring-2 ring-signal-blue ring-offset-2 ring-offset-cloud',
                )}
              >
                <span
                  className="mb-8 block h-[3px] w-full rounded-full"
                  style={{
                    backgroundColor:
                      isCurrent || passed ? stage.color : 'var(--color-hairline)',
                  }}
                  aria-hidden="true"
                />

                <span className="flex items-baseline justify-between gap-8">
                  <span
                    className={cn(
                      'text-caption leading-snug font-semibold',
                      isCurrent
                        ? 'text-ink-navy'
                        : passed
                          ? 'text-slate-gray'
                          : 'text-mist-gray',
                    )}
                  >
                    {stage.shortName}
                  </span>
                  {isCurrent ? (
                    <span className="shrink-0 text-caption font-semibold text-signal-blue">
                      {/* "Here" plus how long it has been here. On the current step those are one fact, and
                          the rail is where somebody looks to ask "how is this deal progressing". */}
                      {ageing && ageing.daysOver > 0 ? (
                        <span className="text-risk">{ageing.daysOver}d over</span>
                      ) : ageing ? (
                        `${ageing.daysUsed}d`
                      ) : (
                        'Here'
                      )}
                    </span>
                  ) : (
                    // Marked on the gate stage only, not on every stage the rule covers: one boundary is a
                    // landmark, six identical marks down the rail are wallpaper. The full sentence is in
                    // the title, and the refusal itself says the rest.
                    stage.isChampionGate && (
                      <span
                        aria-label="Champion gate"
                        title="A champion is required to move past this stage"
                        className="shrink-0 text-caption font-bold text-signal-blue"
                      >
                        ★
                      </span>
                    )
                  )}
                </span>

                <span className="mt-[2px] flex items-baseline justify-between gap-8">
                  <span className="text-caption text-mist-gray tabular-nums">
                    {stage.probability}%
                  </span>
                  {/* Only where there is a checklist. "0/0" reads as unfinished work when
                      the truth is that the stage defines none. */}
                  {progress && progress.total > 0 && (
                    <span
                      className={cn(
                        'shrink-0 text-caption tabular-nums',
                        progress.complete === progress.total
                          ? 'font-semibold text-signal-blue'
                          : 'text-mist-gray',
                      )}
                    >
                      {progress.complete}/{progress.total}
                    </span>
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ol>

      {terminal.length > 0 && (
        <div className="mt-16 flex flex-wrap items-center gap-8">
          <span className="text-caption font-semibold tracking-wide text-slate-gray uppercase">
            Outcome
          </span>
          {terminal.map((stage) => (
            <TerminalButton
              key={stage.id}
              stage={stage}
              isCurrent={stage.id === currentStageId}
              isSelected={stage.id === selectedStageId}
              onSelect={() => onSelect(stage.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TerminalButton({
  stage,
  isCurrent,
  isSelected,
  onSelect,
}: {
  stage: Stage
  isCurrent: boolean
  isSelected: boolean
  onSelect: () => void
}) {
  return (
    <button
      onClick={onSelect}
      aria-current={isCurrent ? 'step' : undefined}
      aria-pressed={isSelected}
      title={
        isCurrent ? `${stage.name} — the deal is here` : `View ${stage.name}'s documents`
      }
      className={cn(
        'inline-flex items-center gap-8 rounded-full border px-16 py-8 text-caption font-semibold transition-colors',
        isCurrent
          ? 'border-transparent text-paper'
          : 'border-hairline bg-paper text-slate-gray hover:bg-pebble',
        isSelected && 'ring-2 ring-signal-blue ring-offset-2 ring-offset-cloud',
      )}
      style={isCurrent ? { backgroundColor: stage.color } : undefined}
    >
      <span
        className="size-8 rounded-full"
        style={{ backgroundColor: isCurrent ? 'currentColor' : stage.color }}
        aria-hidden="true"
      />
      {stage.name}
    </button>
  )
}
