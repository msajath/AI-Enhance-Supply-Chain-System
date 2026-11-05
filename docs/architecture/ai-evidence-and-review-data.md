# AI Evidence, Audit & Human-Review Data Requirements

**Jira:** AESCS-45 (story) · AESCS-165 (subtask) · **Owner:** Member 4 · **Status:** Proposed, needs review
**Sources:** SRS §4.1 ("record requests, relevant evidence references, model/prompt versions, timestamps, and reviewer decisions"), §8.1 core entities ("AI request, AI recommendation, and review outcome"), §8.2 ("AI summaries must be traceable to the underlying report or evidence")
**Related:** [`ai-permissions-and-safe-tools.md`](ai-permissions-and-safe-tools.md)

> This is a **data design**, not a migration. The tables are created in the AI sprints (9–10) through a new numbered migration, after this design is reviewed. Nothing here changes the Sprint 1 schema.

---

## 1. What must be recorded, and why

| Requirement (SRS) | What we store | Where |
| :--- | :--- | :--- |
| Record requests | Who asked, their role and scope at that moment, the question, the capability, timestamps | `ai_request` |
| Model/prompt versions | Provider, model ID, prompt template version, tool-registry version | `ai_request` |
| Evidence references | Every tool call: tool name, validated input, record IDs returned, row count, duration | `ai_tool_call` |
| Traceable answers | Validated answer, figures and their `evidenceId`s, assumptions, confidence, "insufficient data" flag | `ai_request.output` |
| Reviewer decisions | Each suggested action, its status, who reviewed it, when, decision and reason | `ai_recommendation` + `ai_review` |
| Cost / limit controls | Tokens in/out, estimated cost, latency, outcome (ok, rejected, timeout, fallback) | `ai_request` |
| Safe failure | Validation failures and fallbacks are recorded, not silently dropped | `ai_request.outcome` |

## 2. Proposed entities

### `ai_request`: one row per question

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | UUID PK | |
| `organization_id` | UUID NOT NULL FK → organizations | tenant scope; composite FKs as in `002_core_org_structure.sql` |
| `user_id` | UUID NOT NULL FK → users | the asker |
| `user_role` | VARCHAR(50) NOT NULL | role **at request time** (roles can change later) |
| `project_id` | UUID NULL | if the question was project-scoped (checked with `requireProjectAccess`) |
| `capability` | VARCHAR(40) NOT NULL | e.g. `assistant`, `shortage_risk` |
| `question` | TEXT NOT NULL | max 1000 chars (validated) |
| `provider` / `model_id` | VARCHAR(80) NOT NULL | e.g. `anthropic` / exact model string |
| `prompt_version` | VARCHAR(40) NOT NULL | e.g. `assistant-v1.2`; templates live in Git, so the version maps to a commit |
| `tool_registry_version` | VARCHAR(40) NOT NULL | |
| `output` | JSONB NULL | the **validated** `AiAnswer` (see permissions doc §5); NULL if rejected |
| `raw_output_hash` | CHAR(64) NULL | SHA-256 of the raw model text, for investigation without storing it by default |
| `outcome` | VARCHAR(20) NOT NULL CHECK IN (`OK`,`REJECTED_SCHEMA`,`REJECTED_EVIDENCE`,`DENIED`,`TIMEOUT`,`PROVIDER_ERROR`,`DISABLED`) | |
| `input_tokens` / `output_tokens` | INT | |
| `cost_estimate_usd` | NUMERIC(10,5) | |
| `latency_ms` | INT | |
| `created_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

Indexes: `(organization_id, created_at)`, `(user_id, created_at)`, `(outcome, created_at)`.

### `ai_tool_call`: the evidence trail

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | UUID PK | referenced as `evidenceId` in the answer |
| `request_id` | UUID NOT NULL FK → ai_request ON DELETE CASCADE | |
| `sequence` | SMALLINT NOT NULL | order within the request; UNIQUE (request_id, sequence) |
| `tool_name` | VARCHAR(60) NOT NULL | must exist in the registry at `tool_registry_version` |
| `input` | JSONB NOT NULL | the **validated** input (never SQL) |
| `record_type` | VARCHAR(40) NOT NULL | e.g. `project`, `site`, `stock_balance` |
| `record_ids` | UUID[] NOT NULL | IDs of rows returned, so a reviewer can open the same records |
| `row_count` | INT NOT NULL | |
| `data_as_of` | TIMESTAMPTZ NOT NULL | when the data was read (answers can go stale) |
| `status` | VARCHAR(20) NOT NULL CHECK IN (`OK`,`DENIED`,`TIMEOUT`,`ERROR`) | `DENIED` also writes `system_audit_logs` ACCESS_DENIED |
| `duration_ms` | INT | |

We store **record IDs, not copies of business data**, so the AI log does not become a second, unscoped copy of the database (privacy NFR).

### `ai_recommendation`: a suggested action awaiting a human

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | UUID PK | |
| `request_id` | UUID NOT NULL FK → ai_request | |
| `organization_id`, `project_id` | UUID | scope; reviewer must have access to this project |
| `kind` | VARCHAR(40) NOT NULL | e.g. `DRAFT_REQUISITION`, `REORDER_ALERT`, `REVIEW_SUPPLIER` |
| `summary` | TEXT NOT NULL | human-readable |
| `proposed_payload` | JSONB NOT NULL | validated against the **same** zod schema as the real endpoint (e.g. requisition form) |
| `evidence_ids` | UUID[] NOT NULL | ≥ 1, each must be an `ai_tool_call.id` of the same request |
| `status` | VARCHAR(20) NOT NULL DEFAULT `PENDING_REVIEW` CHECK IN (`PENDING_REVIEW`,`ACCEPTED`,`REJECTED`,`EXPIRED`) | |
| `expires_at` | TIMESTAMPTZ NOT NULL | default created_at + 7 days; stale advice is not actionable |
| `created_at` | TIMESTAMPTZ NOT NULL | |

### `ai_review`: the human decision

| Column | Type | Notes |
| :--- | :--- | :--- |
| `id` | UUID PK | |
| `recommendation_id` | UUID NOT NULL UNIQUE FK → ai_recommendation | one final decision per recommendation |
| `reviewer_id` | UUID NOT NULL FK → users | must have the role/scope required for the real action |
| `decision` | VARCHAR(10) NOT NULL CHECK IN (`ACCEPTED`,`REJECTED`) | |
| `reason` | TEXT NULL | required when `REJECTED` (CHECK) |
| `resulting_record_type` / `resulting_record_id` | VARCHAR(40) / UUID NULL | e.g. the requisition the reviewer then created through the normal endpoint |
| `reviewed_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | |

