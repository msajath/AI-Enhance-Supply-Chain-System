# Qorvenz Tech — Local Development Environment Setup Guide

## 1. Overview
This document guides developers setting up their local workstation for:
**Qorvenz Tech – Construction Supply Chain Management & AI Automation Platform**
Sprint 1: Core Foundation.

---

## 2. Prerequisites & Software Requirements

| Tool | Recommended Version | Verification Command | Notes |
| :--- | :--- | :--- | :--- |
| **Node.js** | 20.x or 24.x LTS | `node -v` | Installed with npm |
| **npm** | 10.x or 11.x | `npm -v` | Workspace monorepo manager |
| **Git** | 2.40+ | `git --version` | Source control |
| **Docker Desktop** | Latest (v26 - v29) | `docker --version` | PostgreSQL container orchestration |
| **Docker Compose**| v2.20+ / v5.x | `docker compose version` | Included in Docker Desktop |
| **VS Code** | 1.85+ | `code --version` | Preferred IDE |

### Windows 11 Installation Notes:
- **Node.js**: Download the LTS installer from [nodejs.org](https://nodejs.org/). Ensure "Add to PATH" is checked.
- **Docker Desktop**: Download from [docker.com](https://www.docker.com/products/docker-desktop/). Enable the **WSL 2 backend** during installation. In Docker Desktop Settings > General, enable "Start Docker Desktop when you log in".
- **Git for Windows**: Download from [git-scm.com](https://git-scm.com/). Ensure Git Bash and credential manager are selected.

---

## 3. Clone and Branching Setup

```bash
# 1. Clone repository
git clone https://github.com/msajath/AI-Enhance-Supply-Chain-System.git
cd AI-Enhance-Supply-Chain-System

# 2. Verify current branch
git status
```

---

## 4. Environment Variables Configuration

Duplicate the `.env.example` template to `.env` in the project root:

```powershell
# In PowerShell (Windows)
copy .env.example .env
```

Review and adjust ports or credentials if necessary:
```env
PORT=4000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_USER=qorvenz_user
DB_PASSWORD=qorvenz_dev_secret_2026
DB_NAME=qorvenz_db
DB_SSL=false
CORS_ORIGIN=http://localhost:5173
VITE_API_BASE_URL=http://localhost:4000
```
> [!IMPORTANT]
> Never commit `.env` or credentials to GitHub. `.gitignore` is configured to prevent accidental staging.

---

## 5. Install Dependencies

Install all monorepo dependencies (`apps/web`, `apps/api`, and root workspace tools) with a single command from root:

```bash
npm install
```

---

## 6. Starting PostgreSQL (Docker)

```bash
# Start PostgreSQL container in detached mode
npm run docker:up

# Verify PostgreSQL container is healthy
docker ps

# Inspect logs if needed
npm run docker:logs

# Stop PostgreSQL container when finished
npm run docker:down
```

---

## 7. Running Database Migrations

Apply idempotent SQL migrations to create the database schema:

```bash
# Execute migrations
npm run db:migrate

# (Optional) Seed sample development data
npm run db:seed
```

---

## 8. Running the Application Locally

You can run both Backend and Frontend concurrently from the project root:

```bash
npm run dev
```

This starts:
- **Express REST API Backend**: `http://localhost:4000`
  - Health check: `http://localhost:4000/health`
  - API v1 Root: `http://localhost:4000/api/v1`
- **React Vite Frontend**: `http://localhost:5173`

To run services individually:
```bash
# Backend only
npm run dev:api

# Frontend only
npm run dev:web
```

---

## 9. Running Automated Tests & Verification

```bash
# Run all automated tests
npm run test

# Type-check TypeScript in both apps
npm run typecheck

# Run ESLint linter
npm run lint

# Build production bundles
npm run build
```

---

## 10. Troubleshooting Common Issues

### Issue 1: Docker daemon not running
- **Symptom**: `failed to connect to the docker API at npipe...`
- **Solution**: Open Docker Desktop from the Windows Start menu. Wait for the whale icon in the taskbar notification tray to become steady (green/animated). Then retry `npm run docker:up`.

### Issue 2: Port 5432 already in use
- **Symptom**: `bind: address already in use`
- **Solution**: A native Windows PostgreSQL service may be running. Either stop the Windows service via `services.msc` (`postgresql-x64-...`), or update `DB_PORT` and `POSTGRES_PORT` in `.env` to `5434`.

### Issue 3: EADDRINUSE Port 4000 or 5173
- **Symptom**: `listen EADDRINUSE: address already in use :::4000`
- **Solution**: Identify and kill the conflicting process:
  ```powershell
  Get-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess | Stop-Process -Force
  ```
