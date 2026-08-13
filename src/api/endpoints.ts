import type {
  Account,
  Ageing,
  Activity,
  ActivityKind,
  ActivitySubjectType,
  AnalyticsPeriod,
  AnalyticsSummary,
  Attachment,
  ChampionGap,
  CompletionResult,
  Deal,
  DealChecklist,
  Id,
  LemlistCampaign,
  LemlistEngagement,
  LemlistProspect,
  LemlistStatus,
  LemlistSyncResult,
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
<<<<<<< Updated upstream
=======
  expectedDays: number | null
  championRequired: boolean
  isChampionGate: boolean
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
  tracksPartner: boolean
=======
  championGatePosition: number | null
>>>>>>> Stashed changes
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
  ageing: Ageing | null
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
<<<<<<< Updated upstream
=======
    expectedDays: dto.expectedDays,
    championRequired: dto.championRequired,
    isChampionGate: dto.isChampionGate,
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
    tracksPartner: dto.tracksPartner,
=======
    championGatePosition: dto.championGatePosition,
>>>>>>> Stashed changes
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
    ageing: dto.ageing ?? null,
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
<<<<<<< Updated upstream
=======
  contacts: () => api.get<Contact[]>('/contacts'),
  contactRoles: () => api.get<ContactRole[]>('/contacts/roles'),
  championGaps: () => api.get<ChampionGap[]>('/deals/champion-gaps'),
>>>>>>> Stashed changes
}

