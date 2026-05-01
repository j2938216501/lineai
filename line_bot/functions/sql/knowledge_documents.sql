create table public.knowledge_documents (
  id bigint generated always as identity not null,
  created_at timestamp with time zone not null default now(),
  collection_id bigint not null,
  title text null,
  content text null,
  link text null,
  note text null,
  ai_note text null,
  show boolean null default true,
  constraint knowledge_documents_pkey primary key (id),
  constraint knowledge_documents_collection_id_fkey foreign KEY 
(collection_id) references knowledge_collections (id)
) TABLESPACE pg_default;