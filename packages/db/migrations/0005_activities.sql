alter table "domain"."subjects"
  add constraint "subjects_user_id_id_uq" unique ("user_id", "id");

create table "domain"."activities" (
  "id" uuid primary key,
  "sort_order" bigint generated always as identity,
  "user_id" uuid not null references "auth"."user" ("id") on delete cascade,
  "subject_id" uuid,
  "kind" text not null check ("kind" in ('academic_task', 'exam', 'personal', 'routine')),
  "title" varchar(240) not null check (length(btrim("title")) > 0),
  "description" text check ("description" is null or length("description") <= 10000),
  "status" text not null default 'backlog'
    check ("status" in ('backlog', 'planned', 'in_progress', 'completed', 'cancelled')),
  "priority" text not null default 'medium'
    check ("priority" in ('low', 'medium', 'high', 'critical')),
  "start_after_at" timestamptz,
  "deadline_at" timestamptz,
  "estimated_minutes" integer check ("estimated_minutes" is null or "estimated_minutes" > 0),
  "progress_percent" smallint not null default 0
    check ("progress_percent" between 0 and 100),
  "completed_at" timestamptz,
  "archived_at" timestamptz,
  "deleted_at" timestamptz,
  "version" integer not null default 1 check ("version" > 0),
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "activities_user_id_id_uq" unique ("user_id", "id"),
  constraint "activities_subject_owner_fk" foreign key ("user_id", "subject_id")
    references "domain"."subjects" ("user_id", "id") on delete set null ("subject_id"),
  constraint "activities_time_order_ck" check (
    "start_after_at" is null or "deadline_at" is null or "deadline_at" >= "start_after_at"
  ),
  constraint "activities_completed_ck" check (
    ("status" = 'completed' and "progress_percent" = 100 and "completed_at" is not null)
    or ("status" <> 'completed' and "progress_percent" < 100 and "completed_at" is null)
  )
);

create index "activities_user_sort_idx" on "domain"."activities"
  ("user_id", "sort_order" desc) where "deleted_at" is null;
create index "activities_user_deadline_idx" on "domain"."activities"
  ("user_id", "deadline_at") where "deleted_at" is null and "archived_at" is null;
create index "activities_subject_idx" on "domain"."activities"
  ("user_id", "subject_id") where "deleted_at" is null;

create table "domain"."activity_history" (
  "id" bigint generated always as identity primary key,
  "user_id" uuid not null,
  "activity_id" uuid not null,
  "mutation_id" uuid not null,
  "event_type" text not null check ("event_type" in ('completed', 'reopened')),
  "before_status" text not null,
  "after_status" text not null,
  "before_progress" smallint not null,
  "after_progress" smallint not null,
  "created_at" timestamptz not null default now(),
  constraint "activity_history_activity_fk" foreign key ("user_id", "activity_id")
    references "domain"."activities" ("user_id", "id") on delete cascade,
  constraint "activity_history_mutation_uq" unique ("user_id", "mutation_id")
);

create index "activity_history_activity_latest_idx" on "domain"."activity_history"
  ("user_id", "activity_id", "created_at" desc);

revoke update, delete on "domain"."activity_history" from notesia_app;
