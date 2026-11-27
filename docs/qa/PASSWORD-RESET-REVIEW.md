# Sprint 04 password recovery review

Status: PARTIAL PASS. Prepared on 2026-11-21. Branch: `feature/member3-password-reset`.
Draft review only; deployment is blocked on schema approval, PostgreSQL integration verification and real SMTP delivery verification. No commit, push, PR, Jira update or schema application was performed.

## Audit findings

The existing workspaces are `backend` (Express/TypeScript) and `frontend` (React/Vite/TypeScript). Authentication lives in `backend/src/routes/auth.routes.ts`; public routes use the standard `ApiResponse` envelope. Login compares bcrypt hashes, validates active accounts and configured roles, creates a PostgreSQL-backed HttpOnly session, and issues an HS256 JWT with issuer/audience checks. Both JWT and cookie access recheck database `auth_version`; migration 004 already supplies that field. Incrementing it invalidates existing credentials on their next server request. Existing permissions and organization/project/warehouse scope checks remain authoritative.

The implemented APP_USER equivalent is `users`, with email, `password_hash`, role, `is_active`, and `auth_version`. Recovery follows the login eligibility policy: active account with a configured role. No separate lockout fields or recovery persistence were found in repository migrations. No existing SMTP/email provider was found. Live PostgreSQL metadata inspection failed because the configured database was unavailable; repository schema findings still need confirmation against the deployment database.

The frontend has a shared Axios client from AESCS-32 and an existing auth layout. Its former administrator-help toggle is replaced by a recovery link. Existing Vitest/supertest and React Testing Library conventions are reused. No second application or authentication system was created. Main was clean and matched fetched `origin/main` before branching. Unrelated deletions of twelve `docs/sprint-01` files appeared during the session and were left untouched; exclude them from this feature commit.

## Implementation and files

- `backend/src/modules/auth/password-reset.ts`: public forgot/reset routes, validation, token issuance/consumption, email abstraction and SMTP transport.
- `backend/src/routes/auth.routes.ts`: mounts recovery inside existing origin and no-store controls.
- `backend/src/middleware/requestLogger.ts`: excludes query strings from request log lines.
- `backend/tests/password-reset.test.ts`: 19 isolated security/service/API tests, including mocked SMTP.
- `backend/tests/password-reset.integration.test.ts`: two opt-in PostgreSQL tests; no automatic schema changes.
- `frontend/src/pages/Recovery.tsx`: forgot form, reset form, success and safe error states using the existing auth layout.
- `frontend/src/services/recovery.ts`: shared API client calls and memory-only fragment capture; removes fragment/query from the current history entry before React renders. Strict Mode initialization remains repeatable; module token reference is cleared after mount.
- `frontend/src/pages/Recovery.test.tsx`: five form and service integration tests.
- `frontend/src/pages/Login.tsx`, `frontend/src/App.tsx`: recovery link and public routes independent of logged-in roles.
- `frontend/index.html`: no-referrer policy.
- `.env.example`, backend dependency manifest and root lockfile: SMTP configuration and nodemailer/types.
- `database/proposals/007_password_reset.sql` and `.down.sql`: proposed schema and rollback, intentionally outside migration discovery.

## API and security behavior

`POST /api/v1/auth/forgot-password` accepts `{email}`. Valid requests receive HTTP 202 and the same generic message before lookup or SMTP activity, avoiding account-dependent response timing. Delivery/database failure is logged using a fixed message without the error object, token, URL, email or password. Invalid email returns 400. The feature returns 503 while disabled.

`POST /api/v1/auth/reset-password` accepts `{token,newPassword,confirmPassword}`. Validation requires a 64-character lowercase hexadecimal token, matching passwords, at least 12 characters and no more than 72 UTF-8 bytes, matching the existing bcrypt policy. Invalid/expired/consumed links receive a safe 400. Successful reset does not create a session or JWT and asks the user to sign in.

Tokens use 32 cryptographically random bytes and SHA-256 digest-only storage. Links use a configured origin, never Host headers, and use a URL fragment so the token is not sent to the web server. HTTPS is mandatory for production configuration. Token lifetime defaults to 20 minutes and is constrained to 15–30 minutes. Reissuance suppresses email for five minutes using durable database timestamps, then consumes older outstanding links. Disabled and unsupported accounts receive no email.

Issuance and consumption lock the user row first. Consumption performs an expiry/unused conditional update using `clock_timestamp()`, bcrypt password update, `auth_version` increment, invalidation of other links and secret-free audit insert in one transaction. Any failure rolls all those changes back. User locking serializes concurrent issuance and reset requests across API instances. Real database tests are required before treating this guarantee as verified. Reset never updates roles or business scope data.

IP limits permit ten recovery requests per 15 minutes, scoped only to the two recovery endpoints; existing login limits are unaffected. The default express-rate-limit store is process-local. Use one API instance or enforce aggregate limits at the deployment ingress; this implementation does not introduce Redis. Email cooldown is durable across instances. SMTP executes with bounded timeouts while the issuance lock is held. SMTP delivery and database commit cannot be made atomic: a rare commit failure after accepted delivery can leave an unusable link; request another link. Generic requests acknowledged before work completes are not durably queued and can be lost on process termination. A durable queue is a future architectural decision, not part of the proposed table.

## Schema approval request

