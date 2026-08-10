# Feedback Round 1 — Design

Date: 2026-08-07
Status: approved
Sources: stakeholder feedback (six items, verbatim below), `spec.md` (scope), `design.md` (visual system)

Supersedes, for the items it names: `spec.md` §6.4 and §6.5 (exit-criteria gating deferral).

---

## 1. The feedback

Six items, verbatim:

1. Open date — show reminders for upcoming activities.
2. Open date — if no action is taken on a potential lead for a week, share a reminder to follow up.
3. Dashboard — visuals to see overall pipeline, filterable by things like individuals and partners to begin with.
4. For the playbook, make each deliverable checkboxed; clicking all of them qualifies you to move to the
   next stage, which is automated. Against each deliverable I should be able to add an attachment
   (excel, word, pdf, email msg, etc), but a document is not mandatory to click the checkbox.
5. I should be able to click across all the statuses and see the documents attached; the current status
   should be highlighted in a different colour so I know the current state.
6. All values are in USD and use US standard number formatting.

Plus two directives given alongside: the dashboard's reporting content moves to a separate **Analytics**
tab because no user will scroll that far, and a file storage service is needed for checklist attachments.

### 1.1 Resolved ambiguities

| Question | Resolution |
|---|---|
| "Open date" | **On opening the app.** A reminders surface that greets the user on landing. Not a date column. |
| Reminder delivery | **In-app plus email**, behind a pluggable notifier. In-app needs no credentials. |
| File storage | **MinIO now, S3-compatible later.** Same code path for AWS S3 / R2 / B2 in production. |
| Auto-advance literalness | **Auto-advance with undo.** Moves immediately, toast with Undo, guards below. |
| Analytics placement | **Fifth top-level nav item.** Still flat, so `spec.md` §4.5 holds. |

### 1.2 Deliberate reversal of spec §6.4

`spec.md` §6.4 cut exit-criteria gating from v1, and §6.5 listed "per-stage
activities/deliverables checklists in rep-facing UI" as explicitly deferred. Feedback items 4 and 5
reverse both. This is a scope decision by the stakeholder, recorded here so it reads as a decision
rather than as drift. §6.4's *other* claim — that drag-and-drop stays a valid manual move — still
holds: the checklist adds an automatic path to the next stage, it does not remove the manual one.

---

## 2. Deliverables become first-class rows

### 2.1 Why the JSONB array cannot stay

`Stage.deliverables` is `JSONB`, a bare array of strings (`models/pipeline.py`). Per-deal checkmarks and
attachments cannot key off an array index: an admin reordering or renaming a deliverable in
Settings → Pipelines would silently reassign every rep's checkmarks and uploaded documents to the
wrong item. Deliverables stop being reference text the moment they become checkable, so they need
stable identity.

`entry_criteria`, `exit_criteria`, and `key_activities` stay JSONB. They remain reference-only.

### 2.2 Tables

**`stage_deliverables`**

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `stage_id` | UUID FK → `stages.id` ON DELETE CASCADE | indexed |
| `text` | Text NOT NULL | |
| `position` | Integer NOT NULL | `unique(stage_id, position)`, DEFERRABLE INITIALLY DEFERRED so a reorder can shuffle inside one transaction — same pattern as `uq_stage_pipeline_position` |

**`deal_deliverable_completions`** — row presence *is* the checkmark. No boolean column: a nullable
`completed_at` would allow a row that means neither checked nor unchecked.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `deal_id` | UUID FK → `deals.id` ON DELETE CASCADE | indexed |
| `stage_deliverable_id` | UUID FK → `stage_deliverables.id` ON DELETE CASCADE | indexed |
| `completed_by_id` | UUID FK → `users.id` ON DELETE RESTRICT | |
| `completed_at` | Timestamptz NOT NULL | server default now() |

`unique(deal_id, stage_deliverable_id)` — ticking twice is idempotent, not a duplicate.

**`attachments`**

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `deal_id` | UUID FK → `deals.id` ON DELETE CASCADE | indexed |
| `stage_deliverable_id` | UUID FK → `stage_deliverables.id` ON DELETE CASCADE | indexed |
| `filename` | String(255) NOT NULL | as supplied, for display only |
| `content_type` | String(160) NOT NULL | |
| `size_bytes` | Integer NOT NULL | `CheckConstraint(size_bytes > 0)` |
| `storage_key` | String(512) NOT NULL UNIQUE | server-generated, never client-supplied |
| `uploaded_by_id` | UUID FK → `users.id` ON DELETE RESTRICT | |

Attachments key to the **deliverable**, not to the completion row. Feedback item 4 requires that a
document is not mandatory for checking the box; the converse must also hold — attaching a document
must not require checking the box. Hanging attachments off the completion row would couple both.

### 2.3 Migration

