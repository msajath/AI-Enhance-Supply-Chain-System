# AESCS-32: Centralize frontend API errors and session expiration

Protected requests could return 401 concurrently or after a newer login, and error handling differed across frontend services. Extend the existing Axios client with typed safe errors, envelope validation, configurable timeouts, cancellation and correct empty/multipart handling. Keep the current HttpOnly cookie session and existing role dashboard routes.

Session expiration now notifies React once per session generation. A delayed 401 cannot expire a new login, and a delayed session probe cannot restore a logged-out account. Login credential errors, permission-denied responses and connectivity failures do not trigger expiration. No refresh endpoint, automatic retry, backend contract or database change is introduced.

Validation: 76 frontend tests passed, including real XHR timeout/cancellation/upload tests and existing login/role-routing regressions. Backend tests: 92 passed and 22 opt-in database tests skipped. Typecheck, lint and production builds passed. Existing bundle-size and Vite CJS warnings remain.

Evidence and manual verification: `docs/AESCS-32_IMPLEMENTATION.md` and `docs/AESCS-32_VERIFICATION.txt`.
