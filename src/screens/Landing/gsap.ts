import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

/**
 * One registration point for the landing page's animation stack.
 *
 * Every section below builds its ScrollTriggers inside a `gsap.matchMedia()` so that
 * two things are guaranteed by construction rather than by discipline:
 *
 *  - `mm.revert()` on unmount kills every trigger and restores every inline style the
 *    tweens wrote. The workspace is the same document — a leaked pinned trigger would
 *    keep rewriting `body` padding while a rep is dragging a deal.
 *  - The static fallback is the *authored* markup. Animated sections only ever start
 *    from a state gsap sets itself, so `prefers-reduced-motion` and narrow viewports
 *    get the finished composition, not a blank section.
 */
gsap.registerPlugin(ScrollTrigger)

/** Every scene animates in place and reads fine on a phone, so this is the only gate. */
export const CALM_MOTION_QUERY = '(prefers-reduced-motion: no-preference)'

export { gsap, ScrollTrigger }
