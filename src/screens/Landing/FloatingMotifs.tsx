import { useRef, type ReactNode } from 'react'
import { CALM_MOTION_QUERY, gsap } from './gsap'
import { useScrollScene } from './useScrollScene'

/**
 * The little UI chips that drift around the page — a stage badge here, a keyboard hint
 * there, a saved-to-Excel toast in the corner. They're atmosphere: scattered at
 * hand-picked positions, drifting on their own gentle loops rather than on scroll.
 *
 * They are decoration, so they are `aria-hidden` and they are the first thing to go
 * under `prefers-reduced-motion` — the drift never starts, and the chips simply sit
 * where they were placed.
 */

interface Motif {
  /** Placement, chosen per section rather than generated, so nothing lands on the copy. */
  position: string
  /** Seconds. Varied per chip so the group never pulses in unison. */
  duration: number
  delay: number
  drift: number
  content: ReactNode
}

const chip = 'rounded-full border border-hairline bg-paper px-16 py-8 text-caption font-semibold shadow-sm'

export const STAGE_MOTIFS: Motif[] = [
  {
    position: 'left-[4%] top-[18%]',
    duration: 5.5,
    delay: 0,
    drift: 14,
    content: (
      <span className={`${chip} flex items-center gap-8 text-ink-navy`}>
        <span className="size-8 rounded-full bg-signal-blue" />
        Stage advanced
      </span>
    ),
  },
  {
    position: 'right-[6%] top-[26%]',
    duration: 7,
    delay: 0.8,
    drift: -18,
    content: (
      <span className="rounded-full bg-badge-fill px-16 py-8 text-caption font-semibold text-deep-cobalt shadow-sm">
        55% · Technical Validation
      </span>
    ),
  },
  {
    position: 'left-[10%] bottom-[12%]',
    duration: 6.2,
    delay: 1.6,
    drift: 12,
    content: (
      <span className={`${chip} flex items-center gap-8 text-slate-gray`}>
        Ctrl
        <kbd className="rounded-md border border-hairline bg-pebble px-8 text-caption">K</kbd>
      </span>
    ),
  },
]

export const ASSEMBLY_MOTIFS: Motif[] = [
  {
    position: 'right-[7%] top-[16%]',
    duration: 6.6,
    delay: 0.3,
    drift: -16,
    content: (
      <span className={`${chip} flex items-center gap-8 text-ink-navy`}>
        <svg viewBox="0 0 20 20" className="size-16" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path
            d="M10 3v10m0 0l-3.5-3.5M10 13l3.5-3.5M3.5 16h13"
            strokeLinecap="round"
            className="stroke-signal-blue"
          />
        </svg>
        Exported to Excel
      </span>
    ),
  },
  {
    position: 'left-[5%] top-[62%]',
    duration: 5.8,
    delay: 1.1,
    drift: 15,
    content: <span className={`${chip} text-slate-gray`}>Drawer open · context kept</span>,
  },
]

export function FloatingMotifs({ motifs }: { motifs: Motif[] }) {
  const root = useRef<HTMLDivElement>(null)

  useScrollScene((mm) => {
    mm.add(CALM_MOTION_QUERY, () => {
      const chips = root.current?.querySelectorAll('[data-motif]')
      if (!chips) return

      chips.forEach((element, index) => {
        const motif = motifs[index]
        gsap.to(element, {
          y: motif.drift,
          duration: motif.duration,
          delay: motif.delay,
          ease: 'sine.inOut',
          repeat: -1,
          yoyo: true,
        })
      })
    })
  })

  return (
    <div ref={root} aria-hidden="true" className="pointer-events-none absolute inset-0 hidden md:block">
      {motifs.map((motif, index) => (
        <span key={index} data-motif className={`absolute ${motif.position}`}>
          {motif.content}
        </span>
      ))}
    </div>
  )
}
