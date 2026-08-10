import { useRef, type ReactNode } from 'react'
import { Card } from '@/components/ui/Card'
import { CALM_MOTION_QUERY, gsap } from './gsap'
import { useScrollScene } from './useScrollScene'

/**
 * Section 4 — what actually ships.
 *
 * One card per shipped v1 feature. Nothing aspirational: drag-and-drop stage moves, the
 * drawer, the tree, Excel on every view, Ctrl+K. Card treatment is design.md's feature
 * panel via the app's own `Card`, not a bespoke landing-page card.
 *
 * A plain grid, scrolled the way the rest of the web is scrolled. Each card rises into
 * place on its own scrubbed trigger, so the reveal still answers to the scroll wheel.
 */

interface Feature {
  title: string
  copy: string
  visual: ReactNode
}

/** Small flat mocks rather than icons — the visual should show the thing working. */
const DragVisual = (
  <div className="flex gap-8">
    <div className="flex-1 rounded-xl bg-pebble p-8">
      <div className="h-16 rounded-md bg-hairline" />
    </div>
    <div className="flex-1 rounded-xl border-2 border-dashed border-signal-blue bg-badge-fill p-8">
      <div className="h-16 rounded-md bg-signal-blue/40" />
    </div>
  </div>
)

const DrawerVisual = (
  <div className="flex gap-8">
    <div className="flex-1 space-y-8 rounded-xl bg-pebble p-8">
      <div className="h-8 w-2/3 rounded-md bg-hairline" />
      <div className="h-8 w-1/2 rounded-md bg-hairline" />
    </div>
    <div className="w-[45%] space-y-8 rounded-xl border border-hairline bg-paper p-8 shadow-sm">
      <div className="h-8 w-3/4 rounded-md bg-ink-navy/70" />
      <div className="h-8 rounded-md bg-hairline" />
      <div className="h-8 w-1/2 rounded-md bg-hairline" />
    </div>
  </div>
)

const TreeVisual = (
  <div className="space-y-8 text-body-sm">
    <p className="font-semibold text-ink-navy">Bank of America</p>
    <p className="border-l border-hairline pl-16 text-slate-gray">Wealth &amp; Asset Management</p>
    <p className="border-l border-hairline pl-16 text-slate-gray">Compliance</p>
    <p className="ml-16 border-l border-hairline pl-16 text-mist-gray">Advisor Copilot Platform · 55%</p>
  </div>
)

const ExportVisual = (
  <div className="flex items-center gap-8 rounded-xl bg-pebble p-8">
    <svg viewBox="0 0 20 20" className="size-24 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M10 3v10m0 0l-3.5-3.5M10 13l3.5-3.5M3.5 16h13" strokeLinecap="round" className="stroke-signal-blue" />
    </svg>
    <span className="text-body-sm font-semibold text-ink-navy">deals-direct-2026-07.xlsx</span>
  </div>
)

const SearchVisual = (
  <div className="flex items-center gap-8 rounded-xl border border-hairline bg-paper p-8">
    <span className="flex-1 text-body-sm text-mist-gray">Search accounts, leads, deals…</span>
    <kbd className="rounded-md border border-hairline bg-pebble px-8 py-[2px] text-caption font-medium text-slate-gray">
      Ctrl K
    </kbd>
  </div>
)

const FEATURES: Feature[] = [
  {
    title: 'Move a deal by moving it',
    copy: 'Drag between stages on the board. The stage, its probability and the deal history keep themselves in sync.',
    visual: DragVisual,
  },
  {
    title: 'Edit without leaving',
    copy: 'Every record opens in a right-side drawer. You never lose the board, the tree, or your scroll position.',
    visual: DrawerVisual,
  },
  {
    title: 'Navigate the hierarchy',
    copy: 'Account to lead to deal, expanded only as far as you need it. Rolled-up value and health at every level.',
    visual: TreeVisual,
  },
  {
    title: 'Excel on every view',
    copy: 'Board, list, tree — each one downloads to a spreadsheet, because someone will always ask for one.',
    visual: ExportVisual,
  },
  {
    title: 'Ctrl+K, then type',
    copy: 'One search across accounts, leads and deals. It opens over your work and closes back into it.',
    visual: SearchVisual,
  },
]

export function FeatureGallery() {
  const grid = useRef<HTMLDivElement>(null)

  useScrollScene((mm) => {
    mm.add(CALM_MOTION_QUERY, () => {
      const cards = grid.current?.querySelectorAll('[data-feature]')
      if (!cards) return

      cards.forEach((element) => {
        gsap.fromTo(
          element,
          { y: 48, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            ease: 'none',
            scrollTrigger: {
              trigger: element,
              start: 'top 92%',
              end: 'top 62%',
              scrub: true,
            },
          },
        )
      })
    })
  })

  return (
    <section aria-label="What is built" className="bg-paper px-24 py-96">
      <div className="mx-auto w-full max-w-page">
        <h2 className="text-heading-sm font-bold text-ink-navy md:text-heading">Shipped, not planned.</h2>
        <p className="mt-16 max-w-[560px] text-body text-slate-gray">
          Five things this does today. Everything else on the roadmap stayed off it.
        </p>

        <div ref={grid} className="mt-40 grid gap-24 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div key={feature.title} data-feature className="flex">
              <Card className="flex w-full flex-col justify-between">
                <div>
                  <h3 className="text-subheading font-bold text-ink-navy">{feature.title}</h3>
                  <p className="mt-16 text-body text-slate-gray">{feature.copy}</p>
                </div>
                <div className="mt-24">{feature.visual}</div>
              </Card>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
