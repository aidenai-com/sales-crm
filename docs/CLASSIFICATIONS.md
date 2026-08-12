# Health, staleness, and follow-ups

Every status this CRM shows is **derived on read, never stored**. A stored flag goes wrong the
moment a date passes, and nothing in the app then knows it is lying.

This document is the authority on what each classification means, which threshold governs it,
and where the code lives. `RUNNING.md` covers starting the stack; `DATABASE.md` covers looking
inside it.

---

## The mistake everyone makes first

Every threshold here measures **time since somebody last did something** — not how old the
record is.

| Sounds like | Actually is |
|---|---|
| "Deals older than 21 days are stalled" | Deals **nobody has touched for** 21 days |
| "Leads with open deals older than a week are at risk" | Leads **nobody has touched for** a week — and they get a nudge, not a status |

A deal created two years ago and worked yesterday is healthy. A deal created last month and
ignored since is at risk.

### What "touched" means

The most recent activity against the record, **of any kind** — call, meeting, email, note,
stage change, or document. All kinds count equally.

When there is no activity at all, **creation counts as the touch**. Without that, every record
would be at risk the instant it was created, which is both wrong and the first thing a new user
would see.

---

## 1. Deal health

Three states, evaluated **in order**. First match wins.

| # | Condition | Health | Reason |
|---|---|---|---|
| 1 | `expected_close_date` is in the past | `at-risk` | `overdue` |
| 2 | Days since last touch **> 21** | `at-risk` | `stalled` |
| 3 | Closes within **7 days** | `closing-soon` | `closing-soon` |
| 4 | Everything else | `healthy` | `on-track` |

**The order is load-bearing.** Overdue beats stalled; at-risk beats closing-soon. A deal that is
both overdue and imminent is a problem, not an opportunity, and showing it as an opportunity
would put it in the wrong half of the work queue.

### Why `at-risk` carries a reason

`at-risk` has two entirely different causes needing opposite responses:

- **`overdue`** — the close date has passed. Needs a **new close date**.
- **`stalled`** — nobody has touched it in three weeks. Needs a **phone call**.

Reporting both as "At risk" tells a rep something is wrong without telling them what to do about
it. `HealthReason` is a label on top of `Health`, **not a fourth status** — filters, roll-ups and
the needs-attention count still work in three buckets, because for those purposes both causes
mean the same thing.

**Code:** `backend/app/services/health.py` · `src/lib/health.ts`

---

## 2. Lead follow-up nudges

A lead going quiet produces **a row in the reminders inbox, not a status**. Leads have no health
classification at all — no badge, no colour.

All three conditions must hold:

| Condition | Why |
|---|---|
| No touch for **7 days** — on the lead **or any of its deals** | Working a lead's deal *is* working the lead |
| At least one **open** deal | A lead with nothing in play is not a follow-up you owe anyone |
| The lead itself is older than 7 days | A lead added yesterday is not neglected |

Derived, like everything else here: the nudge appears the moment a lead goes quiet and disappears
the moment anyone touches it. There is no row to clean up and no job to run.

The "or any of its deals" part is a `GREATEST` over two correlated subqueries — Postgres ignores
`NULL` arguments, so a lead touched through only one route still reports that timestamp, and
`NULL` survives only when neither route has anything.

**Code:** `backend/app/services/reminders.py` — `stale_leads()`

---

## 3. Account and lead roll-ups

**Worst case wins.** If any open deal is `at-risk`, the parent is `at-risk`; else if any is
`closing-soon`, that; else `healthy`.

A parent must never look calmer than its children.

Roll-ups read **open deals only**, so a closed-lost deal does not poison its account forever.

**Code:** `backend/app/services/health.py` — `roll_up_health()`, `roll_up()`

---

## 4. Stage kind — what counts as open pipeline

`open` · `won` · `lost`, read from the stage's **explicit `kind`** and never inferred from
probability.

A Closed Lost stage sits at 0%, so deriving "open" from `probability < 100` would count every
lost deal as open pipeline. This definition is what "open pipeline" means everywhere in
Analytics.

**Code:** `backend/app/models/enums.py` — `StageKind` · `health.is_open()`

---

## 5. Advanced stages

`ADVANCED_STAGE_THRESHOLD = 55`. Stages at or above 55% probability count as "advanced" for
dashboard reporting.

