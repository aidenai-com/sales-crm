import type {
  Account,
  Activity,
  ActivityKind,
  ActivitySubjectType,
  AnalyticsSummary,
  Attachment,
  CompletionResult,
  Deal,
  DealChecklist,
  Id,
  Lead,
  Person,
  PipelineTemplate,
  Reminder,
  ReminderInbox,
  Snapshot,
  Stage,
  StageKind,
} from '@/types/domain'
import { api } from './client'

/**
 * Typed endpoints, plus the mapping from wire shapes to domain objects.
 *
 * The API already serialises camelCase, so most fields pass straight through. Two things
 * genuinely differ and are normalised here rather than in components:
 *
 *  - money arrives as a decimal *string* (Postgres NUMERIC), because JSON numbers cannot
 *    represent it exactly. It becomes a number for display maths.
 *  - the backend calls them users; the UI has always called them people.
 */

// --- Wire shapes -------------------------------------------------------------

interface UserDto {
  id: string
  email: string
  fullName: string
  initials: string
  jobTitle: string
  role: 'admin' | 'rep'
  isActive: boolean
}

interface StageDto {
  id: string
  name: string
  shortName: string
  probability: number
  color: string
  kind: StageKind
  position: number
  wipLimit: number | null
  entryCriteria: string[] | null
  exitCriteria: string[] | null
  keyActivities: string[] | null
  deliverables: DeliverableDto[]
}

interface DeliverableDto {
  id: string
  text: string
  position: number
}

interface PipelineDto {
  id: string
  name: string
  tracksPartner: boolean
  stages: StageDto[]
}

interface AccountDto {
  id: string
  name: string
  industry: string
  isPartner: boolean
  ownerId: string
}

interface LeadDto {
  id: string
  accountId: string
  businessUnit: string
  ownerId: string
}

/** The API returns the full detail shape; the raw fields are what the client stores. */
interface DealDto {
  id: string
  name: string
  createdAt: string
  accountId: string
  leadId: string | null
  partnerId: string | null
  pipelineTemplateId: string
  stageId: string
  value: string
  currency: string
  expectedCloseDate: string
  ownerId: string
}

interface ActivityDto {
  id: string
  kind: ActivityKind
  summary: string
  authorId: string
  occurredAt: string
  subjectType: ActivitySubjectType
  subjectId: string
}

/**
 * The signed-in user.
 *
 * Deliberately not `extends Person`: the UI's `Person.role` is a job title ("Enterprise
 * AE"), while the API's `role` is the permission level. Sharing one field name for both
 * would be a bug waiting to happen, so this type keeps them separate.
 */
export interface AuthUser {
  id: Id
  name: string
  initials: string
  jobTitle: string
  email: string
  role: 'admin' | 'rep'
}

interface TokenDto {
  accessToken: string
  refreshToken: string
  tokenType: string
  expiresIn: number
  user: UserDto
}

// --- Mapping -----------------------------------------------------------------

function toPerson(dto: UserDto): Person {
  return { id: dto.id, name: dto.fullName, initials: dto.initials, role: dto.jobTitle }
}

export function toAuthUser(dto: UserDto): AuthUser {
  return {
    id: dto.id,
    name: dto.fullName,
    initials: dto.initials,
    jobTitle: dto.jobTitle,
    email: dto.email,
    role: dto.role,
  }
}

function toStage(dto: StageDto): Stage {
  return {
    id: dto.id,
    name: dto.name,
    shortName: dto.shortName,
    probability: dto.probability,
    color: dto.color,
    kind: dto.kind,
    position: dto.position,
    wipLimit: dto.wipLimit,
    entryCriteria: dto.entryCriteria,
    exitCriteria: dto.exitCriteria,
    keyActivities: dto.keyActivities,
    // Sorted defensively, like stages below: the checklist's order is meaningful to a rep
    // working down it, and should not depend on the API's ordering staying correct.
    deliverables: [...dto.deliverables].sort((a, b) => a.position - b.position),
  }
}

function toPipeline(dto: PipelineDto): PipelineTemplate {
  return {
    id: dto.id,
    name: dto.name,
    tracksPartner: dto.tracksPartner,
    // Defensive: the API orders these, but the board's correctness should not depend on it.
    stages: dto.stages.map(toStage).sort((a, b) => a.position - b.position),
  }
}

