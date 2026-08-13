import { useAuth } from '@/app/auth'
import { routes, useRouter } from '@/app/router'
import { Menu, MenuDivider, MenuItem, MenuLabel } from '@/components/ui/Menu'

/**
 * Who is signed in, and the way out.
 *
 * The role is shown because it changes what the app will let you do — a rep clicking into
 * pipeline settings gets a 403, and seeing "rep" here is what makes that make sense rather
 * than look like a bug.
 */
export function UserMenu() {
  const { user, signOut, isAdmin } = useAuth()
  const { navigate } = useRouter()
  if (!user) return null

  return (
    <Menu
      label={`Account: ${user.name}`}
      // 32px and circular, to match the height every other control in the header now shares. The
      // avatar fills the button, so the button's own hover wash would never be seen — the initials
      // disc carries the hover instead.
      triggerClassName="size-32 rounded-full"
      trigger={
        <span className="grid size-32 place-items-center rounded-full bg-ink-navy text-caption font-bold text-paper transition-colors duration-hover ease-ui hover:bg-ink-navy-hover">
          {user.initials}
        </span>
      }
    >
      {(close) => (
        <>
          <MenuLabel>Signed in as</MenuLabel>
          <div className="px-16 pb-8">
            <p className="truncate text-body-sm font-semibold text-ink-navy">{user.name}</p>
            <p className="truncate text-caption text-slate-gray">{user.email}</p>
            <p className="mt-8 inline-flex items-center gap-8 rounded-full bg-pebble px-8 py-[2px] text-caption font-medium text-slate-gray">
              {isAdmin ? 'Administrator' : 'Sales rep'}
              {user.jobTitle && ` · ${user.jobTitle}`}
            </p>
          </div>

          <MenuDivider />

          <MenuItem
            onSelect={() => {
              close()
              navigate(routes.profile)
            }}
          >
            Your profile
          </MenuItem>

          {/* Not admin-gated: a lemlist key belongs to the person who generated it, so every rep
              connects their own. */}
          <MenuItem
            onSelect={() => {
              close()
              navigate(routes.integrations)
            }}
          >
            Integrations
          </MenuItem>

          {/* Here rather than as icons in the nav bar: team administration and assistant spend are
              things an admin checks occasionally, and the header is for what people reach for daily. */}
          {isAdmin && (
            <MenuItem
              onSelect={() => {
                close()
                navigate(routes.team)
              }}
            >
              Team
            </MenuItem>
          )}

          {isAdmin && (
            <MenuItem
              onSelect={() => {
                close()
                navigate(routes.aiUsage)
              }}
            >
              Assistant usage
            </MenuItem>
          )}

          <MenuDivider />

          <MenuItem
            onSelect={() => {
              close()
              signOut()
            }}
          >
            Sign out
          </MenuItem>
        </>
      )}
    </Menu>
  )
}
