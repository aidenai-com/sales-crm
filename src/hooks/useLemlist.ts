import { useCallback, useEffect, useState } from 'react'
import type { Id, LemlistCampaign, LemlistStatus, LemlistSyncResult } from '@/types/domain'
import { errorMessage } from '@/api/client'
import { lemlistApi } from '@/api/endpoints'

/**
 * The lemlist connection, and the actions on it.
 *
 * Status is kept here rather than in the store's snapshot because it is not part of the CRM's data — it is
 * the state of one user's link to a third party, and putting it in the snapshot would make every screen's
 * first load wait on it.
 *
 * Importing is tracked per campaign rather than as one workspace-wide flag, because that is now the unit of
 * work: importing "US SaaS ICP" must busy that row and leave the others usable. A request in flight is
 * something only the client knows, so `importingId` lives here and is not read back from the server.
 */
const DISCONNECTED: LemlistStatus = {
  connected: false,
  teamId: '',
  teamName: '',
  keyFingerprint: '',
  connectedAt: null,
  lastSyncAt: null,
  lastSyncError: '',
  syncStatus: 'idle',
  campaigns: 0,
  importedCampaigns: 0,
  contacts: 0,
  engagements: 0,
  liveEngagements: 0,
  webhookRegistered: false,
  webhookTargetUrl: '',
}

export function useLemlist() {
  const [status, setStatus] = useState<LemlistStatus>(DISCONNECTED)
  const [campaigns, setCampaigns] = useState<LemlistCampaign[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  /** Which campaign is importing right now, or null. Drives one row's control, not the whole page's. */
  const [importingId, setImportingId] = useState<Id | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<LemlistSyncResult | null>(null)

  const reload = useCallback(async () => {
    try {
      const next = await lemlistApi.status()
      setStatus(next)
      // The campaign list comes from our own tables, so this costs a query and no lemlist request. Only
      // fetched when connected: there is nothing to list otherwise, and asking would 404.
      setCampaigns(next.connected ? await lemlistApi.campaigns() : [])
      setError(null)
    } catch (caught) {
      setError(errorMessage(caught))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  const connect = useCallback(async (apiKey: string) => {
    setBusy(true)
    setError(null)
    try {
      setStatus(await lemlistApi.connect(apiKey))
      return true
    } catch (caught) {
      // Shown in the form, not as a toast: the commonest failure is a mistyped or expired key, and that is
      // a correction to make in the field it came from.
      setError(errorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  const disconnect = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await lemlistApi.disconnect()
      setStatus(DISCONNECTED)
      setCampaigns([])
      setLastSync(null)
      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  /** Asks lemlist whether the campaign list has changed. Cheap — no leads, no activity. */
  const refreshCampaigns = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      setCampaigns(await lemlistApi.refreshCampaigns())
      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }, [])

  /**
   * Imports one campaign's leads and activity.
   *
   * `full` is false on a refresh: the leads are re-read either way, but the activity walk stops at the
   * recent window instead of replaying a history already stored.
   */
  const importCampaign = useCallback(
    async (campaignId: Id, full = true) => {
      setImportingId(campaignId)
      setError(null)
      try {
        const result = await lemlistApi.importCampaign(campaignId, full)
        setLastSync(result)
        // Re-read afterwards rather than patching the row from the report: the counts live on the
        // connection, and a webhook can have added to them while the import ran.
        await reload()
        return result
      } catch (caught) {
        setError(errorMessage(caught))
        // Reloaded on failure too, because the campaign row now carries the reason it failed.
        await reload()
        return null
      } finally {
        setImportingId(null)
      }
    },
    [reload],
  )

  const registerWebhook = useCallback(async () => {
    setBusy(true)
    setError(null)
    try {
      await lemlistApi.registerWebhook()
      await reload()
      return true
    } catch (caught) {
      setError(errorMessage(caught))
      return false
    } finally {
      setBusy(false)
    }
  }, [reload])

  return {
    status,
    campaigns,
    loading,
    busy,
    importingId,
    error,
    lastSync,
    reload,
    connect,
    disconnect,
    refreshCampaigns,
    importCampaign,
    registerWebhook,
    clearError: () => setError(null),
  }
}
