/**
 * Domain model for CRM v1.
 *
 * Kept deliberately flat per BRD R10 ("keep the underlying model simple; avoid
 * over-engineering entity relationships"). Three levels only: Account -> Lead -> Deal.
 */

export type Id = string

/** Health is always derived from dates and activity, never stored. See lib/health.ts. */
export type Health = 'healthy' | 'closing-soon' | 'at-risk'

export interface Person {
  id: Id
  name: string
  initials: string
  role: string
}

/**
 * What a stage means for reporting.
 *
 * This is explicit rather than inferred from probability. Inferring "open" from
 * `probability < 100` breaks the moment an admin adds a Closed Lost stage at 0%, which
 * the pipeline builder makes possible — lost deals would be counted as open pipeline.
 */
export type StageKind = 'open' | 'won' | 'lost'

/**
 * One checkable deliverable on a stage.
 *
 * An object with a stable `id`, not a bare string. A rep ticks these off and files documents
 * against them, so the identity has to survive an admin renaming or reordering the list —
 * keyed by array position, an edit in Settings would silently reassign every rep's
 * checkmarks and attachments to the wrong item.
 */
export interface Deliverable {
  id: Id
  text: string
  position: number
}

/**
 * A pipeline stage.
 *
 * `entryCriteria` / `exitCriteria` / `keyActivities` hold the methodology detail described
 * in spec.md Section 6.2, seeded from `Aidenai methodology.md`. They stay read-only
 * reference on the deal page and are never enforced.
 *
 * `deliverables` is the exception, and is now a list of objects rather than strings: as of
 * feedback round 1 it is a working checklist that advances the deal when completed. That
 * reverses spec.md Sections 6.4 and 6.5 deliberately.
 */
export interface Stage {
  id: Id
  name: string
  /** Short label for narrow column headers, e.g. "Qualify". */
  shortName: string
  /** Win probability as a percentage, 0-100. */
  probability: number
  /** Hex colour chosen by an admin, so it lives in data rather than in a class name. */
  color: string
  kind: StageKind
  position: number
  /** Soft limit on deals in this stage; the board warns past it. Null means no limit. */
  wipLimit: number | null
<<<<<<< Updated upstream
=======
  /**
   * How long a deal is expected to spend in this stage. Null on terminal stages and on pipelines
   * configured before the field existed.
   *
   * An expectation, not a rule — nothing is refused for exceeding it, which is why it stays editable while
   * the champion gate does not.
   */
  expectedDays: number | null
  /**
   * Whether a deal sitting here needs an identified champion — email, phone *and* LinkedIn — in order to
   * move on. True from the pipeline's gate stage onward.
   *
   * Derived by the API from one gate position, never stored per stage. Unlike the criteria below it is
   * enforced: a forward move without one is refused with a 409.
   */
  championRequired: boolean
  /**
   * True for the single stage where the requirement begins.
   *
   * Distinct from `championRequired` so the UI can mark the boundary rather than painting an
   * indistinguishable band down half the board. A deal may *enter* this stage without a champion; it
   * cannot leave without one.
   */
  isChampionGate: boolean
>>>>>>> Stashed changes
  entryCriteria: string[] | null
  exitCriteria: string[] | null
  keyActivities: string[] | null
  deliverables: Deliverable[]
}

/**
 * Pipelines are data, not code. Board columns render from whichever template is active,
 * so adding a pipeline needs no schema change or redesign (spec Section 9).
 *
 * There is no `type` field. It used to be 'direct' | 'partner', which capped the system at
 * exactly two pipelines; the only thing it ever decided was whether to show a Partner
 * field, so that is now `tracksPartner` and the name is free text.
 */
export interface PipelineTemplate {
  id: Id
  name: string
<<<<<<< Updated upstream
  /** Deals on this pipeline carry a Partner alongside the Customer (R8). */
  tracksPartner: boolean
=======
  /**
   * The 1-based stage position from which a champion is mandatory, or null for a pipeline that never asks.
   *
   * One position rather than a flag per stage, because the rule is "from this stage onward". Fixed when the
   * pipeline is created and never editable: moving it earlier would make yesterday's compliant deals
   * non-compliant today, in somebody else's book.
   */
  championGatePosition: number | null
>>>>>>> Stashed changes
  stages: Stage[]
}

