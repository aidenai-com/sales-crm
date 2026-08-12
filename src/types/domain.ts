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
  /**
   * Whether they can still sign in. Deactivated people stay in the snapshot so their name resolves on
   * everything they own and logged; `assignableOwners` is what keeps them out of pickers.
   */
  isActive: boolean
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
  /**
   * Whether a deal needs an identified champion — with email, phone and LinkedIn — before it can
   * enter this stage. Unlike the criteria below, this one is enforced: the API refuses the move
   * with a 409.
   */
  requiresChampion: boolean
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
  stages: Stage[]
}

/**
 * Top-level record: a company. Not a customer, not a partner — an account.
 *
 * There is no `isPartner`, and no partner field anywhere. Being a partner is a property of a *person on
 * a deal*: a deal's contacts carry roles, and the same company can supply the champion on one deal and
 * be the end customer on another. The flag this replaced could not express that — setting it removed
 * the account from the customer tree and every customer picker, so a firm that both resold for us and
 * bought from us could only be recorded as one of the two.
 *
 * An account is only a company: a name, an industry, an owner. Everything that makes it *business* —
 * its business units, its deals — lives in other tables, so a company filed purely to hold a contact
 * is a legitimate row here and simply has nothing under it.
 */
export interface Account {
  id: Id
  name: string
  industry: string
  ownerId: Id
}

/**
 * Sits under an account, distinguished by business unit or function.
 *
 * Has no owner. Only accounts and deals do — a business unit's stewardship follows its account.
 * The account tree still shows a name at this level; it is the account's owner.
 */
export interface Lead {
  id: Id
  accountId: Id
  businessUnit: string
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
}

export type ActivitySubjectType = 'account' | 'lead' | 'deal'

export type ActivityKind =
  | 'call'
  | 'meeting'
  | 'email'
  | 'note'
  | 'stage-change'
  | 'document'
  | 'nudge'

/**
 * The kinds a person can log by hand.
 *
 * `stage-change`, `document` and `nudge` are excluded on purpose: the server writes all three —
 * when a deal moves, when a file is filed against a deliverable, and when an admin chases an
 * owner. Offering any of them here would let someone record an event that never happened.
 */
export type LoggableActivityKind = Exclude<ActivityKind, 'stage-change' | 'document' | 'nudge'>

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
  contacts: Contact[]
  contactRoles: ContactRole[]
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

export interface StageSlice {
  stageId: Id
  stageName: string
  stageShortName: string
  color: string
  probability: number
  position: number
  count: number
  value: number
  weightedValue: number
}

export interface OwnerSlice {
  ownerId: Id
  ownerName: string
  openCount: number
  openValue: number
  weightedValue: number
  wonCount: number
  wonValue: number
}

export interface ForecastSlice {
  /** First day of the close month, for stable sorting. */
  month: string
  label: string
  count: number
  value: number
  weightedValue: number
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
  closeFrom: string | null
  closeTo: string | null
  dealCount: number
}

export interface AnalyticsSummary {
  filters: AnalyticsFilters
  funnel: StageSlice[]
  byOwner: OwnerSlice[]
  forecast: ForecastSlice[]
  outcomes: OutcomeMix
  totalOpenValue: number
  totalWeightedValue: number
}
