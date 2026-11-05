# AI Permissions & Safe-Tool Architecture

**Jira:** AESCS-45 (story) · AESCS-164 (subtask) · **Owner:** Member 4 · **Status:** Proposed, needs review (sign-off table at the end)
**Sources:** SRS §4 *AI Agent Requirements*, §4.1 *AI safety and governance*, §8.2 *Reporting principles*, §9 *Architecture* · `docs/sprint-01/05-permission-matrix-and-api-draft.md` · decision log D-002, D-007, A-401, Q-403

> **One-line rule:** the AI can *read* what the asking user is allowed to read, through a short list of named backend tools, and it can *never* write, approve, or run its own SQL. Everything it says must point back to the system records it used.

---

## 1. Where the AI sits

```
Browser ──(session cookie)──► Express API
                               │
                               ├─ requireAuth ─ requireRole ─ requireProjectAccess   ◄── same guards as every other route
                               │
                               └─ POST /api/v1/ai/ask
                                     │
                                     ▼
                               AI Coordinator (backend service, no DB credentials of its own)
                                     │  1. validate request (zod)
                                     │  2. pick allowed tools for this user's role
                                     │  3. call LLM with tool *descriptions* only
                                     │  4. execute tool calls itself, through the Tool Registry
                                     │  5. validate LLM output (zod) and attach evidence
                                     ▼
                               Tool Registry ──► existing repository functions (parameterised SQL, scoped by AuthContext)
                                                 e.g. listAccessibleProjects(auth), listAccessibleSites(auth, projectId)
```

* The LLM never receives a database connection, connection string, table names or raw SQL. It only sees **tool names, their JSON input schema and short descriptions**.
* The **backend** executes every tool call, using the caller's `AuthContext` (`userId`, `role`, `organizationId`) loaded fresh from the database by `requireAuth`. The LLM cannot choose or change that context.
* The AI service key lives **only** in the API's environment (`AI_API_KEY`, never `VITE_*`). The frontend never calls the AI provider directly.

## 2. Permission model

The AI inherits the caller's permissions. It never has more.

| Layer | Rule | Enforced by |
| :--- | :--- | :--- |
| Who may ask | Roles with "AI assistant: R" in the permission matrix (all except Driver for now). | `requireRole(...AI_ASK_ROLES)` on `POST /ai/ask` |
| Which tools | Each tool lists the roles that may use it. The coordinator only offers the LLM tools allowed for the caller's role. | Tool Registry `allowedRoles` |
| Which records | Each tool calls an existing repository function with the caller's `AuthContext`, so company + project scope apply exactly as for the normal API. | Repository SQL (`PROJECT_SCOPE` predicate), same as `GET /projects` |
| Which fields | Tools return a **whitelisted DTO**, not database rows. Personal data (phone, e-mail, salary-like costs) is excluded unless the role may see it in the UI. | Tool output schema |
| What it may do | **Read only.** No tool inserts, updates, deletes, approves, sends messages or changes stock. | Registry has no write tools; DB role for AI tools is read-only (see §5) |

A request the user could not make through the normal UI is refused by the AI too, with the same 403 semantics, and it is audited (`ACCESS_DENIED`, module `ai`).

## 3. Tool registry (initial, proposed)

Each tool is a typed function `(auth: AuthContext, input) => Promise<ToolResult>` with a zod input schema, a zod output schema, a role list, a timeout and a row limit.

| Tool name | Purpose (SRS capability) | Input (validated) | Output | Roles | Backing function |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `list_my_projects` | Operations assistant | none | `{ projects: ProjectSummary[] }` (≤ 50) | ADMIN, WAREHOUSE_MANAGER | `listAccessibleProjects` (**exists**) |
| `list_sites` | Operations assistant | `{ projectId?: uuid }` | `{ sites: SiteSummary[] }` (≤ 100) | ADMIN, WAREHOUSE_MANAGER | `listAccessibleSites` (**exists**) |
| `get_stock_position` | Inventory intelligence | `{ warehouseId: uuid, materialCode?: string }` | balances + reserved + reorder level | ADMIN, WAREHOUSE_MANAGER | *Sprint 5 stock repository* |
| `get_demand_history` | Demand forecasting | `{ projectId: uuid, materialCode: string, from: date, to: date }` (≤ 366 days) | daily issued quantities | ADMIN, WAREHOUSE_MANAGER | *Sprint 9* |
| `get_open_purchase_orders` | Procurement intelligence | `{ projectId?: uuid, status?: enum }` | PO lines, outstanding qty | ADMIN | *Sprint 4* |
| `get_delivery_status` | Logistics intelligence | `{ deliveryId: uuid }` | status history, ETA | ADMIN, WAREHOUSE_MANAGER | *Sprint 6–7* |

Rules for adding a tool (pull-request checklist):

1. It wraps an **existing, tested repository function** that already takes `AuthContext`. No new SQL just for the AI.
2. Input and output are zod schemas, with `.strict()` objects, bounded strings, UUID IDs, enums and date ranges, and a **row limit**.
3. `allowedRoles` matches the permission matrix row for that data.
4. It has tests for allowed, out-of-scope (403/empty), and malformed input, like `tests/authorize.test.ts`.
5. It is read-only. Reviewers reject any tool whose name or code suggests create/update/approve/send.