/** Top-level record. Name is the direct customer's name (R1). */
export interface Account {
  id: Id
  name: string
  industry: string
  ownerId: Id
  /** Whether this account is a channel partner rather than an end customer. */
  isPartner: boolean
}

/** Sits under an account, distinguished by business unit/function, with an owner (R2). */
export interface Lead {
  id: Id
  accountId: Id
  businessUnit: string
  ownerId: Id
}

export interface Deal {
  id: Id
  name: string
  /** Creation counts as a touch when deriving health; see lib/health.ts. */
  createdAt: string
  accountId: Id
  /** Optional: a deal can roll up to an account without sitting under a specific lead. */
  leadId: Id | null
  pipelineTemplateId: Id
  stageId: Id
  value: number
  /**
   * Always 'USD'. Read-only — the API refuses to set it and the database refuses to store
   * anything else. Kept on the type so the wire format is unchanged, but no formatter takes
   * it as an argument any more: roll-ups and the Excel export sum values without converting,
   * so a second currency would silently corrupt every total. See lib/format.ts.
   */
  currency: string
  expectedCloseDate: string
  ownerId: Id
  /**
<<<<<<< Updated upstream
   * Partner-led deals carry both the partner and the customer on the same record (R8).
   * `accountId` is always the customer; `partnerId` names the partner bringing the deal.
   */
  partnerId: Id | null
=======
   * How long this deal has been where it is, against what the process allows. Null on closed deals.
   *
   * Server-derived and carried on the deal, so every screen showing a deal shows the same figure. A
   * client-side second derivation would drift, and the first sign would be the deals index calling a deal
   * stuck while its own page called it fine.
   */
  ageing: Ageing | null
  // No `partnerId`. Who else is involved is expressed by the people on the deal: a partner-side
  // contact attached to it is what "there is a partner here" means. One column could name only one
  // partner, and named a company rather than somebody to call.
}

// --- Contacts ----------------------------------------------------------------

/** Which side of a deal a contact sits on. */
export type ContactType = 'customer' | 'partner'

/**
 * A person at a customer or a partner — its own object, not a field on an account or a deal.
 *
 * Has no owner, like the business unit above.
 *
 * `missingDetails` names which of email, phone and LinkedIn are blank. Those three are exactly what
 * the champion gate demands, so the gap is shown wherever a contact is shown rather than only at the
 * point a stage move is refused.
 */
export interface Contact {
  id: Id
  createdAt: string
  accountId: Id
  accountName: string
  fullName: string
  email: string
  phone: string
  linkedinUrl: string
  designation: string
  contactType: ContactType
  /** Distinct deals this person is attached to, in any role. */
  dealCount: number
  missingDetails: string[]
}

/**
 * What a person can be on a deal.
 *
 * Rows rather than a fixed union, because which roles exist is the user's decision. `key` is the
 * stable handle: `champion` is the one the application reasons about, and an admin renaming it to
 * "Advocate" must not disable the stage gate.
 */
export interface ContactRole {
  id: Id
  key: string
  name: string
  position: number
  /** Built in — cannot be deleted, and its key never changes. Champion only. */
  isSystem: boolean
}

/**
 * One contact on a deal, in a role or not yet in one.
 *
 * `roleId` is null while nobody has worked out what this person is on this deal — the normal state
 * just after someone is pulled in from the directory. The three role fields are null together.
 */
export interface DealContact {
  id: Id
  contactId: Id
  roleId: Id | null
  roleKey: string | null
  roleName: string | null
  fullName: string
  email: string
  phone: string
  linkedinUrl: string
  designation: string
  contactType: ContactType
  accountId: Id
  accountName: string
  missingDetails: string[]
}

/** A contact, optionally already in a role, as sent when creating a deal or attaching someone later. */
export interface DealContactAssignment {
  contactId: Id
  roleId: Id | null
}

