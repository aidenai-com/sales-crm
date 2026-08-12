import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { RecordText } from './AnswerText'

/**
 * The markdown a model actually emits, rendered — and nothing else.
 *
 * Hand-written for the same reason there is no router library, no charting library and no toast
 * library in this application: what arrives here is a bounded subset — headings, bullets, numbered
 * steps, bold, inline code, and pipe tables — and a full CommonMark implementation is tens of
 * kilobytes plus an HTML pipeline for text that came from a model. Anything it does not recognise
 * falls through as literal text, which is the correct failure: a stray `~~` on screen is a
 * cosmetic problem, where `dangerouslySetInnerHTML` on model output is an injection surface.
 *
 * Tables matter more here than they look. Ask this assistant which deals are at risk and the answer
 * is a table of five records — as raw pipes it is unreadable, and rendered it becomes the most
 * useful thing on screen. So a table renders with the same hairline borders and tabular figures the
 * Analytics screen uses, and its cells still resolve record names into links.
 *
 * Composition: this owns block structure, `RecordText` owns inline record linking. Every plain run
 * this produces passes through it, so a deal named in a table cell is as clickable as one in a
 * sentence.
 */

export function Markdown({ text }: { text: string }) {
  return <div className="space-y-8">{renderBlocks(text)}</div>
}

// --- Blocks -------------------------------------------------------------------

function renderBlocks(text: string): ReactNode[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const blocks: ReactNode[] = []
  let index = 0
  let key = 0

  while (index < lines.length) {
    const line = lines[index]

    if (!line.trim()) {
      index += 1
      continue
    }

    // Fenced code. Consumed to the closing fence, or to the end while the answer is still
    // streaming — a half-arrived block should render as code, not as prose with backticks in it.
    if (line.trimStart().startsWith('```')) {
      const body: string[] = []
      index += 1
      while (index < lines.length && !lines[index].trimStart().startsWith('```')) {
        body.push(lines[index])
        index += 1
      }
      index += 1
      blocks.push(
        <pre
          key={key++}
          className="overflow-x-auto rounded-xl border border-hairline bg-cloud px-16 py-12 font-mono text-[12px] leading-relaxed text-ink-navy"
        >
          {body.join('\n')}
        </pre>,
      )
      continue
    }

    // Pipe table: a header row, a separator of dashes, then rows.
    if (isTableRow(line) && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      const header = splitRow(line)
      index += 2
      const rows: string[][] = []
      while (index < lines.length && isTableRow(lines[index])) {
        rows.push(splitRow(lines[index]))
        index += 1
      }
      blocks.push(<Table key={key++} header={header} rows={rows} />)
      continue
    }

    const heading = /^(#{1,4})\s+(.*)$/.exec(line.trim())
    if (heading) {
      blocks.push(
        <p key={key++} className="pt-8 text-body-sm font-semibold text-ink-navy">
          <Inline text={heading[2]} />
        </p>,
      )
      index += 1
      continue
    }

    if (isBullet(line) || isOrdered(line)) {
      const ordered = isOrdered(line)
      const items: string[] = []
      while (index < lines.length && (ordered ? isOrdered(lines[index]) : isBullet(lines[index]))) {
        items.push(lines[index].trim().replace(ordered ? /^\d+[.)]\s+/ : /^[-*•]\s+/, ''))
        index += 1
      }
      blocks.push(<List key={key++} items={items} ordered={ordered} />)
      continue
    }

    // Paragraph: everything up to a blank line or the start of another block.
    const paragraph: string[] = []
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isBullet(lines[index]) &&
      !isOrdered(lines[index]) &&
      !isTableRow(lines[index]) &&
      !lines[index].trimStart().startsWith('```') &&
      !/^#{1,4}\s/.test(lines[index].trim())
    ) {
      paragraph.push(lines[index].trim())
      index += 1
    }
    blocks.push(
      <p key={key++} className="text-body-sm leading-relaxed text-ink-navy">
        <Inline text={paragraph.join(' ')} />
      </p>,
    )
  }

  return blocks
}

