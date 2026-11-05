# 11 — Sprint 1 Demo Script & Mentor Feedback Record

**Cards (Day 010 — mentor sprint review):** QOR-01-10-M1 (procurement scope + edge cases) · M2 (warehouse scope + stock integrity rules) · M3 (fleet scope + dispatch/receipt acceptance) · M4 (lead demo, record feedback, update backlog)
**Status:** Script ready. **The feedback section must be filled in during the real review meeting.**

## 1. Agenda (40 min)

| Time | Presenter | Content | Artefact |
| :--- | :--- | :--- | :--- |
| 0–5 | M4 | Sprint goal, scope boundary, what is MVP | `01` |
| 5–13 | M1 | PR → approval → RFQ → PO. Edge cases: self-approval, suspended supplier, over-ordering, rejection reason | `03` §1, `06` §1 |
| 13–21 | M2 | Receipt → ledger → transfer. Invariants: no negative stock, reserved ≤ on hand, ledger reconciles, idempotent receipt | `03` §2, `06` §2 |
| 21–29 | M3 | Transport → assignment → dispatch → site receipt. Capacity, maintenance, overlap, partial acceptance | `03` §3, `06` §3 |
| 29–34 | M4 | Permission matrix, NFR targets, ERD decisions, Sprint 2 capacity | `05`, `06` §4, `07`, `10` |
| 34–40 | All | Mentor Q&A, decisions on open questions | `decision-log.md` §3 |

**Bonus (2 min, optional):** show the running app (login, role dashboards, refreshed UI) as proof that the environment works. Be clear that it uses mock data and that the domain modules start in Sprint 3.

## 2. Edge-case walkthrough script

- **M1:** "Site engineer Amal raises a PR for 6 t steel for Matara. He tries to approve it himself → denied. The approver rejects it with no reason → denied. With a reason → the PR goes back. Resubmitted and approved. A quotation from the suspended Quickbuild → rejected. A PO for 7 t against 6 t → rejected."
- **M2:** "60 bags accepted and 5 rejected against 100 ordered: outstanding is 35 and the ledger has one row. The same request sent again → no duplicate row. Two people issue 30 from 50 at the same time → only one succeeds."
- **M3:** "A 9 t load on an 8 t lorry → rejected. The tipper in maintenance → rejected. A second 11:00 booking while the lorry is out 09:00–12:00 → rejected. The site accepts 5.8 t with 0.2 t damaged → PARTIAL with a discrepancy record."

## 3. Mentor feedback record (fill in at the meeting)

| Date | Mentor | Attendees |
| :--- | :--- | :--- |
| | | M1, M2, M3, M4 |

| # | Feedback / decision | Affects | Action | Owner | Due |
| :- | :--- | :--- | :--- | :--- | :--- |
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |

**Sprint 1 gate decision:** ☐ Approved · ☐ Approved with changes · ☐ Not approved
**Open questions answered at the meeting:** list the IDs, then move them to the decision log §1 as DECIDED.

## 4. Backlog update procedure (M4, after the meeting)

1. Move answered questions to DECIDED in `decision-log.md`. Change the related assumptions A-xxx to CONFIRMED or REVISED.
2. Re-prioritise the stories in `08` based on the feedback.
3. Create the Jira epics E01–E08 and the Sprint 2 stories, and link them to the decision IDs.
4. Update `00-SPRINT-01-STATUS.md` with the gate decision.
