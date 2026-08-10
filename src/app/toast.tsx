import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { cn } from '@/lib/cn'

/**
 * Transient messages, optionally carrying one action.
 *
 * Built rather than installed for the same reason `app/router.tsx` is: this needs a queue, a
 * timer and one button, and a toast library is tens of kilobytes plus a portal system for
 * behaviour that fits on a screen.
 *
 * The action slot exists for one job in particular — Undo after a deal auto-advances. That is
 * a state change the user did not explicitly ask for, so it has to be reversible in one click
 * and stay reversible long enough to notice. Hence the timer pauses on hover and while the
 * button holds focus: a toast that expires under the cursor reaching for it is worse than no
 * toast at all.
 */

/**
 * Three tones, matching the status palette design.md's additions define.
 *
 * There is no amber. design.md adds exactly one hue to the base palette on purpose, and
 * inventing a second for a toast would put a colour on screen that appears nowhere else.
 */
export type ToastTone = 'neutral' | 'success' | 'danger'

export interface ToastAction {
  label: string
  /** Label shown while the handler is in flight, e.g. "Undoing…". */
  pendingLabel?: string
  onAct: () => void | Promise<void>
}

export interface ToastInput {
  title: string
  detail?: string
  tone?: ToastTone
  action?: ToastAction
  /** Defaults to 6s, or 12s when there is an action to read and reach for. */
  durationMs?: number
}

interface Toast extends ToastInput {
  id: number
  tone: ToastTone
  durationMs: number
}

interface ToastValue {
  show: (input: ToastInput) => void
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastValue | null>(null)

const DEFAULT_MS = 6_000
const WITH_ACTION_MS = 12_000
/** Beyond this the oldest is dropped; a stack taller than the viewport helps nobody. */
const MAX_VISIBLE = 3

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
  }, [])

  const show = useCallback((input: ToastInput) => {
    const toast: Toast = {
      ...input,
      id: nextId.current++,
      tone: input.tone ?? 'neutral',
      durationMs: input.durationMs ?? (input.action ? WITH_ACTION_MS : DEFAULT_MS),
    }
    setToasts((current) => [...current, toast].slice(-MAX_VISIBLE))
  }, [])

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toasts.length > 0 && (
        <div
          // `polite`, not `assertive`: these confirm what just happened rather than interrupt
          // whatever the user is doing.
          aria-live="polite"
          aria-relevant="additions"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-8 p-24"
        >
          {toasts.map((toast) => (
            <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
          ))}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastValue {
  const value = useContext(ToastContext)
  if (!value) throw new Error('useToast must be used inside a ToastProvider')
  return value
}

const TONE_DOT: Record<ToastTone, string> = {
  neutral: 'bg-slate-gray',
  success: 'bg-signal-blue',
  danger: 'bg-risk',
}

/**
 * Counts down and calls `onExpire`, holding while `paused`.
 *
 * Deliberately a real timer rather than a CSS animation with `onAnimationEnd`. Under
 * `prefers-reduced-motion` the animation never runs, so an animation-driven toast would sit
 * on screen forever for exactly the users least likely to want it there. The progress bar is
 * decoration on top of this; the timer is the mechanism.
 */
function useCountdown(durationMs: number, paused: boolean, onExpire: () => void) {
  const remaining = useRef(durationMs)
  const startedAt = useRef<number | null>(null)
  const expire = useRef(onExpire)
  expire.current = onExpire

  useEffect(() => {
    if (paused) return

    startedAt.current = Date.now()
    const timer = window.setTimeout(() => expire.current(), remaining.current)

    return () => {
      window.clearTimeout(timer)
      // Bank the elapsed time, so resuming does not restart the full duration. Without this
      // a toast could be held open indefinitely by moving the cursor across it repeatedly.
      if (startedAt.current !== null) {
        remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current))
      }
    }
  }, [paused])
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false)
  const [acting, setActing] = useState(false)

  // Held open while the action runs: dismissing mid-undo would remove the only feedback that
  // anything is happening.
  useCountdown(toast.durationMs, paused || acting, onDismiss)

  return (
    <div
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      className={cn(
        'pointer-events-auto relative flex w-full max-w-[460px] items-start gap-12 overflow-hidden',
        'rounded-2xl border border-hairline bg-paper p-16 shadow-sm-3',
        'motion-safe:animate-[toast-in_180ms_ease-out]',
      )}
    >
      <span
        className={cn('mt-[6px] size-8 shrink-0 rounded-full', TONE_DOT[toast.tone])}
        aria-hidden="true"
      />

      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-semibold text-ink-navy">{toast.title}</p>
        {toast.detail && <p className="mt-[2px] text-caption text-slate-gray">{toast.detail}</p>}
      </div>

      {toast.action && (
        <button
          disabled={acting}
          onClick={async () => {
            setActing(true)
            try {
              await toast.action?.onAct()
            } finally {
              // Dismissed either way. Leaving it up after a failed undo invites a second
              // click on an action whose effect has already been attempted; the failure
              // itself surfaces through the store's error banner.
              onDismiss()
            }
          }}
          className={cn(
            'shrink-0 rounded-lg px-12 py-[6px] text-caption font-semibold text-signal-blue',
            'hover:bg-badge-fill disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          {acting ? (toast.action.pendingLabel ?? 'Working…') : toast.action.label}
        </button>
      )}

      <button
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded-lg p-[4px] text-mist-gray hover:bg-pebble hover:text-slate-gray"
      >
        <svg
          viewBox="0 0 16 16"
          className="size-16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          aria-hidden="true"
        >
          <path d="M4 4l8 8M12 4l-8 8" strokeLinecap="round" />
        </svg>
      </button>

      {/* Decoration only — `useCountdown` owns the dismissal. Hidden when motion is reduced,
          where a sweeping bar is the kind of thing the preference is asking us not to draw. */}
      <span
        aria-hidden="true"
        style={{ animationDuration: `${toast.durationMs}ms` }}
        className={cn(
          'absolute inset-x-0 bottom-0 hidden h-[2px] origin-left bg-hairline',
          'motion-safe:block motion-safe:animate-[toast-timer_linear_forwards]',
          (paused || acting) && '[animation-play-state:paused]',
        )}
      />
    </div>
  )
}
