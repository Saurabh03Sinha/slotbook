# Booking engine implementation notes

- All booking state transitions (`createSlotHold`, `confirmSlotHold`, `rescheduleBookingByToken`, `cancelBookingRecord`) run inside `withHostTransactionLock(hostId, ...)`.
- `withHostTransactionLock` acquires a transaction-scoped PostgreSQL advisory lock (`pg_advisory_xact_lock(hashtext('host:' || hostId))`) and lazily expires stale holds (`status = 'held' AND hold_expires_at <= NOW()`) before evaluating slot capacity or buffer conflicts.
- Both 1-on-1 (`capacity = 1`) and group sessions (`capacity > 1`) with before/after buffers are serialized per host without Redis or external lock services.
