alter table "domain"."subjects"
  add column "sort_order" bigint generated always as identity;

create unique index "subjects_sort_order_uq" on "domain"."subjects" ("sort_order");
create index "subjects_user_sort_idx" on "domain"."subjects"
  ("user_id", "sort_order" desc) where "deleted_at" is null;
