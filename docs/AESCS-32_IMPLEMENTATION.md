# AESCS-32 - Frontend API client and session handling

## Audit

This branch uses `frontend/` and `backend/`, rather than the `apps/web` and `apps/api` paths in the task description. `frontend/src/services/api.ts` already held the shared Axios instance, so it remains the single client. No new HTTP library or parallel client was introduced.

The API uses `{ success, data, message?, timestamp }` and `{ success: false, error: { code, message, details? }, timestamp }`. Login is POST `/api/v1/auth/login`; restore is GET `/api/v1/auth/me`; logout is POST `/api/v1/auth/logout`. Browser authentication already uses a PostgreSQL-backed HttpOnly, SameSite cookie. Login also returns a JWT for API clients; React does not store or use it. There is no refresh endpoint. Protected backend requests verify current account status, role, scope and auth_version.

Before this change, the client had a fixed timeout and unconditional JSON Content-Type. Error parsing was spread across services. `App` installed a response interceptor directly, with no guard against delayed responses from previous sessions. Vitest, Testing Library, Axios and jsdom were already installed.

## Implementation

- One Axios instance continues to provide typed GET, POST, PUT, PATCH and DELETE, JSON transforms, per-request configuration and AbortSignal cancellation.
- `VITE_API_BASE_URL` supplies the existing API origin; an empty value uses relative requests and the Vite proxy. `VITE_API_TIMEOUT_MS` supplies a positive timeout in milliseconds, with a 10,000 ms fallback. Vite now exposes the repository-root environment settings to the frontend consistently with its existing proxy configuration. Never put secrets in VITE variables.
- `withCredentials: true` sends the existing cookie. No JWT is copied into localStorage, sessionStorage, React state or Authorization headers. The JWT-attachment acceptance case is deliberately validated as cookie authentication for this browser contract.
- Axios sets JSON Content-Type for object bodies. FormData leaves the boundary to the browser, including when a caller supplied a JSON header. There are no automatic retries.
- Responses retain their existing envelope for compatibility. HTTP 204 and HEAD return undefined data; an endpoint requiring a payload uses `unwrapResponse<T>`. Malformed JSON, empty 200 responses and invalid envelopes become typed invalid-response errors. A failed envelope on HTTP 200 is also rejected.
- `ApiError` contains a safe message, kind, optional HTTP status/code, and a bounded list of field errors. It does not retain credentials, request bodies, raw response details or Axios request configuration. HTTP 400/422 preserve shaped Zod field details. Arbitrary server error text and stack traces are not displayed. HTTP 403/404/409/429/5xx, timeout, network failure and cancellation are distinguishable.
- Existing login-specific error wording is retained. Management pages use normalized messages and field errors; project/site pages recognize typed errors and cancellation.

## Session expiration and races

`services/session.ts` holds only a numeric session generation, an expiration latch and subscriptions. Every dispatched request captures its generation. A protected `/api/v1/*` HTTP 401 expires that generation once. `App` receives the event, clears its user state and lets the existing protected routes navigate to `/login` with replace semantics.

Login, signup, logout and session-probe requests are excluded from automatic expiry handling; health requests are also excluded. Incorrect-password responses remain login errors. A current session probe returning 401 yields null and the existing focus/interval check expires the session. HTTP 403, connection failures and timeouts never expire it. No refresh endpoint, retry loop, hard navigation or backend logout request is triggered by the expiration event.

A successful parsed login starts a new generation. Successful logout ends the generation after the backend responds. Logout 401 also clears the unusable local session; other logout failures retain state and show an error. Session probes capture their generation before awaiting, so a delayed probe cannot restore a logged-out user. Old protected 401 responses cannot expire a newer sign-in. Initial page restoration uses the same generation check. Valid cookie sessions and all existing role dashboard paths remain supported.

The client cannot read or remove an HttpOnly cookie. The backend clears it on logout and rejects invalid/expired credentials. Local expiration clears usable UI state; it does not claim to revoke a remote credential by editing browser storage.