function toDeal(dto: DealDto): Deal {
  return {
    id: dto.id,
    name: dto.name,
    createdAt: dto.createdAt,
    accountId: dto.accountId,
    leadId: dto.leadId,
    partnerId: dto.partnerId,
    pipelineTemplateId: dto.pipelineTemplateId,
    stageId: dto.stageId,
    value: Number(dto.value),
    currency: dto.currency,
    expectedCloseDate: dto.expectedCloseDate,
    ownerId: dto.ownerId,
  }
}

// --- Auth --------------------------------------------------------------------

export const authApi = {
  login: (email: string, password: string) =>
    api.postForm<TokenDto>('/auth/login', { username: email, password }),

  me: () => api.get<UserDto>('/auth/me').then(toAuthUser),

  changePassword: (currentPassword: string, newPassword: string) =>
    api.post<{ detail: string }>('/auth/change-password', { currentPassword, newPassword }),
}

// --- Reads -------------------------------------------------------------------

export const readApi = {
  users: () => api.get<UserDto[]>('/auth/users').then((rows) => rows.map(toPerson)),
  accounts: () => api.get<AccountDto[]>('/accounts') as Promise<Account[]>,
  leads: () => api.get<LeadDto[]>('/leads') as Promise<Lead[]>,
  deals: () => api.get<DealDto[]>('/deals').then((rows) => rows.map(toDeal)),
  /** One deal, for reconciling after a change made outside the store's own writes. */
  deal: (dealId: Id) => api.get<DealDto>(`/deals/${dealId}`).then(toDeal),
  pipelines: () => api.get<PipelineDto[]>('/pipelines').then((rows) => rows.map(toPipeline)),
  activities: (limit = 500) =>
    api.get<ActivityDto[]>(`/activities?limit=${limit}`) as Promise<Activity[]>,
}

/** One call per collection, in parallel. Everything the UI needs to render any screen. */
export async function loadSnapshot(): Promise<Snapshot> {
  const [people, accounts, leads, deals, pipelines, activities] = await Promise.all([
    readApi.users(),
    readApi.accounts(),
    readApi.leads(),
    readApi.deals(),
    readApi.pipelines(),
    readApi.activities(),
  ])
  return { people, accounts, leads, deals, pipelines, activities }
}

// --- Writes ------------------------------------------------------------------

export interface DealPatchBody {
  name?: string
  value?: number
  expectedCloseDate?: string
  ownerId?: Id
  stageId?: Id
  partnerId?: Id | null
  leadId?: Id | null
}

export interface NewAccount {
  name: string
  industry: string
  isPartner: boolean
  ownerId: Id
}

export interface NewLead {
  accountId: Id
  businessUnit: string
  ownerId: Id
}

export interface NewDeal {
  name: string
  accountId: Id
  leadId: Id | null
  partnerId: Id | null
  pipelineTemplateId: Id
  stageId: Id
  value: number
  expectedCloseDate: string
  ownerId: Id
  // No `currency`. All values are USD; the API rejects the field outright.
}

export interface NewUser {
  email: string
  fullName: string
  initials: string
  jobTitle: string
  role: 'admin' | 'rep'
  password: string
}

export const createApi = {
  /** Admin only; the API returns 403 for a rep. */
  user: (input: NewUser) => api.post<UserDto>('/auth/users', input).then(toAuthUser),
  account: (input: NewAccount) => api.post<AccountDto>('/accounts', input) as Promise<Account>,
  lead: (input: NewLead) => api.post<LeadDto>('/leads', input) as Promise<Lead>,
  deal: (input: NewDeal) =>
    api
      // Money crosses as a string for the same reason it comes back as one.
      .post<DealDto>('/deals', { ...input, value: String(input.value) })
      .then(toDeal),
}