const isBullet = (line: string) => /^\s*[-*•]\s+/.test(line)
const isOrdered = (line: string) => /^\s*\d+[.)]\s+/.test(line)
const isTableRow = (line: string) => line.trim().startsWith('|') && line.trim().endsWith('|')
const isTableDivider = (line: string) => /^\s*\|[\s:|-]+\|\s*$/.test(line)

const splitRow = (line: string) =>
  line
    .trim()
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim())

function List({ items, ordered }: { items: string[]; ordered: boolean }) {
  return (
    <ul className="space-y-[4px]">
      {items.map((item, index) => (
        <li key={index} className="flex gap-8 text-body-sm leading-relaxed text-ink-navy">
          {/* A numeral for a sequence, a dot for a set. The model uses ordered lists for steps,
              where the order is the information, and bullets for findings, where it is not. */}
          <span
            aria-hidden
            className={cn(
              'shrink-0 tabular-nums',
              ordered ? 'min-w-16 font-semibold text-signal-blue' : 'text-mist-gray',
            )}
          >
            {ordered ? `${index + 1}.` : '·'}
          </span>
          <span className="min-w-0">
            <Inline text={item} />
          </span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Numbers right-aligned, labels left — the same rule the Analytics tables follow, so a table in an
 * answer reads like a table in the app rather than like output from something else.
 */
function Table({ header, rows }: { header: string[]; rows: string[][] }) {
  const numeric = header.map((_, column) =>
    rows.every((row) => !row[column] || looksNumeric(row[column])),
  )

  return (
    <div className="-mx-8 overflow-x-auto px-8">
      <table className="w-full border-collapse text-caption">
        <thead>
          <tr>
            {header.map((cell, column) => (
              <th
                key={column}
                scope="col"
                className={cn(
                  'border-b border-hairline pb-8 pr-12 font-semibold tracking-wide text-slate-gray uppercase',
                  numeric[column] && column > 0 ? 'text-right' : 'text-left',
                )}
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {header.map((_, column) => (
                <td
                  key={column}
                  className={cn(
                    'border-b border-hairline py-8 pr-12 last:pr-0',
                    numeric[column] && column > 0
                      ? 'text-right tabular-nums text-ink-navy'
                      : 'text-ink-navy',
                  )}
                >
                  <Inline text={row[column] ?? ''} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const looksNumeric = (value: string) => /^[$€£]?\s*-?[\d,.]+\s*%?$/.test(value.trim())

// --- Inline -------------------------------------------------------------------

/**
 * Bold, italic and inline code, then record links for whatever is left.
 *
 * One regex over the run rather than a nested parser: these markers do not nest in practice — a
 * model does not emit bold inside code — and a real inline parser would be several times the size
 * for output nobody would notice.
 */
function Inline({ text }: { text: string }) {
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|`[^`]+`|\*[^*\n]+\*|(?<![a-z0-9])_[^_\n]+_(?![a-z0-9]))/gi
  const parts = text.split(pattern).filter((part) => part !== undefined && part !== '')

  return (
    <>
      {parts.map((part, index) => {
        if (/^(\*\*|__).+(\*\*|__)$/.test(part)) {
          return (
            <strong key={index} className="font-semibold text-ink-navy">
              <RecordText text={part.slice(2, -2)} />
            </strong>
          )
        }
        if (/^`.+`$/.test(part)) {
          return (
            <code
              key={index}
              className="rounded-md bg-pebble px-[4px] py-[1px] font-mono text-[12px] text-ink-navy"
            >
              {part.slice(1, -1)}
            </code>
          )
        }
        if (/^[*_].+[*_]$/.test(part)) {
          return (
            <em key={index} className="italic">
              <RecordText text={part.slice(1, -1)} />
            </em>
          )
        }
        return (
          <Fragment key={index}>
            <RecordText text={part} />
          </Fragment>
        )
      })}
    </>
  )
}
