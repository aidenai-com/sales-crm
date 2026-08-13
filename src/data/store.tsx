import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import type { Account, Deal, Id, Lead, LoggableActivityKind, Person, Snapshot } from '@/types/domain'
import { ApiError, errorMessage } from '@/api/client'
import {
  createApi,
  loadSnapshot,
  pipelineApi,
  readApi,
  writeApi,
  type DealPatchBody,
  type NewAccount,
  type NewDeal,
  type NewLead,
  type NewStage,
  type NewUser,
  type StagePatchBody,
} from '@/api/endpoints'

const EMPTY: Snapshot = {
  people: [],
  accounts: [],
  leads: [],
  deals: [],
  activities: [],
  pipelines: [],
<<<<<<< Updated upstream
=======
  contacts: [],
  contactRoles: [],
  championGaps: [],
>>>>>>> Stashed changes
}

export type DeleteStageOutcome =
  | { deleted: true }
  | { deleted: false; reason: 'has-deals' | 'other'; message: string }

interface StoreValue {
  snapshot: Snapshot
  status: 'loading' | 'ready' | 'error'
  /** Load error only. Failed mutations surface through `error` and leave data intact. */
  loadError: string | null
  error: string | null
  clearError: () => void
  /** True while any request is in flight, for the global activity bar. */
  busy: boolean
  /** Per-record pending flag, so a card or row can show its own spinner. */
  isPending: (key: string) => boolean
  refresh: () => Promise<void>

  // Creation returns the new record so a caller can select or navigate to it, and null
  // when the request failed — the error is already on screen by then.
  createAccount: (input: NewAccount) => Promise<Account | null>
  createLead: (input: NewLead) => Promise<Lead | null>
  createDeal: (input: NewDeal) => Promise<Deal | null>
  /** Admin only. Returns the new person so owner dropdowns can select them straight away. */
  createUser: (input: NewUser) => Promise<Person | null>

  moveDealToStage: (dealId: Id, stageId: Id) => Promise<boolean>
  /**
   * Re-reads one deal and its activity, without reloading the whole snapshot.
   *
   * For changes made through a route the store does not own — the deliverable checklist
   * advancing a deal is the case that needs it. The stage moved server-side, so the local
   * copy is stale, but refetching every account, lead and pipeline to learn one deal's new
   * stage would be an absurd amount of traffic for the information.
   */
  syncDeal: (dealId: Id) => Promise<void>
  /**
   * Re-reads which deals fail their stage's champion requirement.
   *
   * Kept as an explicit call rather than folded into every mutation because only two things change the
   * answer: a deal moving stage, and a deal's champion being mapped, unmapped or edited. The first is
   * in this store and refreshes itself; the second happens in the deal's People panel, which owns its
   * own state and calls this when it writes.
   */
  syncChampionGaps: () => Promise<void>
  /**
   * Re-reads the activity feed, for writes that happen outside this store.
   *
   * The deal's People panel is the case: it calls the contacts API directly, and those writes log
   * activity server-side that the timeline beside them has to show without a reload.
   */
  syncActivities: () => Promise<void>
  updateDeal: (dealId: Id, patch: DealPatchBody) => Promise<void>
  updateAccount: (accountId: Id, patch: { name?: string; industry?: string; ownerId?: Id }) => Promise<void>
  updateLead: (leadId: Id, patch: { businessUnit?: string; ownerId?: Id }) => Promise<void>
  logActivity: (input: {
    subjectType: 'account' | 'lead' | 'deal'
    subjectId: Id
    kind: LoggableActivityKind
    summary: string
    authorId?: Id
  }) => Promise<void>

  // Pipeline administration (admin only; the API returns 403 for reps)
<<<<<<< Updated upstream
  updateTemplate: (pipelineId: Id, patch: { name?: string; tracksPartner?: boolean }) => Promise<void>
  createTemplate: (name: string, tracksPartner: boolean, copyStagesFrom?: Id) => Promise<void>
=======
  updateTemplate: (pipelineId: Id, patch: { name?: string }) => Promise<void>
  createTemplate: (
    name: string,
    options?: { copyStagesFrom?: Id; stages?: NewStage[]; championGatePosition?: number | null },
  ) => Promise<void>
>>>>>>> Stashed changes
  duplicateTemplate: (pipelineId: Id, name: string) => Promise<void>
  addStage: (pipelineId: Id, stage: NewStage) => Promise<void>
  updateStage: (pipelineId: Id, stageId: Id, patch: StagePatchBody) => Promise<void>
  reorderStage: (pipelineId: Id, stageId: Id, toIndex: number) => Promise<void>
  deleteStage: (pipelineId: Id, stageId: Id) => Promise<DeleteStageOutcome>
  reassignDeals: (pipelineId: Id, fromStageId: Id, toStageId: Id) => Promise<void>
}