## Files

| File | Change |
|---|---|
| `frontend/src/services/api.ts` | Shared client configuration, envelope validation, expiry hook, payload unwrap |
| `frontend/src/services/apiError.ts` | Typed safe error model and validation normalization |
| `frontend/src/services/session.ts` | Session generation and single expiration notification |
| `frontend/src/services/auth.ts` | Typed auth errors, successful login/logout lifecycle, unauthorized restore |
| `frontend/src/services/management.ts` | Validated payloads, empty writes, DELETE support and shared error messages |
| `frontend/src/services/organization.ts` | Typed failures and cancellation recognition |
| `frontend/src/App.tsx` | Subscribe to expiration and reject delayed session restorations |
| `frontend/src/services/api.test.ts` | Isolated adapter tests for client configuration, auth, envelopes and error handling |
| `frontend/src/services/api.transport.test.ts` | Real XHR against a disposable loopback test server |
| `frontend/src/App.test.tsx` | Expiration redirect and delayed-probe/logout regressions; standardized safe logout error |
| `frontend/src/vite-env.d.ts`, `frontend/vite.config.ts`, `.env.example` | Timeout typing/example and root Vite environment configuration |
| `docs/AESCS-32_PR.md` | Ready-to-copy PR description |
| `docs/AESCS-32_VERIFICATION.txt` | Executed verification summary for Jira evidence |

No backend routes, schemas, roles, dashboards, application dependencies or lockfiles changed for AESCS-32.

## Verification

Executed on 19 November 2026, Asia/Colombo:

| Command | Result |
|---|---|
| `npm run test:web` | 76 passed across 4 files |
| `npm run test:api` | 92 passed; 22 opt-in database integration tests skipped |
| `npm run typecheck` | Passed for backend and frontend |
| `npm run lint` | Passed for backend and frontend |
| `npm run build` | Passed; existing Vite bundle-size warning remains |

Client unit tests use controlled Axios adapters. Browser transport tests run the real XHR adapter against an ephemeral loopback server to verify that timeouts abort, active requests cancel, invalid JSON rejects, 204 succeeds and multipart headers contain the browser boundary. App tests retain the Sprint 1 login/logout regressions and all 12 role restoration routes, and add safe expiry redirection without repeated logout, plus delayed-probe race coverage.

During implementation, a regression assertion still expected the old generic logout error, and a malformed-JSON test exposed HTTP-200 parse errors being categorized too broadly. The assertion was updated to the standardized safe message; malformed JSON normalization was corrected. The complete frontend suite then passed. No tests were removed.

## Local demonstration

1. Configure the existing API URL and optional timeout in the repository-root environment, then start the normal API/frontend. The backend database must be running for real account login.
2. Sign in through `/login` with an existing account. Refresh the dashboard: the cookie restores the user and their authorized role route.
3. In browser Network tools, verify that protected calls use the cookie session and no browser-managed Bearer token. The cookie is HttpOnly and is not readable by React.
4. Disable/revoke that account using the existing administrative workflow, then refresh a protected resource. Its 401 clears the UI and routes to `/login`. Invalid login credentials stay on login with the usual error.
5. Request a forbidden resource with a valid session: its 403 shows access denied and leaves the session usable. Network offline and timeout errors also leave authentication state intact.
6. Run `npm run test:web` for repeatable timeout/cancellation/envelope/race evidence without a product backend or database. Attach its summary or the verification text to AESCS-32.

## Limits

The 22 database-backed integration tests were not enabled; this task makes no claim of a new live database smoke test. Automated coverage uses isolated API mocks and an actual disposable browser transport. No screenshots or Jira/PR publication were performed. Cross-origin deployment still requires the existing backend CORS/cookie policy and HTTPS configuration; this frontend task does not alter them. There is no token refresh support because the backend has none. Static timeout values must be followed by a Vite restart/rebuild. Existing production-bundle and backend Vite CJS warnings are unchanged.