/** One call per collection, in parallel. Everything the UI needs to render any screen. */
export async function loadSnapshot(): Promise<Snapshot> {
<<<<<<< Updated upstream
  const [people, accounts, leads, deals, pipelines, activities] = await Promise.all([
=======
  const [
    people,
    accounts,
    leads,
    deals,
    pipelines,
    activities,
    contacts,
    contactRoles,
    championGaps,
  ] = await Promise.all([
>>>>>>> Stashed changes
    readApi.users(),
    readApi.accounts(),
    readApi.leads(),
    readApi.deals(),
    readApi.pipelines(),
    readApi.activities(),
<<<<<<< Updated upstream
  ])
  return { people, accounts, leads, deals, pipelines, activities }
=======
    readApi.contacts(),
    readApi.contactRoles(),
    readApi.championGaps(),
  ])
  return {
    people,
    accounts,
    leads,
    deals,
    pipelines,
    activities,
    contacts,
    contactRoles,
    championGaps,
  }
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
=======
/**
 * A team member as the Team settings screen needs them.
 *
 * Wider than `Person`, which is what the rest of the app uses: owner dropdowns need a name and
 * initials and nothing else, so the snapshot carries nothing else. Email, role and active state are
 * administration, and they live here rather than being added to `Person` so that every screen in the
 * app does not start carrying a colleague's email address around to render a two-letter avatar.
 */
export interface TeamMember {
  id: Id
  name: string
  initials: string
  email: string
  jobTitle: string
  role: 'admin' | 'rep'
  isActive: boolean
}

export interface UserPatch {
  email?: string
  fullName?: string
  initials?: string
  jobTitle?: string
  role?: 'admin' | 'rep'
  isActive?: boolean
  /** A reset. Set by an administrator without the current password — see the API's own note. */
  password?: string
  /**
   * Who inherits this person's accounts and open deals. Sent with `isActive: false` when an
   * administrator hands the book over; omitted when they deliberately leave it where it is.
   */
  reassignTo?: Id
}

/** What somebody is holding, so deactivating them is a decision rather than a surprise. */
export interface OwnershipSummary {
  userId: Id
  accounts: number
  openDeals: number
  openDealValue: number
}

function toTeamMember(dto: UserDto): TeamMember {
  return {
    id: dto.id,
    name: dto.fullName,
    initials: dto.initials,
    email: dto.email,
    jobTitle: dto.jobTitle,
    role: dto.role,
    isActive: dto.isActive,
  }
}

/** Administration of people. Every call here is 403 for a rep except the list. */
export const teamApi = {
  list: () => api.get<UserDto[]>('/auth/users').then((rows) => rows.map(toTeamMember)),
  create: (input: NewUser) => api.post<UserDto>('/auth/users', input).then(toTeamMember),
  update: (userId: Id, patch: UserPatch) =>
    api.patch<UserDto>(`/auth/users/${userId}`, patch).then(toTeamMember),

  ownership: (userId: Id) =>
    api
      .get<{ userId: Id; accounts: number; openDeals: number; openDealValue: string }>(
        `/auth/users/${userId}/ownership`,
      )
      // Money crosses as a string, as it does everywhere else in this API.
      .then((dto) => ({ ...dto, openDealValue: Number(dto.openDealValue) }) as OwnershipSummary),
}

>>>>>>> Stashed changes
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

/**
 * A stage as it is created.
 *
 * No champion field. The gate is one position on the *pipeline*, sent once as
 * `championGatePosition` when the pipeline is created — a per-stage flag could describe two gates.
 */
export interface NewStage {
  name: string
  shortName?: string
  probability?: number
  color?: string
  kind?: StageKind
  expectedDays?: number | null
}

export interface StagePatchBody {
  name?: string
  shortName?: string
  probability?: number
  color?: string
  kind?: StageKind
  wipLimit?: number | null
<<<<<<< Updated upstream
=======
  // `expectedDays` is editable and the champion gate is not, and the difference is the point: one is an
  // expectation that nothing is refused for, the other is a rule deals have already been judged against.
  // The API refuses a gate outright, so having it here would only let a caller build a request that fails.
  expectedDays?: number | null
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
  create: (name: string, tracksPartner: boolean, copyStagesFrom?: Id) =>
    api
      .post<PipelineDto>('/pipelines', { name, tracksPartner, copyStagesFrom: copyStagesFrom ?? null })
=======
  /**
   * Creates a pipeline, declaring its stages and its champion gate.
   *
   * All of it is here because the gate can only be set at creation — the API refuses it on an update. A
   * create that could only take a name would leave a new pipeline permanently ungateable.
   *
   * `championGatePosition` is 1-based against the stage list as sent, and must name an open stage that is
   * not the last one: the rule applies to moving *past* the gate, so a gate on the final open stage could
   * never fire. The API validates both and answers 422.
   *
   * `stages` and `copyStagesFrom` are alternatives; sending both is a 400 rather than a silent choice
   * between two complete descriptions. A copy carries the source's gate, so sending one alongside
   * `copyStagesFrom` is refused too.
   */
  create: (
    name: string,
    options: { copyStagesFrom?: Id; stages?: NewStage[]; championGatePosition?: number | null } = {},
  ) =>
    api
      .post<PipelineDto>('/pipelines', {
        name,
        copyStagesFrom: options.copyStagesFrom ?? null,
        stages: options.stages ?? null,
        championGatePosition: options.championGatePosition ?? null,
      })
>>>>>>> Stashed changes
      .then(toPipeline),

  update: (pipelineId: Id, patch: { name?: string; tracksPartner?: boolean }) =>
    api.patch<PipelineDto>(`/pipelines/${pipelineId}`, patch).then(toPipeline),

  duplicate: (pipelineId: Id, name: string) =>
    api.post<PipelineDto>(`/pipelines/${pipelineId}/duplicate`, { name }).then(toPipeline),

  /**
   * Adds a stage to an existing pipeline.
   *
   * The gate is not settable here, and cannot be: it is a position, and a stage added in the middle would
   * shift what that position means for every deal already past it.
   */
  addStage: (pipelineId: Id, stage: NewStage) =>
    api.post<PipelineDto>(`/pipelines/${pipelineId}/stages`, stage).then(toPipeline),

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
<<<<<<< Updated upstream
  partnerId?: Id | null
  closeFrom?: string | null
  closeTo?: string | null
=======
  /**
   * Which window the whole screen describes, by deal *created* date.
   *
   * This replaced an explicit close-date range. A range is two inputs that can be set to something
   * nonsensical and has no answer to "compared with what"; a named calendar period has a defined
   * predecessor, which is what the creation panel needs to be worth reading.
   */
  period?: AnalyticsPeriod | null
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
  partnerId: 'partner_id',
  closeFrom: 'close_from',
  closeTo: 'close_to',
=======
  period: 'period',
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
=======

// --- Contacts ----------------------------------------------------------------

export interface ContactPatchBody {
  fullName?: string
  email?: string
  phone?: string
  linkedinUrl?: string
  designation?: string
  contactType?: ContactType
  // No `accountId`. Moving a contact between companies is not an edit — their designation and every
  // deal they are on belong to the old account.
}

export const contactApi = {
  /**
   * Accounts that might already be the company someone is typing.
   *
   * Called on a debounce while the name field changes, so it is deliberately the cheapest read in the
   * app. `blocksCreation` marks a match the API will refuse outright, as opposed to one worth a look.
   */
  similarAccounts: (name: string, signal?: AbortSignal) =>
    api.get<SimilarAccount[]>(`/accounts/similar?name=${encodeURIComponent(name)}`, signal),

  update: (contactId: Id, patch: ContactPatchBody) =>
    api.patch<Contact>(`/contacts/${contactId}`, patch),

  /** Admin only. Strips this person from every deal they were on, so it is not a rep's call. */
  remove: (contactId: Id) => api.delete<{ detail: string }>(`/contacts/${contactId}`),

  /**
   * The roles a deal tracks and the people on it.
   *
   * Every write below returns the whole picture rather than the row that changed. The panel renders
   * roles and contacts together, and the states worth seeing are the mismatches — an unfilled role, an
   * unmapped person — so a fragment would leave the client re-fetching or guessing.
   */
  forDeal: (dealId: Id) => api.get<DealPeople>(`/deals/${dealId}/people`),

  addToDeal: (dealId: Id, assignment: DealContactAssignment) =>
    api.post<DealPeople>(`/deals/${dealId}/contacts`, assignment),

  /** Maps, remaps, or unmaps somebody. A null role unmaps without detaching them from the deal. */
  remapOnDeal: (dealId: Id, linkId: Id, roleId: Id | null) =>
    api.patch<DealPeople>(`/deals/${dealId}/contacts/${linkId}`, { roleId }),

  /** Detaches one person. The contact itself is untouched and the role stays tracked. */
  removeFromDeal: (dealId: Id, linkId: Id) =>
    api.delete<DealPeople>(`/deals/${dealId}/contacts/${linkId}`),

  /** Starts tracking a role on this deal, with or without anybody in it. */
  addRoleToDeal: (dealId: Id, roleId: Id) =>
    api.post<DealPeople>(`/deals/${dealId}/roles`, { roleId }),

  /** Stops tracking a role. Anybody who held it becomes unmapped rather than detached. */
  removeRoleFromDeal: (dealId: Id, linkId: Id) =>
    api.delete<DealPeople>(`/deals/${dealId}/roles/${linkId}`),
}

export const contactRoleApi = {
  /** Admin only: which roles exist is a company-wide configuration decision, like a pipeline's stages. */
  create: (name: string) => api.post<ContactRole>('/contacts/roles', { name }),
  update: (roleId: Id, patch: { name?: string; position?: number }) =>
    api.patch<ContactRole>(`/contacts/roles/${roleId}`, patch),
  /** Refused with 409 if the role is built in, or still assigned on any deal. */
  remove: (roleId: Id) => api.delete<{ detail: string }>(`/contacts/roles/${roleId}`),
}


// --- Lemlist ------------------------------------------------------------------

/**
 * The lemlist integration.
 *
 * Every read here hits our own database, not lemlist. That is the whole design: the Contacts page must not
 * inherit lemlist's latency, its 20-requests-per-2-seconds workspace budget, or its downtime. Only
 * `connect` and `sync` talk to lemlist, and both are explicit user actions.
 */
export const lemlistApi = {
  status: () => api.get<LemlistStatus>('/integrations/lemlist/status'),

  connect: (apiKey: string) =>
    api.post<LemlistStatus>('/integrations/lemlist/connect', { apiKey }),

  disconnect: () => api.delete<{ detail: string }>('/integrations/lemlist/connect'),

  registerWebhook: () => api.post<{ detail: string }>('/integrations/lemlist/webhook/register'),

  /** The mirrored campaign list. Free — reads our tables, never lemlist. */
  campaigns: () => api.get<LemlistCampaign[]>('/integrations/lemlist/campaigns'),

  /** Asks lemlist whether the campaign list has changed. One or two requests, so it stays quick. */
  refreshCampaigns: () => api.post<LemlistCampaign[]>('/integrations/lemlist/campaigns/refresh'),

  /**
   * Imports one campaign's leads and activity, and waits for it.
   *
   * Slow by nature: paced under lemlist's rate limit, a large campaign takes a while. One campaign at a
   * time is what keeps it inside a request at all — importing the whole workspace at once did not fit.
   */
  importCampaign: (campaignId: Id, full = true) =>
    api.post<LemlistSyncResult>(
      `/integrations/lemlist/campaigns/${campaignId}/import?full=${full}`,
    ),

  prospects: (params: { campaignId?: Id; state?: string; search?: string } = {}) => {
    const query = new URLSearchParams()
    if (params.campaignId) query.set('campaign_id', params.campaignId)
    if (params.state) query.set('state', params.state)
    if (params.search) query.set('search', params.search)
    const suffix = query.toString() ? `?${query}` : ''
    return api.get<LemlistProspect[]>(`/integrations/lemlist/contacts${suffix}`)
  },

  timeline: (prospectId: Id) =>
    api.get<LemlistEngagement[]>(`/integrations/lemlist/contacts/${prospectId}/timeline`),

  promote: (prospectId: Id, accountId: Id) =>
    api.post<{ detail: string }>(`/integrations/lemlist/contacts/${prospectId}/promote`, {
      accountId,
    }),
}
>>>>>>> Stashed changes
