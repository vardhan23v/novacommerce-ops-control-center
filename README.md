# NovaCommerce — Customer Operations Control Center

An internal operations platform for NovaCommerce. It brings orders, payments and shipments from three separate systems into one place. Employees can investigate problems, cancel orders and refund customers (with manager approval), automate follow-ups, and see whenever an integration is failing.

Built for the Infinix Labs Forward Deployed Engineer assessment.

| Path | What it is |
|---|---|
| `web/` | Next.js 15 (App Router) + TypeScript app: UI, REST API, service layer, Prisma/PostgreSQL |
| `web/prisma/` | Schema, migrations, idempotent seed |
| `web/tests/` | Vitest suite (runs against the real supplied mock service and a real Postgres) |
| `assistant/` | Optional Nova Intelligence narrative service (Python, CrewAI + Groq) |
| `deploy/mock/` | Wrapper + Dockerfile to host the supplied mock service unchanged |
| `attachments/` | Supplied files, unmodified (`mock_services.py`, `business_data.json`, `webhook_examples.json`, `api-documentation.md`) |

Design rationale, trade-offs and limitations are in [DECISIONS.md](DECISIONS.md).

## Architecture

```
Browser ──► Next.js pages (client components)
              │  fetch /api/*  (httpOnly session cookie, or Bearer token)
              ▼
         Route handlers (thin: auth + Zod validation)
              ▼
         Service layer  src/server/services/*      ◄── all business rules + permission checks
              │                 │
              ▼                 ▼
         PostgreSQL       Integration client  src/server/integrations/client.ts
         (Prisma)           (timeouts, GET retry, every call logged)
                                 ▼
                    Commerce / Payment / Shipping  (MOCK_API_BASE_URL)

Upstream systems ──POST /api/webhooks──► dedupe on event_id ► update projection ► run workflows
Nova Intelligence ──► deterministic engine (same services) ──optional──► CrewAI service (facts in, prose out)
```

## Running locally

Prerequisites: Node 20+, PostgreSQL 14+, Python 3.9+. Python 3.10+ is needed only for the optional assistant service.

```bash
# 1. Database
createdb nova_ops
createdb nova_ops_test        # used by the tests

# 2. Mock services (terminal 1) — in-memory, resets on restart
python3 attachments/mock_services.py          # http://127.0.0.1:8765

# 3. App (terminal 2)
cd web
cp .env.example .env                           # edit DATABASE_URL if needed
npm install
npx prisma migrate deploy                      # creates the schema
npm run db:seed                                # demo users, example workflows, first import from the mock
npm run dev                                    # http://localhost:3000
```

The seed is safe to re-run. It never overwrites existing users or workflows, and it imports data by upserting.

### Demo accounts

All three accounts share the password `nova-demo-2026` (override with `DEMO_PASSWORD` when seeding).

| Role | Email | Can |
|---|---|---|
| Manager | `manager@nova.test` | everything an operator can + approve/reject refunds |
| Operator | `operator@nova.test` | view, cancel eligible orders, request refunds, create tickets, manage workflows, run sync |
| Viewer | `viewer@nova.test` | read-only |

### Environment variables (`web/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection string |
| `MOCK_API_BASE_URL` | yes | Base URL of the Commerce/Payment/Shipping services (`http://127.0.0.1:8765` locally) |
| `MOCK_API_TIMEOUT_MS` | no | Per-request timeout, default 5000 |
| `WEBHOOK_SECRET` | no | If set, `/api/webhooks` requires header `x-webhook-secret` |
| `ASSISTANT_SERVICE_URL` | no | URL of the CrewAI service; when unset the assistant runs rule-based only |
| `ASSISTANT_SERVICE_TOKEN` | no | Shared bearer token between the app and the assistant service |
| `DEMO_PASSWORD` | no | Seed password for demo accounts |
| `TEST_DATABASE_URL` | no | Test database (default `postgresql://<you>@localhost:5432/nova_ops_test`) |

Assistant service (`assistant/`): `GROQ_API_KEY`, optional `GROQ_MODEL`, `ASSISTANT_SERVICE_TOKEN`, `PORT`. Set secrets only as environment variables on the host. Never commit them.

### Optional: Nova Intelligence with CrewAI

```bash
cd assistant
python3.12 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
GROQ_API_KEY=... uvicorn app:app --port 8800
# then in web/.env: ASSISTANT_SERVICE_URL=http://127.0.0.1:8800
```

