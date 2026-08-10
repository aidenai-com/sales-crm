import { useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { routes, useRouter } from '@/app/router'
import { pipelines } from '@/data/fixtures/pipelines'
import { CALM_MOTION_QUERY, gsap } from './gsap'
import { useScrollScene } from './useScrollScene'
import { FloatingMotifs, STAGE_MOTIFS } from './FloatingMotifs'

/**
 * The hero. Two-column split per design.md: display headline and action on the left, a
 * product mock on the right sitting in front of the decorative magenta/cyan blobs.
 *
 * The mock loops on its own — one deal card walking three stages, the active column
 * ringed as it lands. It's the page's only autoplaying motion, and it's here for the
 * reason every product site has one: showing the core gesture beats describing it. The
 * loop is built inside a media context, so `prefers-reduced-motion` gets the mock frozen
 * on its first stage instead of a blank frame.
 */

/** The first three real stages of the Direct Customer template. */
const STAGES = (pipelines.find((pipeline) => pipeline.id === 'pipe-direct')?.stages ?? [])
  .filter((stage) => stage.kind === 'open')
  .sort((a, b) => a.position - b.position)
  .slice(0, 3)

export function Hero() {
  const { navigate } = useRouter()
  const board = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)

  useScrollScene((mm) => {
    mm.add(CALM_MOTION_QUERY, () => {
      const columns = Array.from(board.current?.querySelectorAll<HTMLElement>('[data-column]') ?? [])
      const glows = Array.from(board.current?.querySelectorAll<HTMLElement>('[data-glow]') ?? [])
      const dealCard = card.current
      const cursor = board.current?.querySelector<HTMLElement>('[data-cursor]')
      if (columns.length !== 3 || !dealCard || !cursor) return

      // Read the real column positions rather than recomputing the grid's arithmetic.
      const offsetFor = (index: number) => columns[index].offsetLeft - columns[0].offsetLeft

      const timeline = gsap.timeline({ repeat: -1, defaults: { ease: 'power2.inOut' } })

      glows.forEach((glow, index) => {
        gsap.set(glow, { opacity: index === 0 ? 1 : 0 })
      })

      // Each move is a drag: the cursor arrives, the card lifts under it, both travel, the
      // card settles. Deals do not advance themselves — a rep moves them, and the mock
      // should not imply otherwise.
      for (let index = 1; index < 3; index += 1) {
        timeline
          .to(cursor, { opacity: 1, duration: 0.25 }, '+=0.8')
          .to(dealCard, { scale: 1.03, rotate: -1.5, duration: 0.25 }, '<')
          .to([dealCard, cursor], { x: () => offsetFor(index), duration: 0.8 })
          .to(glows[index - 1], { opacity: 0, duration: 0.4 }, '<')
          .to(glows[index], { opacity: 1, duration: 0.4 }, '<')
          .to(dealCard, { scale: 1, rotate: 0, duration: 0.25 })
          .to(cursor, { opacity: 0, duration: 0.25 }, '<')
      }

      // Reset by fading out and back in — snapping the card leftwards would read as a bug.
      timeline
        .to(dealCard, { opacity: 0, duration: 0.4 }, '+=1.2')
        .set([dealCard, cursor], { x: 0 })
        .set(glows[2], { opacity: 0 })
        .set(glows[0], { opacity: 1 })
        .to(dealCard, { opacity: 1, duration: 0.4 })

      // Function-based `x` values are re-read on invalidate, so a resize can't strand the
      // card between columns.
      const onResize = () => timeline.invalidate()
      window.addEventListener('resize', onResize)
      return () => window.removeEventListener('resize', onResize)
    })
  })

  return (
    <section
      aria-label="Introduction"
      className="relative flex min-h-screen items-center overflow-hidden bg-cloud px-24 pb-64 pt-96"
    >
      <FloatingMotifs motifs={STAGE_MOTIFS} />

      <div className="relative mx-auto grid w-full max-w-page items-center gap-48 md:grid-cols-2 md:gap-64">
        <div>
          <span className="inline-block rounded-full bg-badge-fill px-16 py-8 text-caption font-semibold text-deep-cobalt">
            Internal · Direct &amp; Partner motions
          </span>
          <h1
            className="mt-24 text-heading-sm font-bold leading-tight text-ink-navy md:text-heading lg:text-heading-lg"
            style={{ fontFamily: 'var(--font-voice)' }}
          >
            The pipeline your process already has.
          </h1>
          <p className="mt-24 max-w-[480px] text-body-lg text-slate-gray">
            Six stages with real probabilities, accounts that hold their leads and deals, and
            an Excel button on every view. It replaces the spreadsheet without becoming
            Salesforce.
          </p>
          <div className="mt-32 flex flex-wrap items-center gap-16">
            <Button onClick={() => navigate(routes.dashboard)}>Open the workspace</Button>
            <a href="#stages" className="text-body-sm font-semibold text-ink-navy hover:underline">
              See the six stages
            </a>
          </div>
        </div>

        {/* design.md: every product visual sits in front of an offset magenta/cyan blob. */}
        <div className="relative">
          <div className="absolute -left-24 -top-32 size-[220px] rounded-full bg-coral-magenta/25 blur-3xl" />
          <div className="absolute -bottom-32 -right-16 size-[240px] rounded-full bg-sky-cyan/25 blur-3xl" />

          <div ref={board} className="relative rounded-2xl border border-hairline bg-paper p-16 shadow-sm-2">
            <p className="mb-16 text-caption font-semibold uppercase tracking-[0.12em] text-slate-gray">
              Direct Customer pipeline
            </p>

            <div className="grid grid-cols-3 gap-8">
              {STAGES.map((stage) => (
                <div key={stage.id} data-column className="relative min-h-[140px] rounded-xl bg-pebble p-8">
                  <div
                    data-glow
                    className="pointer-events-none absolute inset-0 rounded-xl border-2 border-signal-blue opacity-0"
                  />
                  <p className="text-caption font-semibold text-ink-navy">{stage.shortName}</p>
                  <p className="mt-8 text-caption text-slate-gray">{stage.probability}%</p>
                </div>
              ))}
            </div>

            {/* Positioned over the first column; the timeline drags it to the others. */}
            <div
              ref={card}
              className="absolute left-16 top-[108px] w-[calc((100%-48px)/3)] rounded-xl border border-hairline bg-paper p-8 shadow-sm"
            >
              <p className="text-caption font-semibold text-ink-navy">Regulatory Reporting Agents</p>
              <p className="mt-8 text-caption text-slate-gray">JPMorgan Chase</p>
              <p className="mt-8 text-caption font-semibold text-ink-navy">$890K</p>
            </div>

            {/* The hand doing the moving. Hidden until a drag starts. */}
            <span
              data-cursor
              aria-hidden="true"
              className="pointer-events-none absolute left-[72px] top-[150px] text-ink-navy opacity-0"
            >
              <svg viewBox="0 0 24 24" className="size-24 drop-shadow" fill="currentColor">
                <path
                  d="M5 3l14 8.5-6.2 1.1L15 19.4l-2.6 1L10 13.3l-5 3.3z"
                  stroke="var(--color-paper)"
                  strokeWidth="1.5"
                />
              </svg>
            </span>
          </div>

          <p className="mt-16 text-center text-caption text-slate-gray md:text-left">
            Stages change when a rep moves the deal. Nothing advances on its own.
          </p>
        </div>
      </div>
    </section>
  )
}
