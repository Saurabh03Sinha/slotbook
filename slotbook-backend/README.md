# Slotbook Backend

TypeScript + Fastify + Drizzle ORM + PostgreSQL 16 backend for the **Slotbook** take-home assignment.

## Quick Start (One-Command Run)

```bash
cp .env.example .env
docker compose up -d
npm install
npm run dev
```

When `npm run dev` starts, it automatically:
1. Applies the PostgreSQL schema migrations (`drizzle/0000_init.sql`).
2. Seeds the demo host **`alex`** (`America/New_York`, API key `demo-host-secret-key`) with two event types:
   - `intro-call`: 30-min 1-on-1 (`capacity = 1`, 10m before/after buffers, 4h minimum notice, 30d horizon)
   - `office-hours`: 60-min group session (`capacity = 3`, 0m before / 15m after buffer, 2h minimum notice, 30d horizon)
3. Starts the API server on `http://localhost:3000` (Swagger UI at `http://localhost:3000/docs` and health/metrics at `http://localhost:3000/health`).

## Run Concurrency & Lifecycle Tests (Against Real Postgres)

```bash
npm test
```

## API Endpoints Overview

### Public / Guest Minimum API
| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/hosts/:host/events/:slug/slots?from&to&tz` | List available slots in guest's IANA time zone |
| `POST` | `/api/holds` | Hold a slot for 5 minutes (requires `Idempotency-Key` header) |
| `POST` | `/api/holds/:id/confirm` | Confirm a held slot with `{ name, email }` and receive `manageToken` |
| `GET` | `/api/bookings/:token` | View booking details via private manage token |
| `GET` | `/api/bookings/:token/invite.ics` | Download RFC 5545 `.ics` calendar invite |
| `POST` | `/api/bookings/:token/reschedule` | Atomically move confirmed booking to a new `{ slotStart }` |
| `POST` | `/api/bookings/:token/cancel` | Cancel booking with optional `{ reason }` |

### Authenticated Host API (Header `x-api-key: demo-host-secret-key`)
| Method | Endpoint | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/host/me` | View authenticated host profile and IANA time zone |
| `PATCH` | `/api/host/settings` | Update host IANA `timeZone` (e.g. `Asia/Kolkata`, `America/New_York`) |
| `GET` | `/api/host/events` | List host event types |
| `POST` | `/api/host/events` | Create a new event type (duration, capacity, buffers, notice, horizon) |
| `PUT` | `/api/host/events/:slug/availability` | Replace weekly availability windows and date overrides |
| `GET` | `/api/host/bookings` | List upcoming confirmed bookings and active holds |
| `POST` | `/api/host/bookings/:id/cancel` | Cancel a booking as host with `{ reason }` |
| `GET` | `/api/notifications` | Inspect emitted notification sink events (`confirmed`, `rescheduled`, `cancelled`) |