Reversible in both directions.

- `upgrade()` — create the tables, then for each stage read `deliverables` and insert one
  `stage_deliverables` row per entry, `position` from array order. Drop `stages.deliverables`.
- `downgrade()` — recreate `stages.deliverables`, aggregate each stage's rows back into an array
  ordered by `position`, drop the three tables.

The backfill is lossless in both directions. What a downgrade cannot preserve is completions and
attachments created after the upgrade: they reference `stage_deliverable_id`, and those ids exist only
while the table does. A downgrade after reps have used the feature drops that data.

---

## 3. Auto-advance

In `services/deals.py`, after a completion is created:

1. Load the deal's current stage and its deliverables.
2. If the stage defines **zero** deliverables → no-op. An empty checklist is not a satisfied one.
3. If any deliverable lacks a completion for this deal → no-op.
4. Find the next stage by `position` among the pipeline's `kind == 'open'` stages.
   - No next open stage (deal sits at the last open stage) → no-op.
5. Move the deal, and log a `stage-change` Activity attributing it to the acting user.

Never advances into a `won` or `lost` stage. Closing a deal stays a deliberate act.

Unchecking a deliverable afterward does **not** move the deal back. Reverting a stage on an untick
would let a mis-click rewrite pipeline history, and the rep can always move the deal manually.

The create-completion response returns the resulting stage so the client knows whether an advance
happened and can offer Undo. Undo issues a stage move back plus a completion delete — it is an
ordinary pair of writes, not a stored transaction log.

### 3.1 Toast and undo infrastructure

None exists. A `ToastProvider` in `app/toast.tsx`: a queue of messages, each optionally carrying one
action button, auto-dismissing on a timer that pauses on hover and does not run while the action is
focused. It reuses the optimistic-update and rollback pattern already in `data/store.tsx` rather
than inventing a second one.

---

## 4. Stage rail becomes a document browser

`screens/Deal/StageRail.tsx` today has exactly one job: clicking a stage **moves** the deal. Feedback
item 5 needs a second, conflicting job: clicking a stage **inspects** its documents. Leaving both on
one click target is how a rep changes a deal's stage while trying to read a PDF.

**Split them.** The rail selects which stage is being *viewed*, independent of where the deal *is*.

Three visual states, not two:

| State | Treatment |
|---|---|
| Deal's current stage | Filled with the stage colour — the "different colour" feedback item 5 asks for |
| Selected for viewing, not current | Ring / outline in signal blue, unfilled |
| Neither | Muted, as today |

Selecting the current stage collapses both into the filled treatment plus the ring.

Below the rail, a panel for the selected stage shows its deliverables — each a checkbox, each with its
attachments and an upload control. Checkboxes are **only interactive for the deal's current stage**;
on other stages the panel is a read-only record of what was completed and what was filed. Ticking a
box on a stage the deal has already left has no defensible meaning, and would make the auto-advance
rule ambiguous.

Moving the deal becomes an explicit button in the panel ("Move deal here"), plus the existing
drag-and-drop on the board. Both remain available regardless of checklist state — the checklist adds
an automatic path, it does not gate the manual one.

---

## 5. Reminders

### 5.1 Two sources, one surface

**Explicit reminders** — rows a rep creates against a record (feedback item 1).

**`reminders`** follows the exactly-one-subject pattern already established by `Activity`
(`models/activity.py`): three nullable FKs plus a check constraint, rather than an
unenforceable `(subject_type, subject_id)` pair.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `account_id` / `lead_id` / `deal_id` | UUID FK, nullable, ON DELETE CASCADE | `CheckConstraint(num_nonnulls(...) = 1)` |
| `title` | Text NOT NULL | |
| `due_at` | Timestamptz NOT NULL | indexed |
| `assignee_id` | UUID FK → `users.id` ON DELETE RESTRICT | indexed |
| `created_by_id` | UUID FK → `users.id` ON DELETE RESTRICT | |
| `completed_at` | Timestamptz nullable | |
| `notified_at` | Timestamptz nullable | set by the sweep; prevents double-sending |

The API exposes computed `subject_type` / `subject_id` properties, matching how `Activity` already
keeps the wire format simple.

**Derived nudges** — leads with no activity for seven days (feedback item 2). **Not stored.** Computed
the way health already is in `services/health.py`; a stored staleness flag goes wrong the moment a
day passes with no write. New constant `LEAD_FOLLOW_UP_AFTER_DAYS = 7`, deliberately tighter than the
existing `STALE_AFTER_DAYS = 21` used for deal health — a lead going quiet for a week is a nudge, a
deal going quiet for three weeks is a risk. The two thresholds answer different questions and are not
unified.

A lead counts as untouched when it has no activity within seven days, considering activity logged
against the lead itself **and** against any of its deals. Work on a lead's deal is work on the lead;
counting only direct lead activity would nag an owner who is actively closing.

