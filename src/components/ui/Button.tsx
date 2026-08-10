import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'dark' | 'outline' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Shows a spinner and blocks further clicks while a request is in flight. */
  loading?: boolean
  children: ReactNode
}

/**
 * Buttons follow design.md exactly: 8px radius (never pill, never 4px), Signal Blue for
 * the single primary action, Ink Navy for the secondary dark fill.
 */
const variants: Record<Variant, string> = {
  primary: 'bg-signal-blue text-paper hover:bg-deep-cobalt',
  dark: 'bg-ink-navy text-paper hover:bg-ink-navy-hover',
  outline: 'bg-paper text-ink-navy border border-hairline hover:border-mist-gray hover:bg-pebble',
  ghost: 'bg-transparent text-ink-navy hover:bg-pebble',
  danger: 'bg-transparent text-risk hover:bg-risk-fill',
}

const sizes: Record<Size, string> = {
  sm: 'text-body-sm px-16 py-8 font-semibold',
  md: 'text-button px-16 py-[10px] font-semibold',
}

/**
 * Hover motion.
 *
 * The lift is 1px. That is deliberate: at 8px radius on a flat, shadow-based system, a
 * larger travel reads as a toy. What sells it is the *shadow* growing with the lift, which
 * is the same blue-tinted elevation design.md uses everywhere else — so a hover looks like
 * the button rising off the canvas rather than sliding on it.
 *
 * The press undoes the lift on a shorter duration, so it feels like it responds instantly
 * and settles gently. Filled variants get the shadow; ghost ones only get their wash,
 * since a floating shadow with no surface underneath looks detached.
 */
const MOTION =
  'transition-[background-color,border-color,color,box-shadow,transform] ' +
  'duration-(--duration-hover) ease-ui ' +
  'active:duration-(--duration-press) ' +
  'motion-safe:hover:not-disabled:-translate-y-px ' +
  'motion-safe:active:not-disabled:translate-y-0'

const ELEVATED = 'hover:not-disabled:shadow-sm-3 active:not-disabled:shadow-sm'

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const isElevated = variant === 'primary' || variant === 'dark' || variant === 'outline'

  return (
    <button
      // Communicates busy-ness to assistive tech, which a spinner alone does not.
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-8 rounded-lg',
        'disabled:cursor-not-allowed disabled:opacity-60',
        MOTION,
        isElevated && ELEVATED,
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {/*
        The spinner is added beside the label rather than replacing it. Swapping the text
        out changes the button's width mid-click, which moves everything around it.
      */}
      {loading && <Spinner />}
      {children}
    </button>
  )
}
