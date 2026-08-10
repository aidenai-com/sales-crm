import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { Id } from '@/types/domain'

export type CreateKind = 'account' | 'lead' | 'deal' | 'user'

/**
 * What is being created, plus whatever the click already told us.
 *
 * Context matters: "Add a business unit" from inside JPMorgan Chase should not then ask
 * which account, and "New deal" from a board column already knows the pipeline and stage.
 * Prefilling from where the user clicked is the difference between a form that feels like
 * a continuation and one that feels like starting over.
 */
export interface CreateRequest {
  kind: CreateKind
  accountId?: Id
  leadId?: Id
  pipelineId?: Id
  stageId?: Id
}

interface CreationValue {
  request: CreateRequest | null
  openCreate: (request: CreateRequest) => void
  closeCreate: () => void
}

const CreationContext = createContext<CreationValue | null>(null)

export function CreationProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<CreateRequest | null>(null)

  const openCreate = useCallback((next: CreateRequest) => setRequest(next), [])
  const closeCreate = useCallback(() => setRequest(null), [])

  const value = useMemo(
    () => ({ request, openCreate, closeCreate }),
    [request, openCreate, closeCreate],
  )

  return <CreationContext.Provider value={value}>{children}</CreationContext.Provider>
}

export function useCreation(): CreationValue {
  const value = useContext(CreationContext)
  if (!value) throw new Error('useCreation must be used inside a CreationProvider')
  return value
}
