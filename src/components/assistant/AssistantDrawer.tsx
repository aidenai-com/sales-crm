import { useEffect, useRef, useState } from 'react'
import { Drawer } from '@/components/ui/Drawer'
import { useAssistant, type AssistantMessage } from '@/hooks/useAssistant'
import { contextualPrompts, useScreenContext, type ScreenContext } from '@/hooks/useScreenContext'
import { cn } from '@/lib/cn'
import { Markdown } from './Markdown'
import { ContextCard } from './ContextCard'

/**
 * The assistant, as a wide drawer on the right.
 *
 * Reuses the record drawer's shell rather than introducing a second panel: Escape, focus capture,
 * scroll locking and the scrim are already solved there, and two drawers behaving differently on
 * the same screen edge is the kind of inconsistency people notice without being able to name it.
 *
 * Three decisions separate this from a chat window with a CRM behind it:
 *
 *   1. Answers are routes, not text. Record names in a reply open the record — see `AnswerText`.
 *   2. Every answer shows what it read. These numbers get repeated in meetings, so the provenance
 *      of one is part of the answer rather than a debugging aid.
 *   3. The record in view is drawn as a record, not named as a string. See `ContextCard`.
 *
 * What it deliberately is not is a transcript. There is no history sidebar and nothing persists
 * past a reload: the questions here are about what is on screen now, and a stored conversation
 * about last week's pipeline would mostly be a store of stale numbers.
 */
