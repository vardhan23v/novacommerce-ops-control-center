# Decisions

## How I read the problem

NovaCommerce's real pain is **trust**: three systems that disagree, operations that partly fail, and nobody sure what actually happened. So I optimised for three things over visual breadth:

1. Every money- or order-changing action goes through one backend path that enforces the rules and the role.
2. Nothing is shown as successful unless the external system confirmed it.
3. Every outcome, including failures and denials, is recorded and visible.

## Architecture

- **One Next.js app** (App Router) holds the UI, the REST API and the service layer. Route handlers are thin: they resolve the session, validate with Zod, and call a service. All business rules live in `web/src/server/services/*`, so the UI, the API, workflows and the assistant share the same checks. There is no separate backend service, which keeps one deployable unit and one place to read the rules.
- **PostgreSQL + Prisma.** The data is relational (orders → payments, shipments, refunds → approvals), and I needed real transactions and unique constraints for dedupe and concurrency. I use Postgres locally and in production so migrations are identical; SQLite would have diverged on `mode: "insensitive"` and serializable transactions.
- **Local projection.** The app stores its own copy of customers, orders, payments and shipments, keyed by the upstream IDs (`NC-1001`, `P-001`, `S-001`), plus its own records: refunds, approvals, tickets, operations, workflow runs, webhook events, sync runs, the integration call log, and audit. Reads come from the projection, so the app stays usable when an upstream service is down.
- **Money** is integer paise end to end, including Zod (`int().positive()`), the database (`Int`) and the APIs. Paise are converted to rupees only for display, and the refund form parses rupee strings without floating point.

## Integrations

