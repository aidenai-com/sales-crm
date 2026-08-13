# Accounts, contacts and deal roles

Design for five changes: open account creation, duplicate-account prevention, contacts as a
first-class entity with deal-level roles, the removal of the business-unit owner, and company-wide
account visibility.

**Status: built 2026-08-11.** Migrations `e5c1a9b73d84` → `c94f7e20a1d5` applied. Typecheck clean,
production build passing, 134 frontend tests and 114 backend tests passing, with one known failure
recorded under "What is not verified" at the end.

## What was built

| Area | Files |
|---|---|
| Migrations | `e5c1a9b73d84` normalized names · `f0a4e79c2b13` drop lead owner · `b8e13d5a06c7` contacts · `c94f7e20a1d5` champion flag |
| Models | `models/contact.py`, `ContactType` in `enums.py`, `Account.name_normalized`, `Stage.requires_champion`, `Lead.owner_id` removed |
| Backend | `services/account_names.py`, `services/contacts.py`, `repositories/contacts.py`, `api/v1/contacts.py`, `schemas/contact.py`, rewritten `permissions.py` scoping |
| Frontend | `screens/Contacts/`, `create/AccountNameField.tsx`, `create/CreateContactForm.tsx`, `create/DealContactPicker.tsx`, `drawers/ContactDrawerBody.tsx`, `Deal/DealPeoplePanel.tsx`, `ui/ContactBits.tsx`, `hooks/useDealContacts.ts` |
| Tests | `tests/test_champion_gate.py` (20 new); `test_permissions.py` and `test_reminders.py` revised where they asserted the old rules |

---

## 1. Anyone authorized can create an account

`POST /accounts` takes `AdminUser` today. It becomes `CurrentUser` plus
`permissions.require_own_assignment(user, payload.owner_id)` — the same pair `create_lead` and
`create_deal` already use. A rep may create an account but only assign it to themselves; an admin
may assign it to anyone.

Nothing else about the endpoint changes. `DELETE /accounts/{id}` stays admin-only: creating a
company record is routine, destroying one with its leads and deals cascading is not.

## 2. Duplicate account prevention

The problem is that `Citi`, `CITI`, `Citi Bank`, `Citibank` and `Citibank, N.A.` are one company and
five rows. The existing `unique` on `accounts.name` catches only the first pair.

### Normalization

A new `name_normalized` column, derived on write:

1. casefold
2. replace every non-alphanumeric character with a space
3. drop legal-form tokens: `inc ltd llc corp plc gmbh pvt limited co na sa ag bv group holdings`
4. collapse whitespace

`Citi` → `citi`. `Citibank, N.A.` → `citibank`. `Citi Bank Inc.` → `citi bank`.

Periods and apostrophes are stripped *before* tokenizing rather than turned into spaces, because they
sit inside a token: `N.A.` has to become the single token `na` to be recognised as a legal form. The
first implementation converted all punctuation to spaces and produced `citibank n a`, which matched
nothing — the docstring claimed `citibank` and the code did not deliver it.

`bank`, `technologies`, `systems` and `partners` are deliberately **not** in the token list. Dropping
`bank` would fold `Deutsche Bank` into `Deutsche` and collapse two genuinely different customers whose
names differ only by it.

The column carries a **UNIQUE** index. This is the enforcement decision: a normalized collision is
an error with no override, so the guarantee has to live in the database rather than in application
code that a future endpoint could forget to call. Verified 2026-08-11 against the live database —
14 accounts, zero normalized collisions — so the index applies without a data-repair step. A future
deployment with existing collisions would need them resolved by hand first; the migration will fail
loudly rather than silently dropping a row.

Consequence to accept knowingly: two genuinely distinct legal entities that normalize identically
cannot both be filed. That is the trade requested, and it is reversible by dropping the index.

### Fuzzy search

`CREATE EXTENSION IF NOT EXISTS pg_trgm` and a GIN index on `name_normalized`. Trigrams catch
`Citi Bank` against `Citibank`, where the difference is a space rather than a suffix and
normalization alone fails.

Trigram similarity is unreliable on strings of three or four characters, so the query unions
similarity with a prefix match — typing `cit` must surface `Citibank`, which pure trigram scoring
would rank too low to show.

### `GET /accounts/similar?name=…`

Returns candidates ordered by score, each with a `reason` of `exact`, `normalized`, `prefix` or
`fuzzy`, so the UI can explain why a row is on screen instead of showing an unexplained list.

