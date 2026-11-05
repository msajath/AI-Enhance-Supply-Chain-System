# 02 — Discovery & Interview Sheets

**Cards:** QOR-01-01-M1/M2/M3 (Day 001: prepare sheets) · QOR-01-02-M1/M2/M3 (Day 002: conduct interviews) · QOR-01-02-M4 (Day 002: consolidate)
**Status:** The sheets are ready. **The interviews have not been held yet.** The answer columns are blank on purpose. Fill them in during or after the real stakeholder sessions. Do not fill them in from assumptions.

> How to use: one sheet per interviewee. Record the interviewee's role (not personal data), the date and the interviewer. Copy confirmed answers into `docs/decision-log.md` §1 as DECIDED. Anything left unanswered stays OPEN in §3.

---

## Sheet A — Procurement (Member 1)

**Interviewee role:** Procurement Officer / Procurement Manager / Project Manager
**Discovery draft (handbook seed R01-M1):**
- Actor: Procurement Officer / Project Manager
- Trigger: an approved construction material requirement
- Happy path: PR → RFQ → quotes → PO
- Exceptions: rejected request, partial order, cancelled request

| # | Question | Answer | Decision / assumption ID |
| :- | :--- | :--- | :--- |
| P1 | Who can raise a purchase requisition? Site engineer, project manager, storekeeper? | | A-101 |
| P2 | Can one requisition contain materials for more than one project? | | A-101 |
| P3 | What are the requisition states (Draft, Submitted, Approved, Rejected, Cancelled, Partially ordered, Closed)? | | |
| P4 | Approval levels: who approves, and up to what value? Does it depend on material type? | | Q-101, A-102 |
| P5 | Can a requester approve their own requisition? What about an absent approver (delegation)? | | A-104 |
| P6 | When is an RFQ required? How many quotations are needed? | | Q-102 |
| P7 | Which criteria decide the winning quotation (price, lead time, spec, delivery terms, past performance)? Are they weighted? | | |
| P8 | Can one requisition be split across several suppliers or POs? | | A-103 |
| P9 | Can a PO be amended or cancelled after approval? Does that need re-approval? | | Q-103 |
| P10 | Which documents must be attached (quotation PDF, specification, PO copy)? | | |
| P11 | How are suppliers approved, suspended and reactivated? Who does it? | | |
| P12 | Should suppliers log in to a portal? | | Q-104 |

**Rejection paths to capture:** requisition rejected (and the reason), quotation from an unapproved supplier, PO over the approval limit, PO cancelled after partial receipt.
**Permissions to capture:** create PR, approve PR, create RFQ, record quotation, approve PO, manage suppliers.
**Data fields:** see `04-data-dictionary.md` §1.

---

## Sheet B — Warehouse & Inventory (Member 2)

**Interviewee role:** Warehouse Manager / Site Storekeeper
**Discovery draft (handbook seed R01-M2):**
- Locations: central / regional / site
- Units: kg, bag, m³, piece (conversions to be confirmed)
- Transactions: receipt, issue, return, transfer, count
- Invariant: never issue more than available stock

| # | Question | Answer | Decision / assumption ID |
| :- | :--- | :--- | :--- |
| W1 | Which warehouse levels exist? Does each site have its own store? | | A-201, Q-201 |
| W2 | Are zones, racks or bins used? | | Q-201 |
| W3 | Which units are used per material (cement bags, steel tons or pieces, sand m³)? Which conversions are needed? | | A-202 |
| W4 | Which materials need batch, lot, serial or expiry tracking? | | Q-202 |
| W5 | Goods receipt: what is inspected, and who signs? What happens to rejected quantities? | | A-204, Q-204 |
| W6 | Is a receipt possible without a PO (emergency purchase, free issue)? | | |
| W7 | How are reservations made for a project? Do they expire? | | |
| W8 | Who can issue stock to a site? Is a requisition or issue note needed? | | |
| W9 | Inter-warehouse transfer: is it a one-step move, or dispatched then received (in-transit)? | | |
| W10 | How often are physical counts done? Who approves differences, and is there a tolerance? | | Q-203 |
| W11 | How are min, max and reorder levels set (per material, or per material per warehouse)? | | |
| W12 | How are damaged, quarantined and written-off stock recorded? | | |

**Rejection paths:** issue more than available, transfer to the same warehouse, an adjustment without approval, a receipt above the outstanding PO quantity.
**Permissions:** receive, issue, reserve, transfer, count, approve adjustment.

---

## Sheet C — Fleet & Delivery (Member 3)

**Interviewee role:** Fleet / Maintenance Manager · Logistics Coordinator · Driver
**Discovery draft (handbook seed R01-M3):**
- Inputs: transport request, material quantities, site
- Constraints: capacity, driver, shift, maintenance
- Outcomes: dispatched, partial, failed, delivered
- Evidence: recipient, photos, time, discrepancies

| # | Question | Answer | Decision / assumption ID |
| :- | :--- | :--- | :--- |
| F1 | Which vehicle types are used (lorry, tipper, boom truck, pickup)? Is capacity tracked by weight, volume or both? | | A-301 |
| F2 | Are vehicles owned, hired or third-party? | | Q-303 |
| F3 | Which driver documents must be valid (licence class, expiry)? | | |
| F4 | How are shifts and working hours defined? | | |
| F5 | Who creates transport requests? Are they always linked to a PO, transfer or site requirement? | | |
| F6 | How are vehicles and drivers assigned? Manually, or with suggestions? | | A-302 |
| F7 | Which maintenance states block assignment? | | A-303, Q-304 |
| F8 | What is proof of delivery (signature, photo, recipient name, time)? | | Q-302 |
| F9 | Can the site accept part of a load? How are shortages and damage recorded? | | A-304 |
| F10 | What happens on a failed delivery (site closed, wrong material)? | | |
| F11 | Is fuel recorded per trip or per fill-up? | | |
| F12 | Is GPS or telematics available? | | A-402 |

**Rejection paths:** a load above vehicle capacity, an overlapping vehicle or driver booking, a vehicle in maintenance, a driver with an expired licence, a receipt above the dispatched quantity.
**Permissions:** create transport request, assign vehicle, dispatch, record POD, confirm site receipt.

---

## Day 002 interview record template (copy per session)

```markdown
### Interview — <role> — <YYYY-MM-DD>
Interviewer: Member N · Note-taker: Member N
Consent to record notes: yes / no

| Q | Answer (verbatim/summary) | Confirmed? | → Decision/assumption |
|---|---|---|---|
| P1 | | | |

New open questions:
-
Follow-up owner & date:
```

## Day 002 consolidation (Member 4)

| Status | Count | Note |
| :--- | :- | :--- |
| Interviews planned | 4 (procurement, storekeeper, fleet coordinator, project manager) | |
| Interviews completed | **0** | Waiting for the mentor or client to arrange stakeholder access |
| Questions answered | 0 / 36 | |
| Assumptions logged | 15 | Decision log §2 |
| Open questions logged | 19 | Decision log §3 |
