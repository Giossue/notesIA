create table "domain"."subjects" (
  "id" uuid primary key,
  "user_id" uuid not null references "auth"."user" ("id") on delete cascade,
  "name" varchar(160) not null,
  "code" varchar(40),
  "color_token" text not null default 'primary' check ("color_token" in ('primary', 'secondary', 'tertiary')),
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now(),
  "archived_at" timestamptz,
  "deleted_at" timestamptz,
  "version" integer not null default 1 check ("version" > 0)
);

create index "subjects_user_created_idx" on "domain"."subjects"
  ("user_id", "created_at" desc, "id" desc) where "deleted_at" is null;

create unique index "subjects_user_code_active_uq" on "domain"."subjects"
  ("user_id", lower("code"))
  where "code" is not null and "archived_at" is null and "deleted_at" is null;
