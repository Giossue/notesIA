create schema if not exists "auth";

create table "auth"."user" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "name" text not null, "email" text not null unique, "emailVerified" boolean not null, "image" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create table "auth"."account" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "accountId" text not null, "providerId" text not null, "userId" uuid not null references "auth"."user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, "scope" text, "password" text, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz not null);

create table "auth"."verification" ("id" uuid default pg_catalog.gen_random_uuid() not null primary key, "identifier" text not null, "value" text not null, "expiresAt" timestamptz not null, "createdAt" timestamptz default CURRENT_TIMESTAMP not null, "updatedAt" timestamptz default CURRENT_TIMESTAMP not null);

create index "account_userId_idx" on "auth"."account" ("userId");

create index "verification_identifier_idx" on "auth"."verification" ("identifier");

-- Better Auth stores revocable sessions in secondaryStorage. Keys are HMACs and
-- values are AES-256-GCM ciphertext, including its active-session references.
create table "auth"."secure_store" (
  "key_hash" bytea primary key,
  "payload" bytea,
  "expires_at" timestamptz,
  "counter" integer not null default 0
);

create index "secure_store_expires_at_idx" on "auth"."secure_store" ("expires_at");

grant usage on schema "auth" to notesia_app;
grant select, insert, update, delete on all tables in schema "auth" to notesia_app;
alter default privileges for role postgres in schema "auth"
  grant select, insert, update, delete on tables to notesia_app;