export const writeApi = {
  moveDealToStage: (dealId: Id, stageId: Id) =>
    api.post<DealDto>(`/deals/${dealId}/stage`, { stageId }).then(toDeal),

  updateDeal: (dealId: Id, patch: DealPatchBody) =>
    api
      .patch<DealDto>(`/deals/${dealId}`, {
        ...patch,
        // NUMERIC on the wire is a string; sending a float risks precision drift.
        ...(patch.value !== undefined ? { value: String(patch.value) } : {}),
      })
      .then(toDeal),

  updateAccount: (accountId: Id, patch: { name?: string; industry?: string; ownerId?: Id }) =>
    api.patch<AccountDto>(`/accounts/${accountId}`, patch) as Promise<Account>,

  updateLead: (leadId: Id, patch: { businessUnit?: string; ownerId?: Id }) =>
    api.patch<LeadDto>(`/leads/${leadId}`, patch) as Promise<Lead>,

  logActivity: (input: {
    subjectType: ActivitySubjectType
    subjectId: Id
    kind: ActivityKind
    summary: string
    authorId?: Id
  }) => api.post<ActivityDto>('/activities', input) as Promise<Activity>,
}

// --- Pipeline administration (admin only) ------------------------------------

export interface StagePatchBody {
  name?: string
  shortName?: string
  probability?: number
  color?: string
  kind?: StageKind
  wipLimit?: number | null
  /**
   * The complete desired list when sent; omitted leaves the checklist alone.
   *
   * Entries keep their `id` so a rename or reorder updates the existing row. Sending plain
   * strings — or dropping the ids — would make the server treat every save as a fresh set
   * and cascade-delete every rep's checkmarks and documents. See the backend's
   * `_sync_deliverables`.
   */
  deliverables?: Array<{ id?: Id; text: string }>
}

export const pipelineApi = {
  create: (name: string, tracksPartner: boolean, copyStagesFrom?: Id) =>
    api
      .post<PipelineDto>('/pipelines', { name, tracksPartner, copyStagesFrom: copyStagesFrom ?? null })
      .then(toPipeline),

  update: (pipelineId: Id, patch: { name?: string; tracksPartner?: boolean }) =>
    api.patch<PipelineDto>(`/pipelines/${pipelineId}`, patch).then(toPipeline),

  duplicate: (pipelineId: Id, name: string) =>
    api.post<PipelineDto>(`/pipelines/${pipelineId}/duplicate`, { name }).then(toPipeline),

  addStage: (pipelineId: Id, name: string) =>
    api.post<PipelineDto>(`/pipelines/${pipelineId}/stages`, { name }).then(toPipeline),

  updateStage: (pipelineId: Id, stageId: Id, patch: StagePatchBody) =>
    api.patch<PipelineDto>(`/pipelines/${pipelineId}/stages/${stageId}`, patch).then(toPipeline),

  reorderStage: (pipelineId: Id, stageId: Id, toIndex: number) =>
    api
      .post<PipelineDto>(`/pipelines/${pipelineId}/stages/${stageId}/reorder`, { toIndex })
      .then(toPipeline),

  /** Rejects with a 409 ApiError when the stage still holds deals (spec 6.3). */
  deleteStage: (pipelineId: Id, stageId: Id) =>
    api.delete<PipelineDto>(`/pipelines/${pipelineId}/stages/${stageId}`).then(toPipeline),

  reassignDeals: (pipelineId: Id, fromStageId: Id, toStageId: Id) =>
    api.post<{ reassigned: number }>(
      `/pipelines/${pipelineId}/stages/${fromStageId}/reassign`,
      { toStageId },
    ),
}

// --- Deal checklists and documents -------------------------------------------

interface AttachmentPresignDto {
  uploadUrl: string
  storageKey: string
  expiresIn: number
}

