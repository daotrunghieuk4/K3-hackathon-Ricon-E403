-- Persistent quiz attempts and AI/rule-based improvement suggestions.
-- Safe to run repeatedly. Existing question banks are not changed.

create schema if not exists vlearn;

create table if not exists vlearn.quiz_attempts (
  id uuid primary key,
  question_bank_id uuid references vlearn.pdf_question_banks(id) on delete set null,
  learner_key uuid not null,
  learner_name text not null,
  lesson_title text not null,
  difficulty text not null,
  correct_count integer not null check (correct_count >= 0),
  total_count integer not null check (total_count > 0),
  score_pct numeric(5, 2) not null check (score_pct between 0 and 100),
  missed_topics jsonb not null default '[]'::jsonb
    check (jsonb_typeof(missed_topics) = 'array'),
  improvement_suggestions jsonb not null default '{}'::jsonb
    check (jsonb_typeof(improvement_suggestions) = 'object'),
  adaptive_analysis jsonb not null default '{}'::jsonb
    check (jsonb_typeof(adaptive_analysis) = 'object'),
  analysis_mode text not null,
  created_at timestamptz not null default now()
);

create index if not exists quiz_attempts_learner_created_idx
  on vlearn.quiz_attempts (learner_key, created_at desc);

create index if not exists quiz_attempts_question_bank_idx
  on vlearn.quiz_attempts (question_bank_id)
  where question_bank_id is not null;

create index if not exists quiz_attempts_created_idx
  on vlearn.quiz_attempts (created_at desc);