/**
 * A role a deal tracks, and how many people currently fill it.
 *
 * `filledCount` of zero is the interesting case: a role the deal needs and nobody has been found for.
 * That state is the reason roles are tracked separately from the people rather than derived from them.
 */
export interface DealRole {
  id: Id
  roleId: Id
  roleKey: string
  roleName: string
  position: number
  filledCount: number
}

/** Everything the deal page needs about who is involved: roles tracked, and people attached. */
export interface DealPeople {
  roles: DealRole[]
  contacts: DealContact[]
}

/**
 * A possible duplicate, surfaced while someone types a new account name.
 *
 * `reason` says how the match was found and `blocksCreation` whether it is fatal, so the form can
 * distinguish "this is the same company, you cannot file it twice" from "this looks similar, have a
 * look". Inferring severity from `score` alone would conflate the two.
 */
export interface SimilarAccount {
  id: Id
  name: string
  industry: string
  ownerName: string
  score: number
  reason: 'exact' | 'normalized' | 'prefix' | 'fuzzy'
  blocksCreation: boolean
>>>>>>> Stashed changes
}

export type ActivitySubjectType = 'account' | 'lead' | 'deal'

<<<<<<< Updated upstream
export type ActivityKind = 'call' | 'meeting' | 'email' | 'note' | 'stage-change' | 'document'
=======
export type ActivityKind =
  | 'call'
  | 'meeting'
  | 'email'
  | 'note'
  | 'stage-change'
  | 'document'
  | 'nudge'
  | 'contact-change'
>>>>>>> Stashed changes

/**
 * The kinds a person can log by hand.
 *
<<<<<<< Updated upstream
 * `stage-change` and `document` are excluded on purpose: the server writes both — one when a
 * deal moves, the other when a file is filed against or removed from a deliverable. Offering
 * either in the log-activity form would let someone record an event that never happened.
 */
export type LoggableActivityKind = Exclude<ActivityKind, 'stage-change' | 'document'>
=======
 * `stage-change`, `document`, `nudge` and `contact-change` are excluded on purpose: the server writes
 * all four — when a deal moves, when a file is filed against a deliverable, when an admin chases an
 * owner, and when the people or roles on a deal change. Offering any of them here would let someone
 * record an event that never happened.
 */
export type LoggableActivityKind = Exclude<
  ActivityKind,
  'stage-change' | 'document' | 'nudge' | 'contact-change'
>
>>>>>>> Stashed changes

/**
 * One activity shape logs against accounts, leads, and deals (R4). A polymorphic
 * subject keeps this to a single relationship instead of three.
 */
export interface Activity {
  id: Id
  subjectType: ActivitySubjectType
  subjectId: Id
  kind: ActivityKind
  summary: string
  authorId: Id
  occurredAt: string
}

/** Everything the UI reads. The repository returns this shape. */
export interface Snapshot {
  people: Person[]
  accounts: Account[]
  leads: Lead[]
  deals: Deal[]
  activities: Activity[]
  pipelines: PipelineTemplate[]
<<<<<<< Updated upstream
=======
  contacts: Contact[]
  contactRoles: ContactRole[]
  /**
   * Deals sitting in a stage whose champion requirement they fail.
   *
   * Cannot be derived on the client: the gate needs a deal's contacts, and the snapshot carries the
   * contact directory but not the per-deal links. So the server computes it and this is the answer.
   */
  championGaps: ChampionGap[]
>>>>>>> Stashed changes
}

/**
 * A deal that does not meet its *current* stage's champion requirement.
 *
 * The gate refuses transitions, which leaves a state it cannot see: a deal that entered before an admin
 * switched the flag on, or whose champion was unmapped afterwards. `detail` is the same sentence the
 * refusal produces, so the warning and the eventual refusal never say different things.
 */
export interface ChampionGap {
  dealId: Id
  stageName: string
  detail: string
}


// --- Deal checklists and documents -------------------------------------------

