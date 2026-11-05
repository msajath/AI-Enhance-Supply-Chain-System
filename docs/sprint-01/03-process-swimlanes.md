# 03 — Process Swimlanes, Context Diagram & Candidate Architecture

**Cards:** QOR-01-03-M1 (PR→PO) · QOR-01-03-M2 (receipt→stock→transfer) · QOR-01-03-M3 (transport→site acceptance) · QOR-01-03-M4 (context, user map, architecture)
**Status:** Drafted, awaiting peer review. The diagrams are Mermaid, so they render on GitHub and in VS Code with the Mermaid extension.

Steps marked ⚠ depend on an OPEN assumption or question from the decision log.

---

## 1. PR → PO workflow and approval swimlane (Member 1)

```mermaid
flowchart LR
  subgraph Site["Project Manager / Site Engineer"]
    A1[Material need for project] --> A2{Check available + reserved stock}
    A2 -- enough --> A3[Request reservation/issue → Inventory flow]
    A2 -- not enough --> A4[Create purchase requisition<br/>project + lines]
    A4 --> A5[Submit PR]
  end
  subgraph Approver["Approver (per approval matrix ⚠ Q-101)"]
    B1{Approve PR?}
    B1 -- reject + reason --> B2[PR REJECTED → requester revises]
    B1 -- approve --> B3[PR APPROVED]
  end
  subgraph Proc["Procurement Officer"]
    C1[Create RFQ to approved suppliers] --> C2[Record quotations ⚠ Q-102]
    C2 --> C3[Compare: price, lead time, terms, performance]
    C3 --> C4[Draft PO: 1 supplier ⚠ A-103]
  end
  subgraph POApp["PO Approver"]
    D1{Approve PO?<br/>not self ⚠ A-104}
    D1 -- reject --> C3
    D1 -- approve --> D2[PO OPEN → sent to supplier]
  end
  A5 --> B1
  B3 --> C1
  C4 --> D1
  D2 --> E1[[Goods receipt → §2]]
```

**State model (proposed)**

| Entity | States | Allowed transitions |
| :--- | :--- | :--- |
| Requisition | DRAFT → SUBMITTED → APPROVED / REJECTED; APPROVED → PARTIALLY_ORDERED → ORDERED → CLOSED; any pre-order state → CANCELLED | Only the approver may APPROVE or REJECT. The requester may not approve their own PR. |
| Purchase order | DRAFT → PENDING_APPROVAL → OPEN → PARTIAL → COMPLETE; OPEN → CANCELLED (if nothing has been received) | Only the PO approver approves. Amendments ⚠ Q-103. |

---

## 2. Receipt → stock → transfer swimlane (Member 2)

```mermaid
flowchart LR
  subgraph WH["Warehouse Officer"]
    R1[Receive against OPEN PO] --> R2[Inspect quantity & quality]
    R2 --> R3[Record accepted / rejected per PO line]
    R3 --> R4{accepted + rejected ≤ outstanding?}
    R4 -- no --> R5[Reject receipt: over-receipt]
    R4 -- yes --> R6[(One DB transaction:<br/>receipt + ledger + balance)]
    R6 --> R7[Rejected qty → quarantine ⚠ A-204]
  end
  subgraph Ledger["Inventory service (deterministic)"]
    L1[stock_movement +qty<br/>actor, time, reference] --> L2[stock_balance on_hand += accepted]
    L2 --> L3{below reorder level?}
    L3 -- yes --> L4[Low-stock alert]
  end
  subgraph TR["Transfer (Warehouse A → B)"]
    T1[Create transfer request] --> T2{from ≠ to and<br/>available ≥ qty?}
    T2 -- no --> T3[Reject]
    T2 -- yes --> T4[(Transaction: −qty at A, +qty at B<br/>⚠ in-transit step W9)]
  end
  R6 --> L1
  L4 -.-> P[[Procurement: draft PR suggestion]]
```