An earlier draft of this spec had the endpoint deliberately bypass `scope_accounts`, on the grounds
that a rep who cannot see another rep's Citibank is precisely the rep who will create a second one.
Section 5 makes every account visible to every rep, so there is nothing left to bypass — the search
returns what the caller can already open. The carve-out is void, and no special disclosure rule is
needed.

### Frontend

A new `AccountCombobox` used by `CreateAccountForm`:

- debounced 250ms, minimum two characters
- each match shows name, industry, owner, and a partner badge — enough to recognise a company
- an `exact` or `normalized` match disables Create and offers "Open Citibank instead"
- `fuzzy` and `prefix` matches are advisory and do not block

The server refuses a normalized collision with 409 regardless, naming the existing account. The
browser check is a courtesy that saves a round trip; the database is what makes it true.

## 3. Contacts and deal roles

### `contacts`

`account_id`, `full_name`, `email`, `phone`, `linkedin_url`, `designation`, and `contact_type`
(`customer` | `partner`).

No owner — per the ownership rule below, only accounts and deals have one. A contact's stewardship
follows its account.

A partner contact's `account_id` **is** the partner account, so the customer/partner relationship is
already expressed by the foreign key. `contact_type` exists because the two are asked for
separately in the requirements and because a filter needs something cheap to test, not because it
carries information the join does not.

### `contact_roles`

Roles as rows, not an enum — the same reasoning `PipelineTemplate` records for stages: adding a role
must not need a migration, because which roles a deal has is the user's decision.

Seeded: Champion, Executive Sponsor, End Customer, Partner Contact.

Champion carries `is_system = true` and a stable `key`. The stage gate needs something to test that
an admin cannot rename or delete out from under it.

### `deal_contacts`

`deal_id`, `contact_id`, `role_id`, unique on the triple.

Multiple partner contacts on one deal fall out of this for free, which is the requirement. So does
one person holding two roles — a champion who is also the executive sponsor is common enough that
forbidding it would be wrong.

### The champion gate

A stage gains `requires_champion: bool`. A move into a stage with the flag set is refused unless the
deal has a contact in the Champion role whose `email`, `phone` **and** `linkedin_url` are all
non-empty. All three, because all three were named as the requirement; a champion missing a LinkedIn
URL does not satisfy it.

Per-stage rather than a global probability threshold, because it follows this codebase's
pipelines-as-data idiom and can be tuned per pipeline without a migration. Seeded on for every stage
past the first: demanding a champion to *leave* qualification is the stage where you legitimately do
not have one yet. Editable in `StageEditor.tsx`.

Not gated: backward moves, and moves into a `lost` stage. Requiring a champion before a deal can be
marked lost would trap dead deals in the pipeline, inflating every open-value figure on the
dashboard — the gate would corrupt the reporting it is meant to protect.

Enforced in `pipeline_service.move_deal_to_stage`, so `POST /deals/{id}/stage` and the stage change
inside `PATCH /deals/{id}` are both covered by one check. Refused with 409, not 403: the caller has
permission, the deal is not in a state where the move is meaningful — the same distinction
`nudge_deal` already draws.

### Deal creation

`CreateDealForm` gains a contacts step (`DealContactPicker`): choose existing contacts from the customer
and partner accounts, or add one inline, and assign a role to each.

At least one contact is required. A champion is not — see above.

Changing the customer clears the assignments, and changing or removing the partner drops anybody who was
on the deal only because they worked there. Without that, switching accounts mid-form leaves assignments
pointing at people who no longer belong on the deal, and the 422 arrives at submit — after everything
else has been filled in.

### The Contacts tab

Contacts get their own top-level tab, for creation and viewing — the surface that makes "a separate
CRM object rather than a field" true in the product and not only in the schema.

- `ContactsIndex` — searchable, filterable by account and by customer/partner, showing name,
  designation, account, type, and which deals the contact is on
- `CreateContactForm` in the existing create drawer, alongside account / lead / deal
- a contact drawer body: details, the accounts and deals they appear on, and the roles they hold

Completeness is surfaced here rather than only at the gate: a contact missing email, phone or
LinkedIn is marked, because those three are what the champion gate will demand and finding out at
the point of a blocked stage move is too late.

### Deal view

A People panel on `DealPage`, grouped by role with the champion first. Each row carries name,
designation, role chip, and working `mailto:` / `tel:` / LinkedIn actions.