export function AssistantDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { info, messages, streaming, ask, stop, reset } = useAssistant()
  const context = useScreenContext()
  const [draft, setDraft] = useState('')
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  // Follow the answer as it streams. Anchored to the last message's length as well as the count,
  // so it also scrolls while a single reply grows rather than only when a new one starts.
  const lastContent = messages[messages.length - 1]?.content ?? ''
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, lastContent])

  // The drawer exists to be typed into, so opening it puts the cursor there.
  useEffect(() => {
    if (open) input.current?.focus()
  }, [open])

  function submit(question: string) {
    setDraft('')
    void ask(question, context ? { type: context.type, id: context.id } : null)
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="wide"
      title="Ask about your pipeline"
      eyebrow="Assistant"
      footer={
        <Composer
          inputRef={input}
          value={draft}
          onChange={setDraft}
          onSubmit={() => submit(draft)}
          onStop={stop}
          streaming={streaming}
          model={info?.providerConfigured ? info.model : null}
          canReset={messages.length > 0 && !streaming}
          onReset={reset}
        />
      }
    >
      <div className="space-y-24">
        {context && <ContextCard context={context} />}

        {info && !info.providerConfigured && (
          <p className="rounded-xl border border-dashed border-hairline bg-cloud px-16 py-12 text-caption text-slate-gray">
            No model is connected yet. Set <Code>OPENAI_API_KEY</Code> in <Code>backend/.env</Code>{' '}
            and restart the API to switch this on.
          </p>
        )}

        <div ref={scroller}>
          {messages.length === 0 ? (
            <Starters context={context} pipelinePrompts={info?.quickPrompts ?? []} onPick={submit} />
          ) : (
            <ol className="space-y-24">
              {messages.map((message, index) => (
                <li key={index}>
                  <Turn message={message} streaming={streaming && index === messages.length - 1} />
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </Drawer>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-pebble px-[6px] py-[1px] font-mono text-[12px] text-ink-navy">
      {children}
    </code>
  )
}

/**
 * The opening screen — the most-viewed state of any assistant, and the one usually left as a
 * placeholder.
 *
 * Grouped rather than a flat grid of pills, because with a record open there are genuinely two
 * kinds of question available and the grouping is the fastest way to say so. When something is in
 * view, its questions come first: someone who opened this from a deal page is asking about that
 * deal, and the pipeline-wide questions are the fallback rather than the offer.
 *
 * Every prompt maps onto a tool that exists. A suggestion that returns "I can't do that" is worse
 * than no suggestion, so these are generated from the same place the tools are declared.
 */
function Starters({
  context,
  pipelinePrompts,
  onPick,
}: {
  context: ScreenContext | null
  pipelinePrompts: string[]
  onPick: (prompt: string) => void
}) {
  return (
    <div className="space-y-16">
      {context && (
        <Group
          label={`About this ${context.type}`}
          prompts={contextualPrompts(context)}
          onPick={onPick}
          emphasis
        />
      )}
      <Group
        label={context ? 'Across your pipeline' : 'Start here'}
        prompts={pipelinePrompts}
        onPick={onPick}
      />
      {/* <p className="text-caption text-mist-gray">
        I only read what you have access to, and I never change anything.
      </p> */}
    </div>
  )
}

function Group({
  label,
  prompts,
  onPick,
  emphasis = false,
}: {
  label: string
  prompts: string[]
  onPick: (prompt: string) => void
  emphasis?: boolean
}) {
  if (prompts.length === 0) return null

  return (
    <div>
      <p className="text-caption font-semibold tracking-wide text-slate-gray uppercase">{label}</p>
      <ul className="mt-8 space-y-[4px]">
        {prompts.map((prompt) => (
          <li key={prompt}>
            <button
              onClick={() => onPick(prompt)}
              className={cn(
                'group flex w-full items-center justify-between gap-8 rounded-lg border px-12 py-8 text-left',
                'text-caption leading-relaxed transition-colors duration-hover ease-ui',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal-blue',
                emphasis
                  ? 'border-signal-blue/25 bg-badge-fill text-ink-navy hover:border-signal-blue'
                  : 'border-hairline bg-paper text-ink-navy hover:border-signal-blue hover:bg-badge-fill',
              )}
            >
              <span className="min-w-0">{prompt}</span>
              <span
                aria-hidden
                className="shrink-0 text-mist-gray transition-transform duration-hover ease-ui group-hover:translate-x-[2px] group-hover:text-signal-blue"
              >
                <svg viewBox="0 0 16 16" className="size-[12px]" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 3.5l5 4.5-5 4.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * One turn.
 *
 * The question is a right-aligned filled bubble; the answer is not a bubble at all. Replies here
 * can run to a short list of deals, and boxing that in a tinted balloon costs readability for
 * nothing — so the answer sits on the page as prose with a marker beside it, exactly as the
 * activity timeline treats its entries.
 */
function Turn({ message, streaming }: { message: AssistantMessage; streaming: boolean }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[75%] rounded-xl rounded-br-sm bg-signal-blue px-12 py-8 text-caption leading-relaxed text-paper">
          {message.content}
        </p>
      </div>
    )
  }

  return (
    <div className="flex gap-12">
      <span
        aria-hidden
        className={cn(
          'mt-[2px] grid size-24 shrink-0 place-items-center rounded-lg bg-badge-fill text-signal-blue',
          streaming && 'motion-safe:animate-pulse',
        )}
      >
        <svg viewBox="0 0 16 16" className="size-[12px]" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M8 1.5l1.3 3.2L12.5 6 9.3 7.3 8 10.5 6.7 7.3 3.5 6l3.2-1.3z" strokeLinejoin="round" />
        </svg>
      </span>

      <div className="min-w-0 flex-1">
        {message.content ? <Markdown text={message.content} /> : !message.error && <Working />}

        {/* After the answer, not before it. What was read is supporting evidence for a claim, and
            evidence belongs under the claim — putting it above makes the reader work through
            plumbing to reach the sentence they asked for. */}
        {message.tools && message.tools.length > 0 && message.content && (
          <Provenance tools={message.tools} />
        )}

        {message.error && (
          <p className="mt-8 rounded-lg bg-risk-fill px-12 py-8 text-caption font-medium text-risk">
            {message.error}
          </p>
        )}
      </div>
    </div>
  )
}

/**
 * What the answer was based on.
 *
 * Worth the room it takes. These figures get quoted in a pipeline review, and "where did that come
 * from" is the first question anyone sensible asks — a line naming the lookups is the difference
 * between a number someone can defend and one they have to trust.
 */
function Provenance({ tools }: { tools: string[] }) {
  const unique = [...new Set(tools)]
  return (
    <p className="mt-12 flex flex-wrap items-center gap-x-8 gap-y-[4px] border-t border-hairline pt-8 text-caption text-mist-gray">
      <span className="font-medium">Read</span>
      {unique.map((tool, index) => (
        <span key={tool}>
          <span className="text-slate-gray">{readableTool(tool)}</span>
          {index < unique.length - 1 && <span className="text-mist-gray">,</span>}
        </span>
      ))}
    </p>
  )
}

/** Tool names are written for the model. This is what a person is told was consulted. */
function readableTool(name: string): string {
  const readable: Record<string, string> = {
    pipeline_summary: 'your open pipeline',
    deals_needing_attention: 'deals at risk',
    partner_performance: 'partner contribution',
    find_deals: 'deal search',
    recent_activity: 'recent activity',
    deal_detail: 'this deal’s record',
  }
  return readable[name] ?? name.replace(/_/g, ' ')
}

/** Shown only until the first token lands, so it is never on screen next to text. */
function Working() {
  return (
    <span className="flex items-center gap-8 text-caption text-mist-gray" role="status">
      <span className="flex items-center gap-[3px]" aria-hidden>
        {[0, 1, 2].map((index) => (
          <span
            key={index}
            className="size-8 rounded-full bg-mist-gray motion-safe:animate-pulse"
            style={{ animationDelay: `${index * 160}ms` }}
          />
        ))}
      </span>
      Looking at your data
    </span>
  )
}

function Composer({
  inputRef,
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  model,
  canReset,
  onReset,
}: {
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (next: string) => void
  onSubmit: () => void
  onStop: () => void
  streaming: boolean
  model: string | null
  canReset: boolean
  onReset: () => void
}) {
  // Grows with the text instead of reserving room for text nobody has typed. Two fixed rows cost
  // the same vertical space whether the question is three words or thirty, and in a drawer that
  // space comes straight out of the answer above it.
  function resize(element: HTMLTextAreaElement | null) {
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${Math.min(element.scrollHeight, MAX_INPUT_HEIGHT)}px`
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          onSubmit()
        }}
        className={cn(
          'flex items-end gap-8 rounded-2xl border border-hairline bg-paper py-8 pr-8 pl-16',
          'transition-colors duration-hover ease-ui focus-within:border-signal-blue',
        )}
      >
        <textarea
          ref={(element) => {
            inputRef.current = element
            resize(element)
          }}
          value={value}
          onChange={(event) => {
            onChange(event.target.value)
            resize(event.target)
          }}
          onKeyDown={(event) => {
            // Enter sends, Shift+Enter breaks the line — the convention every chat input follows
            // and the one people try first.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              onSubmit()
            }
          }}
          rows={1}
          placeholder="Ask about pipeline, deals or partners…"
          aria-label="Your question"
          className={cn(
            'min-w-0 flex-1 resize-none self-center bg-transparent py-[6px] text-body-sm leading-relaxed',
            'text-ink-navy placeholder:text-mist-gray focus:outline-none',
          )}
          style={{ maxHeight: MAX_INPUT_HEIGHT }}
        />

        {/* A round icon button inside the field rather than a full-width one beside it. The label
            "Ask" was a word explaining an arrow, and it cost the whole field's height to say it. */}
        {streaming ? (
          <button
            type="button"
            onClick={onStop}
            aria-label="Stop answering"
            title="Stop"
            className="grid size-32 shrink-0 place-items-center rounded-xl border border-hairline text-slate-gray transition-colors duration-hover ease-ui hover:border-risk hover:text-risk"
          >
            <span aria-hidden className="size-8 rounded-[2px] bg-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!value.trim()}
            aria-label="Send question"
            title="Send"
            className={cn(
              'grid size-32 shrink-0 place-items-center rounded-xl bg-signal-blue text-paper',
              'transition-colors duration-hover ease-ui hover:bg-deep-cobalt',
              'disabled:cursor-not-allowed disabled:bg-pebble disabled:text-mist-gray',
            )}
          >
            <svg viewBox="0 0 16 16" className="size-16" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
              <path d="M8 13V3.5M3.5 8L8 3.5 12.5 8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </form>

      <div className="flex items-center justify-between gap-16 px-[2px]">
        <p className="truncate text-caption text-mist-gray">
          {streaming ? 'Answering…' : 'Enter to send'}
          {model && <span className="hidden sm:inline"> · {model}</span>}
        </p>
        {canReset && (
          <button
            onClick={onReset}
            className="shrink-0 text-caption font-semibold text-signal-blue hover:underline"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

/** Roughly five lines. Past that the field would start eating the conversation it belongs to. */
const MAX_INPUT_HEIGHT = 132
