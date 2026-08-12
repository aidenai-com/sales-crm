import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import type { ActivitySubjectType, Id } from '@/types/domain'

/**
 * What the record drawer can show.
 *
 * A superset of `ActivitySubjectType`, not the same type. Contacts are records you can open, but
 * activities are never logged *against* a contact — they are logged against the deal or account the
 * conversation belongs to. Widening `ActivitySubjectType` to cover this would let a component build an
 * activity the API refuses.
 */
export type SelectionType = ActivitySubjectType | 'contact'

export interface Selection {
  type: SelectionType
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
