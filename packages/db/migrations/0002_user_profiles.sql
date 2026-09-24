create schema "domain";

create table "domain"."user_profiles" (
  "user_id" uuid primary key references "auth"."user" ("id") on delete cascade,
  "display_name" text not null,
  "language" text not null default 'es' check ("language" in ('es', 'en')),
  "time_zone" text not null default 'Etc/UTC',
  "version" integer not null default 1 check ("version" > 0),
  "created_at" timestamptz not null default now(),
  "updated_at" timestamptz not null default now()
);

insert into "domain"."user_profiles" ("user_id", "display_name")
select "id", "name" from "auth"."user";

create function "domain"."create_user_profile"() returns trigger language plpgsql as $$
begin
  insert into "domain"."user_profiles" ("user_id", "display_name") values (new."id", new."name");
  return new;
end;
$$;

create trigger "auth_user_profile_created"
after insert on "auth"."user"
for each row execute function "domain"."create_user_profile"();

grant usage on schema "domain" to notesia_app;
grant select, insert, update, delete on all tables in schema "domain" to notesia_app;
alter default privileges for role postgres in schema "domain"
  grant select, insert, update, delete on tables to notesia_app;
