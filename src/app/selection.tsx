import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { ActivitySubjectType, Id } from '@/types/domain'

export interface Selection {
  type: ActivitySubjectType
  id: Id
}

interface SelectionValue {
  selection: Selection | null
  select: (selection: Selection) => void
  clear: () => void
}

const SelectionContext = createContext<SelectionValue | null>(null)

/**
 * Which record the drawer is showing. Held above the screens so that opening a drawer
 * never unmounts or resets the workspace behind it (spec 7.1).
 */
export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selection, setSelection] = useState<Selection | null>(null)

  const select = useCallback((next: Selection) => setSelection(next), [])
  const clear = useCallback(() => setSelection(null), [])

  const value = useMemo(() => ({ selection, select, clear }), [selection, select, clear])
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
}

export function useSelection(): SelectionValue {
  const value = useContext(SelectionContext)
  if (!value) throw new Error('useSelection must be used inside a SelectionProvider')
  return value
}
