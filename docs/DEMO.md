# Demo script — happy path

**Runtime: ~12 minutes.** Every record named below exists in the seeded data. Every click
path has been checked against the current build.

The argument you're making, in one line: *this is a pipeline shaped like the AidenAI sales
process, not a generic Kanban board — and a rep never loses their place using it.*

---

## Pre-flight (5 minutes before, not during)

```bash
cd c:\crm\v1
docker compose ps                  # crm-postgres must read "healthy"
curl -s http://localhost:8000/health

# Reset to a known-good state. Close dates are generated relative to today, so a fresh
# seed always produces live at-risk and closing-soon deals.
cd backend
./.venv/Scripts/python.exe -m app.seed --force
```

Then:

- API running: `uvicorn app.main:app --reload --port 8000`
- Frontend running: `npm run dev`
- Browser at **http://localhost:5173**, **signed out**, one tab, zoom 100%, **light mode**
- Close the terminal windows off-screen — nothing says "prototype" louder than a visible dev server

**Seeding is not optional.** Health is derived from dates at render time, so stale seed data
means the dashboard shows nothing at risk and the whole first act falls flat.

**Sign in as:** `aisha.bennett@aidenai.com` / `password1234` — an admin, so Settings works
without a second login, and a real name rather than `admin@`.

---

## 1. Landing page — the argument (1 min)

Start at `/`, signed out. Scroll slowly; everything is scroll-scrubbed, so you control the pace.

| What's on screen | What you say |
|---|---|
| Hero: a deal card being dragged between stages by a cursor | "A rep moves deals. Nothing advances on its own." |
| The self-drawing six-stage path | **Slow down here.** "Prospecting at 5%, through Technical Validation at 55%, to Deploy & Develop. These aren't columns someone invented — it's the AidenAI process, with its real probabilities." |
| Three screens assembling | "Dashboard, board, account tree. Three views of one hierarchy." |
| Feature grid | Don't read it aloud. Keep scrolling. |

Click **Open the workspace** → sign in.

---

## 2. Dashboard — what needs attention (2 min)

Land on `/dashboard`.

1. **Metric strip** — open pipeline value, advanced-stage count, closing this week, needs attention.
   *"This is an action surface, not a report. Every number is a question about today."*

2. **High priority deals.** Point at **Trading Platform Latency Programme** — Citigroup,
   $5.6M, sitting in Propose with its close date already **9 days past**.

   *"Health is derived, never stored — overdue, or untouched for 21 days, and it's at risk.
   A stored flag would go stale the moment a date passed."*

3. **Click that row.** The drawer opens over the dashboard.

   *"This is the rule the whole product follows: you click a record, you get a drawer, and
   you keep your place. No navigating away and clicking back."*

4. **Log an activity** in the drawer — "Call with the Citi platform VP, re-baselining the
   date". Save. The recent activity feed behind the drawer updates.

5. Click **Open full view** → the deal page. Two things to point at:
   - The **stage rail** — where this deal sits in the six stages.
   - The **stage playbook** — entry criteria, key activities, deliverables for this stage,
     from the methodology deck.

   *"This is the differentiator. The stage isn't a label; it carries the work that earns it."*

---

## 3. Pipeline board — the daily workspace (2.5 min)

Nav → **Pipeline**.

1. **Pipeline switcher: Direct Customer / Partner.** *"Two motions, genuinely separate stage
   sets — not one pipeline with a type field."*

2. Columns render from the active template with a count on each. Collapse a column to show
   the board bends to how a rep works.

3. **Drag a deal forward one stage.** Do it slowly. The value and count on both columns update.

4. Then use the **move-to menu** on a card. *"Same move without the mouse — dragging is not
   the only way in."*

5. Switch to the **Partner** tab:
   - Cards show **Partner *and* Customer** on the same record.
   - The pipeline starts with an **Onboarding** stage; a partner enters the GTM motion after it.

   *"Partner-led deals were the requirement most likely to force a schema compromise. It didn't."*

---

## 4. Deals — the search dashboard (2 min)

Nav → **Deals**. This is the newest surface; give it room.

1. Press **`/`**. The search field focuses from anywhere on the page. Type `citi` — the table
   narrows live. *(Ctrl+K is the separate global record search; this filters the table in
   front of you.)*

