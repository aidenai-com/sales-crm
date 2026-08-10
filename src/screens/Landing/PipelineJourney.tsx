import { useRef } from 'react'
import { pipelines } from '@/data/fixtures/pipelines'
import { CALM_MOTION_QUERY, gsap } from './gsap'
import { useScrollScene } from './useScrollScene'

/**
 * Section 2 — the differentiator, drawn by hand.
 *
 * A pipeline here is a methodology, not a row of Kanban columns: six named stages, each
 * with a probability that means something. So the page draws it. Stroke-dashoffset is
 * scrubbed to scroll position, which makes the line reversible — scroll up and the path
 * un-draws back through the stages you came from.
 *
 * Stage names, probabilities and colours are read from the same seeded template the
 * Pipeline Board renders, so this can never drift from the product.
 */

/** The real Direct Customer template, open stages only (Closed Lost is not a journey). */
const STAGES = (pipelines.find((pipeline) => pipeline.id === 'pipe-direct')?.stages ?? [])
  .filter((stage) => stage.kind === 'open')
  .sort((a, b) => a.position - b.position)

/** Node coordinates in the SVG's user space, snaking up and to the right. */
const NODES = [
  { x: 96, y: 520, labelAbove: true },
  { x: 300, y: 384, labelAbove: false },
  { x: 490, y: 452, labelAbove: true },
  { x: 700, y: 250, labelAbove: false },
  { x: 900, y: 322, labelAbove: true },
  { x: 1104, y: 104, labelAbove: false },
]

const PATH_D = [
  'M96 520',
  'C 186 520, 214 384, 300 384',
  'C 392 384, 404 452, 490 452',
  'C 590 452, 606 250, 700 250',
  'C 792 250, 812 322, 900 322',
  'C 1002 322, 1018 104, 1104 104',
].join(' ')

/**
 * Where along the drawn line each node sits, as a fraction of total length. Measured
 * once from the path above rather than assumed even, because the curve between stage 4
 * and 5 is much shorter than the climb into stage 6.
 */
const NODE_AT = [0, 0.2, 0.36, 0.58, 0.75, 1]

/**
 * The methodology's stage names are full sentences, not Kanban labels — "Solution
 * Alignment & Competitive Strategy" is the point. So they're wrapped rather than
 * shortened: greedy fill at roughly 20 characters, which is the widest a label can run
 * before it collides with its neighbour at this node spacing.
 */
function wrap(text: string, limit = 20): string[] {
  const lines: string[] = []

  for (const word of text.split(' ')) {
    const current = lines[lines.length - 1]
    if (current && `${current} ${word}`.length <= limit) lines[lines.length - 1] = `${current} ${word}`
    else lines.push(word)
  }

  return lines
}

export function PipelineJourney() {
  const section = useRef<HTMLElement>(null)
  const path = useRef<SVGPathElement>(null)
  const nodes = useRef<Array<SVGGElement | null>>([])

  useScrollScene((mm) => {
    mm.add(CALM_MOTION_QUERY, () => {
      const line = path.current
      if (!line) return

      const length = line.getTotalLength()

      const timeline = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
          trigger: section.current,
          start: 'top top',
          // The most scroll distance on the page, deliberately. This is the argument.
          end: '+=340%',
          pin: true,
          scrub: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      })

      timeline.fromTo(
        line,
        { strokeDasharray: length, strokeDashoffset: length },
        { strokeDashoffset: 0, duration: 1 },
        0,
      )

      NODES.forEach((_, index) => {
        const node = nodes.current[index]
        if (!node) return

        const dot = node.querySelector('[data-dot]')
        const label = node.querySelector('[data-label]')
        const at = Math.max(0, NODE_AT[index] - 0.02)

        // Nodes light into their own stage colour — the board's colour ramp, no new hues.
        if (dot) {
          timeline.fromTo(
            dot,
            { fill: 'var(--color-hairline)', scale: 0.7, transformOrigin: 'center' },
            { fill: STAGES[index]?.color, scale: 1, duration: 0.05 },
            at,
          )
        }
        if (label) {
          timeline.fromTo(label, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.06 }, at)
        }
      })
    })
  })

  return (
    <section
      ref={section}
      id="stages"
      aria-label="The six stages of the AidenAI sales process"
      className="flex h-screen min-h-[640px] flex-col overflow-hidden bg-paper px-24 py-40"
    >
      {/* The section owns exactly one viewport. Header takes what it needs, the drawing
          takes the rest — `min-h-0` is what stops the flex child from overflowing and
          clipping the lower stages. */}
      <div className="mx-auto flex h-full w-full max-w-page flex-col">
        <p className="text-caption font-semibold uppercase tracking-[0.14em] text-slate-gray">
          The Direct Customer template
        </p>
        <h2 className="mt-8 max-w-[720px] text-heading-sm font-bold text-ink-navy">
          The AidenAI sales process, as your pipeline.
        </h2>
        <p className="mt-8 max-w-[640px] text-body text-slate-gray">
          These are the six stages the board renders — same names, same probabilities, with
          each stage&apos;s entry criteria, key activities and deliverables stored against it.
          A deal sits at 55% because the technical validation happened, not because the
          quarter is ending.
        </p>

        <svg
          viewBox="0 0 1200 620"
          preserveAspectRatio="xMidYMid meet"
          className="mt-24 min-h-0 w-full flex-1"
          role="img"
          aria-label={STAGES.map((stage) => `${stage.name} at ${stage.probability} percent`).join(', ')}
        >
          {/* The unlit rail, so the shape of the journey is legible before it draws. */}
          <path
            d={PATH_D}
            fill="none"
            stroke="var(--color-pebble)"
            strokeWidth="6"
            strokeLinecap="round"
          />
          <path
            ref={path}
            d={PATH_D}
            fill="none"
            stroke="var(--color-signal-blue)"
            strokeWidth="6"
            strokeLinecap="round"
          />

          {NODES.map((node, index) => {
            const stage = STAGES[index]
            if (!stage) return null
            const offset = node.labelAbove ? -1 : 1

            return (
              <g
                key={stage.id}
                ref={(element) => {
                  nodes.current[index] = element
                }}
              >
                <circle
                  data-dot
                  cx={node.x}
                  cy={node.y}
                  r="14"
                  fill={stage.color}
                  stroke="var(--color-paper)"
                  strokeWidth="4"
                />
                <g data-label>
                  <text
                    x={node.x}
                    y={node.y + offset * 42}
                    textAnchor="middle"
                    fontSize="26"
                    fontWeight="700"
                    fill="var(--color-ink-navy)"
                  >
                    {stage.probability}%
                  </text>
                  {/* Labels above the node stack upwards, so their lines are reversed to
                      keep the sentence reading top-to-bottom either way. */}
                  {(node.labelAbove ? [...wrap(stage.name)].reverse() : wrap(stage.name)).map(
                    (line, lineIndex) => (
                      <text
                        key={line}
                        x={node.x}
                        y={node.y + offset * (68 + lineIndex * 22)}
                        textAnchor="middle"
                        fontSize="17"
                        fontWeight="500"
                        fill="var(--color-slate-gray)"
                      >
                        {line}
                      </text>
                    ),
                  )}
                </g>
              </g>
            )
          })}
        </svg>
      </div>
    </section>
  )
}
