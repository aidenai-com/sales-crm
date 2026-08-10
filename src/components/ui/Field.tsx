import type { ComponentPropsWithRef, ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** design.md: inputs are 8px radius on the Pebble input fill with a hairline border. */
const control =
  'w-full rounded-lg border border-hairline bg-pebble px-16 py-8 text-body-sm text-ink-navy ' +
  'placeholder:text-mist-gray focus:border-signal-blue focus:bg-paper focus:outline-none'

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="mb-8 block text-caption font-semibold tracking-wide text-slate-gray uppercase">
        {label}
      </span>
      {children}
      {hint && <span className="mt-8 block text-caption text-slate-gray">{hint}</span>}
    </label>
  )
}

export function TextInput({ className, ...rest }: ComponentPropsWithRef<'input'>) {
  return <input className={cn(control, className)} {...rest} />
}

export function Select({ className, children, ...rest }: ComponentPropsWithRef<'select'>) {
  return (
    <select className={cn(control, 'appearance-none pr-32', className)} {...rest}>
      {children}
    </select>
  )
}

export function Textarea({ className, ...rest }: ComponentPropsWithRef<'textarea'>) {
  return <textarea className={cn(control, 'min-h-96 resize-y leading-relaxed', className)} {...rest} />
}

/** A read-only fact row for drawers: label left, value right. */
export function FactRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-16 border-b border-hairline py-8 last:border-0">
      <span className="text-body-sm text-slate-gray">{label}</span>
      <span className="text-body-sm font-semibold text-ink-navy">{children}</span>
    </div>
  )
}