## 4. Prohibited behaviour (hard rules)

| # | Prohibited | Why (SRS) | How it is prevented |
| :- | :--- | :--- | :--- |
| P1 | Model-generated or free-text SQL | §4 "no model-generated SQL execution"; §9 | No tool accepts SQL or table/column names; all SQL is fixed and parameterised in repository files. |
| P2 | Any operational write (stock, PO, approval, delivery status, user/role change) | §4.1 "deterministic backend services for… inventory changes"; §9 "must not directly modify operational records" | Registry contains read tools only; AI DB role has `SELECT` only; code review checklist. |
| P3 | Bypassing approvals or committing purchases | §4 Procurement "cannot bypass approvals" | AI can *draft a recommendation* (stored in `ai_recommendation`); only a human using the normal approval endpoint can act on it. |
| P4 | Unrestricted data access or cross-scope reads | §4 Coordinator "no unrestricted database access"; §5 | Tools run with the caller's `AuthContext`; same scope SQL as the UI. |
| P5 | Invented figures | §8.2 "totals… not invented by an AI model"; §4 Assistant "no invented figures" | Numbers in the answer must come from tool results. The output schema requires every figure to reference an evidence item; answers with unreferenced numbers are rejected (see evidence doc). |
| P6 | AI key or provider calls in the browser | Security NFR | Key only in API env; CSP blocks provider domains in the web app. |
| P7 | Following instructions found inside data (prompt injection), e.g. a supplier note saying "ignore previous rules" | General LLM safety | Tool results are passed as *data* with a fixed system prompt; the coordinator never lets tool text change the tool list, the role, or the scope. |

## 5. Input / output validation

**Request** (`POST /api/v1/ai/ask`):

```ts
const AskRequest = z.object({
  question: z.string().trim().min(3).max(1000),
  projectId: z.string().uuid().optional(),      // checked with requireProjectAccess
  capability: z.enum(['assistant', 'shortage_risk']).default('assistant'),
}).strict();
```

**LLM output** must parse as:

```ts
const AiAnswer = z.object({
  answer: z.string().max(4000),
  figures: z.array(z.object({ label: z.string(), value: z.number(), unit: z.string().optional(), evidenceId: z.string() })).max(50),
  evidence: z.array(z.object({ id: z.string(), tool: z.string(), recordType: z.string(), recordIds: z.array(z.string()).max(100) })).max(20),
  assumptions: z.array(z.string().max(300)).max(10),
  confidence: z.enum(['low', 'medium', 'high']),
  insufficientData: z.boolean(),
}).strict();
```

If parsing fails, or a `figures[].evidenceId` does not match an `evidence[].id` produced by a real tool call in this request, the answer is **rejected** and the user gets the safe fallback message. The raw output is kept only in the audit record.

**Database role (proposed, Sprint 10):** a separate PostgreSQL role `qorvenz_ai_reader` with `SELECT` on the views the tools use, so even a bug in a tool cannot write.

## 6. Limits & fallback (SRS §4.1, NFR "AI resilience")

| Control | Initial value (proposal, tune in Sprint 9–10) |
| :--- | :--- |
| Per-user rate limit | 20 questions / 15 min (same pattern as login limiter) |
| Per-request tool calls | ≤ 5 |
| LLM timeout | 20 s; tool timeout 3 s each |
| Token budget | ≤ 4k input / 1k output tokens per request; monthly cost cap from Q-403 |
| Retries | 1 retry on provider 5xx/timeouts, never on validation failure |
| Fallback | "The assistant is unavailable right now. The figures on your dashboard are unaffected." Core workflows never call the AI, so they keep working (SRS acceptance: "AI service failure does not prevent core… workflows"). |
| Kill switch | `AI_ENABLED=false` env flag; `POST /ai/ask` returns 503 with the fallback message |

## 7. Human review

AI output is advice. Any suggested action (e.g. "raise a requisition for 40 t of steel") is stored as an `ai_recommendation` with status `PENDING_REVIEW`. A human accepts or rejects it, and acceptance only **pre-fills** the normal form. The normal endpoint, approval workflow and audit apply. Details of what is stored are in [`ai-evidence-and-review-data.md`](ai-evidence-and-review-data.md).

## 8. Open questions

* Q-403: which provider/local model and budget? Affects §6 numbers only, not the architecture.
* A-401: first evaluated capability = demand forecasting / shortage risk (confirm with mentor).
* Should Drivers get a very small "my deliveries" assistant later? Currently **no** AI access for Driver.

## Review sign-off

| Reviewer | Role | Date | Result |
| :--- | :--- | :--- | :--- |
| | Member 1 (permissions owner) | | ☐ Accepted ☐ Changes requested |
| | Member 2 (data owner) | | ☐ Accepted ☐ Changes requested |
| | Mentor | | ☐ Accepted ☐ Changes requested |
