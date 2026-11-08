cd ~/Desktop/slot-assignment

cat << 'EOF' > AI_LOG.md
# AI Usage & Engineering Log (AI_LOG.md)

This log documents how generative AI was utilized during the development of Slotbook, key prompts used, failure modes encountered, and manual architectural corrections.

---

## 1. Key Prompts & AI Architecture Assistance
* **Database & Concurrency Design:** "Design a normalized PostgreSQL 16 schema for an appointment booking engine with hosts, event types (buffers, notice, capacity), bookings, idempotency keys, and notification events. Use standard SQL with appropriate CHECK constraints and transaction-scoped advisory locks."
* **Time Zone Algorithms:** "Using Luxon, write a robust function to compute available slots across a 30-day horizon given a host's IANA time zone, guest time zone, weekly recurring windows, date overrides, and before/after buffer intervals."
* **Fastify & React Scaffolding:** Accelerated boilerplate setup for Fastify TypeScript modules, Zod validation pipelines, and Tailwind UI components.

---

## 2. Where AI Got Things Wrong & Manual Corrections
1. **Non-Transactional Concurrency Vulnerability:**
   * *Issue:* AI initially suggested checking slot capacity with a `SELECT COUNT(*)` query followed by an `INSERT`. Under high concurrent load (25 clients), this produced race conditions and allowed duplicate holds on 1-on-1 slots.
   * *Correction:* Implemented host-level serialization using `pg_advisory_xact_lock(hashtext('host:' || host_id))` inside a serialized transaction block. Overlapping holds now fail deterministically with HTTP 409 Conflict.
2. **PostgreSQL Pool Client Contention:**
   * *Issue:* AI generated availability queries that attempted to execute `client.query()` calls inside `Promise.all(...)` using a single checked-out `PoolClient`.
   * *Correction:* Refactored queries to execute sequentially inside transaction blocks and used the top-level connection pool for independent read queries.
3. **Time Zone Drift via Fixed UTC Offsets:**
   * *Issue:* AI initially converted weekly schedules (e.g. `09:00 - 17:00`) directly to fixed UTC offsets (e.g., UTC-5).
   * *Correction:* Fixed offsets fail across Daylight Saving Time shifts (e.g., EDT UTC-4 to EST UTC-5). Refactored slot computation to evaluate daily windows against the host's IANA time zone (`America/New_York`) day-by-day before projecting into UTC.
4. **Permissive Email Validation:**
   * *Issue:* Default HTML5 email inputs accepted addresses without top-level domains (e.g., `user@domain`), causing unhandled backend validation errors.
   * *Correction:* Enforced strict regex domain validation (`/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/`) with live inline UI error indicators.
5. **Host Self-Booking Safety Guardrail:**
   * *Issue:* AI allowed authenticated hosts to book slots on their own public booking pages.
   * *Correction:* Implemented a session check in `BookingPage.tsx` and `routes.ts` that locks slot buttons into a view-only state when logged in as `@alex`.
EOF

git add AI_LOG.md
git commit -m "docs: add AI_LOG.md documenting prompts and manual corrections"
git push origin main
