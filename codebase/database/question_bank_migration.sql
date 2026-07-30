-- One isolated AI-generated question bank per PDF/configuration.
-- Safe to run repeatedly. This migration does not delete or alter old tables.

create schema if not exists vlearn;

create table if not exists vlearn.pdf_question_banks (
  id uuid primary key,
  source_id uuid not null,
  lesson_title text not null,
  original_filename text not null,
  source_sha256 text not null,
  question_count integer not null check (question_count > 0),
  difficulty_mix jsonb not null,
  questions jsonb not null check (jsonb_typeof(questions) = 'array'),
  generation_mode text not null default 'gemini'
    check (generation_mode in ('gemini')),
  model_name text not null,
  created_at timestamptz not null default now(),
  check (jsonb_array_length(questions) = question_count)
);

create index if not exists pdf_question_banks_source_created_idx
  on vlearn.pdf_question_banks (source_id, created_at desc);

create index if not exists pdf_question_banks_source_hash_idx
  on vlearn.pdf_question_banks (source_sha256);
