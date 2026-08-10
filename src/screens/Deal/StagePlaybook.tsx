import type { Stage } from '@/types/domain'

/**
 * The AidenAI methodology reference for a stage.
 *
 * Read-only, collapsed by default. These three fields are stored per spec 6.2 and nothing
 * enforces them, so a rep can see what the stage asks for and no stage change is blocked.
 *
 * Deliverables used to be a fourth section here and deliberately are not any more: they are
 * now a working checklist with checkboxes and documents, rendered by `StageChecklistPanel`
 * above. Showing them in both places would give a rep two lists of the same items, only one
 * of which does anything.
 *
 * Stages created in the pipeline builder have no methodology content, in which case this
 * renders nothing rather than three empty headings.
 */
export function StagePlaybook({ stage }: { stage: Stage }) {
  const sections = [
    { title: 'Entry criteria', hint: 'True before work starts', items: stage.entryCriteria },
    { title: 'Key activities', hint: 'What the stage is', items: stage.keyActivities },
    { title: 'Exit criteria', hint: 'True before advancing', items: stage.exitCriteria },
  ].filter((section) => section.items && section.items.length > 0)

  if (sections.length === 0) return null

  const total = sections.reduce((sum, section) => sum + (section.items?.length ?? 0), 0)

  return (
    <details className="group rounded-3xl border border-hairline bg-paper shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-16 p-24">
        <div>
          <h2 className="text-body-lg font-semibold text-ink-navy">Stage playbook</h2>
          <p className="mt-8 text-body-sm text-slate-gray">
            {total} reference points for {stage.name}. Guidance only — nothing here blocks a move.
          </p>
        </div>
        <svg
          viewBox="0 0 16 16"
          className="size-24 shrink-0 text-slate-gray transition-transform group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <path d="M4 6l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>

      <div className="grid gap-24 border-t border-hairline p-24 md:grid-cols-2">
        {sections.map((section) => (
          <section key={section.title}>
            <h3 className="text-caption font-semibold tracking-wide text-slate-gray uppercase">
              {section.title}
            </h3>
            <p className="mt-[2px] text-caption text-mist-gray">{section.hint}</p>
            <ul className="mt-8 space-y-8">
              {section.items?.map((item) => (
                <li key={item} className="flex gap-8 text-body-sm leading-relaxed text-slate-gray">
                  <span className="mt-8 size-[5px] shrink-0 rounded-full bg-mist-gray" aria-hidden="true" />
                  {item}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </details>
  )
}
