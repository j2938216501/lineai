-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.line_files (
  id bigint NOT NULL DEFAULT nextval('line_files_id_seq'::regclass),
  message_id text NOT NULL UNIQUE,
  message_type text NOT NULL CHECK (message_type = ANY (ARRAY['image'::text, 'video'::text, 'audio'::text, 'file'::text])),
  source_type text NOT NULL CHECK (source_type = ANY (ARRAY['user'::text, 'group'::text, 'room'::text])),
  source_id text NOT NULL,
  original_file_name text,
  storage_path text NOT NULL,
  file_size bigint NOT NULL,
  content_type text NOT NULL,
  download_url text NOT NULL,
  duration integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  metadata jsonb DEFAULT '{}'::jsonb,
  embedding USER-DEFINED,
  note text,
  CONSTRAINT line_files_pkey PRIMARY KEY (id)
);