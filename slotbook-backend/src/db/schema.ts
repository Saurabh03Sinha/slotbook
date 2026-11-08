import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  date,
  time,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const bookingStatus = pgEnum('booking_status', [
  'held',
  'confirmed',
  'cancelled',
  'expired',
]);

export const hosts = pgTable('hosts', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 100 }).notNull().unique(),
  email: varchar('email', { length: 320 }).notNull().unique(),
  name: varchar('name', { length: 160 }).notNull(),
  timeZone: varchar('time_zone', { length: 64 }).notNull().default('Asia/Kolkata'),
  apiKey: varchar('api_key', { length: 128 }).notNull().default('demo-host-secret-key'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const eventTypes = pgTable(
  'event_types',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    hostId: uuid('host_id')
      .notNull()
      .references(() => hosts.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 160 }).notNull(),
    slug: varchar('slug', { length: 100 }).notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    capacity: integer('capacity').notNull().default(1),
    bufferBeforeMinutes: integer('buffer_before_minutes').notNull().default(0),
    bufferAfterMinutes: integer('buffer_after_minutes').notNull().default(0),
    minimumNoticeMinutes: integer('minimum_notice_minutes').notNull().default(240),
    bookingHorizonDays: integer('booking_horizon_days').notNull().default(30),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('event_types_host_slug_uq').on(t.hostId, t.slug),
    check('event_duration_check', sql`${t.durationMinutes} between 15 and 120`),
    check('event_capacity_check', sql`${t.capacity} >= 1`),
    check(
      'event_buffers_check',
      sql`${t.bufferBeforeMinutes} between 0 and 30 and ${t.bufferAfterMinutes} between 0 and 30`
    ),
    check('event_notice_check', sql`${t.minimumNoticeMinutes} >= 0`),
    check('event_horizon_check', sql`${t.bookingHorizonDays} >= 1`),
  ]
);

export const weeklyAvailability = pgTable(
  'weekly_availability',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventTypeId: uuid('event_type_id')
      .notNull()
      .references(() => eventTypes.id, { onDelete: 'cascade' }),
    weekday: integer('weekday').notNull(), // ISO-8601: Monday=1 ... Sunday=7
    startTime: time('start_time').notNull(),
    endTime: time('end_time').notNull(),
  },
  (t) => [
    index('weekly_availability_event_day_idx').on(t.eventTypeId, t.weekday),
    check('weekly_weekday_check', sql`${t.weekday} between 1 and 7`),
    check('weekly_window_check', sql`${t.startTime} < ${t.endTime}`),
  ]
);

export const dateOverrides = pgTable(
  'date_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventTypeId: uuid('event_type_id')
      .notNull()
      .references(() => eventTypes.id, { onDelete: 'cascade' }),
    localDate: date('local_date').notNull(),
    isUnavailable: boolean('is_unavailable').notNull().default(false),
    startTime: time('start_time'),
    endTime: time('end_time'),
  },
  (t) => [
    index('date_overrides_event_date_idx').on(t.eventTypeId, t.localDate),
    check(
      'date_override_window_check',
      sql`(${t.isUnavailable} = true) or (${t.startTime} is not null and ${t.endTime} is not null and ${t.startTime} < ${t.endTime})`
    ),
  ]
);

export const bookings = pgTable(
  'bookings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    eventTypeId: uuid('event_type_id')
      .notNull()
      .references(() => eventTypes.id, { onDelete: 'cascade' }),
    hostId: uuid('host_id')
      .notNull()
      .references(() => hosts.id, { onDelete: 'cascade' }),
    status: bookingStatus('status').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    effectiveStartsAt: timestamp('effective_starts_at', { withTimezone: true }).notNull(),
    effectiveEndsAt: timestamp('effective_ends_at', { withTimezone: true }).notNull(),
    holdExpiresAt: timestamp('hold_expires_at', { withTimezone: true }),
    guestName: varchar('guest_name', { length: 160 }),
    guestEmail: varchar('guest_email', { length: 320 }),
    manageToken: varchar('manage_token', { length: 128 }).unique(),
    manageTokenHash: varchar('manage_token_hash', { length: 128 }).unique(),
    cancellationReason: text('cancellation_reason'),
    cancelledBy: varchar('cancelled_by', { length: 20 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('bookings_event_start_idx').on(t.eventTypeId, t.startsAt),
    index('bookings_active_slot_idx').on(t.eventTypeId, t.startsAt, t.endsAt),
    index('bookings_host_window_idx').on(t.hostId, t.effectiveStartsAt, t.effectiveEndsAt),
    check('booking_time_check', sql`${t.startsAt} < ${t.endsAt}`),
  ]
);

export const idempotencyKeys = pgTable('idempotency_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  key: varchar('key', { length: 200 }).notNull().unique(),
  requestHash: varchar('request_hash', { length: 128 }).notNull(),
  responseStatus: integer('response_status'),
  responseBody: text('response_body'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

export const notificationEvents = pgTable(
  'notification_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    eventType: varchar('event_type', { length: 40 }).notNull(),
    payload: text('payload').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [index('notification_events_pending_idx').on(t.createdAt)]
);
