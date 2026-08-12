import { useCallback, useEffect, useState } from 'react'
import type { DealPeople, Id } from '@/types/domain'
import { ApiError, errorMessage } from '@/api/client'
import { contactApi } from '@/api/endpoints'

/**
 * The roles a deal tracks and the people on it, fetched per deal.
 *
 * The snapshot carries every contact because the Contacts tab lists them all, but the *links* between
 * deals, contacts and roles are per-deal detail: loading every mapping for every deal on sign-in would
 * grow with the square of the account book to serve one panel on one screen.
 *
 * Every mutation returns the whole `DealPeople` from the server rather than the row that changed. That
 * matters more here than it looks: mapping a contact can *also* create a tracked role, and unmapping one
 * can leave a role behind with nobody in it. A single-row response would leave the client re-deriving
 * both sides, and the interesting states are exactly those mismatches.
 */
const EMPTY: DealPeople = { roles: [], contacts: [] }

export function useDealPeople(dealId: Id) {
  const [people, setPeople] = useState<DealPeople>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setPeople(await contactApi.forDeal(dealId))
      setError(null)
    } catch (caught) {
      // A 401 is handled globally by the client, which signs the user out; reporting it here as well
      // would flash an error over a screen that is already being replaced by the login page.
      if (!(caught instanceof ApiError && caught.isUnauthorized)) setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }, [dealId])

  useEffect(() => {
    void load()
  }, [load])

  /** Every write shares this: run it, replace the whole picture, report a refusal without losing state. */
  const run = useCallback(async (request: () => Promise<DealPeople>) => {
    setSaving(true)
    setError(null)
    try {
      setPeople(await request())
      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  const addContact = useCallback(
    (contactId: Id, roleId: Id | null) =>
      run(() => contactApi.addToDeal(dealId, { contactId, roleId })),
    [dealId, run],
  )

  /** `null` unmaps without detaching — a champion who turned out not to be one is still involved. */
  const remapContact = useCallback(
    (linkId: Id, roleId: Id | null) => run(() => contactApi.remapOnDeal(dealId, linkId, roleId)),
    [dealId, run],
  )

  const removeContact = useCallback(
    (linkId: Id) => run(() => contactApi.removeFromDeal(dealId, linkId)),
    [dealId, run],
  )

  const addRole = useCallback(
    (roleId: Id) => run(() => contactApi.addRoleToDeal(dealId, roleId)),
    [dealId, run],
  )

  const removeRole = useCallback(
    (linkId: Id) => run(() => contactApi.removeRoleFromDeal(dealId, linkId)),
    [dealId, run],
  )

  return {
    people,
    loading,
    saving,
    error,
    reload: load,
    addContact,
    remapContact,
    removeContact,
    addRole,
    removeRole,
    clearError: () => setError(null),
  }
}