export const checklistApi = {
  /** Every stage of the deal's pipeline with its ticks and documents, in one request. */
  read: (dealId: Id) => api.get<DealChecklist>(`/deals/${dealId}/checklist`),

  /**
   * Ticks a deliverable. PUT, so a double-clicked checkbox is a no-op rather than an error.
   *
   * The result carries `advancedToStageId` when this tick completed the stage's checklist
   * and moved the deal — that is what the caller needs to show a toast and offer Undo.
   */
  complete: (dealId: Id, deliverableId: Id) =>
    api.put<CompletionResult>(`/deals/${dealId}/deliverables/${deliverableId}/completion`, {}),

  /** Unticks. Never moves the deal back — see the backend's `checklist.uncomplete`. */
  uncomplete: (dealId: Id, deliverableId: Id) =>
    api.delete<DealChecklist>(`/deals/${dealId}/deliverables/${deliverableId}/completion`),

  /**
   * Uploads a file in three steps: ask for a signed URL, PUT the bytes straight to storage,
   * then confirm so the row is written.
   *
   * The bytes never pass through the API. Streaming them through it would tie up a worker
   * for the whole transfer and hold the file in application memory.
   *
   * `fetch` rather than the shared `api` client for step two: the signed URL points at the
   * bucket, not at this API, so attaching the CRM's bearer token would break the signature.
   */
  async upload(dealId: Id, deliverableId: Id, file: File): Promise<Attachment> {
    const base = `/deals/${dealId}/deliverables/${deliverableId}/attachments`
    const presigned = await api.post<AttachmentPresignDto>(`${base}/presign`, {
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    })

    const put = await fetch(presigned.uploadUrl, {
      method: 'PUT',
      body: file,
      // Must match what was signed, or the bucket rejects the signature.
      headers: { 'Content-Type': file.type },
    })
    if (!put.ok) {
      throw new Error(`Upload failed (${put.status}). Please try again.`)
    }

    return api.post<Attachment>(base, {
      storageKey: presigned.storageKey,
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    })
  },

  /** A short-lived signed URL, re-authorised on every request. */
  downloadUrl: (dealId: Id, attachmentId: Id) =>
    api
      .get<{ downloadUrl: string; expiresIn: number }>(
        `/deals/${dealId}/attachments/${attachmentId}/download`,
      )
      .then((dto) => dto.downloadUrl),

  removeAttachment: (dealId: Id, attachmentId: Id) =>
    api.delete<{ detail: string }>(`/deals/${dealId}/attachments/${attachmentId}`),
}

// --- Reminders ---------------------------------------------------------------

export interface NewReminder {
  subjectType: ActivitySubjectType
  subjectId: Id
  title: string
  /** ISO timestamp. */
  dueAt: string
  assigneeId?: Id
}

export const reminderApi = {
  /** Reminders plus derived stale-lead nudges — the surface shown on opening the app. */
  inbox: () => api.get<ReminderInbox>('/reminders/inbox'),

  list: (includeComplete = false) =>
    api.get<Reminder[]>(`/reminders?include_complete=${includeComplete}`),

  create: (input: NewReminder) => api.post<Reminder>('/reminders', input),

  update: (reminderId: Id, patch: { title?: string; dueAt?: string }) =>
    api.patch<Reminder>(`/reminders/${reminderId}`, patch),

  complete: (reminderId: Id) => api.post<Reminder>(`/reminders/${reminderId}/complete`, {}),

  reopen: (reminderId: Id) => api.post<Reminder>(`/reminders/${reminderId}/reopen`, {}),

  remove: (reminderId: Id) => api.delete<{ detail: string }>(`/reminders/${reminderId}`),
}

// --- Analytics ---------------------------------------------------------------

export interface AnalyticsQuery {
  pipelineId?: Id | null
  ownerId?: Id | null
  partnerId?: Id | null
  closeFrom?: string | null
  closeTo?: string | null
}

/**
 * Query parameters are snake_case.
 *
 * Not a style choice — every other query parameter in this API is, and FastAPI ignores an
 * unrecognised one *silently*, so a camelCase spelling would return unfiltered data with a
 * cheerful 200 rather than an error anybody would notice.
 */
const ANALYTICS_PARAMS: Record<keyof AnalyticsQuery, string> = {
  pipelineId: 'pipeline_id',
  ownerId: 'owner_id',
  partnerId: 'partner_id',
  closeFrom: 'close_from',
  closeTo: 'close_to',
}

export const analyticsApi = {
  summary: (query: AnalyticsQuery = {}) => {
    const params = new URLSearchParams()
    for (const [key, value] of Object.entries(query)) {
      if (value) params.set(ANALYTICS_PARAMS[key as keyof AnalyticsQuery], value)
    }
    const suffix = params.toString()
    return api.get<AnalyticsSummary>(`/analytics/summary${suffix ? `?${suffix}` : ''}`)
  },
}