The canonical ERD is unchanged. Secure expiry, single use, cooldown and restart safety need server-controlled durable storage; existing password, JWT and audit fields cannot safely serve that purpose.

Proposed `password_reset_tokens` has a bigint primary key, UUID foreign key to `users(id)` with cascade deletion, unique 64-character digest with hexadecimal constraint, creation/expiry timestamps and nullable consumption timestamp. Expiry must exceed creation. Indexes support per-user cooldown/cleanup and expiry cleanup; the digest has a unique index. No plaintext secret is stored.

The exact forward and rollback SQL are in `database/proposals/`. They have NOT been executed or put into the automatic migration directory. Approval is required by the user's master prompt sections 6 and 16 before extending the schema.

After approval: confirm actual database metadata and migration numbering, copy the reviewed forward SQL to the migration directory and rollback SQL to `database/migrations/down`, apply via the normal migration workflow to a disposable database first, run integration tests, then follow the team's deployment process. Keep recovery disabled until migration and delivery verification succeed. Rollback: disable recovery and deploy that setting first, then drop the table using reviewed rollback SQL and reconcile the migration ledger through the normal rollback runner. This removes recovery records only; it does not revert passwords already changed.

## Email configuration

Set `PASSWORD_RESET_ENABLED`, `PASSWORD_RESET_ORIGIN`, `PASSWORD_RESET_TTL_MINUTES`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM`, `SMTP_USER`, and `SMTP_PASSWORD` through environment configuration. Keep credentials out of Git. Port defaults to 587, production requires STARTTLS unless implicit TLS is selected. Both HTML and plain text are supplied. SMTP debug logging is disabled. The email contains instructions and a recovery link, never a password, bcrypt hash or access JWT.

Use a local SMTP capture service for development. Mocked nodemailer calls have been verified, but no actual SMTP connection or inbox delivery was tested. Do not enable production recovery based on the mocked test alone.

## Verification evidence

| Check | Actual result |
| --- | --- |
| `npm run typecheck` | Passed in both workspaces |
| `npm run lint` | Passed in both workspaces |
| `npm run test --workspace=backend` | 125 passed, 30 skipped (including 2 new PostgreSQL cases) |
| `npm test` frontend stage | 102 passed, 5 skipped |
| `npm run build` | Both passed; Vite warns about bundle size over 500 kB |
| Existing login/JWT/RBAC/scope unit regressions | Passed within backend/frontend suites |
| PostgreSQL end-to-end reset/concurrency | Not run: database unavailable and schema not approved |
| SMTP delivery | Mock transport passed; real delivery not run |
| Browser screenshots | Not captured; no verified live recovery environment |

Output is saved under `test-results/password-reset-{typecheck,lint,tests,build}.txt` and `password-reset-backend-final.txt`. These paths may be ignored by Git; attach relevant output explicitly to the PR/Jira review. The first recovery run exposed test expectation errors (202 status and dynamic envelope timestamps); those assertions were corrected and the backend suite rerun successfully. Dependency installation reported 13 audit findings (9 moderate, 2 high, 2 critical); no unrelated forced dependency upgrades were attempted.

After approved schema provisioning on `DB_NAME=qorvenz_auth_test`, run `PASSWORD_RESET_INTEGRATION=1` with the backend test command using the shell's environment syntax. The suite exercises actual concurrent consumption, replay, expiration and supersession. Existing integration suites have separate opt-in flags. Never point these tests at team/production data.

## Demonstration steps after approval/configuration

1. Start the existing API/frontend and a local mail capture server with recovery enabled.
2. Open `/login`, select Forgot password, and submit an eligible fixture email. Compare the same response with an unknown email.
3. Inspect the captured email for safe instructions and a fragment-based link; verify no password or JWT appears.
4. Open the link. Confirm the fragment is removed, password fields support show/hide, and mismatch errors work.
5. Submit a matching compliant password. Confirm the success state offers Back to Login and does not authenticate automatically.
6. Sign in with the new password; verify the old password fails. Verify a previously issued JWT/cookie fails on its next protected request.
7. Replay and expire links, run concurrent integration tests, and capture desktop/mobile screenshots and results for review.

## Jira acceptance criteria and PR draft

- AC1: PARTIAL. Digest/lifetime/transaction logic and isolated tests pass; actual expiry/single-use/concurrency evidence from PostgreSQL is pending.
- AC2: PARTIAL. Template, SMTP mock and narrow secret-free recovery logging are verified in code/tests. Full real-delivery and end-to-end log capture remain pending.
- AC3: PARTIAL. Test logs, this report and reviewable code are available; screenshots and a full live workflow are pending.

Suggested PR title: `feat(auth): implement secure password recovery and reset`.
Jira reference: Sprint 04 / Member 3; exact issue key was not supplied (do not invent one).

PR body: Adds forgot/reset pages and public auth endpoints using existing bcrypt, API client and auth-version revocation. Uses high-entropy digest-only recovery tokens, expiry and atomic consumption, generic request responses, SMTP templates and abuse controls. Proposes a minimal user-linked token table outside migration discovery pending explicit approval. Verification: 125 backend and 102 frontend tests pass; typecheck, lint and production builds pass. PostgreSQL integration, real SMTP delivery and screenshots remain pending. Keep the feature disabled. See this review for schema/rollback, evidence and operational limitations.

Readiness: suitable for a draft code/schema review, not ready for production activation or final Jira acceptance.
