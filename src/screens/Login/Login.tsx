import { useState, type FormEvent } from 'react'
import { useAuth } from '@/app/auth'
import { errorMessage } from '@/api/client'
import { Button } from '@/components/ui/Button'
import { Field, TextInput } from '@/components/ui/Field'

/**
 * Sign-in.
 *
 * design.md's hero is a two-column split with the form on the left and a card backed by
 * decorative blobs on the right; this follows that, because the login screen is the one
 * place in the app where the marketing-scale treatment actually belongs — there is no
 * density to protect and it sets the tone before the workspace appears.
 */
export function Login() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return

    setSubmitting(true)
    setError(null)
    try {
      await signIn(email.trim(), password)
      // On success this component unmounts, so there is nothing to reset.
    } catch (caught) {
      setError(errorMessage(caught))
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-dvh bg-cloud">
      <div className="mx-auto grid min-h-dvh max-w-page items-center gap-48 px-24 py-48 lg:grid-cols-[1fr_420px]">
        <div>
          <div className="mb-32 flex items-center gap-8">
            <span className="grid size-32 place-items-center rounded-lg bg-ink-navy text-body-sm font-bold text-paper">
              A
            </span>
            <span className="text-body-lg font-bold text-ink-navy">Sales CRM</span>
          </div>

          <h1 className="max-w-[560px] text-heading font-bold text-ink-navy">
            Your pipeline, without the spreadsheet.
          </h1>
          <p className="mt-24 max-w-[460px] text-body-lg text-slate-gray">
            Every account, every business unit, every deal — in one place, with the stage each
            one actually sits in.
          </p>
        </div>

        <div className="relative">
          {/* design.md's decorative blobs: atmosphere only, never a functional fill. */}
          <div
            aria-hidden="true"
            className="absolute -top-32 -right-24 size-[220px] rounded-full bg-coral-magenta/30 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-24 -left-32 size-[180px] rounded-full bg-sky-cyan/25 blur-3xl"
          />

          <form
            onSubmit={onSubmit}
            className="relative rounded-3xl border border-hairline bg-paper p-32 shadow-sm-2"
          >
            <h2 className="text-subheading font-bold text-ink-navy">Sign in</h2>
            <p className="mt-8 text-body-sm text-slate-gray">
              Use the account your administrator set up for you.
            </p>

            <div className="mt-24 space-y-16">
              <Field label="Email">
                <TextInput
                  type="email"
                  name="email"
                  autoComplete="username"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@aidenai.com"
                />
              </Field>

              <Field label="Password">
                <TextInput
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </Field>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-16 rounded-lg bg-risk-fill px-16 py-8 text-body-sm text-risk"
              >
                {error}
              </p>
            )}

            <Button
              type="submit"
              loading={submitting}
              disabled={email.trim() === '' || password === ''}
              className="mt-24 w-full"
            >
              {submitting ? 'Signing in' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
