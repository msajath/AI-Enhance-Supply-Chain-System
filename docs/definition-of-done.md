
# QORVENZ TECH — Definition of Done

**Project:** AI-Enhanced Logistics Management System
**Jira:** AESCS-137
**Applies to:** All four developers

## 1. Purpose

This document defines the minimum quality and security
requirements that every implementation must satisfy
before its Jira issue can be marked Done.

## 2. Code Quality

Every pull request must:

- Follow the approved project structure.
- Pass ESLint without errors.
- Pass TypeScript typechecking.
- Build the backend and frontend successfully.
- Pass applicable automated tests.
- Include tests for new or modified behavior.
- Avoid unrelated changes.

## 3. CI Requirements

The existing GitHub Actions workflow is:

.github/workflows/ci.yml

The project uses these root npm commands:

- npm run lint
- npm run typecheck
- npm run build
- npm test

GitHub Actions also performs PostgreSQL-backed
migration and integration checks.

Required CI checks must pass against the latest
pull request commit before merging.

A failing required check must not be skipped.

## 4. Security Checklist

Reviewers must check the following when applicable:

- Protected APIs enforce authentication.
- Backend authorization validates user permissions.
- Project and location access restrictions are enforced.
- Inputs are validated.
- Secrets are not committed or exposed in logs.
- Passwords and tokens are handled securely.
- Sensitive information is excluded from API errors.
- Database operations requiring atomicity use transactions.
- Authorization failures and invalid requests are tested.

Frontend role-based visibility alone does not provide
security. Backend authorization is required.

If an item does not apply, explain why.

## 5. Database Safety

- Use the approved canonical ERD.
- Do not make unauthorized schema changes.
- Review migration dependencies.
- Test migrations against disposable databases.
- Document rollback or recovery procedures.
- Never run destructive tests against shared production data.

## 6. Pull Request Review

Before merging:

1. Link the related Jira issue.
2. Describe the implementation.
3. Provide relevant test evidence.
4. Confirm required CI checks passed.
5. Obtain at least one independent approval.
6. Resolve blocking reviewer comments.
7. Follow the team's agreed merge strategy.

No direct commits or force-pushes to protected branches.

## 7. Definition of Done

A Jira task can be marked Done when:

- All acceptance criteria are satisfied.
- Required implementation and tests are complete.
- CI checks pass.
- The pull request has been reviewed and merged.
- Relevant documentation is updated.
- PR links and demonstration evidence are recorded.
- Remaining limitations and follow-up work are documented.

## 8. Branching Policy

Current repository work is based on main.

The older TEAM_WORKFLOW.md describes a develop-based
workflow. The team must confirm whether to restore
develop or formally adopt main-based integration.

Until then, do not create or merge into develop
without team approval.