/** A document filed against a deal's stage deliverable. */
export interface Attachment {
  id: Id
  dealId: Id
  stageDeliverableId: Id
  filename: string
  contentType: string
  sizeBytes: number
  uploadedById: Id
  uploadedByName: string
  createdAt: string
  /**
   * No storage key. It is an internal bucket address, and the API deliberately withholds it
   * — downloads go through an endpoint that re-checks permission and returns a short-lived
   * signed URL, so a link cannot outlive the permission that produced it.
   */
}

/** One deliverable on one deal: its text, whether it is ticked, and what is filed. */
export interface DeliverableStatus {
  id: Id
  text: string
  position: number
  complete: boolean
  completedAt: string | null
  completedById: Id | null
  completedByName: string | null
  attachments: Attachment[]
}

export interface StageChecklist {
  stageId: Id
  stageName: string
  stageShortName: string
  stageColor: string
  stagePosition: number
  /**
   * Whether the deal is currently in this stage. Drives whether checkboxes are interactive:
   * ticking a box on a stage the deal has already left has no defensible meaning, and the
   * API refuses it with a 409.
   */
  isCurrentStage: boolean
  deliverables: DeliverableStatus[]
  completeCount: number
  totalCount: number
}

/** Every stage of a deal's pipeline, so documents can be browsed across all of them. */
export interface DealChecklist {
  dealId: Id
  currentStageId: Id
  stages: StageChecklist[]
}

/**
 * The result of ticking a box.
 *
 * `advancedToStageId` is set only when that tick completed the stage's checklist and moved
 * the deal, which is what lets the client show the toast and offer Undo.
 */
export interface CompletionResult {
  checklist: DealChecklist
  advancedToStageId: Id | null
  advancedToStageName: string | null
  advancedFromStageId: Id | null
}

// --- Reminders ---------------------------------------------------------------

export interface Reminder {
  id: Id
  title: string
  dueAt: string
  assigneeId: Id
  assigneeName: string
  completedAt: string | null
  subjectType: ActivitySubjectType
  subjectId: Id
  subjectLabel: string
  overdue: boolean
}

/**
 * A lead nobody has touched for a week.
 *
 * Derived by the server on every read rather than stored, so there is no id to dismiss —
 * the nudge disappears when the lead is worked, which is the only outcome that should make
 * it disappear.
 */
export interface StaleLeadNudge {
  leadId: Id
  businessUnit: string
  accountId: Id
  accountName: string
  ownerId: Id
  ownerName: string
  lastActivityAt: string | null
  daysQuiet: number
  openDealCount: number
}

/** What greets a user on opening the app. */
export interface ReminderInbox {
  overdue: Reminder[]
  upcoming: Reminder[]
  staleLeads: StaleLeadNudge[]
  totalCount: number
}

// --- Analytics ---------------------------------------------------------------

/**
 * There is deliberately no `weightedValue` on any of these.
 *
 * It used to be `value * stageProbability / 100`, and it was printed on the deal page, the deals index, the
 * dashboard, the team screen and inside the assistant's answers. A stage's percentage describes how far
 * along a deal is, not how likely it is to be won, so that product looked like expected revenue and was
 * not. Removed rather than relabelled — a wrong number with an honest caption is still wrong.
 */

/** Which window the whole screen describes, by deal *created* date. */
export type AnalyticsPeriod = 'week' | 'month' | 'quarter' | 'year'

/**
 * One deal, flat, carrying every key a drill groups by.
 *
 * The summary ships the deals it was computed from so drilling into a bar shows that bar's deals rather
 * than a freshly fetched set that may have moved underneath it.
 */
export interface AnalyticsDeal {
  id: Id
  name: string
  accountName: string
  value: number
  pipelineId: Id
  pipelineName: string
  stageId: Id
  stageName: string
  stageShortName: string
  ownerId: Id
  ownerName: string
  expectedCloseDate: string
  createdAt: string
  isOpen: boolean
  health: Health
  /** Null on closed deals, which are exempt from ageing. */
  ageing: Ageing | null
}