const StoreContext = createContext<StoreValue | null>(null)

/** Pending keys, so components ask for exactly the record they render. */
export const pendingKey = {
  deal: (id: Id) => `deal:${id}`,
  account: (id: Id) => `account:${id}`,
  lead: (id: Id) => `lead:${id}`,
  stage: (id: Id) => `stage:${id}`,
  pipeline: (id: Id) => `pipeline:${id}`,
  activity: (subjectId: Id) => `activity:${subjectId}`,
} as const

/**
 * The app's data layer, now backed by the API.
 *
 * It keeps the same `snapshot` shape the screens were already written against, which is
 * why swapping the seeded store for real HTTP did not ripple through every component. What
 * is new is the surrounding state every network-backed app needs: an initial load, a busy
 * flag, per-record pending keys, and errors that do not destroy what is on screen.
 *
 * Mutations are optimistic. A dragged card must move under the cursor immediately —
 * waiting for a round trip makes the board feel broken — so the local snapshot updates
 * first, the server's response replaces it when it lands, and a failure rolls the change
 * back and says why.
 */
export function StoreProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Record<string, number>>({})
  const [inFlight, setInFlight] = useState(0)

  // Mutations read the latest snapshot to build their rollback without becoming
  // dependencies of every callback, which would rebuild them on every keystroke.
  const latest = useRef(snapshot)
  latest.current = snapshot

  const beginRequest = useCallback((key?: string) => {
    setInFlight((n) => n + 1)
    // Counted, not boolean: two edits to the same deal must not have the first one
    // finishing clear the second one's spinner.
    if (key) setPending((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }))
  }, [])

  const endRequest = useCallback((key?: string) => {
    setInFlight((n) => Math.max(0, n - 1))
    if (key) {
      setPending((current) => {
        const next = (current[key] ?? 1) - 1
        if (next <= 0) {
          const { [key]: _drop, ...rest } = current
          return rest
        }
        return { ...current, [key]: next }
      })
    }
  }, [])

  const load = useCallback(async () => {
    setStatus((current) => (current === 'ready' ? 'ready' : 'loading'))
    beginRequest()
    try {
      const loaded = await loadSnapshot()
      setSnapshot(loaded)
      setLoadError(null)
      setStatus('ready')
    } catch (caught) {
      // A 401 is handled by the client, which signs the user out; anything else is a real
      // load failure worth showing with a retry.
      if (!(caught instanceof ApiError && caught.isUnauthorized)) {
        setLoadError(errorMessage(caught))
        setStatus('error')
      }
    } finally {
      endRequest()
    }
  }, [beginRequest, endRequest])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Re-reads the activity feed.
   *
   * Writes made through the store refetch it themselves via `refetchActivities`. This exists for writes
   * made *outside* it: the deal's People panel owns its own state and calls the contacts API directly,
   * and every one of those writes now logs an activity server-side. Without this the timeline on the
   * same screen would sit there stale until a reload — which is exactly the reload this is here to
   * avoid.
   */
  const syncActivities = useCallback(async () => {
    try {
      const activities = await readApi.activities()
      setSnapshot((current) => ({ ...current, activities }))
    } catch {
      // Silent: the write itself succeeded and is already reflected. A failed feed refresh is a stale
      // timeline, not a lost change, and an error banner would misreport it as the latter.
    }
  }, [])

  const syncChampionGaps = useCallback(async () => {
    try {
      const championGaps = await readApi.championGaps()
      setSnapshot((current) => ({ ...current, championGaps }))
    } catch {
      // Silent, and deliberately so. This is a warning layer over a gate the server enforces
      // regardless: a failed refresh means a badge is briefly stale, and putting an error banner over
      // somebody's board about it would be noise concerning nothing they can act on.
    }
  }, [])

  /**
   * Runs a mutation with an optimistic local update.
   *
   * On failure the snapshot captured before the change is restored, so a rejected request
   * never leaves the UI showing something the server does not agree with.
   */
  const mutate = useCallback(
    async <T,>(options: {
      key?: string
      optimistic?: (current: Snapshot) => Snapshot
      request: () => Promise<T>
      commit?: (current: Snapshot, result: T) => Snapshot
      /** Some writes also create activity rows, which only a refetch will reveal. */
      refetchActivities?: boolean
    }): Promise<T | null> => {
      const rollback = latest.current
      setError(null)

      if (options.optimistic) setSnapshot((current) => options.optimistic!(current))
      beginRequest(options.key)

      try {
        const result = await options.request()
        if (options.commit) setSnapshot((current) => options.commit!(current, result))

        if (options.refetchActivities) {
          const activities = await readApi.activities()
          setSnapshot((current) => ({ ...current, activities }))
        }
        return result
      } catch (caught) {
        setSnapshot(rollback)
        if (!(caught instanceof ApiError && caught.isUnauthorized)) setError(errorMessage(caught))
        return null
      } finally {
        endRequest(options.key)
      }
    },
    [beginRequest, endRequest],
  )

  const value = useMemo<StoreValue>(() => {
    return {
      snapshot,
      status,
      loadError,
      error,
      clearError: () => setError(null),
      busy: inFlight > 0,
      isPending: (key: string) => (pending[key] ?? 0) > 0,
      refresh: load,

      createAccount: (input) =>
        mutate({
          // Not optimistic: the server assigns the id, and a placeholder row that cannot
          // be opened or edited is worse than a brief wait.
          request: () => createApi.account(input),
          commit: (current, created) => ({
            ...current,
            accounts: [...current.accounts, created].sort((a, b) => a.name.localeCompare(b.name)),
          }),
        }),

      createLead: (input) =>
        mutate({
          key: pendingKey.account(input.accountId),
          request: () => createApi.lead(input),
          commit: (current, created) => ({ ...current, leads: [...current.leads, created] }),
        }),

      createDeal: (input) =>
        mutate({
<<<<<<< Updated upstream
=======
          key: pendingKey.account(input.accountId),
          request: () => createApi.contact(input),
          commit: (current, created) => ({
            ...current,
            contacts: [...current.contacts, created].sort((a, b) =>
              a.fullName.localeCompare(b.fullName),
            ),
          }),
        }),

      updateContact: async (contactId, patch) => {
        const updated = await mutate({
          key: pendingKey.contact(contactId),
          request: () => contactApi.update(contactId, patch),
          commit: (current, edited) => ({
            ...current,
            contacts: current.contacts.map((c) => (c.id === contactId ? edited : c)),
          }),
        })
        // Filling in a champion's phone number is the ordinary way a blocked deal becomes unblocked, and
        // it happens here rather than on the deal. Without this the warning would survive its own fix.
        if (updated) void syncChampionGaps()
        return updated
      },

      deleteContact: async (contactId) => {
        const result = await mutate({
          key: pendingKey.contact(contactId),
          // Optimistic. A deleted row vanishing immediately is the expected feel, and `mutate`
          // restores the pre-change snapshot if the request is refused.
          optimistic: (current) => ({
            ...current,
            contacts: current.contacts.filter((c) => c.id !== contactId),
          }),
          request: () => contactApi.remove(contactId),
        })
        return result !== null
      },

      createDeal: async (input) => {
        // The guard rail, at the one place every deal creation passes through.
        //
        // The API accepts a deal with no contacts — deliberately, so that requiring them cannot mask an
        // ownership error and so existing callers keep working — which makes this the boundary that
        // actually enforces the rule. `CreateDealForm` disables its button for the same reason, but a
        // check that lives only in one component is one refactor away from being gone.
        //
        // Reported through the store's own error channel rather than thrown: every other refusal a user
        // can cause surfaces the same way, and a thrown error here would be an unhandled rejection in
        // whichever component happened to call it.
        if (input.contacts.length === 0) {
          setError('A deal needs at least one contact. Add the person you are dealing with.')
          return null
        }

        return mutate({
>>>>>>> Stashed changes
          request: () => createApi.deal(input),
          commit: (current, created) => ({ ...current, deals: [...current.deals, created] }),
        }),

      createUser: (input) =>
        mutate({
          request: () => createApi.user(input),
          // Added to `people` immediately: the point of creating a rep is usually to
          // assign them something, and a dropdown that does not list them yet blocks that.
          commit: (current, created) => ({
            ...current,
            people: [
              ...current.people,
              { id: created.id, name: created.name, initials: created.initials, role: created.jobTitle },
            ].sort((a, b) => a.name.localeCompare(b.name)),
          }),
        }).then((created) =>
          created
            ? { id: created.id, name: created.name, initials: created.initials, role: created.jobTitle }
            : null,
        ),

      moveDealToStage: async (dealId, stageId) => {
        const deal = latest.current.deals.find((d) => d.id === dealId)
        if (!deal || deal.stageId === stageId) return false

        const result = await mutate({
          key: pendingKey.deal(dealId),
          optimistic: (current) => ({
            ...current,
            deals: current.deals.map((d) => (d.id === dealId ? { ...d, stageId } : d)),
          }),
          request: () => writeApi.moveDealToStage(dealId, stageId),
          commit: (current, updated) => ({
            ...current,
            deals: current.deals.map((d) => (d.id === updated.id ? updated : d)),
          }),
          // The move is logged server-side; pull it in so timelines stay truthful.
          refetchActivities: true,
        })
        // The deal is now answering to a different stage's requirement, so a warning may have appeared
        // or cleared. Only on success: a refused move left the deal exactly where it was.
        if (result !== null) void syncChampionGaps()
        return result !== null
      },

      syncChampionGaps,
      syncActivities,

      syncDeal: async (dealId) => {
        // No optimistic update and no rollback: there is no local change to undo. This
        // reconciles with a change that has already happened on the server.
        await mutate({
          key: pendingKey.deal(dealId),
          request: () => readApi.deal(dealId),
          commit: (current, updated) => ({
            ...current,
            deals: current.deals.map((d) => (d.id === updated.id ? updated : d)),
          }),
          refetchActivities: true,
        })
      },

      updateDeal: async (dealId, patch) => {
        await mutate({
          key: pendingKey.deal(dealId),
          optimistic: (current) => ({
            ...current,
            deals: current.deals.map((d) => (d.id === dealId ? { ...d, ...patch } : d)),
          }),
          request: () => writeApi.updateDeal(dealId, patch),
          commit: (current, updated) => ({
            ...current,
            deals: current.deals.map((d) => (d.id === updated.id ? updated : d)),
          }),
          refetchActivities: patch.stageId !== undefined,
        })
        // A stage change through the generic patch is still a stage change, so the same refresh applies.
        if (patch.stageId !== undefined) void syncChampionGaps()
      },

      updateAccount: async (accountId, patch) => {
        await mutate({
          key: pendingKey.account(accountId),
          optimistic: (current) => ({
            ...current,
            accounts: current.accounts.map((a) => (a.id === accountId ? { ...a, ...patch } : a)),
          }),
          request: () => writeApi.updateAccount(accountId, patch),
          commit: (current, updated) => ({
            ...current,
            accounts: current.accounts.map((a) => (a.id === updated.id ? updated : a)),
          }),
        })
      },

      updateLead: async (leadId, patch) => {
        await mutate({
          key: pendingKey.lead(leadId),
          optimistic: (current) => ({
            ...current,
            leads: current.leads.map((l) => (l.id === leadId ? { ...l, ...patch } : l)),
          }),
          request: () => writeApi.updateLead(leadId, patch),
          commit: (current, updated) => ({
            ...current,
            leads: current.leads.map((l) => (l.id === updated.id ? updated : l)),
          }),
        })
      },

      logActivity: async (input) => {
        await mutate({
          key: pendingKey.activity(input.subjectId),
          // Not optimistic: the server assigns the id and timestamp, and a placeholder
          // that briefly shows the wrong time in a timeline is worse than a short wait.
          request: () => writeApi.logActivity(input),
          commit: (current, created) => ({
            ...current,
            activities: [created, ...current.activities],
          }),
        })
      },

      // --- Pipeline administration ------------------------------------------
      // These replace the whole template from the response rather than patching locally:
      // a stage edit can renumber positions, and reconstructing that client-side would be
      // duplicating server logic for no benefit.

      updateTemplate: async (pipelineId, patch) => {
        await mutate({
          key: pendingKey.pipeline(pipelineId),
          request: () => pipelineApi.update(pipelineId, patch),
          commit: (current, updated) => ({
            ...current,
            pipelines: current.pipelines.map((p) => (p.id === updated.id ? updated : p)),
          }),
        })
      },

<<<<<<< Updated upstream
      createTemplate: async (name, tracksPartner, copyStagesFrom) => {
        await mutate({
          request: () => pipelineApi.create(name, tracksPartner, copyStagesFrom),
=======
      createTemplate: async (name, options) => {
        await mutate({
          request: () => pipelineApi.create(name, options),
>>>>>>> Stashed changes
          commit: (current, created) => ({ ...current, pipelines: [...current.pipelines, created] }),
        })
      },

      duplicateTemplate: async (pipelineId, name) => {
        await mutate({
          key: pendingKey.pipeline(pipelineId),
          request: () => pipelineApi.duplicate(pipelineId, name),
          commit: (current, created) => ({ ...current, pipelines: [...current.pipelines, created] }),
        })
      },

      addStage: async (pipelineId, stage) => {
        await mutate({
          key: pendingKey.pipeline(pipelineId),
          request: () => pipelineApi.addStage(pipelineId, stage),
          commit: (current, updated) => ({
            ...current,
            pipelines: current.pipelines.map((p) => (p.id === updated.id ? updated : p)),
          }),
        })
      },

      updateStage: async (pipelineId, stageId, patch) => {
        // Deliverables are deliberately left out of the optimistic update. A new one has no
        // id until the server assigns it, so guessing the resulting list would put rows on
        // screen that cannot be ticked or attached to — and the write is fast enough that the
        // brief wait is invisible. Everything else applies immediately.
        const { deliverables: _serverAssigned, ...instant } = patch

        await mutate({
          key: pendingKey.stage(stageId),
          optimistic: (current) => ({
            ...current,
            pipelines: current.pipelines.map((p) =>
              p.id === pipelineId
                ? {
                    ...p,
                    stages: p.stages.map((s) => (s.id === stageId ? { ...s, ...instant } : s)),
                  }
                : p,
            ),
          }),
          request: () => pipelineApi.updateStage(pipelineId, stageId, patch),
          commit: (current, updated) => ({
            ...current,
            pipelines: current.pipelines.map((p) => (p.id === updated.id ? updated : p)),
          }),
        })
      },

      reorderStage: async (pipelineId, stageId, toIndex) => {
        await mutate({
          key: pendingKey.stage(stageId),
          // Optimistic, because this is driven by dragging: a stage that springs back to
          // its old slot until the server answers reads as a failed drop.
          optimistic: (current) => ({
            ...current,
            pipelines: current.pipelines.map((p) => {
              if (p.id !== pipelineId) return p
              const ordered = [...p.stages].sort((a, b) => a.position - b.position)
              const from = ordered.findIndex((s) => s.id === stageId)
              if (from === -1) return p

              const target = Math.max(0, Math.min(toIndex, ordered.length - 1))
              const [moved] = ordered.splice(from, 1)
              ordered.splice(target, 0, moved)

              return { ...p, stages: ordered.map((s, i) => ({ ...s, position: i + 1 })) }
            }),
          }),
          request: () => pipelineApi.reorderStage(pipelineId, stageId, toIndex),
          commit: (current, updated) => ({
            ...current,
            pipelines: current.pipelines.map((p) => (p.id === updated.id ? updated : p)),
          }),
        })
      },

      deleteStage: async (pipelineId, stageId) => {
        setError(null)
        beginRequest(pendingKey.stage(stageId))
        try {
          const updated = await pipelineApi.deleteStage(pipelineId, stageId)
          setSnapshot((current) => ({
            ...current,
            pipelines: current.pipelines.map((p) => (p.id === updated.id ? updated : p)),
          }))
          return { deleted: true }
        } catch (caught) {
          // A 409 here is the spec 6.3 guard doing its job, not a fault: the caller shows
          // the reassignment offer instead of an error banner.
          if (caught instanceof ApiError && caught.isConflict) {
            return { deleted: false, reason: 'has-deals', message: caught.detail }
          }
          const message = errorMessage(caught)
          setError(message)
          return { deleted: false, reason: 'other', message }
        } finally {
          endRequest(pendingKey.stage(stageId))
        }
      },

      reassignDeals: async (pipelineId, fromStageId, toStageId) => {
        await mutate({
          key: pendingKey.stage(fromStageId),
          request: () => pipelineApi.reassignDeals(pipelineId, fromStageId, toStageId),
          refetchActivities: true,
        })
        // Deals moved server-side in bulk; only a refetch reflects where they landed.
        const deals = await readApi.deals()
        setSnapshot((current) => ({ ...current, deals }))
      },
    }
  }, [
    snapshot,
    status,
    loadError,
    error,
    inFlight,
    pending,
    load,
    mutate,
    beginRequest,
    endRequest,
    syncChampionGaps,
    syncActivities,
  ])

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside a StoreProvider')
  return value
}
