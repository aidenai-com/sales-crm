import { useMemo, type ReactNode } from 'react'
import { useSelection } from '@/app/selection'
import { useStore } from '@/data/store'
import { HealthDot } from '@/components/ui/Badge'
import { buildDealViews } from '@/lib/rollup'

/**
 * An answer, with the records it mentions turned into things you can open.
 *
 * This is the one thing a general-purpose chat window cannot do and the reason this drawer is
 * worth building instead of pasting a question into one. An assistant that says "Acme Expansion
 * is stalled" and leaves you to go and find Acme Expansion has handed you a second task. Here the
 * name is the record: clicking it opens the same drawer the rest of the app opens, so the answer
 * is a route into the data rather than a description of it.
 *
 * Matching is deliberately conservative, because a false positive is worse than a missed link —
 * an underlined word that opens the wrong deal is a lie about the data:
 *
 *   - Only names of four characters or more. "ACE" or "BU2" would match half the alphabet.
 *   - Longest name first, so "Acme Corp Manufacturing" wins over "Acme Corp" inside it.
 *   - Word boundaries only, so "Acme" does not match inside "Acmetech".
 *   - Each match consumes its span, so nothing is linked twice or nested.
 *
 * This handles inline text only. Block structure — lists, tables, headings — belongs to
 * `Markdown`, which calls this for every plain run it produces. The split keeps the matching
 * logic here in one place instead of once per block type.
 */

interface Mention {
  name: string
  onOpen: () => void
  /** Rendered before the name, when the record has one — deals do, accounts do not. */
  marker?: ReactNode
}

export function RecordText({ text }: { text: string }) {
  const { snapshot } = useStore()
  const { select } = useSelection()

  const mentions = useMemo(() => {
    const views = buildDealViews(snapshot)
    const found: Mention[] = []

    for (const view of views) {
      if (view.deal.name.length >= 4) {
        found.push({
          name: view.deal.name,
          onOpen: () => select({ type: 'deal', id: view.deal.id }),
          // The health dot travels with the name, so an answer about a stalled deal carries the
          // same colour the board and the drawer use for it. The word says what; the dot says
          // how it is doing, without the model having to remember to mention it.
          marker: <HealthDot health={view.health} detail={view.healthDetail} />,
        })
      }
    }

    for (const account of snapshot.accounts) {
      if (account.name.length >= 4) {
        found.push({
          name: account.name,
          onOpen: () => select({ type: 'account', id: account.id }),
        })
      }
    }

    return found.sort((a, b) => b.name.length - a.name.length)
  }, [snapshot, select])

  const segments = useMemo(() => linkify(text, mentions), [text, mentions])

  return (
    <>
      {segments.map((segment, index) =>
        typeof segment === 'string' ? (
          segment
        ) : (
          <button
            key={index}
            onClick={segment.mention.onOpen}
            title={`Open ${segment.mention.name}`}
            className="mx-[1px] inline-flex max-w-full items-center gap-[4px] rounded-md bg-badge-fill px-[6px] align-baseline font-semibold text-signal-blue transition-colors hover:bg-signal-blue hover:text-paper"
          >
            {segment.mention.marker}
            <span className="truncate">{segment.text}</span>
          </button>
        ),
      )}
    </>
  )
}

type Segment = string | { text: string; mention: Mention }

/**
 * Splits text into plain runs and record references.
 *
 * A single left-to-right pass. At each position the longest mention that starts there wins, and
 * the cursor jumps past it — which is what stops a shorter name inside a longer one producing a
 * second, wrong link.
 */
function linkify(text: string, mentions: Mention[]): Segment[] {
  if (!text || mentions.length === 0) return [text]

  const lower = text.toLowerCase()
  const segments: Segment[] = []
  let plainFrom = 0
  let cursor = 0

  const isBoundary = (index: number) => {
    if (index < 0 || index >= text.length) return true
    return !/[a-z0-9]/i.test(text[index])
  }

  while (cursor < text.length) {
    let hit: Mention | null = null

    for (const mention of mentions) {
      const name = mention.name.toLowerCase()
      if (!lower.startsWith(name, cursor)) continue
      if (!isBoundary(cursor - 1) || !isBoundary(cursor + name.length)) continue
      hit = mention
      break // mentions are pre-sorted longest-first, so the first match is the longest
    }

    if (hit) {
      if (cursor > plainFrom) segments.push(text.slice(plainFrom, cursor))
      segments.push({ text: text.slice(cursor, cursor + hit.name.length), mention: hit })
      cursor += hit.name.length
      plainFrom = cursor
    } else {
      cursor += 1
    }
  }

  if (plainFrom < text.length) segments.push(text.slice(plainFrom))
  return segments
}
