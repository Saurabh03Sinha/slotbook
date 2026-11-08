CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

DO $$ BEGIN
  CREATE TYPE "booking_status" AS ENUM ('held', 'confirmed', 'cancelled', 'expired');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "hosts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "username" varchar(100) NOT NULL UNIQUE,
  "email" varchar(320) NOT NULL UNIQUE,
  "name" varchar(160) NOT NULL,
  "time_zone" varchar(64) DEFAULT 'Asia/Kolkata' NOT NULL,
  "api_key" varchar(128) DEFAULT 'demo-host-secret-key' NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "event_types" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "host_id" uuid NOT NULL REFERENCES "hosts"("id") ON DELETE CASCADE,
  "name" varchar(160) NOT NULL,
  "slug" varchar(100) NOT NULL,
  "duration_minutes" integer NOT NULL,
  "capacity" integer DEFAULT 1 NOT NULL,
  "buffer_before_minutes" integer DEFAULT 0 NOT NULL,
  "buffer_after_minutes" integer DEFAULT 0 NOT NULL,
  "minimum_notice_minutes" integer DEFAULT 240 NOT NULL,
  "booking_horizon_days" integer DEFAULT 30 NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "event_duration_check" CHECK ("duration_minutes" BETWEEN 15 AND 120),
  CONSTRAINT "event_capacity_check" CHECK ("capacity" >= 1),
  CONSTRAINT "event_buffers_check" CHECK ("buffer_before_minutes" BETWEEN 0 AND 30 AND "buffer_after_minutes" BETWEEN 0 AND 30),
  CONSTRAINT "event_notice_check" CHECK ("minimum_notice_minutes" >= 0),
  CONSTRAINT "event_horizon_check" CHECK ("booking_horizon_days" >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS "event_types_host_slug_uq" ON "event_types" ("host_id", "slug");

CREATE TABLE IF NOT EXISTS "weekly_availability" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_type_id" uuid NOT NULL REFERENCES "event_types"("id") ON DELETE CASCADE,
  "weekday" integer NOT NULL,
  "start_time" time NOT NULL,
  "end_time" time NOT NULL,
  CONSTRAINT "weekly_weekday_check" CHECK ("weekday" BETWEEN 1 AND 7),
  CONSTRAINT "weekly_window_check" CHECK ("start_time" < "end_time")
);

CREATE INDEX IF NOT EXISTS "weekly_availability_event_day_idx" ON "weekly_availability" ("event_type_id", "weekday");

CREATE TABLE IF NOT EXISTS "date_overrides" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_type_id" uuid NOT NULL REFERENCES "event_types"("id") ON DELETE CASCADE,
  "local_date" date NOT NULL,
  "is_unavailable" boolean DEFAULT false NOT NULL,
  "start_time" time,
  "end_time" time,
  CONSTRAINT "date_override_window_check" CHECK (("is_unavailable" = true) OR ("start_time" IS NOT NULL AND "end_time" IS NOT NULL AND "start_time" < "end_time"))
);

CREATE INDEX IF NOT EXISTS "date_overrides_event_date_idx" ON "date_overrides" ("event_type_id", "local_date");

CREATE TABLE IF NOT EXISTS "bookings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "event_type_id" uuid NOT NULL REFERENCES "event_types"("id") ON DELETE CASCADE,
  "host_id" uuid NOT NULL REFERENCES "hosts"("id") ON DELETE CASCADE,
  "status" "booking_status" NOT NULL,
  "starts_at" timestamptz NOT NULL,
  "ends_at" timestamptz NOT NULL,
  "effective_starts_at" timestamptz NOT NULL,
  "effective_ends_at" timestamptz NOT NULL,
  "hold_expires_at" timestamptz,
  "guest_name" varchar(160),
  "guest_email" varchar(320),
  "manage_token" varchar(128) UNIQUE,
  "manage_token_hash" varchar(128) UNIQUE,
  "cancellation_reason" text,
  "cancelled_by" varchar(20),
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "updated_at" timestamptz DEFAULT now() NOT NULL,
  CONSTRAINT "booking_time_check" CHECK ("starts_at" < "ends_at"),
  CONSTRAINT "booking_effective_time_check" CHECK ("effective_starts_at" <= "starts_at" AND "effective_ends_at" >= "ends_at")
);

CREATE INDEX IF NOT EXISTS "bookings_event_start_idx" ON "bookings" ("event_type_id", "starts_at");
CREATE INDEX IF NOT EXISTS "bookings_active_slot_idx" ON "bookings" ("event_type_id", "starts_at", "ends_at");
CREATE INDEX IF NOT EXISTS "bookings_host_window_idx" ON "bookings" ("host_id", "effective_starts_at", "effective_ends_at");

CREATE TABLE IF NOT EXISTS "idempotency_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "key" varchar(200) NOT NULL UNIQUE,
  "request_hash" varchar(128) NOT NULL,
  "response_status" integer,
  "response_body" text,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "expires_at" timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS "notification_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "booking_id" uuid NOT NULL REFERENCES "bookings"("id") ON DELETE CASCADE,
  "event_type" varchar(40) NOT NULL,
  "payload" text NOT NULL,
  "created_at" timestamptz DEFAULT now() NOT NULL,
  "processed_at" timestamptz
);

CREATE INDEX IF NOT EXISTS "notification_events_pending_idx" ON "notification_events" ("created_at");