### 5.2 Delivery

`services/notifications.py` defines a `Notifier` protocol with one method, plus two implementations:

- **`LoggingNotifier`** — the default. Logs the message it would have sent, at INFO. No credentials.
- **`SmtpNotifier`** — `smtplib` over STARTTLS.

Selection is by configuration, not by code: `SmtpNotifier` when `smtp_host` is non-empty, otherwise
`LoggingNotifier`. Dropping real credentials into `.env` switches delivery on with no code change,
and Outlook / Microsoft Graph slots in later as a third implementation of the same protocol.

**Dummy credentials shipped in `.env.example`:**

```
REMINDERS_ENABLED=true
REMINDER_SWEEP_INTERVAL_SECONDS=900
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=crm@example.invalid
SMTP_PASSWORD=replace-me
SMTP_FROM=crm@example.invalid
```

`SMTP_HOST` is blank on purpose, so a fresh checkout logs rather than attempting to reach a host that
does not exist.

### 5.3 The sweep

An asyncio task started in the FastAPI lifespan, sleeping `reminder_sweep_interval_seconds` between
passes, guarded by `reminders_enabled`. Each pass selects reminders that are due, incomplete, and
have `notified_at IS NULL`, notifies, and stamps `notified_at`. No new dependency — the stack has no
scheduler and one interval loop does not justify adding APScheduler or Celery.

Failure isolation: an exception notifying one reminder must not abort the pass or kill the task.
Each reminder is handled in its own try/except and the loop continues; a crashed sweep task would
fail silently and permanently, which is worse than a dropped email.

### 5.4 Surface

`GET /api/v1/reminders/inbox` returns both sources in one payload — upcoming and overdue explicit
reminders for the current user, plus derived stale-lead nudges. The Dashboard renders it as a
"Needs your attention" card at the top. This is what "on open, show reminders" means in practice.

---

## 6. Analytics tab, and a shorter Dashboard

### 6.1 The problem

The Dashboard currently stacks hero, metric strip, high-priority deals, pipeline health, recent
activity, and an admin-only team performance block — five to six full sections. It reads as a report,
which contradicts `spec.md` §4.1's own framing ("an action surface, not a reporting surface").

### 6.2 Split

**Dashboard keeps** — compact hero, metric strip, reminders card, high-priority deals, recent
activity. Target: roughly one and a half viewports at 1440×900.

**Analytics receives** — the existing `PipelineHealth` and `TeamPerformance` blocks, plus new charts,
all behind one shared filter bar.

Filters: owner (individuals), partner, pipeline, close-date range. Filter state lives in the URL query
string so a filtered view is shareable and survives a reload.

Charts:

| Chart | Form | Answers |
|---|---|---|
| Stage funnel | Horizontal bars, count and value | Where is the pipeline concentrated |
| Value by owner | Horizontal bars, sorted | Who is carrying what |
| Partner contribution | Horizontal bars | Which partners are sourcing value |
| Weighted forecast by close month | Column chart | What lands when |
| Outcome mix | Stacked bar, won vs lost | Are we converting |

Every chart respects the filter bar, and the existing `ExportButton` covers R9 for the underlying rows.

### 6.3 Charts are hand-rolled SVG

Consistent with the codebase's existing posture — `app/router.tsx` documents why a routing library
was rejected for the same reason. Five simple charts do not justify a charting dependency and its
bundle cost. The `dataviz` skill governs palette, form choice, and accessibility so the set reads as
one system rather than five ad-hoc drawings.

### 6.4 Navigation

Top-level nav becomes Dashboard, Pipeline, Accounts, Analytics, Search. Five flat items, no nesting,
so `spec.md` §4.5 still holds. New route `/analytics` added to `app/router.tsx`'s route table.

---

## 7. File storage — MinIO, S3-compatible

A MinIO service in `docker-compose.yml`, plus `boto3` talking S3 against an endpoint URL. Production
switches to AWS S3, Cloudflare R2, or Backblaze B2 by changing environment variables alone.

### 7.1 Upload flow

File bytes never pass through FastAPI. Streaming uploads through the API would tie up an async worker
for the duration of a transfer and put a 25 MB request body in application memory.

1. `POST /api/v1/deals/{deal_id}/deliverables/{deliverable_id}/attachments/presign` — client sends
   filename, content type, size. Server validates all three, generates the storage key, returns a
   presigned PUT URL.
2. Client PUTs the bytes to storage directly.
3. `POST .../attachments` — client confirms; server verifies the object exists at that key and its
   reported size matches, then inserts the `attachments` row.

Step 3's verification matters: without it a client could register a row for an object it never
uploaded, and the UI would show a document that 404s on download.

