# AESCS-32 implementation verification

Date: 19 November 2026 (Asia/Colombo). Branch: `main`, based on `e92bd48`.

**Overall: PARTIAL PASS for complete live verification. READY FOR PULL REQUEST against AC1-AC3.** All executed final tests and quality checks passed. Account-backed live authentication remains unverified because the local PostgreSQL database contains no users, and this task explicitly prohibits database modifications. This readiness assessment is for review of the API-client task, not a claim of complete live authentication or release sign-off.

## Audit of the actual implementation

The repository uses `frontend/` and `backend/`, not `apps/web/` and `apps/api/`. The existing central client is `frontend/src/services/api.ts`; there is no need to add a second client at `src/lib/api.ts`. Auth, management and organization services import this same instance. `App.tsx` uses those services for login, restoration, logout, profile changes, protected dashboards, projects, sites and management pages.

React authentication state is held in `App`, with session generations and expiration subscriptions in `services/session.ts`. Browser requests use `withCredentials: true` and the existing HttpOnly cookie. The backend additionally accepts signed Bearer JWTs for API clients. React deliberately does not store the JWT returned by login, read a JWT from localStorage, or manufacture an Authorization header. This matches the verified backend contract rather than replacing working cookie authentication. There is no refresh endpoint.

Backend endpoints inspected: `/api/v1/auth/login`, `/auth/me`, `/auth/logout`, project/site routes and permission-protected management routes. `requireAuth` verifies JWT signature/algorithm/issuer/audience/expiry or the cookie session, then reloads account activity, role, organization and auth_version. Permission and resource-scope checks stay on the backend. Success/error responses use the existing `success`, `data`, `error.code`, `error.message`, optional `error.details` and timestamp envelope.

Configuration comes from `VITE_API_BASE_URL` and `VITE_API_TIMEOUT_MS`, with a 10-second timeout fallback and support for per-request overrides. Vite reads the root environment. Existing package scripts use Vitest, Testing Library/jsdom, ESLint, TypeScript and Vite. Production build behavior retains the existing bundle-size warning. No new application or test dependencies were added.

## Defect reproduced and fixed

`parseUser` checked identity and the role label but accepted arbitrary optional authorization metadata. For example, a response with `permissions: {}` reached `user.permissions.includes(...)` in the protected route guard and could crash instead of failing safely. Strings in place of arrays could also produce misleading permission checks.

Seven new malformed-metadata tests initially failed because login accepted those responses: permissions string/object/non-string items, roles string/non-string items, non-string roleCode and non-string dashboard. The parser now validates those fields before returning a user or starting a new frontend session, and throws a safe typed `INVALID_AUTH_RESPONSE` error for malformed data. Missing optional fields remain backward-compatible with Sprint 1 responses. An App regression also verifies safe login/restoration fallback before route rendering.

After the fix, all seven tests passed. No existing tests were removed. No backend, database schema, data, role relationship, endpoint, dashboard or login layout was changed.

## Features tested and evidence level

| Feature | Result and method |
|---|---|
| Shared client actually used by the application | Source audit plus existing App, project/site and management service integration |
| GET, POST, PUT, PATCH, DELETE | Passed over real browser XHR to a disposable loopback HTTP server; method and JSON body asserted |
| API origin and timeout configuration | Passed using isolated Vite environment settings and actual request configuration |
| Browser authentication credentials | `withCredentials` asserted; no localStorage token copied to Authorization. Backend cookie flow tested separately with isolated fixtures |
| Real frontend-to-Express-to-PostgreSQL communication | Passed: actual client, actual compiled Express backend, actual PostgreSQL health query |
| Real protected 401 and invalid JWT | Passed over XHR through actual backend middleware; missing credentials rejected, malformed JWT returns INVALID_TOKEN |
| Real unknown-account login rejection | Passed through actual backend password comparison and PostgreSQL lookup; no expiration event for login failure |
| Valid login, valid Bearer JWT, invalid password, disabled/revoked account, expired/tampered/wrong-audience JWT | Passed in backend HTTP/middleware tests with isolated database fixtures; these are not live PostgreSQL account tests |
| 401 cleanup and safe redirect | Passed with actual Axios interceptor wired to the rendered App and React Router, using a controlled HTTP adapter; one notification for concurrent failures, no backend logout loop |
| 403 without logout | Passed with actual client/interceptor and rendered App; workspace remains visible and internal error text is not displayed |
| Successful login, logout, initial restoration, roles and protected route regressions | Passed in rendered App tests with controlled API responses; all catalog roles and legacy Driver remain supported |
| Delayed requests and logout races | Passed: old 401 cannot expire a newer login; delayed focus/session probe cannot restore a logged-out user |
| 400/422 validation and backend error envelopes | Passed: shaped field details and existing management text envelopes preserved safely |
| 404, 409, 429, 500 | Passed: typed safe errors; no uncontrolled retry or unnecessary expiration |
| Timeout, network failure, cancellation | Passed: normalized timeout/network cases; actual XHR timeout abort and in-flight AbortController cancellation |
| Malformed/empty JSON and HTTP 204 | Passed: malformed responses reject safely; 204 returns undefined without JSON parsing |
| FormData uploads | Passed over real XHR; multipart boundary supplied by the browser |
| Missing-cookie restoration | Passed against actual Express backend, returning null from restoreSession |

The loopback transport server is test-only and implements no product business operations. Its successful PUT/PATCH/DELETE tests prove the client sends those methods and bodies correctly, not that unexecuted PostgreSQL business writes succeeded.

## Commands executed and actual results

