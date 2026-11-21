# AESCS-182 — Optional Integrations and MVP Budget Assessment

**Project:** QORVENZ TECH — AI-Enhanced Logistics Management System
**Sprint:** AESCS Sprint 2 — Core Setup
**Owner:** Member 1 — Malhar Ahmed
**Date:** 21 November 2026
**Status:** Proposed assessment — mentor/client approval pending

## 1. Purpose

This document evaluates optional third-party integrations for the AI-Enhanced Logistics Management System.

The assessment identifies business benefits, technical requirements, data exchanged, licensing, recurring costs, security risks, alternatives and decisions requiring approval.

No external paid service will be implemented or purchased based solely on this assessment.

## 2. Requirements and Scope

**References:**
- Qorvenz Tech Software Project Requirements Specification, Sections 2.2, 6 and 12.
- `docs/decision-log.md` — A-402 and Q-403.
- `docs/sprint-01/01-scope-register.md`.
- `docs/architecture.md`.

The system's primary responsibility is construction supply-chain management, including procurement, suppliers, inventory, fleet, transportation and deliveries.

Optional integrations must not prevent these core functions from operating.

A-402 currently remains open. The absence of approved funding is not equivalent to a final mentor decision.

## 3. Integration Assessments

### 3.1 Accounting and ERP

**Business purpose:** Exchange approved purchase orders, supplier details, cost records and expenditure information with accounting or ERP software.

**Potential solution:** ERPNext, a client-selected ERP or another approved accounting system.

**Data exchanged:** Supplier identifiers, purchase orders, invoices, cost centers, expenditure values and transaction references.

**Technical dependency:** Vendor API, authentication method, data mapping and reconciliation rules.

**Licensing and cost:** ERPNext is open-source software under GPLv3. Self-hosting avoids proprietary software licence fees but still requires infrastructure, maintenance and integration work. Commercial ERP subscriptions and API access depend on the vendor.

**Security risks:** Exposure of financial records, unauthorized synchronization, duplicate transactions and inconsistent records.

**Responsible area:** Procurement, finance and integration architecture. Specific implementation ownership is not assigned here.

**Fallback:** Continue using the internal purchase order and cost records, with authorized manual export when required.

**Proposed classification:** Later enhancement.

**Decision:** Pending mentor/client approval.

### 3.2 GPS and Vehicle Telematics

**Business purpose:** Track vehicle locations, estimate delivery arrival times and improve fleet visibility.

**Potential solution:** Client-approved GPS hardware and a compatible telematics provider.

**Data exchanged:** Vehicle identifier, GPS coordinates, timestamps, movement history and trip status.

**Technical dependency:** GPS devices or mobile tracking, provider API, connectivity and integration with vehicle/delivery records.

**Licensing and cost:** Potential device purchase, installation, data connectivity, platform subscription and API charges. Exact prices require a provider quotation.

**Security and privacy risks:** Driver location privacy, continuous tracking, access to historical routes and location-data retention.

**Responsible area:** Fleet and logistics.

**Fallback:** Drivers or coordinators manually update dispatch, transit and delivery status.

**Proposed classification:** Later enhancement, unless the client specifically requires live tracking.

**Decision:** Pending mentor/client approval.

### 3.3 Mapping and Route Planning

**Business purpose:** Display delivery destinations, visualize routes and estimate travel distances.

**Potential solutions:** Google Maps Platform or an appropriately licensed OpenStreetMap-based service.

**Data exchanged:** Origin, destination, site coordinates, stops and route information.

**Technical dependency:** Mapping SDK/API, geocoding or route service, credentials and usage limits.

**Licensing and cost:** Google Maps Platform uses service-specific free monthly usage allowances and usage-based charges. OpenStreetMap data is available under an open licence, but publicly hosted OSM tiles have usage restrictions. Production hosting or commercial tile services may incur costs.

**Security risks:** Exposure of site locations, API-key leakage and unexpected API charges.

**Responsible area:** Logistics and deployment architecture.

**Fallback:** Display saved site addresses, manually planned routes and delivery status without external routing.

**Proposed classification:** Optional prototype or later enhancement.

**Decision:** Pending mentor/client approval.

### 3.4 Email, SMS and Business Messaging

**Business purpose:** Notify authorized users about approvals, stock shortages, delivery updates and other events.

**Potential solutions:** Approved email provider, Twilio SMS or Meta WhatsApp Business Platform.

