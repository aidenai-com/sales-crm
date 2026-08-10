import { useTheme } from '@/app/theme'
import { cn } from '@/lib/cn'

/**
 * One button, one job: flip the theme.
 *
 * It shows the icon for the theme you'd get by pressing it — a moon while you're in
 * light mode — because that's what the label promises. Pressing it also pins the choice,
 * so the app stops following the OS from then on.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const next = theme === 'dark' ? 'light' : 'dark'

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      className={cn(
        'grid size-32 shrink-0 place-items-center rounded-lg text-slate-gray transition-colors',
        'hover:bg-pebble hover:text-ink-navy',
        className,
      )}
    >
      {theme === 'dark' ? (
        // In dark mode the button offers light: a sun.
        <svg viewBox="0 0 20 20" className="size-16" fill="none" stroke="currentColor" strokeWidth="1.75">
          <circle cx="10" cy="10" r="3.5" />
          <path
            d="M10 1.5v2M10 16.5v2M3.9 3.9l1.4 1.4M14.7 14.7l1.4 1.4M1.5 10h2M16.5 10h2M3.9 16.1l1.4-1.4M14.7 5.3l1.4-1.4"
            strokeLinecap="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" className="size-16" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path
            d="M16.5 12.4A7 7 0 017.6 3.5a7 7 0 108.9 8.9z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  )
}
