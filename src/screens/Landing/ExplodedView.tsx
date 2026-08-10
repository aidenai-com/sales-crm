import { useRef } from 'react'
import { CALM_MOTION_QUERY, gsap } from './gsap'
import { useScrollScene } from './useScrollScene'
import { ASSEMBLY_MOTIFS, FloatingMotifs } from './FloatingMotifs'

/**
 * Section 3 — three screens, one product.
 *
 * Dashboard, Pipeline Board and Account Explorer arrive from three directions and lock
 * into a single composed surface. The point is the lock, not the flight: these aren't
 * three features bolted together, they're three views of the same hierarchy.
 *
 * The offscreen start positions are derived from the measured viewport, which is exactly
 * why `useScrollScene` waits a frame before building — a fragment measured mid-layout
 * starts partly onscreen and the assembly reads as a nudge instead of an arrival.
 */

/** Fragment 1 — a Dashboard metric-card cluster. */
function MetricFragment() {
  const metrics = [
    { label: 'Open pipeline', value: '$4.2M' },
    { label: 'Advanced stage', value: '7' },
    { label: 'Closing this week', value: '3' },
  ]

  return (
    <div className="w-full rounded-2xl border border-hairline bg-paper p-16 shadow-sm-2">
      <p className="mb-16 text-caption font-semibold uppercase tracking-[0.12em] text-slate-gray">
        Dashboard
      </p>
      <div className="grid grid-cols-3 gap-8">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-xl bg-pebble p-8">
            <p className="text-body-lg font-bold text-ink-navy">{metric.value}</p>
            <p className="mt-8 text-caption text-slate-gray">{metric.label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Fragment 2 — one Pipeline Board column with its deal cards. */
function BoardFragment() {
  const deals = [
    { customer: 'Bank of America', name: 'Advisor Copilot Platform', value: '$3.1M' },
    { customer: 'JPMorgan Chase', name: 'Mainframe COBOL Refactor', value: '$2.75M' },
  ]

  return (
    <div className="w-full rounded-2xl border border-hairline bg-paper p-16 shadow-sm-2">
      <div className="mb-16 flex items-center justify-between">
        <p className="text-caption font-semibold uppercase tracking-[0.12em] text-slate-gray">
          Technical Validation &amp; ROI
        </p>
        <span className="rounded-full bg-badge-fill px-8 py-[2px] text-caption font-medium text-deep-cobalt">
          55%
        </span>
      </div>
      <div className="flex flex-col gap-8">
        {deals.map((deal) => (
          <div key={deal.name} className="rounded-xl border border-hairline bg-cloud p-8">
            <p className="text-body-sm font-semibold text-ink-navy">{deal.name}</p>
            <p className="mt-8 flex items-center justify-between text-caption text-slate-gray">
              <span>{deal.customer}</span>
              <span className="font-semibold text-ink-navy">{deal.value}</span>
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Fragment 3 — an Account Explorer tree row, expanded one level. */
function ExplorerFragment() {
  return (
    <div className="w-full rounded-2xl border border-hairline bg-paper p-16 shadow-sm-2">
      <p className="mb-16 text-caption font-semibold uppercase tracking-[0.12em] text-slate-gray">
        Accounts
      </p>
      <div className="text-body-sm">
        <p className="flex items-center gap-8 font-semibold text-ink-navy">
          <svg viewBox="0 0 16 16" className="size-16 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6l4 4 4-4" strokeLinecap="round" />
          </svg>
          Bank of America
        </p>
        <p className="mt-8 flex items-center justify-between border-l border-hairline pl-16 text-slate-gray">
          <span>Wealth &amp; Asset Management</span>
          <span className="font-semibold text-ink-navy">$3.1M</span>
        </p>
        <p className="mt-8 flex items-center justify-between border-l border-hairline pl-16 text-slate-gray">
          <span>Compliance</span>
          <span className="font-semibold text-ink-navy">$1.45M</span>
        </p>
      </div>
    </div>
  )
}

export function ExplodedView() {
  const section = useRef<HTMLElement>(null)
  const fragments = useRef<Array<HTMLDivElement | null>>([])

  useScrollScene((mm) => {
    mm.add(CALM_MOTION_QUERY, () => {
      const [top, left, right] = fragments.current
      if (!top || !left || !right) return

      const width = () => window.innerWidth
      const height = () => window.innerHeight

      const timeline = gsap.timeline({
        defaults: { ease: 'power2.out' },
        scrollTrigger: {
          trigger: section.current,
          start: 'top top',
          // The extra 60% past the lock is the hold — the assembled state gets a beat.
          end: '+=200%',
          pin: true,
          scrub: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
        },
      })

      timeline
        .fromTo(
          top,
          { y: () => -height() * 0.8, x: () => width() * 0.2, rotate: 6, opacity: 0 },
          { y: 0, x: 0, rotate: 0, opacity: 1, duration: 0.4 },
          0,
        )
        .fromTo(
          left,
          { x: () => -width() * 0.9, y: 80, rotate: -8, opacity: 0 },
          { x: 0, y: 0, rotate: 0, opacity: 1, duration: 0.4 },
          0.05,
        )
        .fromTo(
          right,
          { x: () => width() * 0.9, y: 120, rotate: 8, opacity: 0 },
          { x: 0, y: 0, rotate: 0, opacity: 1, duration: 0.4 },
          0.1,
        )
        // Nothing moves for the last third: the composed product just sits there.
        .to({}, { duration: 0.3 })
    })
  })

  return (
    <section
      ref={section}
      aria-label="Three screens, one product"
      className="relative flex min-h-screen items-center overflow-hidden bg-cloud px-24 py-64"
    >
      <FloatingMotifs motifs={ASSEMBLY_MOTIFS} />

      <div className="relative mx-auto w-full max-w-[880px]">
        <h2 className="text-center text-heading-sm font-bold text-ink-navy md:text-heading">
          Three screens. One hierarchy.
        </h2>
        <p className="mx-auto mt-16 max-w-[520px] text-center text-body text-slate-gray">
          Account to lead to deal, the whole way down. Change a deal on any surface and the
          other two already agree with you.
        </p>

        <div className="relative mt-40 grid gap-16 md:grid-cols-2">
          <div
            ref={(element) => {
              fragments.current[0] = element
            }}
            className="md:col-span-2"
          >
            <MetricFragment />
          </div>
          <div
            ref={(element) => {
              fragments.current[1] = element
            }}
          >
            <BoardFragment />
          </div>
          <div
            ref={(element) => {
              fragments.current[2] = element
            }}
          >
            <ExplorerFragment />
          </div>
        </div>
      </div>
    </section>
  )
}
