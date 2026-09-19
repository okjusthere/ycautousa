# Lead delivery and notification recovery

The customer-facing success message means the inquiry is saved. Email runs
separately so a mail outage cannot prevent a successful submission.

## Durable submission

The form generates an `Idempotency-Key` for each logical submission. Retrying
unchanged details reuses that key, even when Turnstile must issue a new token.
Changing the details or submitting another inquiry creates a new key.

The Worker validates input and verification, then commits the lead, notification
job, and conversion counter in one D1 batch transaction. A unique submission key
prevents concurrent requests from creating duplicate leads. Reusing the key with
different details returns HTTP 409. Clients predating this deployment can still
submit without the optional header, but do not get duplicate suppression.

## Sending and recovery

The Worker attempts the job through `waitUntil` after persistence. A production
cron runs every five minutes to recover pending jobs and due retries. Conditional
updates claim each job with a two-minute lease, preventing request, cron, and
manual processors from sending the same job concurrently.

| State      | Meaning                                                               | Next action                                 |
| ---------- | --------------------------------------------------------------------- | ------------------------------------------- |
| `pending`  | Saved and queued                                                      | Immediate attempt, or next cron             |
| `sending`  | One processor holds a lease                                           | Wait for provider result                    |
| `retrying` | Provider explicitly rejected for rate/daily limits                    | Automatic retry when due                    |
| `sent`     | Provider accepted and returned a message ID                           | No automatic/manual resend                  |
| `failed`   | Configuration/rejection error, or retry limit reached                 | Correct configuration; retry in admin       |
| `unknown`  | Timeout, internal service error, unclassified error, or expired lease | Check inbox/spam before confirming a resend |

There are at most five attempts per automatic cycle, with delays of one minute,
five minutes, thirty minutes, and two hours. Actual retry time is the first cron
at or after the due time. A manual retry starts a new cycle and creates an audit
entry; the endpoint enforces a one-minute cooldown and requires admin
authentication plus a same-origin request.

The provider offers no message idempotency key or exactly-once delivery guarantee.
A timeout may occur after acceptance, and a database failure may lose the result
after sending. Those jobs are deliberately marked `unknown`, rather than
automatically producing another email. The admin must explicitly confirm that a
resend is needed. `sent` confirms provider acceptance, not inbox delivery.

Open **Admin → Leads → select an inquiry → Email notification** to view status,
refresh it, or retry a failed notification. Active jobs refresh every five seconds;
refreshing notification metadata preserves unsaved notes and lead status edits.

## Recipient and configuration

Production sends from `leads@ycautousa.com` to `sophie@youxuancars.com` using the
restricted `EMAIL` binding. `EMAIL_TO` is the authoritative destination and is
read-only in admin settings. Changing it requires verifying the new destination,
updating the binding and `EMAIL_TO` in `wrangler.jsonc`, and redeploying. Pending
jobs capture the original destination; a mismatch fails safely for review.

Email bodies contain inquiry details; logs and job errors store only safe error
codes and IDs. Customer acknowledgement emails are not enabled.

## Migration and operation

Apply `0006_reliable_notifications.sql` before deploying this code. The additive
migration adds submission metadata and an outbox, with triggers to keep the
existing `leads.email_status` field consistent. It does not create jobs for old
inquiries or send historical notifications. Historical `failed`/`skipped` leads
can be enqueued only through an explicit administrator retry.

This uses the existing Worker and D1 database plus a Cron Trigger; no separate
server or paid queue service is introduced. Worker/D1/email operations remain
subject to the account's existing usage limits and billing.

Before the 2026-09-19 reliability migration, the D1 recovery bookmark was
`00000146-00000000-000050eb-a0971ee172c482b4673c0dc6ca72f973`. Prefer rolling back
Worker code while retaining this additive schema. Restoring the database bookmark
would also discard customer data written after that bookmark and should only be
used as an explicitly approved recovery action.
