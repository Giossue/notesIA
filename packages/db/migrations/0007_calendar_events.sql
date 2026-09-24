create table "domain"."calendar_events" (
  "id" uuid primary key,
  "sort_order" bigint generated always as identity,
  "user_id" uuid not null references "auth"."user" ("id") on delete cascade,
  "subject_id" uuid,
  "kind" text not null check (
    "kind" in ('class', 'work', 'appointment', 'personal', 'unavailable', 'other')
  ),
  "title" varchar(200) not null check (length(btrim("title")) > 0),
  "description" text check ("description" is null or length("description") <= 10000),
  "starts_at" timestamptz not null,
  "ends_at" timestamptz not null,
  "time_zone" varchar(64) not null,
  "is_locked" boolean not null default true,
  "source" text not null default 'manual' check ("source" = 'manual'),
  "archived_at" timestamptz,
  "last_mutation_id" uuid,
  "version" integer not null default 1 check ("version" > 0),
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "calendar_events_user_id_id_uq" unique ("user_id", "id"),
  constraint "calendar_events_subject_owner_fk" foreign key ("user_id", "subject_id")
    references "domain"."subjects" ("user_id", "id") on delete set null ("subject_id"),
  constraint "calendar_events_time_order_ck" check ("ends_at" > "starts_at")
);

create index "calendar_events_user_sort_idx" on "domain"."calendar_events"
  ("user_id", "sort_order" desc);
create index "calendar_events_user_start_idx" on "domain"."calendar_events"
  ("user_id", "starts_at", "id") where "archived_at" is null;
create index "calendar_events_user_end_idx" on "domain"."calendar_events"
  ("user_id", "ends_at") where "archived_at" is null;