A champion with missing details renders an inline warning naming the missing field. The point is
that the reason a stage move will be refused is visible *before* someone attempts it — a gate that
only speaks when you hit it teaches nothing.

The panel also states the relationship plainly: customer, partner, and which side each contact sits
on.

## 4. Removing the business-unit owner

`leads.owner_id` is dropped. Approved with the visibility consequence understood.

The consequence is an authorization change, not a dropped field. `permissions.scope_leads` currently
reads:

```python
# Strictly owned. A rep who owns the *account* still does not see another rep's lead
# under it — that is what "view only their respective leads" means.
```

With no lead owner, lead visibility derives from the account, so **a rep sees every business unit
under an account they own**, including ones a colleague was working. That is the requested model.

Touched by this:

| Location | Change |
|---|---|
| `permissions.scope_leads` | Join to `Account`, filter on `Account.owner_id` |
| `permissions.require_lead_owner` | Delegates to `require_account_owner(lead.account)` |
| `reminders.py:190` | Stale-lead reminders address the **account** owner |
| `LeadCreate` / `LeadUpdate` | `owner_id` removed |
| `LeadNode.owner_name` | Reports the account owner |
| `CreateLeadForm` | Owner select removed |
| `LeadDrawerBody` | `ownerName` reads through the account |
| `NudgeButton` | Its owner comparison reads the account owner |
| `test_permissions.py` | Real revision, not adjustment — the rule it asserts has changed |

Three existing business units have an owner differing from their account's — *Consumer Banking
Technology*, *Risk & Compliance* and *Compliance*. Those are the only rows where this migration
changes who receives a reminder, and the only ones worth checking after it runs.

The down-migration repopulates `owner_id` from the account owner. That is not a true reversal: the
three distinct assignments above are lost on the way down and cannot be recovered from the schema.
Noted here because a down-migration that looks lossless and is not is worse than one documented as
lossy.

## 5. Every rep sees every account

`scope_accounts` becomes a no-op: the Accounts tab shows all accounts to everyone. `visible_account_ids`
and its "a rep who owns a deal under Bank of America must see Bank of America" reasoning are no longer
needed for reads and are deleted rather than left as dead code.

Write scoping is unchanged — see everything, edit what you own. `require_account_owner` still guards
`PATCH`, and `DELETE` stays admin-only.

Two consequences that follow rather than being chosen:

**Leads become globally visible.** With no lead owner (section 4) and no account scoping, every
business unit is visible to every rep. This is the composition of two approved decisions, not a third
one.

**Account and lead activity timelines become globally visible.** `scope_activities` routes
account-level activity through `visible_account_ids` and lead-level activity through `Lead.owner_id`;
with the first a no-op and the second gone, both open up. A visible record whose history is hidden is
a half-open door, so this is the consistent outcome — but it does mean a rep's notes on an account are
no longer private to them.

**Deal activity stays owner-scoped.** `Activity.deal_id` continues to filter on `Deal.owner_id`. Deals
were never made global, and deal-level notes are where the commercially sensitive detail sits.

## Things that turned out differently once built

**"A deal needs at least one contact" is a client-side rule, not a schema rule.** `contacts` on
`DealCreate` defaults to an empty list and the API accepts one.

This was reversed after an initial `min_length=1` proved to have two bad consequences. Pydantic
validates before dependencies resolve, so an empty list was rejected *before* `require_own_assignment`
ran — a rep sending both an empty contact list and somebody else's owner id got a 422 where the
ownership rule should have produced a 403, reporting a permission error as a validation error. And it
broke every existing caller of `POST /deals` with no compatibility window.

Enforced in two places on the client instead:

- `CreateDealForm` computes a single `blockedBecause` reason and disables submit. The reason is
  displayed, in an `aria-live` region — a disabled button with no stated cause is a dead end.
- `store.createDeal` refuses the call outright and reports it through the store's normal error
  channel. This is the real gate: a check living only in one component is one refactor from gone, and
  every deal creation in the app funnels through here.

The cost, stated plainly: a caller that is not the app — a script, a seed, an integration, the
assistant — can create a deal with nobody attached, and nothing server-side will stop it.
`tests/test_permissions.py::test_the_api_accepts_a_deal_with_no_contacts` pins this down as deliberate
so it is not later "fixed" as a bug. If contactless deals do start appearing, the answer is a
`min_length` plus a migration for the existing rows, not a third check somewhere else.

