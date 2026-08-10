import { Link, routes } from '@/app/router'
import { EmptyState } from '@/components/ui/Card'

export function NotFound() {
  return (
    <div className="mx-auto max-w-page px-24 py-96">
      <EmptyState
        title="There is nothing at this address"
        hint="The link may be out of date. Pick up from the dashboard or go straight to your deals."
      />
      <div className="mt-24 flex justify-center gap-16">
        <Link
          to={routes.dashboard}
          className="rounded-lg bg-signal-blue px-16 py-[10px] text-button font-semibold text-paper hover:bg-deep-cobalt"
        >
          Go to dashboard
        </Link>
        <Link
          to={routes.deals}
          className="rounded-lg border border-hairline bg-paper px-16 py-[10px] text-button font-semibold text-ink-navy hover:bg-pebble"
        >
          View all deals
        </Link>
      </div>
    </div>
  )
}