| Command | Result |
|---|---|
| `npm test` (baseline audit) | 106 backend passed, 28 backend integration cases skipped; 82 frontend passed |
| `npm run test --workspace=frontend -- src/services/api.test.ts` (before fix) | 25 passed, 7 newly added regression cases failed; reproduced malformed-metadata acceptance |
| Live selected suite with `AESCS32_LIVE_READONLY=1` | 47 passed: 32 client, 10 browser transport, 5 real-backend read-only cases |
| `npm run test:web` (after fixes) | 97 passed; 5 opt-in live read-only cases skipped by default |
| Full frontend suite with `AESCS32_LIVE_READONLY=1` and JSON/JUnit reporters | **102 passed, 0 failed, 0 skipped** across 5 files |
| `npm run typecheck` | Passed for frontend and backend, including new tests |
| `npm run lint` | Passed for frontend and backend |
| `npm run build` | Passed for API and web; frontend transformed 108 modules; existing chunk larger than 500 kB warning remains |
| `git diff --check` | Passed |

Final frontend breakdown: App 45, projects/sites 10, API unit 32, browser transport 10, real-backend read-only 5. Final failed cases: **0**. Backend production code was unchanged after its 106-test baseline run.

## Live test boundaries and database preservation

The opt-in live suite starts the actual compiled Express application on an ephemeral loopback port with an in-memory session store. Its PostgreSQL access is limited to the health SELECT and unknown-user lookup; other tested requests reject before a valid user is loaded. It does not create users, seed fixtures, run migrations, approve requests, log in successfully, or use a PostgreSQL session store. The CORS origin is adjusted only within that test process and restored afterwards.

Read-only database checks found 0 users before testing. Afterwards there were still 0 users, 0 audit events and no PostgreSQL session table. No database records or schema were modified by this verification task.

The following remain **unverified against a real persisted account**:

- Successful live login and its PostgreSQL-backed cookie persistence across process restart/page reload.
- Live successful logout/revocation and behavior of a formerly valid persisted session.
- Positive protected PostgreSQL resource access and live role/scope 403 restrictions with real accounts.
- Successful product PUT/PATCH/DELETE writes; these were not run under the no-database-changes constraint.
- A full Chrome/Edge end-to-end session scenario. jsdom XHR/React tests do not claim cross-browser cookie-policy coverage.

The 28 existing opt-in database integration tests were not enabled: 8 scope, 13 management workflow, 6 access-request and 1 persisted-auth case. They create/update/delete test records or require fixture accounts; the local database has none. Their skip status is not reported as a pass. Existing mock-backed HTTP tests cover the corresponding AESCS-32 authentication/authorization behaviors without changing the database.

## Jira acceptance criteria and definition of done

| Criterion | Verdict | Evidence |
|---|---|---|
| AC1: Frontend handles timeout and error envelopes | PASS | Client and real-XHR tests, field-error tests, safe HTTP error mapping |
| AC2: Unauthorized sessions redirect to login safely | PASS | Actual client/interceptor-to-App 401 test, real backend 401 event, concurrent/stale-generation cases, login-error loop protection, 403 preservation |
| AC3: Tests or demonstration evidence is available for pull-request review | PASS | Test sources plus generated machine-readable JSON/JUnit results and this report |
| DoD: Frontend/backend integration | PASS for executed read-only integration; authenticated persisted-account E2E remains open | Actual Axios/XHR + Express + PostgreSQL health and authentication-denial checks |
| DoD: Typecheck, lint, automated tests, production build | PASS | Executed command results above |
| DoD: Relevant authorization restrictions | PASS in isolated HTTP/route tests; live missing/invalid credentials verified | Backend guards, frontend route restrictions, read-only auditor and user-scoped driver tests; live account-based permission/scopes not claimed |

**AESCS-32 is READY FOR PULL REQUEST review with the live-account coverage limit explicitly disclosed.** Complete persisted-account integration sign-off remains pending an existing authorized test environment/account. Do not seed or mutate the current database merely to mark those cases passed.

## Modified and created files

| File | Purpose |
|---|---|
| `frontend/src/services/auth.ts` | Reject malformed optional authentication metadata before activating a session |
| `frontend/src/services/api.test.ts` | Seven malformed-metadata regression cases |
| `frontend/src/services/api.transport.test.ts` | Assert all five methods and JSON bodies over real XHR |
| `frontend/src/App.test.tsx` | Wire real client 401/403 behavior into React routing; reject malformed restoration metadata |
| `frontend/src/services/api.backend.test.ts` | New opt-in, real-backend read-only integration suite |
| `docs/qa/AESCS-32-VERIFICATION.md` | Verification report and reproduction instructions |

These changes are local; this verification request did not publish a PR or push a commit.

## Jira evidence and reproduction

Generated evidence files:

- `test-results/AESCS-32/frontend.json`: all 102 final test assertions and machine-readable summary.
- `test-results/AESCS-32/frontend.xml`: JUnit evidence for the same run.

`test-results/` is intentionally Git-ignored; attach these artifacts to Jira/PR rather than committing generated results. No screenshots were created or claimed. Useful screenshots, if needed, are the final 102-pass terminal summary and the test names for 401 redirect, 403 retention and malformed auth metadata.

To reproduce default automated checks:

```powershell
npm run typecheck
npm run lint
npm test
npm run build
```

To reproduce the additional live read-only verification with an already running/configured PostgreSQL database:

```powershell
npm run build:api
$env:AESCS32_LIVE_READONLY='1'
npm run test --workspace=frontend -- --reporter=default --reporter=json --reporter=junit --outputFile.json=../test-results/AESCS-32/frontend.json --outputFile.junit=../test-results/AESCS-32/frontend.xml
Remove-Item Env:AESCS32_LIVE_READONLY
```

The live suite uses the real backend build and database connection settings; it does not require demo passwords. No credentials, tokens or raw request bodies should be captured in Jira screenshots or reports.