Acceptance **does not** perform the action. It opens the normal form pre-filled; the resulting record is linked here after the normal endpoint (with its own approval and audit) succeeds.

## 3. Rules the data must enforce

1. **No orphan figures:** every `output.figures[].evidenceId` ∈ `ai_tool_call.id` for that request (checked in code before saving `OK`).
2. **Scope at write time:** `ai_request.project_id` and `ai_recommendation.project_id` pass `canAccessProject(auth, id)` for the asker / reviewer.
3. **Separation of duties:** `ai_review.reviewer_id` must have permission for the real action; the AI itself is never a reviewer.
4. **Immutability:** `ai_request`, `ai_tool_call` and `ai_review` are append-only (no UPDATE/DELETE grants for the app role). Only `ai_recommendation.status` changes, and only via review/expiry.
5. **No secrets:** prompts and outputs must not contain API keys, passwords or session tokens; the logger redacts `Authorization` headers.

## 4. Retention & privacy (proposal, confirm with client)

| Data | Keep | Then |
| :--- | :--- | :--- |
| `ai_request` metadata, `ai_tool_call`, `ai_review` | 24 months (audit) | archive / delete |
| `ai_request.question` and `output` text | 12 months | null out text, keep metadata |
| Raw model output | not stored by default (hash only); 30 days when `AI_DEBUG_CAPTURE=true` in non-production | delete |

Questions may contain personal data typed by users, so they are only visible to the asker, System Admin and Auditor roles.

## 5. Reports this enables (Sprint 9–10 evaluation evidence)

* AI usage by role / capability / outcome per week.
* Rejection rate (schema or evidence failures): target < 5% before demo.
* Recommendation acceptance rate and time-to-review.
* "Show me the records": from any answer, open the exact records via `ai_tool_call.record_ids`.

## Review sign-off

| Reviewer | Role | Date | Result |
| :--- | :--- | :--- | :--- |
| | Member 1 (audit / permissions) | | ☐ Accepted ☐ Changes requested |
| | Member 2 (schema owner) | | ☐ Accepted ☐ Changes requested |
| | Mentor | | ☐ Accepted ☐ Changes requested |