Without the service or the key, the assistant still answers. Its answers come from the deterministic engine, and the UI labels them "rule-based".

## Tests

```bash
cd web
npm test
```

There are 29 tests. They start a fresh copy of the **supplied** `mock_services.py` on port 8799, run against a real Postgres test database, and cover:

- **Sync:** imports all 60 orders, payments and shipments; search, filters and pagination; when a service is down, local data is kept and the errors are recorded; the NC-1012 503 is attached to its shipment.
- **Cancellation:** shipped, delivered and delayed orders are blocked before Commerce is called; an eligible order cancels through Commerce; local state is unchanged when Commerce fails or returns 409.
- **Refunds:** failed payments, processing orders and bad amounts are rejected; the Payment API is not called before approval; an operator cannot approve; a double approval executes once; NC-1010 comes back 201 but is recorded as **failed**; pending refunds reserve the captured amount; a rejection never calls Payments; an unreachable Payment API leaves the refund `unconfirmed` and does not retry it.
- **Permissions:** a viewer is denied every mutation in both the service layer and over HTTP; denials are audited; a missing session gets 401.
- **Webhooks and workflows:** state updates; duplicates are dropped by `event_id`; invalid events and unknown orders are handled safely; non-matching conditions are skipped; matching conditions create a ticket exactly once; failed actions are recorded; refund actions only create an approval; disabled workflows don't run.

## Demo walkthrough

| Scenario | How |
|---|---|
| Synchronization | Integrations → **Sync now** (shows per-service results and the call log) |
| Failed shipment lookup | Open **NC-1012** → **Refresh**: the banner shows the carrier 503 and the last known shipment is kept |
| Failed payment | Payments → filter *failed*, or ask the assistant "Analyze failed payments" |
| Ineligible cancellation | NC-1001 (shipped) or NC-1006 (delayed): the Cancel button is disabled and shows the reason; the API returns 409 |
| Eligible cancellation | NC-1005 → **Cancel order** (operator or manager) |
| Refund → approval → success | As operator: NC-1002 → **Request refund**. As manager: Approvals → **Approve** |
| Failed refund | Request a refund on NC-1010 and approve it: it is recorded as *failed*, with the Payment reference |
| Workflow creates a ticket | Send `evt-002` (below): "Payment failure → ticket" runs and creates a Commerce ticket |
| Webhook deduplication | Send the same event twice: the second call returns `"status":"duplicate"` |
| Viewer restriction | Sign in as viewer: there are no action buttons, and calling the API directly returns 403 |
| Service unavailable | Stop the mock service: pages still load from local data, Integrations shows *degraded*, and actions fail with a recorded error |

```bash
# deliver the supplied example events
python3 -c "import json;[print(json.dumps(e)) for e in json.load(open('attachments/webhook_examples.json'))]" |
  while read -r e; do curl -s -H 'content-type: application/json' -d "$e" http://localhost:3000/api/webhooks; echo; done
# a delayed, high-value shipment that matches the seeded "> ₹5,000" workflow
curl -s -H 'content-type: application/json' http://localhost:3000/api/webhooks \
  -d '{"event_id":"evt-demo-1016","type":"shipment.updated","occurred_at":"2026-11-27T10:00:00Z","order_id":"NC-1016","data":{"status":"delayed"}}'
```

## REST API

Every endpoint except login and webhooks needs a session: the `nova_session` cookie set by login, or `Authorization: Bearer <token>` using the `token` that login returns. Errors return `{ "error", "code", "details?" }` with status 400 (validation), 401, 403 (role), 404, 409 (business rule or upstream conflict), or 502 (upstream failure). Amounts are always integer **paise**.

```bash
TOKEN=$(curl -s localhost:3000/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"operator@nova.test","password":"nova-demo-2026"}' | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -s localhost:3000/api/orders?shipment=delayed -H "Authorization: Bearer $TOKEN"
```