/**
 * How long a deal has been where it is, and against what the process allows.
 *
 * `basis` matters and is shown, not hidden. `stage` is measured from a logged stage move and describes the
 * current stage alone. `cycle` is measured from creation against the cumulative expected days of every stage
 * up to here, and is used when no move was ever recorded — a firm claim about the deal, a weaker one about
 * the stage. "47 days in Validate" and "151 days to reach Validate" are different sentences, and rendering
 * them identically would overstate the second.
 */
export interface Ageing {
  basis: 'stage' | 'cycle'
  daysUsed: number
  /** Null when the stages carry no expected duration, in which case nothing is judged. */
  daysExpected: number | null
  daysOver: number
  daysLeft: number | null
}

/** One thing wrong with a deal, paired with what to do about it. */
export interface RiskReason {
  code:
    | 'stuck'
    | 'overdue'
    | 'cold'
    | 'no-champion'
    | 'actions-outstanding'
    | 'no-actions-defined'
  detail: string
  action: string
}

/**
 * A deal needing intervention.
 *
 * One row answers all four questions the reporting requirement asks: **who** is `ownerName`, **where** is
 * the stage with its ageing, **why** are the reasons, and **what action** is the next unticked deliverable.
 * Deliberately not a score — a number from 0 to 100 compresses the reasons back into something nobody can
 * act on.
 */
export interface DealRisk {
  dealId: Id
  dealName: string
  accountName: string
  ownerId: Id
  ownerName: string
  stageId: Id
  stageName: string
  stageShortName: string
  pipelineId: Id
  pipelineName: string
  value: number
  expectedCloseDate: string
  health: Health
  ageing: Ageing
  reasons: RiskReason[]
  /** Null when the stage defines no deliverables — a configuration gap, not a finished checklist. */
  nextAction: string | null
  actionsTotal: number
  actionsDone: number
  daysSinceActivity: number | null
}

export interface RiskSummary {
  deals: DealRisk[]
  stuckCount: number
  stuckValue: number
  /** Open deals in scope, so the stuck figure has a denominator rather than floating free. */
  openCount: number
  openValue: number
  /** Stages with no deliverables defined. An administrator's gap, counted across the whole book. */
  withoutActionsCount: number
}

export interface StageSlice {
  /** Which pipeline the stage belongs to — the response carries every pipeline's stages when unfiltered. */
  pipelineId: Id
  stageId: Id
  stageName: string
  stageShortName: string
  color: string
  /** Progression, not likelihood. Shown as an axis label; nothing multiplies by it. */
  probability: number
  position: number
  count: number
  value: number
}

export interface PipelineSlice {
  pipelineId: Id
  pipelineName: string
  count: number
  /** Distinct companies, not deals — several deals on one account is the normal case. */
  accountCount: number
  value: number
}

export interface OwnerSlice {
  ownerId: Id
  ownerName: string
  openCount: number
  openValue: number
  wonCount: number
  wonValue: number
  /** Won + lost, so a win rate can be printed with its denominator rather than as a bare percentage. */
  resolvedCount: number
}

export interface PartnerSlice {
  /** Null on the "Direct" row, which is included so partner value has something to sit beside. */
  partnerId: Id | null
  partnerName: string
  openCount: number
  openValue: number
  wonCount: number
  wonValue: number
}

export interface ForecastSlice {
  /** First day of the close month, for stable sorting. */
  month: string
  label: string
  count: number
  value: number
}

export interface CreatedBucket {
  start: string
  label: string
  count: number
  value: number
}

/** What was created in the period, and in the one before it — a creation figure alone says nothing. */
export interface CreatedSummary {
  buckets: CreatedBucket[]
  count: number
  value: number
  priorCount: number
  priorValue: number
  priorLabel: string
  /**
   * The previous window bucketed the same way, aligned by *position* rather than by date.
   *
   * Position pairing is the only thing that works across window lengths — February divides into four week
   * buckets and March into five — and it answers the question a reader asks: how did the third week compare
   * with the third week. Always the same length as `buckets`.
   */
  priorBuckets: CreatedBucket[]
}

export interface OutcomeMix {
  wonCount: number
  wonValue: number
  lostCount: number
  lostValue: number
  openCount: number
  openValue: number
  /** Won as a share of *decided* deals. Open deals are not in the denominator. */
  winRate: number
}