**`reassign_deals` is not gated.** An administrator emptying a stage in order to delete it bypasses the
champion check. A gate there would make a stage undeletable because some deal in it lacks a champion,
leaving no way out but editing every deal first.

**Trigram search cannot match acronyms.** `BofA` against `Bank of America` scores 0.05 — an acronym
shares almost no letter sequences with its expansion, and no threshold catches it without flooding the
list with false positives. Measured, not assumed: `Citi Bank`↔`Citibank` scores 0.583 and
`Citibank`↔`Citigroup` scores 0.267, so the 0.3 threshold separates the case worth catching from the
one worth ignoring. Acronyms remain a real gap.

**The double `CREATE TYPE`.** `b8e13d5a06c7` first called `.create()` on the enum *and* let
`create_table` emit its own, failing with "type contact_type already exists". Fixed with
`postgresql.ENUM(..., create_type=False)`. Worth recording because the whole four-migration chain rolled
back atomically on the failure, which is the only reason there was no partial state to repair by hand.

## What is not verified

**Nothing has been driven in a browser.** Typecheck, build and unit tests all pass, but no screen in
this change has been looked at: the Contacts tab, the duplicate warning as it appears while typing, the
deal-creation contacts step, and the People panel are all unseen.

**Resolved: the rollback test.** `test_a_refused_patch_does_not_apply_its_other_fields` was failing, and
it was the test, not the code. The failure was `MissingGreenlet`, and the cause is worth recording
because it will recur: the test session and the request session are the same object, so the
`await db.rollback()` inside `update_deal` — the very thing under test — also expires the test's own ORM
instances. Every subsequent attribute read, including `data["priya_deal"].id`, then triggers a lazy
refresh from sync context and dies. The failure was evidence the rollback had run, wearing the costume of
a broken assertion. Fixed by capturing ids and names into locals before the request. Any future test that
asserts on state after a refused write needs the same treatment.

## Not in scope

**Contracts.** An early draft of this spec carried a `contracts` table with types, a status
lifecycle and renewal dates. That came from reading a typo — "Contract as an Object" in the
requirements was "Contact as an Object", the heading introducing section 3. Nothing about contracts
was ever requested, and the section is recorded here only so the idea is not rediscovered later and
mistaken for a dropped requirement.

---

# Addendum, 2026-08-12: companies without business, and user administration

## An account is a company, not a claim

The gap the contacts work left: `contacts.account_id` is `NOT NULL`, and the create form only offered
existing accounts, so a person at a company nobody had filed was a dead end. Filing the company first
was the workaround, and it made the company *look* like a pipeline participant on the Accounts screen —
which is not what "I know somebody there" means.

The schema already had the answer. An `Account` carries a name, a normalized key, an industry and an
owner; every trace of business lives in `leads` and `deals`. So a company with nothing under it is
already, in the data, exactly "a name I know."

Three changes, no migration:

**Inline company creation** from the contact form. A `A company not listed…` option in the Company
select reveals `AccountNameField` — the same duplicate detection the account form uses, so "Wipro",
"Wipro Ltd" and "wipro technologies" still cannot become three rows — plus an optional industry. Two
writes in one gesture: the company, then the contact. Picking a suggested match switches the form back
to that account rather than filing a second one. No owner picker and no lead prompt, because this is
filing a name, not claiming an account.

**Accounts defaults to what is being worked.** `hasBusiness(node)` is `leads.length > 0 ||
directDeals.length > 0` — derived, never stored, so it cannot go stale the way `is_partner` did. The
Active/All tabs only appear once there is something to hide.

**Anyone may file an account.** The `isAdmin` gate on the New account button was a leftover from
central account creation and directly contradicted "whoever creates the account becomes its owner"; the
API had already dropped it.

## User administration

`PATCH /auth/users/{id}` (admin) edits name, email, initials, title, role, active state, and resets the
password. Every field optional, so two admins editing different fields do not overwrite each other and
an empty password box is never read as "set it to nothing".

**Two refusals, both checked against the acting admin rather than a count of remaining admins.** You
cannot remove your own admin role, and you cannot deactivate yourself. A count would be the wrong test:
it would let the last two admins each demote the other, and would refuse a legitimate demotion whenever
a second admin happened to be inactive. Nothing in this system can grant the role back.

**There is no delete.** A user owns accounts, deals and logged activity. Deactivating is the real
operation: no sign-in, refused at token refresh, history stays legible.