**Data exchanged:** Recipient contact details, notification category, event reference, message contents and delivery status.

**Technical dependency:** Messaging API, provider credentials, sender configuration, templates and callback handling.

**Licensing and cost:** SMS and business-messaging services may charge per message, country, message type or account configuration. Email-provider pricing depends on usage and the service selected.

**Security risks:** Personal contact information, message leakage, fraudulent notifications, consent requirements and provider credential exposure.

**Responsible area:** Notification and platform integration.

**Fallback:** Display notifications inside the AESCS application.

**Proposed classification:** In-app notifications for MVP; external messaging pending approval.

**Decision:** Pending mentor/client approval.

### 3.5 Barcode, QR Code and RFID

**Business purpose:** Improve material identification, warehouse scanning and stock movement accuracy.

**Potential solutions:** Browser-based QR/barcode scanning, smartphone cameras, dedicated scanners or RFID equipment.

**Data exchanged:** Material identifier, material code, lot information, storage location and movement reference.

**Technical dependency:** Camera/browser permissions, compatible scanning libraries, supported barcode formats and optional scanning hardware.

**Licensing and cost:** Basic browser-based scanning may avoid dedicated hardware costs, subject to the selected library's licence. Dedicated scanners, RFID readers, tags and standards-related implementation can create additional costs.

**Security risks:** Altered QR labels, duplicate scans, unauthorized stock movements and untrusted scanned content.

**Responsible area:** Inventory and warehouse operations.

**Fallback:** Manual material-code entry and validated inventory forms.

**Proposed classification:** Simple QR/barcode capability may be considered for the MVP. RFID is proposed as a later enhancement.

**Decision:** Pending mentor/client approval.

### 3.6 Document Storage and Management

**Business purpose:** Store purchase-order documents, delivery notes, approved attachments, proof-of-delivery images and related records.

**Potential solutions:** Approved private storage, an appropriate self-hosted storage service or an object-storage provider such as Amazon S3.

**Data exchanged:** Documents, file identifiers, metadata, uploader details, timestamps and authorization references.

**Technical dependency:** Upload/download interfaces, access controls, backup policies and storage-provider configuration.

**Licensing and cost:** Self-hosted storage requires infrastructure and backup capacity. Amazon S3 uses charges that depend on storage, requests, retrieval and data transfer.

**Security risks:** Unauthorized file access, malicious uploads, document leakage, insufficient backup and uncontrolled retention.

**Responsible area:** Shared platform infrastructure and relevant functional modules.

**Fallback:** Use an approved controlled storage method for the prototype. Do not commit sensitive documents to Git.

**Proposed classification:** Basic secure document handling may be required for approved MVP workflows; external storage provider remains undecided.

**Decision:** Pending mentor/client approval.

### 3.7 BIM and Construction Scheduling

**Business purpose:** Exchange project schedules, material forecasts or construction-model references.

**Potential solution:** Client-approved scheduling or BIM platform.

**Data exchanged:** Project identifiers, activity dates, material demand and approved schedule references.

**Technical dependency:** Enterprise platform API, data export format and project-identifier mapping.

**Licensing and cost:** Vendor-specific licences, subscriptions or integration charges may apply.

**Security risks:** Confidential construction schedules, project information exposure and inaccurate synchronization.

**Responsible area:** Project coordination and integration architecture.

**Fallback:** Authorized users enter material requirements and planned dates using existing system workflows.

**Proposed classification:** Outside the current core MVP unless separately approved.

**Decision:** Pending mentor/client approval.

### 3.8 Enterprise Identity Provider

**Business purpose:** Integrate AESCS authentication with an organization's existing identity-management system.

**Potential solutions:** Keycloak or an approved enterprise OpenID Connect/SAML identity provider.

**Data exchanged:** User identity claims, authentication tokens, role/group information and session metadata.

**Technical dependency:** Identity-provider configuration, supported authentication protocol, token validation and user/role mapping.

**Licensing and cost:** Keycloak is open-source, but self-hosting requires infrastructure and security maintenance. Managed enterprise identity platforms may have subscription or usage charges.

**Security risks:** Incorrect role mapping, compromised tokens, account takeover, authentication outages and overly broad permissions.

**Responsible area:** Security and platform administration.

**Fallback:** Continue using the existing AESCS authentication system with secure password handling and backend authorization.