| Method | Path | Role | Description |
|---|---|---|---|
| POST | `/api/auth/login` | — | `{email, password}` → `{token, user}`; also sets the cookie |
| POST | `/api/auth/logout` | any | Ends the session |
| GET | `/api/auth/me` | any | Current user and permissions |
| GET | `/api/dashboard` | any | All dashboard metrics, computed from the database |
| GET | `/api/orders` | any | `q, status, payment, shipment, page, pageSize (≤100), sort=createdAt\|amountMinor\|id, dir` |
| GET | `/api/orders/{id}` | any | Order + customer, payment, shipment, refunds, tickets, operations, workflow runs, audit, eligibility |
| POST | `/api/orders/{id}/refresh` | any | Re-reads the order from all three services; returns per-service `issues` |
| POST | `/api/orders/{id}/cancel` | operator, manager | `{reason?}`; cancels through Commerce. 409 if ineligible, 502 if Commerce fails (local state unchanged) |
| POST | `/api/orders/{id}/refunds` | operator, manager | `{amount_minor, reason?}` → 202 with a refund in `pending_approval` and its approval. Payments is **not** called |
| POST | `/api/orders/{id}/tickets` | operator, manager | `{reason}` → creates a ticket through Commerce |
| GET | `/api/approvals?status=pending` | any | Approval queue |
| POST | `/api/approvals/{id}` | manager | `{decision: "approve"\|"reject", note?}`. Approve executes the refund and returns the refund with its real outcome (`succeeded`, `failed` or `unconfirmed`) |
| GET | `/api/refunds`, `/api/tickets`, `/api/payments`, `/api/shipments` | any | Lists (optional `status`) |
| GET / POST | `/api/workflows` | any / operator, manager | List with stats, or create `{name, trigger, conditions[], action, enabled}` |
| PATCH | `/api/workflows/{id}` | operator, manager | Partial update (e.g. `{enabled:false}`) |
| GET | `/api/workflows/executions` | any | Execution history |
| POST | `/api/webhooks` | (upstream) | One event or an array of events. → `processed` \| `duplicate` \| `ignored` (200) or `rejected` (400) |
| GET | `/api/webhooks/events` | any | Received events with their outcomes |
| GET / POST | `/api/sync` | any / operator, manager | Sync history, or run a full sync |
| GET | `/api/integrations?service=&errors=1` | any | Live probe, per-service health, call log, last successful sync |
| GET | `/api/audit?q=&outcome=&page=` | any | Searchable audit log |
| POST | `/api/assistant` | any | `{message}` → an answer from application data. Actions come back as a `proposal` for the user to confirm |

**Workflow body:**

```json
{
  "name": "Delayed high-value shipment → ticket",
  "trigger": "shipment.updated",
  "conditions": [
    { "field": "shipment.status", "op": "eq", "value": "delayed" },
    { "field": "order.amount_minor", "op": "gt", "value": 500000 }
  ],
  "action": { "type": "create_ticket", "reason": "Contact customer about delay" },
  "enabled": true
}
```

- **Triggers:** `payment.failed`, `shipment.updated`, `order.cancelled`.
- **Fields:** `order.amount_minor`, `order.status`, `order.channel`, `payment.status`, `shipment.status`.
- **Operators:** `eq neq gt gte lt lte`.
- **Actions:** `{type:"create_ticket", reason}` or `{type:"request_refund", amount: <paise>|"full", reason?}`. A refund action only creates an approval request.

## Deployment

The live setup runs three pieces:

1. **Web app on Vercel.** Set the project's root directory to `web`. The `build` script runs `prisma generate && prisma migrate deploy && next build`. Set `DATABASE_URL`, `MOCK_API_BASE_URL`, and optionally `ASSISTANT_SERVICE_URL`, `ASSISTANT_SERVICE_TOKEN` and `WEBHOOK_SECRET`. After the first deploy, run `npm run db:seed` once against the production database.
2. **Hosted PostgreSQL** (Neon, through the Vercel Marketplace or directly).
3. **Mock service on Railway (or any Docker host).** Build `deploy/mock/Dockerfile` from the repository root. It serves the unmodified `attachments/mock_services.py` on `0.0.0.0:$PORT`, because the original only binds `127.0.0.1`, which a hosted app can't reach.
4. **Optional: assistant on Railway.** Build `assistant/Dockerfile` and set `GROQ_API_KEY` on the host.

The mock keeps its state in memory and resets whenever its host restarts. The app's database does not reset, so after a mock restart, upstream and local state can disagree (for example, about a refund created before the restart). See DECISIONS.md.

## Known limitations

These are summarised here; DECISIONS.md has the full list.

- No scheduled background sync. Sync runs from the seed, from the button, or from the order **Refresh**.
- A webhook-applied state can be overwritten by the next sync, because the Commerce/Payment/Shipping APIs are treated as the source of truth.
- Single-tenant, with no password reset or user management UI. Demo users come from the seed.
