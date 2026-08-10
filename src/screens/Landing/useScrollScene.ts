import { useLayoutEffect } from 'react'
import { ScrollTrigger, gsap } from './gsap'

/**
 * Builds a scroll scene after layout has settled, and tears it down completely.
 *
 * The rAF matters: these scenes measure `scrollWidth` and `window.innerWidth` to work
 * out pin distances and offscreen start positions. In React those measurements can run
 * before the browser has finished laying out a freshly mounted flex/grid subtree, which
 * yields short pins and fragments that start half onscreen. One frame is enough for the
 * layout to be real; `ScrollTrigger.refresh()` then re-reads it once more.
 */
export function useScrollScene(setup: (mm: gsap.MatchMedia) => void) {
  useLayoutEffect(() => {
    const mm = gsap.matchMedia()
    const frame = requestAnimationFrame(() => {
      setup(mm)
      ScrollTrigger.refresh()
    })

    return () => {
      cancelAnimationFrame(frame)
      // Reverts the media contexts: kills their ScrollTriggers, unpins, and rolls back
      // every inline style the tweens wrote. Nothing survives into the app shell.
      mm.revert()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
