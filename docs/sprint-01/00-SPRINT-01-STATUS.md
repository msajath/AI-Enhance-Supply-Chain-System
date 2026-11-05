# Sprint 01 — Status & Completion Checklist

**Sprint:** 01 Requirements and validation (handbook Days 001–010)
**Gate (handbook p.4):** *Validated scope, assumptions, success cases and design sign-off.*
**Last updated:** 2026-11-05

## 1. Audit result (before this update)

| Expected Sprint 1 output (handbook) | Found in repo on 2026-11-05? |
| :--- | :--- |
| `docs/decision-log.md` (edited by all 40 cards) | ❌ Missing |
| `evidence/sprint-01/day-001…010/member-1…4/notes.md` (40 notes) | ❌ Missing |
| Interview sheets, swimlanes, data fields, permission matrix, test cases, NFRs, ERD review, user stories, fixtures, review packet, demo record | ❌ Missing |
| Repository / Jira structure (Day 001, M4) | ✅ Repo, branches and CI exist; Jira not evidenced |

**Conclusion:** Sprint 1 was **not complete**. The team had moved straight to code: auth, health API, a 6-table migration, CI and a frontend shell. In the handbook that is Sprint 2 ("Foundation and access") work. The code has been left as is. This update adds only the Sprint 1 artefacts.

## 2. Status after this update

| Day | Theme | M1 | M2 | M3 | M4 |
| :- | :--- | :-: | :-: | :-: | :-: |
| 001 | Discovery prep / scope register | 📝 | 📝 | 📝 | 📝 |
| 002 | Interviews / consolidation | ⏳ | ⏳ | ⏳ | 📝 |
| 003 | Swimlanes / context & architecture | 📝 | 📝 | 📝 | 📝 |
| 004 | Data fields / permission matrix & API | 📝 | 📝 | 📝 | 📝 |
| 005 | Acceptance & test cases / NFRs | 📝 | 📝 | 📝 | 📝 |
| 006 | ERD review / naming & boundaries | 📝 | 📝 | 📝 | 📝 |
| 007 | User stories / Jira epics | 📝 | 📝 | 📝 | 📝 |
| 008 | Fixtures / governance | 📝 | 📝 | 📝 | 📝 |
| 009 | Peer review / review packet | ⏳ | ⏳ | ⏳ | 📝 |
| 010 | Mentor review / demo | ⏳ | ⏳ | ⏳ | ⏳ |

📝 = written artefact and open questions ready; needs a peer-review link · ⏳ = needs a human event (an interview, a review meeting or the mentor session)

## 3. "Done when" checklist (every card: written artefact + explicit unresolved questions + group review link)

- [x] Written artefact for every card (`docs/sprint-01/01…11`)
- [x] Unresolved questions are explicit (`decision-log.md` §3: 19 questions; §2: 15 assumptions)
- [x] Evidence note for each of the 40 cards (`evidence/sprint-01/…`)
- [ ] Day 002 stakeholder interviews held and answers recorded (`02` sheets have blank answer columns)
- [ ] Group review link (PR URL) added to each evidence note
- [ ] Day 009 cross-review results ticked (`10` §3)
- [ ] Mentor Sprint 1 review held and feedback recorded (`11` §3)
- [ ] Jira epics E01–E08 created in the real Jira workspace

**What the team does next:** open one PR with these documents and have every member review it. Hold the interviews and the mentor review. Fill in the blanks. Then tick the last five boxes. After that, Sprint 1 can be signed off.

## 4. Out of Sprint 1 scope (deliberately not done)

No handbook Sprint 2+ work was started. The code below was added because the team's **Jira Sprint 1** includes it (see §5).

The only code change is the **UI/UX refresh**, which the team asked for separately (2026-11-05):

| Area | What changed | Files |
| :--- | :--- | :--- |
| Colour system | **60-30-10 rule.** 60% cool light neutrals (page, cards, borders) · 30% navy `#16324d` family (brand, navigation, icons, charts) · 10% construction amber `#f5a524` (primary buttons, selected-nav indicator, brand dot, highlights only). The four extra pastel icon colours were removed. Green, amber and red are now used only as **status** colours (Delivered, Low stock, −8%). | `frontend/src/index.css` (tokens at the top + "UI REFRESH v2" block at the end) |
| Motion | Card/panel fade-up with stagger, sparkline draw-in, stock bars grow, table rows fade in, sliding amber nav indicator, hover lift, button sheen and press, pulsing "online" dot and current-stop ring, slow drifting login backdrop, bell wiggle and theme-toggle rotation. All motion is switched off for users who set *reduce motion* in their OS. | `frontend/src/index.css` |
| Fixes | "3 urgent" low-stock chip now shows as a warning instead of green success · mobile top bar no longer overflows at 390 px (role badge hidden below 480 px) · dark-mode links/IDs readable. | `frontend/src/App.tsx` (1 line), `frontend/src/index.css` |

All class names, labels and ARIA attributes are unchanged, so `App.test.tsx` selectors still apply. **Run `npm run test` and `npm run build` in `frontend/` before merging.** They could not be run in the authoring environment because the npm registry was unreachable. Visual check: login, Admin, Warehouse manager (mobile) and Driver dashboards in light and dark themes.

## 5. Jira Sprint 1 tickets (added 2026-11-05)

The team's Jira board puts some foundation coding in Sprint 1: AESCS-40, 41, 42, 45 and 46, the role guard story, and their subtasks. All of them are implemented and verified. The full ticket-by-ticket table, test logs and screenshots are in **[`evidence/sprint-01/JIRA-COVERAGE.md`](../../evidence/sprint-01/JIRA-COVERAGE.md)**.

| Area | Result |
| :--- | :--- |
| Schema 002 + rollback (M2) | 25/25 PostgreSQL constraint checks pass; migrate → rollback → re-migrate verified |
| Seed (M2) | Follows the Day 008 fixture plan (D-012/D-019); repeatable (2 runs, same counts); individual passwords; old shared-password account disabled |
| Role guard + project scope (M1) | 403 + audit row for wrong role / out-of-scope project; real-SQL scope tests pass |
| Projects & Sites pages (M3) | Loading / empty / error / filter states: 10 unit tests + 23 browser checks; 19 real end-to-end checks with real login |
| AI governance docs (M4) | Written; reviewer sign-off pending |
| Smoke + cross-project tests, CI evidence (M4) | 66/66 API tests pass (incl. real-PostgreSQL scope + session tests); CI uploads JUnit results |

Still open (needs people): run `npm install` + CI once on the real toolchain, PR reviews, AI doc sign-off, mentor review.