export interface AnalyticsFilters {
  pipelineId: Id | null
  ownerId: Id | null
<<<<<<< Updated upstream
  partnerId: Id | null
  closeFrom: string | null
  closeTo: string | null
=======
  period: AnalyticsPeriod
  periodFrom: string
  periodTo: string
>>>>>>> Stashed changes
  dealCount: number
  accountCount: number
  /** Open deals created before the window, and so absent from every panel. Printed, not hidden. */
  excludedOpenCount: number
}

export interface AnalyticsSummary {
  filters: AnalyticsFilters
  funnel: StageSlice[]
  byPipeline: PipelineSlice[]
  byOwner: OwnerSlice[]
  byPartner: PartnerSlice[]
  forecast: ForecastSlice[]
  created: CreatedSummary
  risks: RiskSummary
  outcomes: OutcomeMix
  totalOpenValue: number
  deals: AnalyticsDeal[]
}


// --- Lemlist integration -----------------------------------------------------

/**
 * Whether this user has connected their lemlist account, and how the last import went.
 *
 * The API key is never here. `keyFingerprint` is eight characters derived from its hash — enough to tell
 * two keys apart, useless as a key — because "are we connected with the key I think we are" is a real
 * question and showing the key back to answer it is not an acceptable way to do it.
 */
export interface LemlistStatus {
  connected: boolean
  teamId: string
  teamName: string
  keyFingerprint: string
  connectedAt: string | null
  lastSyncAt: string | null
  lastSyncError: string
  syncStatus: 'idle' | 'syncing' | 'error'
  /** How many campaigns lemlist lists, and how many of those have been mirrored. Listing is free; the gap
   *  between the two is what the user has chosen not to spend requests on. */
  campaigns: number
  importedCampaigns: number
  contacts: number
  engagements: number
  /**
   * How many engagements arrived by webhook rather than by import.
   *
   * The ratio answers a question nothing else on the screen can: whether the integration is *live*, as
   * opposed to merely connected. A hook can be registered and never fire.
   */
  liveEngagements: number
  webhookRegistered: boolean
  webhookTargetUrl: string
}

export interface LemlistSyncResult {
  campaigns: number
  contactsCreated: number
  contactsUpdated: number
  engagements: number
  /** Campaigns that failed, named, with why. A partial import reports as partial. */
  failures: string[]
}

/**
 * A campaign in the connected workspace.
 *
 * Listing a campaign and importing it are separate acts, and these three fields carry the difference:
 * `importedAt` null means listed but never mirrored, a value means mirrored and refreshable, and
 * `importing` means one is running right now.
 */
export interface LemlistCampaign {
  id: Id
  lemlistId: string
  name: string
  status: string
  leadCount: number
  remoteCreatedAt: string | null
  importedAt: string | null
  importing: boolean
  importError: string
}

/**
 * An imported prospect. Not a `Contact` — see the note on the backend model.
 *
 * `contactId` is the promotion link: null means this is still only somebody in an outreach campaign, and a
 * value means a person has decided they are real and filed them against an account.
 */
export interface LemlistProspect {
  id: Id
  email: string
  fullName: string
  firstName: string
  lastName: string
  companyName: string
  jobTitle: string
  phone: string
  linkedinUrl: string
  state: string
  campaignId: Id
  campaignName: string
  lastActivityAt: string | null
  engagementCount: number
  engagementScore: number
  /**
   * How far along the outreach sequence they got: 0 never contacted, 5 a booked meeting.
   *
   * Derived on the server from the events *and* the state, because either alone understates progress. This
   * is what the sequence trail draws, and what the temperature bands group by.
   */
  funnelStep: number
  /** Bounced or unsubscribed — a closed door rather than a low score, and drawn as a break in the trail. */
  deadEnd: boolean
  variables: Record<string, unknown>
  contactId: Id | null
}

export interface LemlistEngagement {
  id: Id
  kind: string
  occurredAt: string
  /** True when it arrived by webhook rather than by import, which is how you tell delivery is working. */
  fromWebhook: boolean
  payload: Record<string, unknown>
}