**Invariants:** `on_hand ≥ 0`, `0 ≤ reserved ≤ on_hand`, and every balance change has exactly one ledger row. A transfer source can never equal its destination. Writes are idempotent through a request key.

---

## 3. Transport → site acceptance swimlane (Member 3)

```mermaid
flowchart LR
  subgraph LC["Logistics Coordinator"]
    S1[Transport request<br/>from PO / transfer / site need] --> S2[Pick vehicle + driver + window]
    S2 --> S3{Capacity ok? Vehicle AVAILABLE?<br/>No overlap for vehicle/driver?}
    S3 -- no --> S4[Reject with reason]
    S3 -- yes --> S5[Delivery PLANNED]
  end
  subgraph WH["Warehouse"]
    W1[Issue/dispatch qty → ledger −qty] --> W2[Delivery DISPATCHED]
  end
  subgraph DR["Driver"]
    V1[Trip in progress] --> V2[Arrive at site]
  end
  subgraph Site["Site Storekeeper / Engineer"]
    X1[Count & inspect] --> X2[Record accepted / damaged / short]
    X2 --> X3[POD: recipient + time ⚠ Q-302]
    X3 --> X4{accepted = dispatched?}
    X4 -- yes --> X5[DELIVERED]
    X4 -- no --> X6[PARTIAL + discrepancy record]
  end
  S5 --> W1 --> V1
  V2 --> X1
```

---

## 4. System context diagram (Member 4)

```mermaid
flowchart TB
  U1([Procurement]) & U2([Warehouse / Storekeeper]) & U3([Fleet / Logistics]) & U4([Project / Site]) & U5([Executive / Finance / Auditor]) & U6([Driver]) --> WEB
  WEB[Qorvenz Web App<br/>React + TypeScript] -->|HTTPS, session cookie| API[Qorvenz API<br/>Express + TypeScript]
  API --> DB[(PostgreSQL<br/>source of truth)]
  API -.planned.-> Q[Job queue<br/>alerts, reports]
  API -.planned.-> FS[Private file storage<br/>quotations, PODs]
  API -.planned, read-only tools.-> AI[AI service<br/>recommendations only]
  API -.optional, not MVP.-> EXT[Email / Maps / GPS / ERP]
```

## 5. User map

| User group | Primary jobs in MVP | Main screens |
| :--- | :--- | :--- |
| System Administrator | Users, roles, scopes, configuration | Settings, Team |
| Procurement Officer / Manager | PR review, RFQ, quotations, PO | Procurement |
| Warehouse Manager / Officer | Receipt, stock, transfer, count | Inventory |
| Site Storekeeper / Project Manager | Request materials, receive deliveries | Overview, Deliveries |
| Logistics Coordinator / Fleet Manager | Plan transport, assign vehicles, maintenance | Deliveries, Fleet |
| Driver | Today's trips, POD | Driver dashboard |
| Executive / Finance / Auditor | Dashboards, reports, read-only audit | Overview, Analytics |

> The current frontend implements three roles (Admin, Warehouse manager, Driver). The mapping to the SRS roles is open: see decision log Q-402.

## 6. Candidate architecture

| Layer | Choice | Status in repo |
| :--- | :--- | :--- |
| Web | React 18 + Vite + TypeScript (`frontend/`) | Exists: login, signup, role dashboards (mock data) |
| API | Express + TypeScript (`apps/api/`) | Exists: health, auth (session cookie, bcrypt, rate limit) |
| DB | PostgreSQL 16 (`database/migrations/`) | Exists: 6 tables (`001_sprint1_foundation.sql`) |
| Modules | `modules/procurement`, `inventory`, `logistics`, `agents` | **Not yet.** Planned from Sprint 2/3 |
| Jobs / files / AI | BullMQ, object storage, LLM adapter | Planned (Sprints 8–10) |
| CI | GitHub Actions: lint, typecheck, test, build | Exists |
