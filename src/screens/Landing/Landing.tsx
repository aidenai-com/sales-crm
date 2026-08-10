import { Button } from '@/components/ui/Button'
import { ThemeToggle } from '@/components/ui/ThemeToggle'
import { Link, routes, useRouter } from '@/app/router'
import { Hero } from './Hero'
import { PipelineJourney } from './PipelineJourney'
import { ExplodedView } from './ExplodedView'
import { FeatureGallery } from './FeatureGallery'

/**
 * The landing page.
 *
 * A static hero, then three scroll-driven sections, then the ask. Everything after the
 * hero is scrubbed to scroll position rather than played on a timer — the same contract
 * the workspace makes: nothing happens unless you do it. The hero's looping product mock
 * and the drifting UI chips are the deliberate exceptions; they're atmosphere.
 *
 * The final section is the exception to everything above: no pin, no scrub, no scene. The
 * page stops performing and asks for the click.
 */
export function Landing() {
  const { navigate } = useRouter()

  return (
    <div className="bg-cloud">
      <header className="absolute inset-x-0 top-0 z-40">
        <div className="mx-auto flex h-64 max-w-page items-center justify-between px-24">
          <span className="flex items-center gap-8">
            <span className="grid size-32 place-items-center rounded-lg bg-ink-navy text-body-sm font-bold text-paper">
              A
            </span>
            <span className="text-body-lg font-bold text-ink-navy">Sales CRM</span>
          </span>
          <span className="flex items-center gap-8">
            <ThemeToggle />
            <Link
              to={routes.dashboard}
              className="rounded-lg px-16 py-8 text-body-sm font-semibold text-ink-navy transition-colors hover:bg-pebble"
            >
              Open the workspace
            </Link>
          </span>
        </div>
      </header>

      <main>
        <Hero />
        <PipelineJourney />
        <ExplodedView />
        <FeatureGallery />

        <section className="flex min-h-[70vh] items-center justify-center bg-cloud px-24 py-96">
          <div className="max-w-[640px] text-center">
            <h2 className="text-heading-sm font-bold text-ink-navy md:text-heading">
              Your pipeline is already this shape. Start using it.
            </h2>
            <p className="mx-auto mt-24 max-w-[480px] text-body text-slate-gray">
              Six stages, two motions, one hierarchy. No setup, no import, no migration
              meeting.
            </p>
            <Button className="mt-32" onClick={() => navigate(routes.dashboard)}>
              Open the workspace
            </Button>
          </div>
        </section>
      </main>
    </div>
  )
}