Downloads are presigned GETs with a short expiry, so authorization is checked by the API on each
request rather than by a permanent public URL.

### 7.2 Configuration

```
S3_ENDPOINT_URL=http://localhost:9000
S3_BUCKET=crm-attachments
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_REGION=us-east-1
S3_PRESIGN_EXPIRY_SECONDS=900
MAX_UPLOAD_BYTES=26214400
```

`S3_ENDPOINT_URL` empty means real AWS S3, which is how boto3 already behaves.

### 7.3 Validation

Allowed content types, matching feedback item 4's "excel, word, pdf, email msg, etc": PDF, Word
(`.doc`, `.docx`), Excel (`.xls`, `.xlsx`), Outlook message (`.msg`), plain text, CSV, PNG, JPEG.
Rejected with 415 otherwise. Size over `MAX_UPLOAD_BYTES` is rejected with 413 at presign time, so
the client learns before transferring 200 MB.

Storage keys are `deals/{deal_id}/{deliverable_id}/{uuid4}-{sanitized_filename}`. The uuid prevents
collisions on same-named uploads; sanitization strips path separators. Client input never reaches the
key unsanitized — a client-supplied key is a path traversal in someone else's bucket prefix.

### 7.4 Alternatives considered

- **Azure Blob Storage** — the better choice if the Outlook integration commits the project to
  Microsoft 365: same tenant, same Entra ID identity, one fewer vendor. Rejected for now because it
  locks the storage layer to a non-S3 SDK, whereas the S3 API keeps four providers interchangeable.
- **Postgres `bytea`** — no new infrastructure, but Word and PDF files bloat backups and database
  memory. Viable only while attachments are rare, which is not the intent here.
- **Local disk volume** — cheapest, but does not survive container replacement and breaks with more
  than one API instance.

---

## 8. USD enforcement

Currency is already `'USD'` at every call site; the work is enforcement plus removing plumbing that
implies otherwise.

- `Deal.currency` keeps its column, gains `CheckConstraint(currency = 'USD')`.
- `currency` drops out of the deal create and update schemas — a field nothing may vary should not be
  settable.
- The `hint={`In ${deal.currency}`}` on `components/drawers/DealFields.tsx` goes away.
- `lib/format.ts` gains `preciseMoney` for cents-visible cases and loses its `currency` parameters.
  Three functions, all `en-US`, all USD: `compactMoney` for dense surfaces, `fullMoney` for whole
  dollars, `preciseMoney` where cents matter.
- Frontend `Deal.currency` stays on the type as a read-only field so the API contract is unchanged.

US standard number formatting — comma thousands separators, period decimal — is what `en-US`
`Intl.NumberFormat` already produces. Every numeric display uses `tabular-nums`, as it does today.

---

## 9. Build order

1. Storage layer plus MinIO in compose — unblocks attachments.
2. Deliverables migration, completions, attachments API.
3. Auto-advance service, toast and undo infrastructure.
4. Deal page: stage rail split, checklist, document panel.
5. Reminders: model, derived nudges, notifier, sweep, dashboard surface.
6. Analytics tab, Dashboard slimming.
7. USD enforcement pass.
8. Tests and typecheck throughout.

## 10. Testing

- **Migration** — upgrade backfills text and order from JSONB; downgrade restores it. Round-trip test.
- **Auto-advance** — advances when the last box is ticked; no-ops on a stage with zero deliverables;
  no-ops at the last open stage; never lands on `won` or `lost`; unticking does not move back; logs a
  `stage-change` activity.
- **Completions** — ticking twice is idempotent, not a 500.
- **Attachments** — presign rejects a disallowed content type with 415 and an oversized file with 413;
  confirm rejects a key with no object behind it; storage keys are sanitized against traversal.
- **Reminders** — the sweep stamps `notified_at` and does not re-notify; one failing send does not
  abort the pass; stale-lead derivation counts activity on the lead's deals, not only on the lead.
- **Analytics** — each aggregation against a known fixture; filters compose (owner plus partner plus
  range narrows correctly).
- **Format** — `preciseMoney` and the two existing helpers produce US formatting; no call site passes
  a currency.
- **RBAC** — every new route carries a permission, consistent with the existing 44-route matrix.

## 11. Out of scope

Deliberately excluded, so the boundary is explicit:

- lemlist and Outlook integrations. This round is the prerequisite work; the notifier protocol in §5.2
  is the seam Outlook will attach to, and nothing here presumes its shape.
- Attachments against accounts, leads, or activities. Deal deliverables only.
- Attachment versioning, preview, or in-app rendering. Upload, list, download, delete.
- Reminder recurrence. A reminder fires once.
- Per-user notification preferences or a digest. One email per reminder.
- Exit-criteria and entry-criteria gating. Only `deliverables` becomes checkable; the other three
  methodology fields stay reference-only.
