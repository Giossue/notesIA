create table "domain"."subtasks" (
  "id" uuid primary key,
  "sort_order" bigint generated always as identity,
  "user_id" uuid not null,
  "activity_id" uuid not null,
  "title" varchar(240) not null check (length(btrim("title")) > 0),
  "estimated_minutes" integer check (
    "estimated_minutes" is null or "estimated_minutes" between 1 and 525600
  ),
  "is_completed" boolean not null default false,
  "completed_at" timestamptz,
  "archived_at" timestamptz,
  "last_mutation_id" uuid,
  "version" integer not null default 1 check ("version" > 0),
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  constraint "subtasks_activity_owner_fk" foreign key ("user_id", "activity_id")
    references "domain"."activities" ("user_id", "id") on delete cascade,
  constraint "subtasks_completion_ck" check (
    ("is_completed" and "completed_at" is not null)
    or (not "is_completed" and "completed_at" is null)
  )
);

create index "subtasks_activity_order_idx" on "domain"."subtasks"
  ("user_id", "activity_id", "sort_order");
