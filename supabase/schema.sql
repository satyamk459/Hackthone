create extension if not exists pgcrypto;
create extension if not exists vector;

create type public.processing_status as enum ('uploaded', 'queued', 'processing', 'extracting', 'analyzing', 'indexing', 'completed', 'failed', 'needs_retry');
create type public.chat_role as enum ('user', 'assistant');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  insurer_name text,
  policy_name text,
  policy_number text,
  policy_type text,
  status public.processing_status not null default 'uploaded',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  version_label text,
  effective_from date,
  effective_to date,
  created_at timestamptz not null default now()
);

create table public.policy_documents (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  version_id uuid not null references public.policy_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null,
  processing_status public.processing_status not null default 'uploaded',
  processing_error text,
  uploaded_at timestamptz not null default now(),
  processed_at timestamptz
);

create table public.policy_analysis (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  version_id uuid not null references public.policy_versions(id) on delete cascade,
  analysis_json jsonb not null default '{}'::jsonb,
  model_name text,
  analysis_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (policy_id, version_id)
);

create table public.policy_chunks (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.policies(id) on delete cascade,
  version_id uuid not null references public.policy_versions(id) on delete cascade,
  page_number integer,
  section_title text,
  content text not null,
  embedding vector(768),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid not null references public.policies(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.chat_role not null,
  content text not null,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid not null references public.policies(id) on delete cascade,
  claim_number text,
  hospital_name text,
  treatment text,
  claim_amount numeric(14,2),
  status text not null default 'User-entered status',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.activity_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  policy_id uuid not null references public.policies(id) on delete cascade,
  event_type text not null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index policy_chunks_embedding_idx on public.policy_chunks using hnsw (embedding vector_cosine_ops);
create index policies_user_id_idx on public.policies(user_id);
create index policy_documents_user_id_idx on public.policy_documents(user_id);

alter table public.profiles enable row level security;
alter table public.policies enable row level security;
alter table public.policy_versions enable row level security;
alter table public.policy_documents enable row level security;
alter table public.policy_analysis enable row level security;
alter table public.policy_chunks enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.chat_messages enable row level security;
alter table public.claims enable row level security;
alter table public.activity_history enable row level security;

create policy "profiles are private" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "users own policies" on public.policies for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users own versions" on public.policy_versions for all using (exists (select 1 from public.policies p where p.id = policy_id and p.user_id = auth.uid())) with check (exists (select 1 from public.policies p where p.id = policy_id and p.user_id = auth.uid()));
create policy "users own documents" on public.policy_documents for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users own analysis" on public.policy_analysis for all using (exists (select 1 from public.policies p where p.id = policy_id and p.user_id = auth.uid())) with check (exists (select 1 from public.policies p where p.id = policy_id and p.user_id = auth.uid()));
create policy "users own chunks" on public.policy_chunks for all using (exists (select 1 from public.policies p where p.id = policy_id and p.user_id = auth.uid())) with check (exists (select 1 from public.policies p where p.id = policy_id and p.user_id = auth.uid()));
create policy "users own chat sessions" on public.chat_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users own chat messages" on public.chat_messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users own claims" on public.claims for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "users own history" on public.activity_history for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public) values ('insurance-documents', 'insurance-documents', false) on conflict (id) do nothing;
create policy "users can read own documents" on storage.objects for select using (bucket_id = 'insurance-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users can upload own documents" on storage.objects for insert with check (bucket_id = 'insurance-documents' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "users can delete own documents" on storage.objects for delete using (bucket_id = 'insurance-documents' and (storage.foldername(name))[1] = auth.uid()::text);