2. **Esc** to clear. Now use the filter bar:
   - **Pipeline** segmented control — with live counts, so you see the split before clicking.
   - **Status → At risk.** *"Everything overdue or untouched, in one click."*
   - Active filters show as **removable pills**, with **Clear all**.

3. **Sort from the column headers.** Click **Value** — largest first. Click **Close** —
   soonest first. *"Each column opens in the direction you actually want; clicking again flips it."*

4. Click a stage bar in **Across the pipeline** (right-hand card) — it cross-filters the table
   and adds a Stage pill.

5. **Download to Excel.** Open the file. *"Every view exports, respecting the filters you set.
   This is what replaces the spreadsheet — and the export is how you get out of it."*

---

## 5. Account Explorer — the hierarchy (1.5 min)

Nav → **Accounts**.

1. Expand **JPMorgan Chase**: 3 leads (Corporate & Investment Bank, Consumer Banking
   Technology, Risk & Compliance), 4 deals, $12.94M.

2. Each level carries a rolled-up value and health badge. *"Worst case wins on the way up —
   a parent never looks calmer than its children."*

3. Expand a lead → its deals. *"Account, business unit, opportunity. This is what replaces
   the flat table."*

4. Click a node → drawer opens, tree state intact behind it. Edit the account owner, save,
   close. *"Nothing collapsed. You're exactly where you were."*

---

## 6. Create something (1 min)

From the account drawer you just had open, or the **New deal** button on Deals:

1. **New lead** on JPMorgan Chase — a business unit and an owner.
2. **New deal** under it — pick pipeline, stage, value, close date.
3. Go to **Pipeline**: it's in the column. **Dashboard**: it's in the counts.

*"One deal, one stage, one account. That's the whole model — the BRD's instruction was to
keep it simple, and we didn't quietly outgrow it."*

---

## 7. Admin: pipelines as data (1.5 min)

Gear icon → **Settings → Pipelines**.

1. Both templates with their ordered stages, probabilities and colours.
2. **Rename** a stage, **reorder** two stages — the board reflects it immediately.
3. **Try to delete a stage that has deals in it.** It refuses and offers to reassign them first.
   *"No silent orphaning. That's a deliberate guard, not an accident."*
4. **Duplicate a template.** *"This is how a third pipeline gets added — as data. No schema
   migration, no redesign. That was a success criterion."*

Optional, if the room cares about permissions: sign in as `priya.raghavan@aidenai.com` /
`password1234` in a private window. She sees the pipelines read-only; the API returns 403
on the write routes. Reps use the pipeline, admins shape it.

---

## 8. Close (30 s)

- Hit the **theme toggle** — the whole app in dark, same tokens.
- **Ctrl+K** — global search across accounts, leads and deals, over whatever you're on.

Land the plane:

> "Three screens, two pipelines, six stages with real probabilities, and an Excel button on
> every view. A rep can move a deal, log a call, and drill into an account without ever
> losing their place — and adding a new pipeline type needs no migration."

---

## Say this if asked, rather than improvising

| Question | Answer |
|---|---|
| "Can it stop a deal advancing before the criteria are met?" | The criteria are stored per stage and shown in the playbook. **Gating is deliberately deferred** — v1 is manual moves. The schema already has room for it. |
| "Deal counts per rep?" | Explicitly a later phase (R11). Owner is on every record, so it's a query, not a redesign. |
| "Forecasting / AI scoring / email integration?" | Out of scope for v1 by decision. The architecture doesn't preclude them. |
| "Can reps customise their own pipeline?" | No — admin-only, on purpose. Per-user stage sets make pipeline reporting meaningless. |
| "What happens when a partner becomes a customer?" | Open question, flagged in the spec, not yet decided. Don't invent an answer. |

---

## If something breaks mid-demo

| Symptom | Do this |
|---|---|
| Data looks wrong or nothing is at risk | You skipped the reseed. Move to Settings → Pipelines and talk about the model while it's fixed. |
| A screen shows "Could not load your data" | The API died. `curl localhost:8000/health`, restart uvicorn, press **Try again** in the UI. |
| A save fails with an error banner | Session expired. Sign out and back in. Don't retry into the same error. |
| The board looks empty | You're on the Partner tab with the open-only filter and nothing matches. Switch tabs. |

**Do not** open DevTools, and do not run migrations or `psql` on the shared screen. If a
question needs the database, answer it afterwards.
