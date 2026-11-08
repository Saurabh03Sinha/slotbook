# Slotbook — High-Integrity Scheduling & Booking Engine

A full-stack, transactional appointment scheduling engine built in TypeScript. Backed by PostgreSQL 16 as the single source of truth for concurrency control, advisory locks, and idempotency, guaranteeing **zero double-bookings** across distributed clients.

**Public Repository:** [https://github.com/Saurabh03Sinha/slotbook](https://github.com/Saurabh03Sinha/slotbook)

---

## Quick Start (One-Command Run)

### Prerequisites
* [Docker](https://docs.docker.com/get-docker/) & Docker Compose
* [Node.js 20+](https://nodejs.org/)

### 1. Start Database & Backend
```bash
cd slotbook-backend
docker compose up -d
npm install
npm run dev