`Person` gained `isActive`, and deactivated people stay in the snapshot so their name still resolves on
everything they own. `assignableOwners(people, keep)` filters them out of pickers while keeping the
currently-selected id whatever its state — dropping a deactivated current owner would leave the select
with a value matching no option, which browsers render as the first name in the list, silently claiming
the deal belongs to somebody it does not.

`POST /auth/change-password` already existed; it gained a "must differ from the current one" check,
placed *after* the current-password verification so it cannot confirm a guess for free. The Profile
screen validates length, match and difference on the client — but only the server can check the current
password, and it must: a valid session is not proof of knowing it, so without that check a borrowed
laptop is enough to lock the owner out.

## Verified

Typecheck clean, build passing, 133 frontend tests green. Backend verified by direct probe against the
live database: admin edit, both self-lockout refusals, email collision 409, rep 403, password reset then
sign-in with it, wrong-current 400, same-as-current 400, valid change 200, deactivate then sign-in 403,
restore.

**Unverified:** nothing in this addendum has been driven in a browser. The Team screen, the Profile
form, the inline company creation and the Active/All tabs are all unseen.

---

# Addendum, 2026-08-12: guard rails around the champion gate

## The hole

`assert_champion_ready` was called from one place — inside `move_deal_to_stage` — against the stage being
**entered**. Nothing ever re-evaluated a deal sitting still. So moving a gate from stage 3 to stage 1 did
not just fail to apply retroactively; it was **bypassed permanently for every existing deal**. A deal
already in stage 1 entered before the flag existed, so it was never asked, and moving 1 → 2 consulted
only stage 2's flag, which was off. The requirement could be satisfied by nobody and noticed by nothing.

The seed data proved it: before any change, two deals were sitting in the gated stage without a complete
champion.

Two smaller faults came with it. A *backward* move into a newly gated stage was refused — a deal could be
denied entry to a stage it had occupied for a month, at exactly the moment somebody was recording that it
had slipped. And an admin toggling the flag on a stage holding forty deals saw the same thing as toggling
it on an empty one.

## The fix

**A forward move is now checked against the stage it leaves as well as the one it enters**, departure
first, so the refusal names the stage that actually caused it. That closes the walk-through hole and makes
a newly-switched-on gate land at the next natural moment rather than in a bulk breakage.

**A backward move is not checked at all.** Regressing a deal is a correction, usually made *because* the
deal is in trouble; demanding a complete champion first would mean the only way to record a slipping deal
accurately is to first do the thing that is not happening.

**Compliance became a state.** `champion_gaps` returns every visible deal whose *current* stage
requirement it fails — two queries for the whole book, `GET /deals/champion-gaps` — and `ChampionGap` is
in the snapshot. It renders as a badge on deal cards and index rows and a full statement on the deal page
and drawer. `champion_shortfall` builds the sentence for all three cases (entering / leaving / resting),
so the warning shown now and the refusal hit later can never say different things.

**The admin sees the cost first.** `GET /pipelines/{p}/stages/{s}/champion-impact` counts the deals in
that stage without a complete champion, and the stage editor asks before switching the flag on — but only
when the number is non-zero, because a dialog that always says "0 affected" is one people learn to
dismiss. Turning it *off* is immediate: relaxing a rule cannot strand anybody. If the count fails to
load, the edit proceeds — a courtesy must not become a gate.

Staleness is handled at the three places that can change the answer: a stage move (the store), a
champion being mapped or unmapped (`useDealPeople`), and a contact's details being edited
(`updateContact`) — which is the ordinary way a blocked deal becomes unblocked.

## Deactivated owners

`deals.owner_id` is a plain FK, so deactivating somebody left their whole book intact and — because
`scope_deals` is owner-scoped — **invisible to every rep and visible only to administrators, while still
counting in the forecast.** The nudge path was worse: it targets `deal.owner`, so an admin chasing a stale
deal mailed a deactivated address and logged a reminder implying somebody was on it.

Deactivation now asks who inherits. `GET /auth/users/{id}/ownership` reports accounts, open deals and
their value; `UserUpdate.reassign_to` moves them in the same transaction as the deactivation, so a
half-completed handover cannot leave a signed-out person holding invisible deals. "Leave it assigned to
them" stays available as an explicit, labelled choice.

Open deals only. A won deal keeps its owner, because reassigning it would rewrite who closed it. Business
units are untouched by design — they have no owner, their stewardship follows the account. Handing a book
to a deactivated person is refused, and so is nudging a deactivated owner, which now says the deal needs
reassigning instead.

