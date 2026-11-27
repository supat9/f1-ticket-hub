# F1 Ticket Hub

F1 Ticket Hub is a support-to-engineering workspace. Support staff capture and assign cases, engineers track their work, and administrators manage team access.

## Try the portfolio demo

Install Node.js 24 and start the frontend.

```powershell
cd frontend
npm ci
npm run dev
```

Start at the [public product homepage](http://127.0.0.1:3000/) for a bilingual product tour. Staff sign in to the [workspace](http://127.0.0.1:3000/workspace).

Open [the interactive demo](http://127.0.0.1:3000/demo). Open **Guided walkthrough** to follow a duplicate-order incident through intake, engineering handoff, PR evidence, and support review. Try the triage, due-soon, and overdue queues to see how the workspace helps prioritize work. Use **Reset demo** to restore the fictional data. The board and walkthrough run in the browser. Use **ไทย / English** in the header to switch the interface and AI output language. The selection persists across pages and reloads.

The full application adds authenticated roles, a ticket activity timeline, deadline queues, service reports, attachments, CSV export, and optional assignment notifications through LINE.

## Architecture

### Local AI triage

From the project root, run `docker compose up -d triage-ai`. On first start llama.cpp downloads the Qwen3 1.7B Q8 model into a Docker volume. Check readiness at `http://127.0.0.1:8092/health`. Start the frontend and open [AI triage](http://127.0.0.1:3000/demo#ai-triage), select a fictional report and open its prepared bilingual brief. Choose **On-device · Qwen** to run a model assessment. On the [homepage](http://127.0.0.1:3000/#ai-triage) compare the prepared decisions before and after the customer reply, or select the local Qwen option for a model assessment. The public demo accepts only built-in sample IDs and reuses generated sample briefs in memory.

In the signed-in workspace, open a ticket and choose **ประเมินเคสนี้**. Next.js retrieves the ticket with the current session through the Go API. Qwen runs locally by default. Selecting Claude sends the title and description to Anthropic when the user requests a brief. Set the server-only environment variable `ANTHROPIC_API_KEY` before starting Next.js to enable Claude Haiku 4.5. The assessment recommends asking the customer for a specific missing observation or handing off the case with a proposed acceptance check. Staff can copy the question or the engineering brief. Stop the model with `docker compose stop triage-ai`.

### Components

| Path | Purpose |
| --- | --- |
| `frontend/` | Next.js App Router and TypeScript |
| `backend/cmd/api/` | Go and Gin HTTP server |
| `backend/migrations/` | PostgreSQL schema migrations |
| `compose.yaml` | PostgreSQL 18 and an optional loopback-only llama.cpp service with persistent model storage |
| `scripts/Initialize-LocalDatabase.ps1` | Starts PostgreSQL and applies the schema to a local database |

The Next.js server holds the session credential in an HTTP-only cookie and calls Gin on behalf of the browser. Gin enforces role-based access and stores tickets, sessions, and attachments in PostgreSQL. Ticket creation supports idempotency keys, and status and assignment updates check for concurrent changes.

## Run locally

For the full application, install Node.js 24, Go 1.26.11 or newer, and Docker Desktop with Docker Compose. Start Docker Desktop, then run the following commands from the project root in separate terminals.

**PostgreSQL**

```powershell
.\scripts\Initialize-LocalDatabase.ps1
```

**Create the first administrator**

```powershell
cd backend
$env:DATABASE_URL = 'postgres://f1:f1_local_dev@127.0.0.1:5433/f1_portfolio?sslmode=disable'
go run ./cmd/api create-user admin@example.com admin
```

Enter the password twice when prompted. Use at least 6 characters and at most 72 UTF-8 bytes. Sign in and open [Admin](http://127.0.0.1:3000/admin) to create staff accounts and assign roles. Create additional administrators using the local command.

**Gin API**

```powershell
cd backend
$env:DATABASE_URL = 'postgres://f1:f1_local_dev@127.0.0.1:5433/f1_portfolio?sslmode=disable'
go run ./cmd/api
```

**Next.js**

```powershell
cd frontend
npm ci
npm run dev
```

Open [F1 Ticket Hub](http://127.0.0.1:3000/login) and sign in with the staff account to create a ticket and browse the internal CS queue. Staff enter all tickets. The `customer` source marks an issue that CS received from a customer. This MVP runs on loopback for local testing. Sessions expire after eight hours and signing out revokes the current session.

Switch between Table and Kanban at the top of the queue. Use the filters to see tickets you own, tickets assigned to you, or tickets awaiting assignment. Open a ticket by its title to edit ownership, assignment, and status together. Kanban groups tickets by status with a count per column. Move a card by dragging on desktop or by choosing a status on the card.

| Role | Access |
| --- | --- |
| Admin | Manage employee accounts and teams; create, assign, and update all tickets |
| CS | View, create, assign, and update all tickets |
| Dev | View and update the status of tickets they own or are assigned to |

The API applies team permissions to active sessions immediately, including ticket lists, Kanban, counts, and direct ticket access.

### Support and engineering workflow

1. In the **รอคัดกรอง** queue, Support opens a new case, records reproduction steps and impact, then assigns a Dev account.
2. The assigned Dev starts work, records the fix or verification evidence, and can add an HTTPS pull request URL. Submitting changes the case to **แก้ไขแล้ว** and sends it to Support for review.
3. In **รอตรวจรับ**, Support records the review outcome and closes the ticket or returns it to the engineer. The activity timeline shows the actor, status changes, assignment changes, evidence, and internal notes.

Tickets enter this workflow when Support sends the handoff. Existing tickets and API clients can use the regular status and assignment flow before handoff. Guided cases use the workflow controls in ticket details for reassignment, submission, and review.

### Deadline queues and report

Resolution targets use elapsed calendar time from intake by priority. Critical is 4 hours, High is 24 hours, Med is 72 hours, and Low is 120 hours. **ใกล้ครบกำหนด** shows active tickets due within 24 hours, and **เกินกำหนด** shows active tickets that have passed their target.

The [report](http://127.0.0.1:3000/reports) groups tickets by their intake date and applies the same visibility rules as the queue. It shows backlog, deadline breaches, median time to first work, median time to resolution, and the fraction resolved within target. Historical tickets without a recorded start or completion are excluded from the corresponding timing median.

## Ticket API

Ticket endpoints require `Authorization: Bearer <token>`. Internal clients can obtain a session from `POST /api/auth/login` with a JSON email and password. The browser uses an HttpOnly cookie set by Next.js.

- `POST /api/tickets` accepts JSON with `title`, `description`, `source` (`customer` or `internal`), and optional `priority` (`low`, `normal`, `high`, or `urgent`). Set `ownerId` and `assigneeId` using staff IDs. By default the creator owns the ticket and the assignee is empty. A successful response is HTTP 201 and includes a generated code such as `F1-000123` and initial status `open`. An optional UUID `Idempotency-Key` returns the same ticket for repeated submissions with identical values. Reusing the key with different values returns HTTP 409.
- Creation also accepts `customerName`, `product`, `category`, `notes`, and one base64-encoded JPG or PNG in `image`. CS and Admin can update the four text fields with `PATCH /api/tickets/:id/details` and the current `detailsVersion`, or add an image with `POST /api/tickets/:id/images`. Each ticket supports up to five images at 5 MB per file. Image listing and retrieval follow the ticket's visibility rules.
- `GET /api/tickets` returns `{ tickets, nextCursor }` with up to 25 tickets in descending ID order. Pass `?before=<nextCursor>` for older tickets. IDs and cursors are JSON strings.
- `GET /api/tickets/board` returns the four status columns with `total`, `tickets`, and `nextCursor`. Each column returns up to 15 tickets. Pass the cursor as a query parameter named after the status to page that column independently.
- Both queue endpoints accept `filter=all|mine|assigned|unassigned|triage|review|due_soon|overdue`. `GET /api/tickets/summary` returns counts for these filters and the open status. `GET /api/tickets/:id` returns the full ticket for its detail panel, including `dueAt` and whether it uses the guided workflow.
- `GET /api/tickets/:id/workflow` returns the handoff and review fields plus a paginated activity timeline. Use `before` with `nextBefore` to load earlier entries. `PATCH /api/tickets/:id/workflow` accepts a current `version` and a workflow `action` (`handoff`, `start`, `submit`, `close`, or `return`) with the relevant handoff, resolution, or review fields. `POST /api/tickets/:id/notes` takes a `note` and supports a UUID `Idempotency-Key` to deduplicate retries.
- `GET /api/tickets/report` returns deadline counts, median start and resolution hours, and the number resolved within target. Date filters use the ticket's intake date in Asia/Bangkok.
- The queue and summary accept optional `from` and `to` dates in `YYYY-MM-DD` format. These filter the ticket creation date in Asia/Bangkok and include both boundary dates.
- `PATCH /api/tickets/:id/status` changes a ticket's `status` from its `expectedStatus`. Repeating the same move succeeds. A conflicting update returns HTTP 409.
- Ticket responses include `completedAt` after a status change to `resolved` or `closed`. Moving between these two statuses keeps the recorded completion time. Reopening clears it, and the next completion records a new time. The table and CSV display the time in Asia/Bangkok. Existing cases without a recorded completion time display an empty date until a new qualifying status change.
- `GET /api/staff` returns staff IDs and work email addresses for the assignment fields.
- `PATCH /api/tickets/:id/assignment` sets the ticket's `ownerId` and `assigneeId` from the staff directory. Pass the `assignmentVersion` from the last ticket response. Use an empty or null `assigneeId` to unassign. Include both `status` and `expectedStatus` to save status and assignment together. A conflicting update returns HTTP 409 so staff can review the latest ticket.
- Creation and assignment updates also accept `assigneeName` for a typed name of up to 120 characters. Send it with an empty `assigneeId`. A typed name is shown in the queue and export. Account-based assignments enable notifications and Dev access.
- Admins can reset CS and Dev passwords in Admin. A reset invalidates the employee's active sessions and AI token.
- [GET /healthz](http://127.0.0.1:8080/healthz) checks the database connection.

### Claude Code and Codex MCP

Dev accounts can connect a local coding client to the F1 API at `http://127.0.0.1:8080/mcp` using Streamable HTTP. Start the Go API with the portfolio database and its migrations. From the project root in PowerShell 7, launch either client:

```powershell
.\scripts\Connect-F1Mcp.ps1 -Client Claude
# or
.\scripts\Connect-F1Mcp.ps1 -Client Codex
```

The launcher prompts for the developer's F1 email and password if the terminal has no `F1_DEV_TOKEN`. It issues a developer token, ends the sign-in session, and passes the token through the environment. Issuing a token replaces that developer's previous token. Reuse the same terminal for both clients. To switch accounts or renew, pass `-Email` explicitly. To revoke access, run `.\scripts\Connect-F1Mcp.ps1 -Revoke`. To work on another repository, run the launcher by absolute path from that repository.

In the client, give the agent a ticket ID and the work to perform. For example: **“Work on F1-000123. Mark it in progress when you start, record the tests you actually ran, then send the fix to Support for review.”** The agent updates the same ticket and timeline used by the staff app. Local Claude Code users can inspect the connection with `/mcp`. Codex users can inspect the tools with `/mcp`. The checked-in client configurations reference the environment variable. The launcher also supplies the connection explicitly for clients that do not load project settings.

| MCP tool | Use |
| --- | --- |
| `f1_list_tickets` | Page through tickets owned by or assigned to the current Dev. Optional `window` accepts `created_today` or `due_today` (open or in-progress cases). Both use the Bangkok calendar day and return `createdAt` and `dueAt`. |
| `f1_get_ticket` | Read the ticket description, current status, reproduction steps, review feedback, and workflow version. |
| `f1_add_note` | Record progress or test results. Reuse the same UUID and text when retrying. |
| `f1_update_status` | Update a ticket outside the guided handoff with its expected status, a stable request ID, and evidence. |
| `f1_update_handoff` | Start an assigned guided ticket or submit the resolution and an optional HTTPS PR for Support review. On a version conflict, read the current ticket before deciding the next action. |

### Dev automation REST API

Each Dev can sign in once with their existing F1 account through `POST /api/auth/login` and call `POST /api/auth/dev-token` with that session's Bearer token. The response contains the agent's `token` and `expiresAt`. Store the token in the agent's secret store and use it as `Authorization: Bearer <dev-token>`. One token is active per Dev for up to 90 days. Issuing a new token replaces the previous one. To revoke it, call `DELETE /api/auth/dev-token` with the staff session token.

Give the agent these two operations on the Gin API (locally, `http://127.0.0.1:8080`):

- `GET /api/automation/tickets/F1-000123/status` reads the current status by exact Job ID. The token can access a ticket only while its Dev is the owner or assignee.
- `PATCH /api/automation/tickets/F1-000123/status` changes only the status. Use an exact Job ID supplied by the task, read its status first, and include evidence from the work before updating. Use one stable `requestId` per update and repeat it only with the same payload when retrying.

```json
{
  "requestId": "pr-42-merged-f1-000123",
  "expectedStatus": "in_progress",
  "status": "resolved",
  "evidence": "PR #42 was merged after the fix passed its checks."
}
```

The supported statuses are `open`, `in_progress`, `resolved`, and `closed`. The API returns `{ code, status, changed }` and stores the Dev's account, old and new status, and evidence for each change. A retry of a completed request returns `changed: false` with the current status. If the status was changed by someone else, the API returns HTTP 409 with the current status. Review the current state before attempting a different update. An inaccessible or unknown Job ID returns HTTP 404.

For agents on other machines, configure their F1 API base URL to use an internal HTTPS endpoint reachable from the agent. Keep the token in the request header.

### Local settings

| Setting | Default |
| --- | --- |
| `API_ADDR` for Gin | `127.0.0.1:8080` |
| `API_BASE_URL` for Next.js | `http://127.0.0.1:8080` |
| `DATABASE_URL` for Gin | `postgres://f1:f1_local_dev@127.0.0.1:5433/f1?sslmode=disable` |
| `SESSION_COOKIE_SECURE` for Next.js | `false` for loopback HTTP. Set `true` behind HTTPS. |

Set overrides in the corresponding terminal before starting the service. Next.js also accepts `API_BASE_URL` in `frontend/.env.local`. The Compose credentials are for local development. PostgreSQL is published on loopback port `5433` so it can run alongside an existing instance on `5432`.

Stop PostgreSQL with `docker compose stop postgres`. The named volume persists across restarts.

### Checks

Run `npm run lint`, `npx tsc --noEmit`, and `npm run build` in `frontend`. Run `go test ./...` and `go vet ./...` in `backend`. Set `F1_TEST_DATABASE_URL` to a local PostgreSQL database to include the workflow and LINE integration tests. The tests create and remove an isolated schema.

### Browser test for the ticket lifecycle

The Playwright test signs in as Support, creates a ticket in the workspace and assigns it to a developer. Through the HTTP MCP endpoint, the developer starts work, sends the same note twice with the same request ID and submits the fix. Support verifies the evidence, closes the case in the browser and reloads it. The test checks that the closure persisted and the timeline contains one copy of the note attributed to the developer.

From the project root with Node.js 24, Go 1.26.11 or newer and Docker Compose:

```powershell
docker compose up -d --wait postgres
$env:F1_TEST_DATABASE_URL = 'postgres://f1:f1_local_dev@127.0.0.1:5433/f1?sslmode=disable'
cd frontend
npm ci
npx playwright install --only-shell chromium
npm run build
npm run test:e2e
```

You can also point `F1_TEST_DATABASE_URL` at a PostgreSQL test database where the role can create schemas. Each run applies the migrations to a new schema, seeds two temporary accounts, and removes the schema afterward. Playwright starts its own API on port 18081 and frontend on 13001. Keep both ports free. On Linux use `npx playwright install --with-deps --only-shell chromium` to install the browser's system dependencies.

The [GitHub Actions workflow](.github/workflows/ci.yml) runs the backend checks, frontend lint and production build, and browser test on pull requests and pushes to `main`. A failed browser test saves a trace under `frontend/test-results/`. Open it from the frontend directory with `npx playwright show-trace <path-to-trace.zip>`. CI retains that trace for seven days.

### LINE assignment notifications

Create the organization's LINE Official Account in [LINE Official Account Manager](https://manager.line.biz/), then enable Messaging API in the account settings. Open the resulting Messaging API channel in [LINE Developers Console](https://developers.line.biz/console/). Use a dedicated F1 account if the organization already has another bot, since LINE supports a single webhook URL per channel. See [Messaging API setup](https://developers.line.biz/en/docs/messaging-api/getting-started/).

Set these variables in the environment of the **Gin API** process and restart it. Keep the Channel Secret and Access Token out of the frontend and source control.

| Variable | Value |
| --- | --- |
| `LINE_CHANNEL_SECRET` | Channel Secret from **Basic settings** in LINE Developers Console |
| `LINE_CHANNEL_ACCESS_TOKEN` | Channel Access Token from **Messaging API** in LINE Developers Console |
| `LINE_OFFICIAL_ACCOUNT_ID` | Official Account Basic ID from LINE Official Account Manager, including the leading `@` |
| `F1_PUBLIC_URL` | Optional HTTPS origin of the frontend, reachable by staff, to include a queue link in each message |

For a Windows pilot, apply the migrations, stop the previous Gin API process, then run the launcher from the project root in PowerShell 7. It verifies the token against the Basic ID and prompts for both secrets without printing them or writing them to disk.

```powershell
pwsh -NoProfile -File .\scripts\Start-LineApi.ps1
```

In the LINE Developers Console, set the Messaging API webhook URL to `https://<webhook-host>/api/line/webhook`. Route that path through an HTTPS reverse proxy to the Gin API and preserve the raw request body and the `X-Line-Signature` header. Enable **Use webhook** and run **Verify**. The staff app can remain on a private network. Only the webhook path needs to be reachable by LINE. See [LINE webhook setup](https://developers.line.biz/en/docs/messaging-api/receiving-messages/) and [webhook signature verification](https://developers.line.biz/en/docs/messaging-api/verify-webhook-signature/).

With the Gin API running, the launcher can also ask LINE to verify a webhook URL without changing the channel configuration or sending a chat message.

```powershell
pwsh -NoProfile -File .\scripts\Start-LineApi.ps1 -VerifyOnly -WebhookUrl https://line-webhook.example.com/api/line/webhook
```

Staff open the bell menu, select **ตั้งค่าแจ้งเตือน LINE**, add the Official Account as a friend, and send the one-time command to it in a direct chat. They can then verify the connection from F1. New assignments to connected staff queue a LINE push with the case code and optional link. The in-app bell continues to work for every assignee.