- **One gateway** (`integrations/client.ts`) handles every external call. It reads the base URL from `MOCK_API_BASE_URL`, applies a 5s timeout, and logs each attempt to `IntegrationCall` with service, path, status, error, duration and attempt number. The Integrations page and the dashboard health indicators are built from this log.
- **Retries:** a GET is retried once on a network error or a 5xx. **POSTs are never retried automatically.** The mock has no idempotency keys, so a retried refund POST could pay out twice.
- **Sync** upserts customers → orders → payments/shipments, then reconciles refunds. It never deletes. A failing service records its error in the `SyncRun` and leaves its existing rows untouched, so each service fails on its own (`partial` status).
- **Per-order failures** (NC-1012's shipping 503) are stored on the shipment (`lastSyncError`). The UI shows the last known data with a banner, rather than hiding the record.
- **Source of truth.** The upstream APIs are authoritative. Webhooks update the projection immediately, but the next sync can overwrite them. The supplied example events don't change the mock (evt-003 cancels NC-1004 locally while Commerce still says *processing*), so after a sync NC-1004 shows *processing* again. I chose this over letting stale notifications win. Ideally sync would flag such drift explicitly; that is not built.

## Cancellation

The rules are checked locally first, using the brief's rules plus the mock's own rule that a shipped, delayed or delivered shipment blocks cancellation. This gives a fast, clear error and avoids calling Commerce at all. The app then calls Commerce and marks the order cancelled **only on HTTP 200**. A 409 is recorded as *rejected*; a 5xx, timeout or unreachable service is recorded as *failed*. Either way, an `Operation` row and an audit entry are written. A confirmed cancellation also triggers the `order.cancelled` workflows.

## Refunds and approvals

The refund lifecycle is `pending_approval → rejected | executing → succeeded | failed | unconfirmed`.

- **Request.** The request runs in a serializable transaction. It checks the payment is captured, the order is cancelled or delivered, and `0 < amount ≤ captured − (sum of refunds not failed or rejected)`. Pending refunds count against the total, so two requests can't both reserve the same money. The request writes a `Refund` and an `Approval` and never calls Payments.
- **Decision.** Only a manager can decide. The transition from `pending` is a conditional `updateMany … where status='pending'`, so a double click or two managers approving at once executes the refund exactly once (this is tested).
- **Execution.** **The refund status in the response body decides the outcome, not HTTP 201.** NC-1010 returns 201 with `status: "failed"` and is recorded as failed, with the upstream refund ID. A definitive 4xx is recorded as *failed*. A timeout or 5xx is recorded as **`unconfirmed`**, not as failed: we can't know whether money moved, so the refund is not retried blindly. The next sync matches unconfirmed refunds against `GET /payments/refunds` by order and amount.
- **Workflows and the assistant** use the same `requestRefund`, so they can only create approval requests.

## Webhooks

`POST /api/webhooks` accepts one event or an array of events.

- **Validation:** Zod checks `event_id`, `type` (one of the three), an ISO `occurred_at`, `order_id` and `data.status`. Invalid events get 400 and an audit entry.
- **Deduplication** uses a unique `eventId` insert, so it is safe under concurrent redelivery. A duplicate returns 200 `duplicate`, so senders stop retrying.
- **Unknown orders** are stored as `ignored`; no state changes.
- **Stale shipment events** (older than the shipment's `updatedAt`) don't overwrite newer state.
- **Authentication** is an optional shared secret (`WEBHOOK_SECRET`). The real upstream systems would sign their payloads; the mock defines no scheme, so the secret is off by default to keep the demo usable with curl.

## Workflow engine

A workflow has a trigger, conditions joined with AND, and one action, stored as validated JSON. The engine is deterministic: it loads current local data for the order, evaluates the conditions, and runs the action.

- **Once per event:** `(workflowId, eventId)` is unique, and the execution row is inserted *before* the action runs. A redelivered event, or a second run, can't execute twice.
- **Recorded outcomes:** every run is recorded as `succeeded`, `failed` (with the error) or `skipped` (with which condition failed and its actual value).
- **Actor:** actions run as a system actor with operator rights, so they go through the same permission checks and can only *request* refunds.
- **Refund amount:** the refund action takes an explicit paise amount or `"full"` (the remaining refundable amount), following the API notes.
- **Editor:** a form-based editor, as the brief allows.

## Authentication and authorization

- **Authentication** uses bcrypt password hashes and random 256-bit session tokens. Only the SHA-256 hash of each token is stored, in `Session`, so a database leak doesn't hand out live sessions. The token travels in an httpOnly, SameSite=Lax cookie, or as a Bearer token for API clients.
- **Authorization** is a single permission matrix in `auth.ts`. Every mutating service calls `authorize(actor, permission)`, which writes an audit entry and throws 403 when denied. The UI hides buttons only for convenience: tests call the services and route handlers directly as a viewer and get 403.
- **Operators can manage workflows.** The brief doesn't say who manages workflows, and refund actions still require approval, so letting operators manage them doesn't bypass anything.

## Audit

`AuditLog` records actor, role, action, entity, entityId, outcome (`success`, `failure`, `denied` or `info`), a JSON details field and a timestamp. It covers logins (including failed ones), cancellations, refund requests, approvals, rejections and executions, tickets, workflow create/update/enable/disable and executions, syncs, webhooks, permission denials and assistant queries. The Activity page searches it, and each order page shows its own trail.

## Nova Intelligence

- **The engine is deterministic.** Intent detection and data gathering run in the app with the user's own role. Answers are built from real rows, so the engine cannot invent an order.
- **CrewAI agents never touch data.** The facts gathered (and already filtered by the user's role) are sent to the CrewAI service. A specialist agent (Order, Payment or Shipping, chosen by intent) and an Operations Coordinator then write a short diagnosis with next steps, via Groq.
  - The agents have **no tools**, so they can't query anything the user can't see, and they can't act.
  - Delegation is off, and there are at most two LLM calls per question.
  - The UI shows the AI narrative *and* the data behind it, labelled with the engine that produced it.
- **Actions need confirmation.** "Request a refund for NC-1005" returns a *proposal*. Clicking confirm calls the normal endpoint as the user, so the role check, eligibility rules and manager approval all apply. A viewer is told they can't.
- **Fallbacks:** if the service isn't configured, times out, or has no `GROQ_API_KEY`, the deterministic answer stands and a notice explains why. The core app has no LLM dependency.

## Frontend

- **Design system first.** All colours are semantic CSS variables (`canvas`, `surface`, `line`, `fg`, `accent`, `ok/warn/bad/info`) mapped into Tailwind v4, so light and dark mode share one set of classes. Dark mode follows the system by default; the account menu or Settings overrides it, and an inline script applies the choice before first paint so there's no flash.
- **Look:** neutral surfaces with hairline borders, a single indigo accent for primary actions, focus and selection, status colours only for status, Inter with tabular numerals, and monospace order IDs. Cards are compact, because operations users scan many numbers.
- **One component kit** (`components/ui.tsx`):
  - Controls: buttons, inputs, selects, segmented controls, switches.
  - Data display: badges with one status→colour map, tables.
  - Overlays: a modal and a side sheet, both with a focus trap, Esc to close and focus returned to the trigger; a keyboard-navigable dropdown menu.
  - Feedback: toasts, skeletons, empty and error states.
  - I wrote these instead of installing shadcn/ui: it would have added setup work and dependencies for roughly the same result.
- **No fake visuals.** Charts read only the dashboard API. Charts use concrete hex values per theme, because SVG fill attributes can't read CSS variables. There are no trend arrows: the data has no history, so a trend would be invented. Because the data has no line items, the order page shows a financial summary (captured, refunded, pending, refundable) instead of made-up items.
- **The frontend never decides permissions.** It hides or disables controls the role can't use, while the backend still enforces every rule. The Settings page shows the real permission matrix exported from `auth.ts`.
- **Read-only API additions for the redesign:**
  - Dashboard: refund status counts and the last failed sync.
  - Integrations: the last failed sync.
  - `/api/settings`: non-secret configuration facts.
- **Dev-only artefact:** the "N" badge in the corner of local screenshots is the Next.js dev indicator. It doesn't appear in production.

## Deployment

- **Vercel** hosts the Next.js app, **Supabase** the Postgres database, and **Railway** the mock service. Each piece runs where it fits: Vercel is built for Next.js, and Supabase gives a managed Postgres in Mumbai (`ap-south-1`), next to the Vercel `bom1` region.
- **The mock can't run on Vercel.** Vercel only runs serverless functions and can't keep a long-running Python server alive, so the mock runs on Railway through a wrapper that imports the original file unchanged and binds `0.0.0.0:$PORT`.
- **Supabase connection:** the app uses the session pooler (IPv4) with a small `connection_limit`, so serverless functions don't exhaust Postgres connections. Migrations run in the Vercel build, where Supabase is reachable.
- **Data API lock-down.** Supabase automatically exposes the `public` schema through its REST API using a public anon key. Without row-level security, anyone holding that key could read `User` (password hashes) and `Session`. A migration enables RLS on every table with no policies, so that API sees nothing. Prisma connects as the table owner and is unaffected. I verified that an anon request to `/rest/v1/User` returns `[]`.
- **History:** this was first deployed entirely on Railway (app, Postgres and mock). I moved the app and database to Vercel and Supabase on the candidate's request.
- **The CrewAI service** is containerised but not deployed. The app runs without it by design.

## Known limitations and what I'd do next

- **No scheduled sync.** Next step: Vercel Cron calling `POST /api/sync` with a service token.
- **No drift detection** between webhook-applied state and upstream state (see Integrations above).
- **Workflow side effects run inline** with the webhook request. With volume, I would move them to a queue with an outbox, so a slow Commerce call can't hold up the webhook response.
- **No idempotency keys** on our own POST endpoints. Double submits are guarded by the conditional approval transition and by the refundable-amount check, but not universally.
- **No user management, password reset or rate limiting on login.** Demo users come from the seed.
- **After the mock restarts, refunds the app recorded as succeeded no longer exist upstream.** The app keeps its own record; reconciliation only fills in `unconfirmed` refunds and doesn't flag ones that disappeared.
- **The assistant's intent detection is keyword-based.** Unusual phrasings fall back to the help text.
