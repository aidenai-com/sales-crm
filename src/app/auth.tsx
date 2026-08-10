import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { setSessionExpiredHandler, tokens } from '@/api/client'
import { authApi, toAuthUser, type AuthUser } from '@/api/endpoints'

type Status = 'checking' | 'signed-out' | 'signed-in'

interface AuthValue {
  status: Status
  user: AuthUser | null
  isAdmin: boolean
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

/**
 * Session state.
 *
 * Starts in `checking` rather than `signed-out`: a stored token is probably valid, and
 * flashing the login screen before finding that out would be wrong on every reload.
 * The token is verified against /auth/me instead of trusted, so a revoked or expired one
 * lands on the login screen rather than an app full of failed requests.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(() => (tokens.access() ? 'checking' : 'signed-out'))
  const [user, setUser] = useState<AuthUser | null>(null)

  const signOut = useCallback(() => {
    tokens.clear()
    setUser(null)
    setStatus('signed-out')
  }, [])

  // The client calls this when a refresh fails, so an expired session cannot leave the
  // app rendering as though it were still authenticated.
  useEffect(() => {
    setSessionExpiredHandler(signOut)
  }, [signOut])

  useEffect(() => {
    if (status !== 'checking') return

    let cancelled = false
    authApi
      .me()
      .then((current) => {
        if (cancelled) return
        setUser(current)
        setStatus('signed-in')
      })
      .catch(() => {
        if (cancelled) return
        tokens.clear()
        setStatus('signed-out')
      })

    return () => {
      cancelled = true
    }
  }, [status])

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password)
    tokens.save(result.accessToken, result.refreshToken)
    setUser(toAuthUser(result.user))
    setStatus('signed-in')
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      isAdmin: user?.role === 'admin',
      signIn,
      signOut,
    }),
    [status, user, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside an AuthProvider')
  return value
}
