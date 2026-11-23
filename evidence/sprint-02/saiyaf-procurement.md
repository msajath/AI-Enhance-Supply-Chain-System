# Saiyaf Siddeek · Sprint 2 procurement evidence

The branch starts at main commit `32b0d9e`. The tests exercise the Express endpoints under `/api/v1`. The procurement routes use the existing authentication, permissions and origin checks.

| Issue | Implementation and evidence |
|---|---|
| AESCS-29 | Malformed JSON and invalid fields return 400 with field details. The auth and management handlers preserve safe client messages. The auth regression suite checks that an internal failure returns a generic error. |
| AESCS-37 | Site lists and project site counts require both project and site grants. Warehouse transfer visibility checks the applicable source or destination scope. Tests exercise same-company project denial, hidden sites and warehouse visibility. |
| AESCS-38 | Administrators set a company decision limit with `POST /procurement/approval-policies`. Each change creates a dated policy version with its author. The history endpoint lists the newest version first. |
| AESCS-48 | The catalog supports categories, units and materials. Company-scoped foreign keys and unique material codes protect the existing material master. The migration registers existing category and unit names. The warehouse material-entry endpoint still accepts its original payload. |
| AESCS-50 | Each material supports specifications and explicit conversion factors into its stock unit. Tests cover incompatible dimensions, nonpositive factors and conversion from grams to kilograms. Legacy units can be classified when their dimension is known. |
| AESCS-53 | A warehouse manager links a pending receipt to an active supplier account and a promised timestamp. The scorecard uses posted receipt timestamps and warehouse rejection records. It reports the fraction of receipts on time and the fraction with any rejected quantity. Empty, pending or unattributed history is flagged. Both rates use receipt counts so unlike units are never added together. |
| AESCS-54 | Requisitions and their material lines are inserted atomically. Positive quantities, company-scoped materials and project/site relationships are enforced in PostgreSQL. An invalid second line rolls back the entire draft. |
| AESCS-55 | An authorized site user creates a draft with multiple materials, lists visible requisitions and submits their own draft. The server supplies the requester and enforces assigned project and site scope. |
| AESCS-57 | A supply-chain manager can approve or reject a submitted requisition within the configured limit. The limit uses the sum of quantity times estimated unit price in the company's accounting currency. A row lock and a unique decision per requisition prevent double decisions. PostgreSQL records the actor, policy version, reason and time. Tests cover self-approval after a role change, a duplicate decision, and an attempted audit deletion. |

## Verification

- Both TypeScript projects passed type checking.
- All 106 enabled backend regression tests passed with HTTP requests delivered in memory. The five procurement integration scenarios passed separately using real PostgreSQL 18.6 in standalone mode. This exercised Express, authentication, authorization, validation, SQL statements and transactions.
- A separate upgrade check applied the entire migration sequence to a disposable database containing an existing material before migration 007. It verified the catalog backfill, ran the down migration, reapplied 007 and verified the material again.
- The frontend run had 96 passes and 5 skipped tests. The 10 browser transport tests require a localhost connection, which this environment denied. The four existing opt-in backend integration suites were skipped in the regression run.
- The original checkout, remote branch, Jira evidence attachments and external pull-request review are outside this local verification.

## Run the procurement tests on a development machine

From the repository root, configure the usual local PostgreSQL connection and create an empty disposable database named `qorvenz_procurement_test`. The tests create isolated fixture organizations in that database. Use PowerShell for these commands.

```powershell
$env:DB_NAME = "qorvenz_procurement_test"
$env:PROCUREMENT_INTEGRATION = "1"
npm run db:migrate --workspace @qorvenz/api
npm test --workspace @qorvenz/api -- tests/procurement.integration.test.ts
```