**Proposed classification:** Later enhancement unless the client requires enterprise SSO.

**Decision:** Pending mentor/client approval.

## 4. Summary Decision Register

| Integration | Proposed MVP Position | Approval Status |
|---|---|---|
| ERP/accounting | Later enhancement | Pending |
| GPS/telematics | Later enhancement | Pending |
| Mapping/routes | Optional prototype | Pending |
| External messaging | Later enhancement | Pending |
| QR/barcode | Optional MVP capability | Pending |
| RFID | Later enhancement | Pending |
| Secure document handling | Required where approved workflows need attachments; provider undecided | Pending |
| BIM/scheduling | Outside core MVP | Pending |
| Enterprise identity provider | Later enhancement | Pending |

The QR/barcode and RFID options are assessed separately because their hardware and integration requirements differ.

## 5. Budget Evaluation

No actual project integration budget has been confirmed.

For each approved service, estimate:

**Monthly cost = subscription + usage charges + hosting + maintenance + other applicable recurring fees.**

Also record one-time hardware, setup and migration costs separately.

Before integration, the team must verify:

- The current vendor price and licensing terms.
- Expected monthly usage.
- Free-tier limits and eligibility.
- Whether payment information is required.
- Suitable cost alerts or hard usage limits, where available.
- Data residency, privacy and consent requirements.
- A fallback that does not interrupt core operations.

An unconfirmed cost must be recorded as **TBD**, not zero.

## 6. General Security Requirements

All approved integrations must:

1. Use secure backend integration boundaries where credentials or sensitive data are involved.
2. Never expose provider secrets through frontend environment variables.
3. Apply appropriate authorization and project/location scope restrictions.
4. Validate incoming third-party data.
5. Protect personal, financial and commercially sensitive information.
6. Apply timeouts, appropriate retry limits and error handling.
7. Log significant operations without exposing secrets.
8. Provide a safe fallback when third-party services fail.

## 7. Mentor and Client Decisions Required

| ID | Decision |
|---|---|
| INT-01 | Which external integrations are mandatory for the MVP? |
| INT-02 | Is any paid integration budget available? |
| INT-03 | Is live GPS tracking required for the demonstration? |
| INT-04 | Is a free or paid mapping service required? |
| INT-05 | Are SMS, WhatsApp or email notifications mandatory? |
| INT-06 | Are QR/barcode or RFID devices available? |
| INT-07 | What is the approved document-storage location? |
| INT-08 | Is an enterprise identity provider required? |
| INT-09 | Which stakeholder approves each integration and its recurring cost? |

Every decision must be recorded as Required MVP, Later Enhancement, Out of Scope or Pending, together with the approver and decision date.

## 8. Recommendation

For the initial academic MVP, prioritize complete and tested internal supply-chain workflows.

Avoid adding external subscriptions, GPS hardware or enterprise software integrations without approved requirements and funding.

Where useful, use controlled prototype data and local workflows to demonstrate the business value.

This recommendation is not a final client decision.

## 9. Verification and Review

**Documentation checks:**
- All eight SRS integration categories assessed.
- Business benefits and exchanged data recorded.
- Licensing and recurring cost models considered.
- Security and consent risks identified.
- Alternatives and fallback behavior documented.
- Unknown costs and decisions explicitly marked pending.

**Implementation status:** Assessment only. No third-party service activated.

**Peer review:** Pending.
**Mentor/client classification decisions:** Pending.
**Jira:** AESCS-182.

## 10. References

- Qorvenz Tech Software Project Requirements Specification, Sections 2.2, 6 and 12.
- `docs/decision-log.md`.
- [ERPNext Open Source](https://docs.frappe.io/erpnext/open-source)
- [Google Maps Platform Pricing](https://developers.google.com/maps/billing-and-pricing/pricing)
- [OpenStreetMap Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)
- [Twilio Sri Lanka SMS Pricing](https://www.twilio.com/en-us/sms/pricing/lk)
- [Meta WhatsApp Business Platform](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview/)
- [Amazon S3 Pricing](https://aws.amazon.com/s3/pricing/)
- [Keycloak](https://www.keycloak.org/)
- [GS1 Barcode Standards](https://ref.gs1.org/guidelines/2d-in-retail/)

*Vendor/licensing information reviewed on 21 November 2026. Recheck prices and terms before purchasing or deploying any integration.*
