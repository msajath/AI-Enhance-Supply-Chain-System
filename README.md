# Qorvenz Tech — Construction Supply Chain Management & AI Automation Platform

![Sprint 1](https://img.shields.io/badge/Sprint-1%20Core%20Foundation-blue.svg)
![React](https://img.shields.io/badge/Frontend-React%2018%20%7C%20Vite%20%7C%20TypeScript-61DAFB.svg)
![Node](https://img.shields.io/badge/Backend-Node.js%20%7C%20Express%20%7C%20TypeScript-339933.svg)
![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL%2016-4169E1.svg)
![Docker](https://img.shields.io/badge/DevOps-Docker%20Compose-2496ED.svg)

An industrial-grade construction supply chain management and automated intelligence platform developed by **Qorvenz Tech**.

---

## 🏗️ Project Architecture Overview

```text
AI-Enhance-Supply-Chain-System/
├── apps/
│   ├── web/                    # React 18 + Vite + TypeScript Frontend (Port 5173)
│   │   ├── src/
│   │   │   ├── components/     # UI Components & Telemetry Widgets
│   │   │   ├── pages/          # Application Pages (Dashboard, Health, etc.)
│   │   │   ├── layouts/        # App Shell Layouts
│   │   │   ├── routes/         # React Router Definitions
│   │   │   ├── services/       # Reusable Axios API Client
│   │   │   ├── hooks/          # Custom React Hooks (useHealth, etc.)
│   │   │   └── types/          # Shared Frontend Type Definitions
│   │   └── package.json
│   │
│   └── api/                    # Express + TypeScript REST API Backend (Port 4000)
│       ├── src/
│       │   ├── config/         # Environment Schema & PostgreSQL Pool
│       │   ├── middleware/     # Error Handler, Request Logger, Zod Validator
│       │   ├── modules/        # Domain Business Modules (Sprint 1-4)
│       │   ├── routes/         # Health & API Routing
│       │   ├── utils/          # Standard Response Envelopes & AppError
│       │   └── main.ts         # Server Entry Point & Graceful Shutdown
│       ├── tests/              # Vitest & Supertest Integration Tests
│       └── package.json
│
├── database/
│   ├── migrations/             # Idempotent Versioned SQL Migrations
│   └── seeds/                  # Development Sample Seeds
├── docs/
│   ├── DEVELOPMENT_SETUP.md    # Local Setup & Prerequisites
│   ├── TEAM_WORKFLOW.md        # Gitflow, Branching & 4-Member Roles
│   └── ENVIRONMENT_VERIFICATION.md # Test Matrix & Verification Log
├── scripts/                    # Migration & Seeding CLI Runners
├── .github/workflows/          # GitHub Actions CI Automation
├── .vscode/                    # Shared Settings, Recommended Extensions, Launch Tasks
├── .env.example                # Safe Environment Variables Template
├── docker-compose.yml          # Local PostgreSQL Container Specification
└── package.json                # Monorepo Workspace Root
```

---

## 👥 Four-Member Team Module Responsibilities

| Member | Domain Scope | Git Branch Namespace |
| :--- | :--- | :--- |
| **Member 1** | Authentication, Organization Master, Procurement, Supplier Management | `feature/member1-*` |
| **Member 2** | Material Master (BOM), Warehouses, Inventory, Stock Ledger | `feature/member2-*` |
| **Member 3** | Fleet & Heavy Equipment, Transportation Dispatch, Delivery Tracking | `feature/member3-*` |
| **Member 4** | Executive Reporting, AI Orchestration Layer, CI/CD DevOps, Integration | `feature/member4-*` |

---

## ⚡ Quick Start Guide

### 1. Configure Environment
```bash
# Copy template to .env
copy .env.example .env
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Start PostgreSQL Database (Docker)
```bash
npm run docker:up
```

### 4. Run Schema Migrations
```bash
npm run db:migrate
```

### 5. Launch Full Stack (API + Web)
```bash
npm run dev
```
- **Web Dashboard**: [http://localhost:5173](http://localhost:5173)
- **API Health Check**: [http://localhost:4000/health](http://localhost:4000/health)
- **API v1 Base**: [http://localhost:4000/api/v1](http://localhost:4000/api/v1)

---

## 🧪 Testing and Quality Control

```bash
# Run all automated tests
npm run test

# Type-check TypeScript code
npm run typecheck

# Check code formatting & linting
npm run lint

# Build production bundles
npm run build
```

---

## 📖 Extended Documentation
- [Development Environment Setup](docs/DEVELOPMENT_SETUP.md)
- [Team Git & Collaboration Workflow](docs/TEAM_WORKFLOW.md)
- [Environment Verification Results](docs/ENVIRONMENT_VERIFICATION.md)