---

## 6. Reminder states

| State | Meaning |
|---|---|
| `overdue` | `due_at <= now` and not complete |
| `upcoming` | Due within the next **7 days** |
| complete | `completed_at` set — idempotent, completing twice keeps the original timestamp |
| notified | `notified_at` stamped once by the background sweep, so no reminder emails twice |

The inbox returns `overdue`, `upcoming` and `stale_leads` in **one payload**, because the
dashboard renders them as a single card — splitting the request would let half the card arrive
late and reflow the page under the reader.

**Code:** `backend/app/services/reminders.py` — `inbox()` · `src/screens/Dashboard/ReminderInbox.tsx`

---

## Thresholds in one place

| Constant | Value | Governs | Defined in |
|---|---|---|---|
| `STALE_AFTER_DAYS` | 21 | Deal → `at-risk` / `stalled` | `health.py`, `health.ts` |
| `CLOSING_SOON_WITHIN_DAYS` | 7 | Deal → `closing-soon` | `health.py`, `health.ts` |
| `LEAD_FOLLOW_UP_AFTER_DAYS` | 7 | Lead → inbox nudge | `reminders.py` |
| `reminder_due_within_days` | 7 | How far ahead the inbox looks | `core/config.py` |
| `ADVANCED_STAGE_THRESHOLD` | 55 | "Advanced stage" reporting | `health.py` |
| `reminder_sweep_interval_seconds` | 900 | How often reminder email is sent | `core/config.py` |

### The three sevens are unrelated

`LEAD_FOLLOW_UP_AFTER_DAYS`, `CLOSING_SOON_WITHIN_DAYS` and `reminder_due_within_days` all happen
to be 7. They are three independent settings that mean three different things, and **changing one
does not change the others**.

### The two clocks are deliberately different

A lead goes quiet after **7 days**; its deals do not turn red until **21**. A nudge and a risk
flag are different claims — one is "give this a poke", the other is "this is going wrong". If you
expected a single number to control both, it does not.

---

## Known duplication

`STALE_AFTER_DAYS` and `CLOSING_SOON_WITHIN_DAYS` are defined **twice** — in `health.py` and in
`src/lib/health.ts` — with matching values, and the derivation logic exists in both places.

The backend docstring states it is the single authority and that "the client should render what
the server derives rather than recompute it", but the frontend still computes health
independently. Only the frontend has `HealthReason`.

**Today the two agree.** They are two copies of a business rule that must stay in step, so a
change to either threshold has to be made in both files. Consolidating onto the server-derived
value is the intended direction.

---

## Email delivery

Reminder email is chosen by configuration, not by code: `SMTP_HOST` set means real SMTP, blank
means a logging stand-in.

**Currently blank** — there are no `SMTP_*` keys in `backend/.env`, so `LoggingNotifier` is
active. Each sweep writes the full message it would have sent to the log, prefixed
`[notification not sent — SMTP_HOST is unset]`.

> **The consequence.** The logging stand-in returns success, so the sweep stamps `notified_at`
> exactly as a real send would. This keeps development behaviour identical to production and
> stops the same reminder being reprocessed every 15 minutes — but it means **every reminder that
> came due while SMTP was unset is permanently marked as notified**. After configuring a real
> mail server, only reminders coming due from that point forward will send. To deliver the
> backlog, clear `notified_at` on incomplete reminders once.

`smtp_from` defaults to `crm@example.invalid`, a deliberately unroutable address, so a
half-configured server cannot send from something that looks real.

To enable: set `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`,
`SMTP_USE_TLS` in `backend/.env`. The sweep itself is already running — `reminders_enabled`
defaults to true and it starts from the FastAPI lifespan.

**Code:** `backend/app/services/notifications.py` · `reminders.run_sweep()`

---

## What is not classified

Worth stating, so their absence is not mistaken for a bug:

- **Leads have no health status.** Only nudges.
- **Accounts have no health of their own.** Only a roll-up of their open deals.
- **Leads with no open deals are watched by nothing.** No nudge, no flag.
- **Contacts do not exist.** There is no person record anywhere in the schema — accounts are
  companies, leads are business units within them.
- **There is no "open date".** Deals carry `created_at` and `expected_close_date`; leads carry
  `created_at`. Nothing holds a separate, editable date on which a deal or lead opened.
