# Lemlist integration — design and status

**Date:** 2026-08-12
**Status:** implemented end to end; verified against a mocked lemlist, not yet against a real account.

## What the API actually is

Confirmed from lemlist's developer documentation (August 2026):

| | |
|---|---|
| Base URL | `https://api.lemlist.com/api` |
| Auth | HTTP Basic, **empty username**, API key as password — `Authorization: Basic base64(":" + apiKey)` |
| Rate limit | **20 requests per 2 seconds**, per workspace |
| Key | Settings → Integrations → Generate. **Shown once.** API access requires a paid plan; free accounts get 403 |
| Webhooks | `POST /hooks` with `targetUrl`, optional `type` (omit = all events), optional `secret`. lemlist stores the secret encrypted, never returns it, and it cannot be changed after creation |

**Unconfirmed and handled defensively.** Two things the docs do not pin down: the exact pagination
parameters on collection endpoints, and whether `format=json` is honoured on `/campaigns/{id}/export/leads`
(the docs describe it as a CSV download). Both fail safe — the pagination walk stops when a page repeats or
comes back short, and the export parser accepts a JSON array *or* CSV text. A wrong assumption imports less,
never garbage.

## The three decisions that shape it

**1. The CRM is the source of truth for reads.** No screen renders from a live lemlist call. Everything is
imported into our own tables and read from there, so the Contacts page does not inherit lemlist's latency,
its shared rate limit, or its downtime. Only `connect` and `sync` talk to lemlist, both on explicit user
action.

**2. Imported prospects are kept apart from the contact directory.** This is the one deliberate deviation
from the original plan, which had lemlist leads becoming `Contact` rows. `contacts.account_id` is `NOT NULL`
— a contact belongs to a filed company, which is what lets the directory group by company and what makes the
champion gate mean anything. A lemlist lead has a free-text `companyName` and nothing else, and a cold list
is mostly companies nobody has decided to work. Merging them would mean inventing an account per company
name, filling the accounts table with prospects and defeating the duplicate detection built to keep it clean.

So imported leads live in `lemlist_contacts`, and `POST /contacts/{id}/promote` files one as a real contact
at an account **the user names**. Matching "Acme" to "Acme Corporation" is a judgement call; guessing it
wrong attaches somebody to the wrong company, which is exactly what the duplicate-account search exists to
prevent a human doing carelessly. The UI offers a likely match and lets the person confirm it.

**3. Every write is idempotent, and that is load-bearing.** Unique constraints on lemlist's own ids in every
table. Webhooks are at-least-once, and the nightly reconcile deliberately re-reads a window webhooks already
covered, so "the same event twice" is the normal case rather than an error. `ON CONFLICT DO NOTHING` on
engagements rather than select-then-insert, which is also the only version that is correct when a webhook
and a reconcile land the same event concurrently.

## Tables — migration `2e17bd7d5af5`

- `lemlist_connections` — one per user, unique on `user_id`. Encrypted API key, key fingerprint, team id and
  name, sync status, last error, encrypted webhook secret.
- `lemlist_campaigns` — remote id unique per connection, plus `raw` JSONB.
- `lemlist_contacts` — identity is `(campaign, email)`, not lemlist's lead id: the export carries fields but
  not reliably the same `_id` the activity and webhook payloads use, while email is in all three.
  `lemlist_lead_id` is recorded when seen and matched first. The same person in two campaigns is two rows on
  purpose — their state is per campaign, and collapsing them would have to pick one of two contradictory
  answers.
- `lemlist_engagements` — unique on `(connection, activity_id)`. Webhooks that carry no activity id get a
  synthetic one built from event + lead + timestamp, so a replay still collides.
- `lemlist_webhooks` — so registration is idempotent and disconnect can deregister.

The migration was hand-edited after autogenerate, which also proposed replacing `accounts.name_normalized`'s
trigram and partial-unique indexes with a plain btree because it cannot read either kind back. Applying that
would have silently destroyed the duplicate-account detection. Only the lemlist operations were kept.

## Credential handling

API keys are Fernet-encrypted (`app/core/secrets.py`) with a key derived from `secret_key` under a distinct
label, so a weakness in JWT signing cannot become a weakness here. Hashing is not an option — the key has to
be *sent* to lemlist, so it must be recoverable.

The key never leaves the server. No endpoint returns it, masked or otherwise; `api_key_fingerprint` (eight
hex characters of its SHA-256) answers "which key do you hold" without revealing any of it. Verified: the
generated OpenAPI schema contains neither the ciphertext field nor the webhook secret.

**Stated limitation:** the encryption key lives in the same configuration the application reads, so this
protects against a leaked database, not a leaked host. A real deployment should point `_cipher()` at a KMS —
a change confined to that one function.

## Health interaction

The webhook handler and the reconcile both write engagements, and `contact-change` style bookkeeping is kept
out of the deal-health touch calculation for the same reason nudges are: filing who is involved is not
contact with them.

## Verified

Client, against a mocked lemlist with no network: key verification, multi-page campaign walk with
throttling, CSV export parsed into the JSON shape, lead list, activities, hook creation carrying the secret,
a wrong key raising an auth error rather than a generic failure, a 429 retried once then succeeding.
Secrets: round-trip, stable fingerprint, tampered ciphertext refused. Engagement score: 36 replied-plus-
opened, 75 meeting booked, **0 for four opens followed by an unsubscribe**.

End to end, on a **throwaway database created and dropped by the probe** (the developer database was never
opened):

1. bad key refused, nothing stored
2. good key connects, ciphertext in the row, plaintext absent
3. webhook registered with a 43-character secret
4. full import — 2 campaigns, 3 prospects, 4 engagements, fields and states joined from export + lead list
5. re-import — 0 created, 3 updated, 0 new engagements; counts unchanged
6. webhook applied; replayed with no duplicate row; bad secret refused; unknown lead ignored rather than
   erroring; state advanced to `meetingBooked`; `from_webhook` distinguishes live from imported
7. promotion into the CRM directory
8. reconcile skipped events outside the 3-day window
9. disconnect removed all imported data and kept the promoted contact

**One real bug found by the probe:** `promote_contact` built a `Contact` without `contact_type`, which is
`NOT NULL` with no default — every promotion would have failed. Fixed to `CUSTOMER`, since outreach is aimed
at people being sold to and a partner relationship is set up deliberately rather than discovered by a cold
campaign.

## Not verified

- **No call has been made to the real lemlist API.** Everything above is against a mock built from the
  documentation. The two unconfirmed assumptions are the likeliest thing to surprise us.
- **Nothing has been driven in a browser.** The Integrations screen and the Prospects tab are unseen.
- Webhook delivery has never been exercised by lemlist itself, only by a POST shaped like one.

## To test against a real account

1. Paste the key at **Integrations** (user menu). It is verified before storage.
2. **Import everything.** Expect it to be slow in proportion to campaign count — the 20-per-2-seconds
   budget dominates.
3. **Contacts → Prospects** for the imported list, filters, engagement score and per-prospect timeline.
4. For live events, set `LEMLIST_WEBHOOK_BASE_URL` to a public URL (a tunnel locally) and register the
   webhook. Timeline entries mark `live` versus `imported`, which is how to tell delivery is actually
   working.
5. `LEMLIST_NIGHTLY_SYNC_ENABLED=true` turns on the nightly reconcile. Off by default because it spends a
   user's own lemlist rate limit.
