import { useCallback, useEffect, useRef, useState } from 'react'
import type { DealChecklist, Id } from '@/types/domain'
import { checklistApi } from '@/api/endpoints'
import { ApiError, errorMessage } from '@/api/client'
import { useStore } from '@/data/store'
import { useToast } from '@/app/toast'

/**
 * A deal's deliverable checklist, its documents, and the automatic stage advance.
 *
 * Kept out of the global store on purpose. `Snapshot` holds what every screen reads; a
 * checklist is read by one page about one deal, and putting it in the snapshot would mean
 * every board render carrying data only the deal page uses.
 *
 * The one thing that *does* belong to the store is the deal's stage, which an advance
 * changes. That is reconciled through `syncDeal` rather than by mutating the snapshot here,
 * so the board and the dashboard see the move too.
 */

interface UseChecklist {
  checklist: DealChecklist | null
  loading: boolean
  error: string | null
  /** Which deliverable is mid-write, so one row can show its own spinner. */
  pendingDeliverableId: Id | null
  uploadingDeliverableId: Id | null
  toggle: (deliverableId: Id, complete: boolean) => Promise<void>
  upload: (deliverableId: Id, file: File) => Promise<void>
  download: (attachmentId: Id, filename: string) => Promise<void>
  removeAttachment: (attachmentId: Id) => Promise<void>
  reload: () => Promise<void>
}

export function useChecklist(dealId: Id): UseChecklist {
  const { syncDeal, moveDealToStage } = useStore()
  const { show } = useToast()

  const [checklist, setChecklist] = useState<DealChecklist | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pendingDeliverableId, setPendingDeliverableId] = useState<Id | null>(null)
  const [uploadingDeliverableId, setUploadingDeliverableId] = useState<Id | null>(null)

  // Guards against a response for a previous deal landing after the user has navigated to
  // another one and overwriting its checklist.
  const currentDeal = useRef(dealId)
  currentDeal.current = dealId

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const loaded = await checklistApi.read(dealId)
      if (currentDeal.current !== dealId) return
      setChecklist(loaded)
      setError(null)
    } catch (caught) {
      if (!(caught instanceof ApiError && caught.isUnauthorized)) setError(errorMessage(caught))
    } finally {
      if (currentDeal.current === dealId) setLoading(false)
    }
  }, [dealId])

  useEffect(() => {
    void load()
  }, [load])

  const toggle = useCallback(
    async (deliverableId: Id, complete: boolean) => {
      setPendingDeliverableId(deliverableId)
      setError(null)
      try {
        if (!complete) {
          setChecklist(await checklistApi.uncomplete(dealId, deliverableId))
          return
        }

        const result = await checklistApi.complete(dealId, deliverableId)
        setChecklist(result.checklist)

        if (!result.advancedToStageId) return

        // The deal moved without the user asking for it, so say so and make it reversible.
        const from = result.advancedFromStageId
        await syncDeal(dealId)
        show({
          title: `Moved to ${result.advancedToStageName}`,
          detail: 'Every deliverable for the previous stage is complete.',
          tone: 'success',
          action: from
            ? {
                label: 'Undo',
                pendingLabel: 'Undoing…',
                // Undo reverses the *move*, not the tick. The checkmarks describe work that
                // genuinely happened; only the automatic consequence is in question, and
                // clearing the box would throw away a fact the rep asserted.
                onAct: async () => {
                  await moveDealToStage(dealId, from)
                  await load()
                },
              }
            : undefined,
        })
      } catch (caught) {
        if (!(caught instanceof ApiError && caught.isUnauthorized)) setError(errorMessage(caught))
        // Re-read rather than guess. A 409 means the server and this component disagree about
        // which stage the deal is in, and the server is right.
        await load()
      } finally {
        setPendingDeliverableId(null)
      }
    },
    [dealId, load, moveDealToStage, show, syncDeal],
  )

  const upload = useCallback(
    async (deliverableId: Id, file: File) => {
      setUploadingDeliverableId(deliverableId)
      setError(null)
      try {
        await checklistApi.upload(dealId, deliverableId, file)
        await load()
        show({ title: `Attached ${file.name}`, tone: 'success' })
      } catch (caught) {
        if (!(caught instanceof ApiError && caught.isUnauthorized)) setError(errorMessage(caught))
      } finally {
        setUploadingDeliverableId(null)
      }
    },
    [dealId, load, show],
  )

  const download = useCallback(
    async (attachmentId: Id, filename: string) => {
      setError(null)
      try {
        const url = await checklistApi.downloadUrl(dealId, attachmentId)
        // A real anchor click rather than `location.href`: this navigates the tab on some
        // browsers when the response has no attachment disposition, and losing the page in
        // the middle of reviewing a deal is a poor trade for one line saved.
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = filename
        anchor.rel = 'noopener'
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
      } catch (caught) {
        if (!(caught instanceof ApiError && caught.isUnauthorized)) setError(errorMessage(caught))
      }
    },
    [dealId],
  )

  const removeAttachment = useCallback(
    async (attachmentId: Id) => {
      setError(null)
      try {
        await checklistApi.removeAttachment(dealId, attachmentId)
        await load()
      } catch (caught) {
        if (!(caught instanceof ApiError && caught.isUnauthorized)) setError(errorMessage(caught))
      }
    },
    [dealId, load],
  )

  return {
    checklist,
    loading,
    error,
    pendingDeliverableId,
    uploadingDeliverableId,
    toggle,
    upload,
    download,
    removeAttachment,
    reload: load,
  }
}