## Verified

Typecheck clean, build passing, 133 frontend tests green. Probed live against the database: the gate
moved onto stage 1, gaps went 2 → 4, a forward move refused with the departure stage named (both through
`POST /stage` and `PATCH /deals`), a backward move into the gated stage allowed, impact reported 2 of 3
deals failing, the gate restored and gaps back to 2. Handover: Dana's 4 accounts and 6 open deals ($13.28M)
moved to Marcus in one call, handover to an inactive person refused. The database was reseeded afterwards.

**Unverified:** none of this has been driven in a browser.

---

# Addendum, 2026-08-13: the champion gate is fixed at creation

## Why configurable was the wrong answer

Yesterday's addendum built guard rails around moving a gate: a departure check to close the walk-through
hole, derived compliance so grandfathered deals were visible, and an impact count before switching one on.
All of it worked. None of it addressed the real problem, which is that **a stage whose gate can change stops
describing the deals inside it.**

Switching a gate *on* creates deals that entered under one rule and live under another. Switching one *off*
retires a requirement with no record it ever applied — so a deal that passed through gated is
indistinguishable afterwards from one that never faced the gate. Warning before the change does not help,
because the damage is to the history rather than to the moment.

Setting it at creation has none of those problems, for one reason: **a stage being created holds no deals.**
Whatever the flag says is true of every deal that will ever pass through it, from the first onwards. That is
the whole argument, and it makes this a stricter design rather than merely a simpler one.

The same reasoning is why adding a *new* stage may still declare a gate. A brand-new stage is empty by
definition, so gating it cannot strand anything — every deal that ever enters does so through the gate.

## What changed

**`requires_champion` is gone from `StageUpdate`.** `PayloadModel` forbids unknown fields, so an attempt to
send it is a 422 naming the field rather than a change quietly dropped. A caller who thinks they are moving a
gate finds out they are not.

**`PipelineTemplateCreate` gained `stages`** — the full list, in order, each declaring its own gate. Without
it a new pipeline's original stages could never be gated at all, leaving the requirement reachable only on
stages added later, which is a gap rather than a design. `stages` and `copy_stages_from` are alternatives;
sending both is a 400 rather than a silent choice between two complete descriptions of the gates. Omitting
both falls back to the built-in defaults. Copying carries the original's gates, because a copy you then have
to re-gate by hand is not a copy.

**The champion-impact endpoint, its repository helper and its schema are deleted.** They existed only to warn
before a toggle that can no longer happen. `_complete_champion_exists` stays — `champion_gaps` still uses it.

**What stays, and why.** The departure check and the derived gap list are *not* removed, because immutability
does not make a deal's compliance permanent: a champion can be unmapped, removed, or have their phone number
deleted after the deal entered. A deal can still sit in a gated stage without satisfying it, so it still has
to be flagged and still has to be refused on the way out.

## UI

The pipeline creation panel is now a small wizard: name, then a stage list — prefilled with an opinionated
draft gated at Qualify and Propose — where each open stage carries a **Champion required** toggle. Prefilled
with gates on deliberately: a form that started with everything off would make "no gates anywhere" the path
of least resistance for a decision nobody can revisit.

**Add stage** became a form rather than a one-click add, for the same reason. One click that silently created
an ungated stage would make the only moment the decision is available the one moment nobody is asked to make
it.

The stage editor shows the requirement **read-only** — a checkmark, what it means, and a line saying it was
set at creation and cannot change. Shown rather than hidden, because "does this stage need a champion" is
exactly what somebody opening a stage's settings wants to know.

## Verified

Typecheck clean, build passing, 133 frontend tests green. Thirteen checks on a **throwaway database created
and dropped by the probe** — the developer database was never opened:

creation honours per-stage gates · turning one off is refused 422 naming `requiresChampion` · turning one on
is refused · an ordinary rename and probability edit still works with the gate untouched · gates survive a
round trip · a new stage declares its own gate and lands in the right position · copying carries gates ·
`stages` plus `copyStagesFrom` is a 400 with a readable message · an empty stage list is refused · omitting
stages falls back to defaults · a rep gets 403 on both create and edit · the impact route is 404 ·
`champion-gaps` still works.

`tests/test_champion_gate.py` sets `requires_champion` on the ORM object rather than through the API, so
immutability does not affect it. It remains outdated from the deal-roles change, as noted previously.

**Unverified:** none of the three UI surfaces has been opened in a browser.
