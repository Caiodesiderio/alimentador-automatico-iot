-- =====================================================================
-- Stubs do Supabase para rodar as migrations em um PostgreSQL comum
-- =====================================================================
-- NÃO rode isto no Supabase. Lá tudo isto já existe.
--
-- Este arquivo só serve para quem quiser conferir as migrations em um
-- Postgres limpo — é o que a verificação automática do repositório faz.
-- Ele cria as poucas coisas que o Supabase fornece de fábrica e que as
-- migrations esperam encontrar: os papéis `anon` e `authenticated`, a
-- publicação do Realtime, e um esqueleto mínimo do schema `storage`.
-- =====================================================================

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public to anon, authenticated;

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text,
  public boolean default false
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  created_at timestamptz default now()
);

alter table storage.objects enable row level security;

-- No Supabase esta função devolve o caminho quebrado em partes.
create or replace function storage.foldername(name text)
returns text[] language sql immutable as $$
  select string_to_array(name, '/');
$$;

grant usage on schema storage to anon, authenticated;
