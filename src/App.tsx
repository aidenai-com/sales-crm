import { useEffect, useState } from 'react'
import { StoreProvider, useStore } from '@/data/store'
import { ThemeProvider } from '@/app/theme'
import { AuthProvider, useAuth } from '@/app/auth'
import { SelectionProvider } from '@/app/selection'
import { CreationProvider } from '@/app/creation'
import { RouterProvider, useRouter } from '@/app/router'
import { ToastProvider } from '@/app/toast'
import { TopNav } from '@/components/layout/TopNav'
import { SearchOverlay } from '@/components/layout/SearchOverlay'
import { RecordDrawer } from '@/components/drawers/RecordDrawer'
import { CreateDrawer } from '@/components/create/CreateDrawer'
import { ActivityBar } from '@/components/ui/ActivityBar'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { Dashboard } from '@/screens/Dashboard/Dashboard'
import { Analytics } from '@/screens/Analytics/Analytics'
import { PipelineBoard } from '@/screens/Pipeline/PipelineBoard'
import { AccountExplorer } from '@/screens/Accounts/AccountExplorer'
import { DealsIndex } from '@/screens/Deals/DealsIndex'
import { DealPage } from '@/screens/Deal/DealPage'
import { PipelineSettings } from '@/screens/Settings/PipelineSettings'
<<<<<<< Updated upstream
=======
import { AiUsage } from '@/screens/Settings/AiUsage'
import { Team } from '@/screens/Settings/Team'
import { Profile } from '@/screens/Settings/Profile'
import { Integrations } from '@/screens/Settings/Integrations'
>>>>>>> Stashed changes
import { NotFound } from '@/screens/NotFound'
import { Landing } from '@/screens/Landing/Landing'
import { Login } from '@/screens/Login/Login'

function Screen() {
  const { match } = useRouter()

  switch (match.name) {
    case 'dashboard':
      return <Dashboard />
    case 'analytics':
      return <Analytics />
    case 'pipeline':
      return <PipelineBoard />
    case 'accounts':
      return <AccountExplorer />
    case 'deals':
      return <DealsIndex />
    case 'deal':
      return <DealPage dealId={match.params.dealId} />
    case 'pipelines':
      return <PipelineSettings />
<<<<<<< Updated upstream
=======
    case 'aiUsage':
      return <AiUsage />
    case 'team':
      return <Team />
    case 'profile':
      return <Profile />
    case 'integrations':
      return <Integrations />
>>>>>>> Stashed changes
    default:
      return <NotFound />
  }
}

/**
 * The landing page is not a workspace screen: it has its own header and no drawer, so it
 * renders outside the shell. Its ScrollTriggers are killed on unmount, which is what
 * makes navigating from here into the app a clean handover rather than a leak.
 */
function Workspace() {
  const { busy, error, clearError, status, loadError, refresh } = useStore()
  // Administrators only, and checked here as well as on the button that opens it. The trigger is hidden
  // for reps; not mounting the drawer means no leftover state or stray shortcut can open a panel that
  // answers questions about a book they cannot see.
  const { isAdmin } = useAuth()
  const [searchOpen, setSearchOpen] = useState(false)

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen(true)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  // A failed first load has no data to render around, so it takes over the page. A failed
  // mutation does not: that shows as a banner and leaves the workspace intact.
  if (status === 'error') {
    return (
      <>
        <TopNav onOpenSearch={() => setSearchOpen(true)} />
        <main className="mx-auto max-w-page px-24 py-96">
          <div className="mx-auto max-w-[520px] rounded-3xl border border-hairline bg-paper p-32 text-center shadow-sm">
            <h1 className="text-subheading font-bold text-ink-navy">Could not load your data</h1>
            <p className="mt-16 text-body-sm text-slate-gray">{loadError}</p>
            <div className="mt-24 flex justify-center">
              <Button onClick={() => void refresh()}>Try again</Button>
            </div>
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <TopNav onOpenSearch={() => setSearchOpen(true)} />
      <ActivityBar active={busy} />
      <ErrorBanner message={error} onDismiss={clearError} />

      <main>
        <Screen />
      </main>

      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} />
      <RecordDrawer />
      <CreateDrawer />
<<<<<<< Updated upstream
=======
      {isAdmin && <AssistantDrawer open={assistantOpen} onClose={() => setAssistantOpen(false)} />}
>>>>>>> Stashed changes
    </>
  )
}

/** Full-page hold while a stored token is verified, so the login screen never flashes. */
function CheckingSession() {
  return (
    <div className="grid min-h-dvh place-items-center bg-cloud">
      <div className="flex flex-col items-center gap-16 text-slate-gray">
        <Spinner className="text-signal-blue" label="Restoring your session" />
        <p className="text-body-sm">Restoring your session</p>
      </div>
    </div>
  )
}

function Root() {
  const { match } = useRouter()
  const { status } = useAuth()

  // The landing page is public; everything else is behind the session.
  if (match.name === 'landing') return <Landing />

  if (status === 'checking') return <CheckingSession />
  if (status === 'signed-out') return <Login />

  // Mounted only once signed in, so the first data load always carries a token.
  // ToastProvider sits outermost of these: the checklist and reminder hooks that raise
  // toasts run inside the workspace, and its overlay is fixed to the viewport, so nothing
  // below it needs to be in place first.
  return (
    <ToastProvider>
      <StoreProvider>
        <SelectionProvider>
          <CreationProvider>
            <Workspace />
          </CreationProvider>
        </SelectionProvider>
      </StoreProvider>
    </ToastProvider>
  )
}

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <RouterProvider>
          <Root />
        </RouterProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}
