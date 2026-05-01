create table public.knowledge_collections (
  id bigint generated always as identity not null,
  created_at timestamp with time zone not null default now(),
  name text null,
  description text null,
  dify_id text null,
  constraint knowledge_collections_pkey primary key (id)
) TABLESPACE pg_default;