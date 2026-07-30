-- VLearn Quiz Agent - PostgreSQL schema
-- Scope:
--   - Two product roles: admin (instructor) and user (student)
--   - PDF upload, text extraction by page, LLM question generation
--   - Admin review/publish workflow
--   - Student practice/assigned quizzes, grading, history and knowledge gaps
--   - No vector embeddings
--
-- PostgreSQL 15+ is recommended.
-- Fresh-install schema: use a migration instead when upgrading a database that
-- already contains data.

begin;

create schema if not exists vlearn;
set search_path to vlearn, public;

-- ============================================================================
-- 1. USERS, CLASSES AND ENROLLMENT
-- ============================================================================

create table app_users (
  id bigint generated always as identity primary key,
  auth_subject text not null unique,
  email text not null,
  full_name text not null,
  role text not null check (role in ('admin', 'user')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index app_users_email_lower_uidx
  on app_users (lower(email));

create table classrooms (
  id bigint generated always as identity primary key,
  name text not null,
  description text,
  owner_admin_id bigint not null references app_users(id),
  status text not null default 'active'
    check (status in ('active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index classrooms_owner_admin_id_idx
  on classrooms (owner_admin_id);

create table classroom_enrollments (
  classroom_id bigint not null references classrooms(id) on delete cascade,
  student_id bigint not null references app_users(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  status text not null default 'active'
    check (status in ('active', 'inactive')),
  primary key (classroom_id, student_id)
);

create index classroom_enrollments_student_id_idx
  on classroom_enrollments (student_id, status);

-- ============================================================================
-- 2. LEARNING MATERIALS
-- PDF binaries belong in private object storage. Only metadata and extracted
-- text are stored in PostgreSQL.
-- ============================================================================

create table documents (
  id bigint generated always as identity primary key,
  classroom_id bigint not null references classrooms(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'draft'
    check (status in ('draft', 'processing', 'ready', 'failed', 'archived')),
  is_visible_to_students boolean not null default false,
  created_by bigint not null references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_classroom_status_idx
  on documents (classroom_id, status, created_at desc);

create index documents_created_by_idx
  on documents (created_by);

create table document_versions (
  id bigint generated always as identity primary key,
  document_id bigint not null references documents(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  storage_path text not null,
  original_filename text not null,
  mime_type text not null default 'application/pdf',
  file_size_bytes bigint not null check (file_size_bytes >= 0),
  file_sha256 text not null,
  page_count integer check (page_count > 0),
  extraction_status text not null default 'pending'
    check (extraction_status in ('pending', 'processing', 'completed', 'failed')),
  extraction_error text,
  is_current boolean not null default true,
  created_by bigint not null references app_users(id),
  created_at timestamptz not null default now(),
  unique (document_id, version_number),
  unique (document_id, file_sha256)
);

create unique index document_versions_one_current_uidx
  on document_versions (document_id)
  where is_current;

create index document_versions_created_by_idx
  on document_versions (created_by);

create table document_pages (
  id bigint generated always as identity primary key,
  document_version_id bigint not null
    references document_versions(id) on delete cascade,
  page_number integer not null check (page_number > 0),
  extracted_text text not null,
  extraction_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (document_version_id, page_number)
);

-- ============================================================================
-- 3. TOPICS, PROMPTS, GUARDRAILS AND PROVIDER CONFIGURATION
-- ============================================================================

create table topics (
  id bigint generated always as identity primary key,
  classroom_id bigint not null references classrooms(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  unique (classroom_id, name)
);

create table prompt_templates (
  id bigint generated always as identity primary key,
  classroom_id bigint references classrooms(id) on delete cascade,
  prompt_type text not null
    check (prompt_type in (
      'question_generation',
      'short_answer_grading',
      'feedback_generation'
    )),
  name text not null,
  version integer not null check (version > 0),
  system_prompt text not null,
  user_prompt_template text not null,
  output_schema jsonb not null default '{}'::jsonb,
  default_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default false,
  created_by bigint not null references app_users(id),
  created_at timestamptz not null default now()
);

-- COALESCE makes NULL classroom_id behave as one shared "system" scope.
create unique index prompt_templates_scope_type_version_uidx
  on prompt_templates (
    coalesce(classroom_id, 0),
    prompt_type,
    version
  );

create unique index prompt_templates_one_active_uidx
  on prompt_templates (
    coalesce(classroom_id, 0),
    prompt_type
  )
  where is_active;

create index prompt_templates_created_by_idx
  on prompt_templates (created_by);

-- The expression indexes above enforce scoped uniqueness, but PostgreSQL
-- cannot use them efficiently for the classroom_id foreign-key lookup.
create index prompt_templates_classroom_id_idx
  on prompt_templates (classroom_id)
  where classroom_id is not null;

create table guardrail_rules (
  id bigint generated always as identity primary key,
  classroom_id bigint references classrooms(id) on delete cascade,
  name text not null,
  rule_type text not null
    check (rule_type in (
      'grounding',
      'content_safety',
      'output_validation',
      'difficulty',
      'grading'
    )),
  instruction text not null,
  config jsonb not null default '{}'::jsonb,
  priority integer not null default 100,
  is_active boolean not null default true,
  created_by bigint not null references app_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index guardrail_rules_scope_active_idx
  on guardrail_rules (classroom_id, is_active, priority);

create index guardrail_rules_created_by_idx
  on guardrail_rules (created_by);

-- secret_reference points to a server-side secret manager or vault entry.
-- Never store or return the raw API key from this table.
create table ai_provider_configs (
  id bigint generated always as identity primary key,
  owner_admin_id bigint not null references app_users(id) on delete cascade,
  provider text not null check (provider in ('gemini', 'openai', 'anthropic', 'other')),
  model_name text not null,
  secret_reference text not null,
  masked_key_hint text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_admin_id, provider)
);

-- ============================================================================
-- 4. QUESTION GENERATION AND ADMIN REVIEW
-- ============================================================================

create table question_sets (
  id bigint generated always as identity primary key,
  classroom_id bigint not null references classrooms(id) on delete cascade,
  document_version_id bigint not null references document_versions(id),
  title text not null,
  set_type text not null default 'admin_generated'
    check (set_type in ('admin_generated', 'student_practice')),
  status text not null default 'generating'
    check (status in (
      'generating',
      'draft',
      'pending_review',
      'approved',
      'rejected',
      'failed'
    )),
  generation_config jsonb not null default '{}'::jsonb,
  created_by bigint not null references app_users(id),
  reviewed_by bigint references app_users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (reviewed_at is null and reviewed_by is null)
    or
    (reviewed_at is not null and reviewed_by is not null)
  ),
  check (
    set_type = 'student_practice'
    or (
      status in ('approved', 'rejected')
      and reviewed_at is not null
      and reviewed_by is not null
    )
    or (
      status not in ('approved', 'rejected')
      and reviewed_at is null
      and reviewed_by is null
    )
  )
);

create index question_sets_classroom_status_idx
  on question_sets (classroom_id, status, created_at desc);

create index question_sets_document_version_id_idx
  on question_sets (document_version_id);

create index question_sets_created_by_idx
  on question_sets (created_by, created_at desc);

create index question_sets_reviewed_by_idx
  on question_sets (reviewed_by)
  where reviewed_by is not null;

create table ai_runs (
  id bigint generated always as identity primary key,
  classroom_id bigint not null references classrooms(id) on delete cascade,
  run_type text not null
    check (run_type in (
      'pdf_extraction',
      'question_generation',
      'short_answer_grading',
      'feedback_generation'
    )),
  initiated_by bigint not null references app_users(id),
  document_version_id bigint references document_versions(id),
  question_set_id bigint references question_sets(id) on delete set null,
  prompt_template_id bigint references prompt_templates(id),
  provider_config_id bigint references ai_provider_configs(id),
  model_name text not null,
  prompt_version text,
  request_config jsonb not null default '{}'::jsonb,
  raw_output jsonb,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed')),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost numeric(12, 6)
    check (estimated_cost is null or estimated_cost >= 0),
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index ai_runs_classroom_type_created_idx
  on ai_runs (classroom_id, run_type, created_at desc);

create index ai_runs_pending_idx
  on ai_runs (created_at)
  where status in ('queued', 'running');

create index ai_runs_initiated_by_idx
  on ai_runs (initiated_by, created_at desc);

create index ai_runs_document_version_id_idx
  on ai_runs (document_version_id)
  where document_version_id is not null;

create index ai_runs_question_set_id_idx
  on ai_runs (question_set_id)
  where question_set_id is not null;

create index ai_runs_prompt_template_id_idx
  on ai_runs (prompt_template_id)
  where prompt_template_id is not null;

create index ai_runs_provider_config_id_idx
  on ai_runs (provider_config_id)
  where provider_config_id is not null;

create table questions (
  id bigint generated always as identity primary key,
  question_set_id bigint not null references question_sets(id) on delete cascade,
  topic_id bigint references topics(id) on delete set null,
  source_ai_run_id bigint references ai_runs(id) on delete set null,
  question_type text not null
    check (question_type in (
      'single_choice',
      'multiple_choice',
      'short_answer',
      'essay'
    )),
  difficulty text not null
    check (difficulty in ('easy', 'medium', 'hard')),
  content text not null,
  answer_key_text text,
  explanation text,
  grading_rubric jsonb not null default '{}'::jsonb,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'rejected')),
  display_order integer not null check (display_order > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_set_id, display_order)
);

create index questions_topic_id_idx
  on questions (topic_id);

create index questions_source_ai_run_id_idx
  on questions (source_ai_run_id)
  where source_ai_run_id is not null;

create index questions_set_status_difficulty_idx
  on questions (question_set_id, status, difficulty);

create table question_options (
  id bigint generated always as identity primary key,
  question_id bigint not null references questions(id) on delete cascade,
  content text not null,
  is_correct boolean not null default false,
  explanation text,
  display_order integer not null check (display_order > 0),
  unique (question_id, display_order)
);

create table question_sources (
  question_id bigint not null references questions(id) on delete cascade,
  document_page_id bigint not null references document_pages(id),
  source_quote text,
  relevance_note text,
  primary key (question_id, document_page_id)
);

create index question_sources_document_page_id_idx
  on question_sources (document_page_id);

-- ============================================================================
-- 5. PUBLISHED/PRACTICE QUIZZES
-- ============================================================================

create table quizzes (
  id bigint generated always as identity primary key,
  classroom_id bigint not null references classrooms(id) on delete cascade,
  title text not null,
  description text,
  quiz_type text not null
    check (quiz_type in ('assigned', 'practice')),
  status text not null default 'draft'
    check (status in ('draft', 'published', 'closed', 'archived')),
  created_by bigint not null references app_users(id),
  owner_student_id bigint references app_users(id) on delete cascade,
  opens_at timestamptz,
  closes_at timestamptz,
  attempts_allowed integer not null default 1 check (attempts_allowed > 0),
  show_answers_after_submission boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (closes_at is null or opens_at is null or closes_at > opens_at),
  check (
    (quiz_type = 'practice' and owner_student_id is not null)
    or
    (quiz_type = 'assigned' and owner_student_id is null)
  )
);

create index quizzes_classroom_status_idx
  on quizzes (classroom_id, status, created_at desc);

create index quizzes_created_by_idx
  on quizzes (created_by);

create index quizzes_owner_student_idx
  on quizzes (owner_student_id, created_at desc)
  where owner_student_id is not null;

create table quiz_questions (
  quiz_id bigint not null references quizzes(id) on delete cascade,
  question_id bigint not null references questions(id),
  display_order integer not null check (display_order > 0),
  points numeric(8, 2) not null default 1 check (points > 0),
  primary key (quiz_id, question_id),
  unique (quiz_id, display_order)
);

create index quiz_questions_question_id_idx
  on quiz_questions (question_id);

-- ============================================================================
-- 6. ATTEMPTS, RESPONSES AND GRADING
-- ============================================================================

create table quiz_attempts (
  id bigint generated always as identity primary key,
  quiz_id bigint not null references quizzes(id) on delete cascade,
  student_id bigint not null references app_users(id) on delete cascade,
  attempt_number integer not null check (attempt_number > 0),
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'grading', 'graded')),
  started_at timestamptz not null default now(),
  submitted_at timestamptz,
  graded_at timestamptz,
  total_score numeric(10, 2),
  max_score numeric(10, 2),
  unique (quiz_id, student_id, attempt_number),
  check (submitted_at is null or submitted_at >= started_at),
  check (graded_at is null or (submitted_at is not null and graded_at >= submitted_at)),
  check (total_score is null or total_score >= 0),
  check (max_score is null or max_score > 0),
  check (total_score is null or max_score is null or total_score <= max_score),
  check (
    (status = 'in_progress' and submitted_at is null and graded_at is null)
    or
    (
      status in ('submitted', 'grading')
      and submitted_at is not null
      and graded_at is null
    )
    or
    (
      status = 'graded'
      and submitted_at is not null
      and graded_at is not null
      and total_score is not null
      and max_score is not null
    )
  )
);

create index quiz_attempts_student_created_idx
  on quiz_attempts (student_id, started_at desc);

create index quiz_attempts_quiz_status_idx
  on quiz_attempts (quiz_id, status);

create table quiz_responses (
  id bigint generated always as identity primary key,
  attempt_id bigint not null references quiz_attempts(id) on delete cascade,
  question_id bigint not null references questions(id),
  answer_text text,
  auto_score numeric(8, 2),
  final_score numeric(8, 2),
  max_score numeric(8, 2) not null check (max_score > 0),
  grading_status text not null default 'pending'
    check (grading_status in (
      'pending',
      'auto_graded',
      'needs_review',
      'human_graded'
    )),
  grader_feedback text,
  answered_at timestamptz not null default now(),
  unique (attempt_id, question_id),
  check (auto_score is null or (auto_score >= 0 and auto_score <= max_score)),
  check (final_score is null or (final_score >= 0 and final_score <= max_score))
);

create index quiz_responses_question_id_idx
  on quiz_responses (question_id);

create index quiz_responses_needs_review_idx
  on quiz_responses (answered_at)
  where grading_status = 'needs_review';

create table response_selected_options (
  response_id bigint not null references quiz_responses(id) on delete cascade,
  option_id bigint not null references question_options(id),
  primary key (response_id, option_id)
);

create index response_selected_options_option_id_idx
  on response_selected_options (option_id);

create table grading_runs (
  id bigint generated always as identity primary key,
  response_id bigint not null references quiz_responses(id) on delete cascade,
  ai_run_id bigint references ai_runs(id) on delete set null,
  proposed_score numeric(8, 2) not null check (proposed_score >= 0),
  confidence numeric(5, 4)
    check (confidence is null or (confidence >= 0 and confidence <= 1)),
  rationale text,
  reviewed_by bigint references app_users(id),
  review_action text
    check (review_action is null or review_action in ('accepted', 'overridden')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (reviewed_at is null and reviewed_by is null and review_action is null)
    or
    (reviewed_at is not null and reviewed_by is not null and review_action is not null)
  )
);

create index grading_runs_response_created_idx
  on grading_runs (response_id, created_at desc);

create index grading_runs_ai_run_id_idx
  on grading_runs (ai_run_id)
  where ai_run_id is not null;

create index grading_runs_reviewed_by_idx
  on grading_runs (reviewed_by)
  where reviewed_by is not null;

-- ============================================================================
-- 7. AUDIT LOG
-- ============================================================================

create table audit_logs (
  id bigint generated always as identity primary key,
  actor_id bigint references app_users(id) on delete set null,
  classroom_id bigint references classrooms(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id bigint,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_classroom_created_idx
  on audit_logs (classroom_id, created_at desc);

create index audit_logs_actor_created_idx
  on audit_logs (actor_id, created_at desc);

-- ============================================================================
-- 8. CONSISTENCY TRIGGERS
-- ============================================================================

create function set_updated_at()
returns trigger
language plpgsql
set search_path = vlearn, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger app_users_set_updated_at
before update on app_users
for each row execute function set_updated_at();

create trigger classrooms_set_updated_at
before update on classrooms
for each row execute function set_updated_at();

create trigger documents_set_updated_at
before update on documents
for each row execute function set_updated_at();

create trigger guardrail_rules_set_updated_at
before update on guardrail_rules
for each row execute function set_updated_at();

create trigger ai_provider_configs_set_updated_at
before update on ai_provider_configs
for each row execute function set_updated_at();

create trigger question_sets_set_updated_at
before update on question_sets
for each row execute function set_updated_at();

create trigger questions_set_updated_at
before update on questions
for each row execute function set_updated_at();

create trigger quizzes_set_updated_at
before update on quizzes
for each row execute function set_updated_at();

-- PostgreSQL CHECK constraints cannot inspect another table. The following
-- trigger functions enforce role, tenant and workflow invariants that span
-- multiple relations.
create function require_active_user_role(
  target_user_id bigint,
  expected_role text,
  field_name text
)
returns void
language plpgsql
set search_path = vlearn, pg_temp
as $$
declare
  target_role text;
  target_is_active boolean;
begin
  select role, is_active
  into target_role, target_is_active
  from app_users
  where id = target_user_id;

  if not found then
    return; -- The foreign key reports the missing user.
  end if;

  if not target_is_active then
    raise exception '% must reference an active user', field_name
      using errcode = '23514';
  end if;

  if expected_role is not null and target_role <> expected_role then
    raise exception '% must reference an active %', field_name, expected_role
      using errcode = '23514';
  end if;
end;
$$;

create function enforce_vlearn_user_roles()
returns trigger
language plpgsql
set search_path = vlearn, pg_temp
as $$
begin
  if tg_table_name = 'classrooms' then
    perform require_active_user_role(
      new.owner_admin_id, 'admin', 'classrooms.owner_admin_id'
    );
  elsif tg_table_name = 'classroom_enrollments' then
    perform require_active_user_role(
      new.student_id, 'user', 'classroom_enrollments.student_id'
    );
  elsif tg_table_name in (
    'documents',
    'document_versions',
    'prompt_templates',
    'guardrail_rules'
  ) then
    perform require_active_user_role(
      new.created_by, 'admin', tg_table_name || '.created_by'
    );
  elsif tg_table_name = 'ai_provider_configs' then
    perform require_active_user_role(
      new.owner_admin_id, 'admin', 'ai_provider_configs.owner_admin_id'
    );
  elsif tg_table_name = 'question_sets' then
    perform require_active_user_role(
      new.created_by,
      case when new.set_type = 'admin_generated' then 'admin' else 'user' end,
      'question_sets.created_by'
    );
    if new.reviewed_by is not null then
      perform require_active_user_role(
        new.reviewed_by, 'admin', 'question_sets.reviewed_by'
      );
    end if;
  elsif tg_table_name = 'ai_runs' then
    perform require_active_user_role(
      new.initiated_by, null, 'ai_runs.initiated_by'
    );
  elsif tg_table_name = 'quizzes' then
    perform require_active_user_role(
      new.created_by,
      case when new.quiz_type = 'assigned' then 'admin' else 'user' end,
      'quizzes.created_by'
    );
    if new.owner_student_id is not null then
      perform require_active_user_role(
        new.owner_student_id, 'user', 'quizzes.owner_student_id'
      );
    end if;
  elsif tg_table_name = 'quiz_attempts' then
    perform require_active_user_role(
      new.student_id, 'user', 'quiz_attempts.student_id'
    );
  elsif tg_table_name = 'grading_runs' then
    if new.reviewed_by is not null then
      perform require_active_user_role(
        new.reviewed_by, 'admin', 'grading_runs.reviewed_by'
      );
    end if;
  elsif tg_table_name = 'audit_logs' and new.actor_id is not null then
    perform require_active_user_role(
      new.actor_id, null, 'audit_logs.actor_id'
    );
  end if;

  return new;
end;
$$;

-- A role is part of the identity contract. Changing it after references exist
-- can silently invalidate ownership and enrollment rules.
create function prevent_user_role_change()
returns trigger
language plpgsql
set search_path = vlearn, pg_temp
as $$
begin
  if new.role is distinct from old.role then
    raise exception
      'app_users.role is immutable; create a new identity for a different role'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger app_users_prevent_role_change
before update of role on app_users
for each row execute function prevent_user_role_change();

create trigger classrooms_enforce_owner_role
before insert or update of owner_admin_id on classrooms
for each row execute function enforce_vlearn_user_roles();

create trigger enrollments_enforce_student_role
before insert or update of student_id on classroom_enrollments
for each row execute function enforce_vlearn_user_roles();

create trigger documents_enforce_creator_role
before insert or update of created_by on documents
for each row execute function enforce_vlearn_user_roles();

create trigger document_versions_enforce_creator_role
before insert or update of created_by on document_versions
for each row execute function enforce_vlearn_user_roles();

create trigger prompt_templates_enforce_creator_role
before insert or update of created_by on prompt_templates
for each row execute function enforce_vlearn_user_roles();

create trigger guardrail_rules_enforce_creator_role
before insert or update of created_by on guardrail_rules
for each row execute function enforce_vlearn_user_roles();

create trigger provider_configs_enforce_owner_role
before insert or update of owner_admin_id on ai_provider_configs
for each row execute function enforce_vlearn_user_roles();

create trigger question_sets_enforce_roles
before insert or update of set_type, created_by, reviewed_by on question_sets
for each row execute function enforce_vlearn_user_roles();

create trigger ai_runs_enforce_initiator_role
before insert or update of initiated_by on ai_runs
for each row execute function enforce_vlearn_user_roles();

create trigger quizzes_enforce_roles
before insert or update of quiz_type, created_by, owner_student_id on quizzes
for each row execute function enforce_vlearn_user_roles();

create trigger quiz_attempts_enforce_student_role
before insert or update of student_id on quiz_attempts
for each row execute function enforce_vlearn_user_roles();

create trigger grading_runs_enforce_reviewer_role
before insert or update of reviewed_by on grading_runs
for each row execute function enforce_vlearn_user_roles();

create trigger audit_logs_enforce_actor_role
before insert or update of actor_id on audit_logs
for each row execute function enforce_vlearn_user_roles();

-- Scope identity is immutable after insertion. Moving a parent row to another
-- classroom would otherwise invalidate already-linked descendants without
-- touching their own rows or firing their consistency triggers.
create function prevent_scope_identity_change()
returns trigger
language plpgsql
set search_path = vlearn, pg_temp
as $$
begin
  if tg_table_name = 'classrooms' then
    if new.owner_admin_id is distinct from old.owner_admin_id then
      raise exception 'Classroom ownership is immutable'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'documents' then
    if new.classroom_id is distinct from old.classroom_id
       or new.created_by is distinct from old.created_by then
      raise exception 'Document classroom and creator are immutable'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'document_versions' then
    if new.document_id is distinct from old.document_id
       or new.created_by is distinct from old.created_by then
      raise exception 'Document version ownership is immutable'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'topics' then
    if new.classroom_id is distinct from old.classroom_id then
      raise exception 'Topic classroom is immutable'
        using errcode = '23514';
    end if;
  elsif tg_table_name in ('prompt_templates', 'guardrail_rules') then
    if new.classroom_id is distinct from old.classroom_id
       or new.created_by is distinct from old.created_by then
      raise exception '% scope and creator are immutable', tg_table_name
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'ai_provider_configs' then
    if new.owner_admin_id is distinct from old.owner_admin_id then
      raise exception 'AI provider configuration owner is immutable'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'question_sets' then
    if new.classroom_id is distinct from old.classroom_id
       or new.document_version_id is distinct from old.document_version_id
       or new.set_type is distinct from old.set_type
       or new.created_by is distinct from old.created_by then
      raise exception 'Question set scope, type and creator are immutable'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'questions' then
    if new.question_set_id is distinct from old.question_set_id then
      raise exception 'Question set ownership is immutable'
        using errcode = '23514';
    end if;
  elsif tg_table_name = 'quizzes' then
    if new.classroom_id is distinct from old.classroom_id
       or new.quiz_type is distinct from old.quiz_type
       or new.created_by is distinct from old.created_by
       or new.owner_student_id is distinct from old.owner_student_id then
      raise exception 'Quiz scope, type, creator and owner are immutable'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger classrooms_prevent_scope_identity_change
before update of owner_admin_id on classrooms
for each row execute function prevent_scope_identity_change();

create trigger documents_prevent_scope_identity_change
before update of classroom_id, created_by on documents
for each row execute function prevent_scope_identity_change();

create trigger document_versions_prevent_scope_identity_change
before update of document_id, created_by on document_versions
for each row execute function prevent_scope_identity_change();

create trigger topics_prevent_scope_identity_change
before update of classroom_id on topics
for each row execute function prevent_scope_identity_change();

create trigger prompt_templates_prevent_scope_identity_change
before update of classroom_id, created_by on prompt_templates
for each row execute function prevent_scope_identity_change();

create trigger guardrail_rules_prevent_scope_identity_change
before update of classroom_id, created_by on guardrail_rules
for each row execute function prevent_scope_identity_change();

create trigger provider_configs_prevent_scope_identity_change
before update of owner_admin_id on ai_provider_configs
for each row execute function prevent_scope_identity_change();

create trigger question_sets_prevent_scope_identity_change
before update of classroom_id, document_version_id, set_type, created_by
on question_sets
for each row execute function prevent_scope_identity_change();

create trigger questions_prevent_scope_identity_change
before update of question_set_id on questions
for each row execute function prevent_scope_identity_change();

create trigger quizzes_prevent_scope_identity_change
before update of classroom_id, quiz_type, created_by, owner_student_id on quizzes
for each row execute function prevent_scope_identity_change();

create function enforce_scope_consistency()
returns trigger
language plpgsql
set search_path = vlearn, pg_temp
as $$
declare
  expected_classroom_id bigint;
  expected_document_version_id bigint;
  owner_admin_id bigint;
  document_is_visible boolean;
  document_status text;
begin
  if tg_table_name = 'documents' then
    select c.owner_admin_id
    into owner_admin_id
    from classrooms c
    where c.id = new.classroom_id;

    if owner_admin_id is not null and new.created_by <> owner_admin_id then
      raise exception 'documents.created_by must own the classroom'
        using errcode = '23514';
    end if;

  elsif tg_table_name = 'document_versions' then
    select c.owner_admin_id
    into owner_admin_id
    from documents d
    join classrooms c on c.id = d.classroom_id
    where d.id = new.document_id;

    if owner_admin_id is not null and new.created_by <> owner_admin_id then
      raise exception 'document_versions.created_by must own the classroom'
        using errcode = '23514';
    end if;

  elsif tg_table_name in ('prompt_templates', 'guardrail_rules') then
    if new.classroom_id is not null then
      select c.owner_admin_id
      into owner_admin_id
      from classrooms c
      where c.id = new.classroom_id;

      if owner_admin_id is not null and new.created_by <> owner_admin_id then
        raise exception '%.created_by must own the classroom', tg_table_name
          using errcode = '23514';
      end if;
    end if;

  elsif tg_table_name = 'question_sets' then
    select d.classroom_id, d.is_visible_to_students, d.status
    into expected_classroom_id, document_is_visible, document_status
    from document_versions dv
    join documents d on d.id = dv.document_id
    where dv.id = new.document_version_id;

    if expected_classroom_id is not null
       and new.classroom_id <> expected_classroom_id then
      raise exception
        'question_sets.classroom_id must match its document classroom'
        using errcode = '23514';
    end if;

    select c.owner_admin_id
    into owner_admin_id
    from classrooms c
    where c.id = new.classroom_id;

    if new.set_type = 'admin_generated' then
      if owner_admin_id is not null and new.created_by <> owner_admin_id then
        raise exception
          'Admin question sets must be created by the classroom owner'
          using errcode = '23514';
      end if;
    else
      if document_status <> 'ready' or not document_is_visible then
        raise exception
          'Student practice requires a ready, student-visible document'
          using errcode = '23514';
      end if;
      if not exists (
        select 1
        from classroom_enrollments ce
        where ce.classroom_id = new.classroom_id
          and ce.student_id = new.created_by
          and ce.status = 'active'
      ) then
        raise exception
          'Student practice creator must be actively enrolled'
          using errcode = '23514';
      end if;
    end if;

    if new.reviewed_by is not null
       and owner_admin_id is not null
       and new.reviewed_by <> owner_admin_id then
      raise exception
        'question_sets.reviewed_by must own the classroom'
        using errcode = '23514';
    end if;

  elsif tg_table_name = 'ai_runs' then
    select c.owner_admin_id
    into owner_admin_id
    from classrooms c
    where c.id = new.classroom_id;

    if new.initiated_by <> owner_admin_id
       and not exists (
         select 1
         from classroom_enrollments ce
         where ce.classroom_id = new.classroom_id
           and ce.student_id = new.initiated_by
           and ce.status = 'active'
       ) then
      raise exception 'ai_runs.initiated_by has no classroom access'
        using errcode = '23514';
    end if;

    if new.document_version_id is not null then
      select d.classroom_id
      into expected_classroom_id
      from document_versions dv
      join documents d on d.id = dv.document_id
      where dv.id = new.document_version_id;

      if expected_classroom_id is not null
         and expected_classroom_id <> new.classroom_id then
        raise exception 'ai_runs document belongs to another classroom'
          using errcode = '23514';
      end if;
    end if;

    if new.question_set_id is not null
       and not exists (
         select 1
         from question_sets qs
         where qs.id = new.question_set_id
           and qs.classroom_id = new.classroom_id
       ) then
      raise exception 'ai_runs question set belongs to another classroom'
        using errcode = '23514';
    end if;

    if new.prompt_template_id is not null
       and not exists (
         select 1
         from prompt_templates pt
         where pt.id = new.prompt_template_id
           and (
             pt.classroom_id is null
             or pt.classroom_id = new.classroom_id
           )
       ) then
      raise exception 'ai_runs prompt is not available to this classroom'
        using errcode = '23514';
    end if;

    if new.provider_config_id is not null
       and not exists (
         select 1
         from ai_provider_configs apc
         where apc.id = new.provider_config_id
           and apc.owner_admin_id = owner_admin_id
           and apc.is_active
       ) then
      raise exception 'ai_runs provider config must belong to the classroom owner'
        using errcode = '23514';
    end if;

  elsif tg_table_name = 'questions' then
    if new.topic_id is not null then
      select qs.classroom_id
      into expected_classroom_id
      from question_sets qs
      where qs.id = new.question_set_id;

      if not exists (
        select 1
        from topics t
        where t.id = new.topic_id
          and t.classroom_id = expected_classroom_id
      ) then
        raise exception 'questions.topic_id belongs to another classroom'
          using errcode = '23514';
      end if;
    end if;

  elsif tg_table_name = 'question_sources' then
    select qs.document_version_id
    into expected_document_version_id
    from questions q
    join question_sets qs on qs.id = q.question_set_id
    where q.id = new.question_id;

    if not exists (
      select 1
      from document_pages dp
      where dp.id = new.document_page_id
        and dp.document_version_id = expected_document_version_id
    ) then
      raise exception
        'Question source must come from the question set document version'
        using errcode = '23514';
    end if;

  elsif tg_table_name = 'quizzes' then
    select c.owner_admin_id
    into owner_admin_id
    from classrooms c
    where c.id = new.classroom_id;

    if new.quiz_type = 'assigned' then
      if owner_admin_id is not null and new.created_by <> owner_admin_id then
        raise exception 'Assigned quizzes must be created by the classroom owner'
          using errcode = '23514';
      end if;
    else
      if new.owner_student_id <> new.created_by then
        raise exception
          'Practice quiz owner_student_id must equal created_by'
          using errcode = '23514';
      end if;
      if not exists (
        select 1
        from classroom_enrollments ce
        where ce.classroom_id = new.classroom_id
          and ce.student_id = new.owner_student_id
          and ce.status = 'active'
      ) then
        raise exception 'Practice quiz owner must be actively enrolled'
          using errcode = '23514';
      end if;
    end if;

  elsif tg_table_name = 'grading_runs' then
    if new.reviewed_by is not null then
      select qz.classroom_id
      into expected_classroom_id
      from quiz_responses qr
      join quiz_attempts qa on qa.id = qr.attempt_id
      join quizzes qz on qz.id = qa.quiz_id
      where qr.id = new.response_id;

      if not exists (
        select 1
        from classrooms c
        where c.id = expected_classroom_id
          and c.owner_admin_id = new.reviewed_by
      ) then
        raise exception 'grading_runs.reviewed_by must own the classroom'
          using errcode = '23514';
      end if;
    end if;
  end if;

  return new;
end;
$$;

create trigger documents_enforce_scope
before insert or update of classroom_id, created_by on documents
for each row execute function enforce_scope_consistency();

create trigger document_versions_enforce_scope
before insert or update of document_id, created_by on document_versions
for each row execute function enforce_scope_consistency();

create trigger prompt_templates_enforce_scope
before insert or update of classroom_id, created_by on prompt_templates
for each row execute function enforce_scope_consistency();

create trigger guardrail_rules_enforce_scope
before insert or update of classroom_id, created_by on guardrail_rules
for each row execute function enforce_scope_consistency();

create trigger question_sets_enforce_scope
before insert or update of
  classroom_id, document_version_id, set_type, created_by, reviewed_by
on question_sets
for each row execute function enforce_scope_consistency();

create trigger ai_runs_enforce_scope
before insert or update of
  classroom_id,
  initiated_by,
  document_version_id,
  question_set_id,
  prompt_template_id,
  provider_config_id
on ai_runs
for each row execute function enforce_scope_consistency();

create trigger questions_enforce_topic_scope
before insert or update of question_set_id, topic_id on questions
for each row execute function enforce_scope_consistency();

create trigger question_sources_enforce_scope
before insert or update of question_id, document_page_id on question_sources
for each row execute function enforce_scope_consistency();

create trigger quizzes_enforce_scope
before insert or update of classroom_id, quiz_type, created_by, owner_student_id
on quizzes
for each row execute function enforce_scope_consistency();

create trigger grading_runs_enforce_scope
before insert or update of response_id, reviewed_by on grading_runs
for each row execute function enforce_scope_consistency();

-- Approved questions must be complete. Constraint triggers are deferred so an
-- application can insert a question, its options and its sources in any order
-- within one short transaction.
create function validate_question_definition()
returns trigger
language plpgsql
set search_path = vlearn, pg_temp
as $$
declare
  target_question_id bigint;
  target_question questions%rowtype;
  option_count integer;
  correct_option_count integer;
  source_count integer;
begin
  if tg_table_name = 'questions' then
    target_question_id =
      case when tg_op = 'DELETE' then old.id else new.id end;
  else
    target_question_id =
      case when tg_op = 'DELETE' then old.question_id else new.question_id end;
  end if;

  select *
  into target_question
  from questions
  where id = target_question_id;

  if not found or target_question.status <> 'approved' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if target_question.topic_id is null then
    raise exception 'Approved question % must have a topic', target_question_id
      using errcode = '23514';
  end if;

  if nullif(btrim(target_question.explanation), '') is null then
    raise exception 'Approved question % must have an explanation',
      target_question_id using errcode = '23514';
  end if;

  select count(*)
  into source_count
  from question_sources qs
  where qs.question_id = target_question_id;

  if source_count = 0 then
    raise exception 'Approved question % must have at least one source',
      target_question_id using errcode = '23514';
  end if;

  select count(*), count(*) filter (where qo.is_correct)
  into option_count, correct_option_count
  from question_options qo
  where qo.question_id = target_question_id;

  if target_question.question_type = 'single_choice' then
    if option_count < 2 or correct_option_count <> 1 then
      raise exception
        'Single-choice question % needs at least 2 options and exactly 1 correct option',
        target_question_id using errcode = '23514';
    end if;
  elsif target_question.question_type = 'multiple_choice' then
    if option_count < 2 or correct_option_count < 1 then
      raise exception
        'Multiple-choice question % needs at least 2 options and a correct option',
        target_question_id using errcode = '23514';
    end if;
  else
    if option_count <> 0 then
      raise exception 'Text question % cannot have selectable options',
        target_question_id using errcode = '23514';
    end if;
    if nullif(btrim(target_question.answer_key_text), '') is null then
      raise exception 'Text question % must have an answer key',
        target_question_id using errcode = '23514';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create constraint trigger questions_validate_definition
after insert or update or delete on questions
deferrable initially deferred
for each row execute function validate_question_definition();

create constraint trigger question_options_validate_definition
after insert or update or delete on question_options
deferrable initially deferred
for each row execute function validate_question_definition();

create constraint trigger question_sources_validate_definition
after insert or update or delete on question_sources
deferrable initially deferred
for each row execute function validate_question_definition();

-- Published questions are assessment snapshots. Copy a question into a new
-- draft instead of editing content that students may already have answered.
create function prevent_published_question_mutation()
returns trigger
language plpgsql
set search_path = vlearn, pg_temp
as $$
declare
  target_question_id bigint;
begin
  if tg_table_name = 'questions' then
    target_question_id =
      case when tg_op = 'DELETE' then old.id else new.id end;
  else
    target_question_id =
      case when tg_op = 'DELETE' then old.question_id else new.question_id end;
  end if;

  if exists (
    select 1
    from quiz_questions qq
    join quizzes qz on qz.id = qq.quiz_id
    where
      qq.question_id = target_question_id
      and qz.status in ('published', 'closed', 'archived')
  ) then
    raise exception
      'Published question % is immutable; create a new draft question',
      target_question_id;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger questions_prevent_published_mutation
before update or delete on questions
for each row execute function prevent_published_question_mutation();

create trigger question_options_prevent_published_mutation
before insert or update or delete on question_options
for each row execute function prevent_published_question_mutation();

create trigger question_sources_prevent_published_mutation
before insert or update or delete on question_sources
for each row execute function prevent_published_question_mutation();

create function enforce_quiz_state()
returns trigger
language plpgsql
set search_path = vlearn, pg_temp
as $$
declare
  question_count integer;
  invalid_question_count integer;
begin
  if tg_op = 'INSERT' then
    if new.status <> 'draft' then
      raise exception 'A quiz must be created as draft'
        using errcode = '23514';
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Published, closed or archived quizzes cannot be deleted'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if old.status in ('published', 'closed', 'archived')
     and (
       new.classroom_id is distinct from old.classroom_id
       or new.title is distinct from old.title
       or new.description is distinct from old.description
       or new.quiz_type is distinct from old.quiz_type
       or new.created_by is distinct from old.created_by
       or new.owner_student_id is distinct from old.owner_student_id
       or new.opens_at is distinct from old.opens_at
       or new.closes_at is distinct from old.closes_at
       or new.attempts_allowed is distinct from old.attempts_allowed
     ) then
    raise exception 'Published quiz structure is immutable'
      using errcode = '23514';
  end if;

  if new.status is distinct from old.status
     and not (
       (old.status = 'draft' and new.status in ('published', 'archived'))
       or
       (old.status = 'published' and new.status in ('closed', 'archived'))
       or
       (old.status = 'closed' and new.status = 'archived')
     ) then
    raise exception 'Invalid quiz status transition: % -> %',
      old.status, new.status using errcode = '23514';
  end if;

  if old.status = 'draft' and new.status = 'published' then
    select
      count(*),
      count(*) filter (where q.status <> 'approved')
    into question_count, invalid_question_count
    from quiz_questions qq
    join questions q on q.id = qq.question_id
    where qq.quiz_id = new.id;

    if question_count = 0 then
      raise exception 'Cannot publish an empty quiz'
        using errcode = '23514';
    end if;

    if invalid_question_count > 0 then
      raise exception 'All quiz questions must be approved before publish'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

create trigger quizzes_enforce_state
before insert or update or delete on quizzes
for each row execute function enforce_quiz_state();

create function enforce_quiz_question_consistency()
returns trigger
language plpgsql
set search_path = vlearn, pg_temp
as $$
declare
  target_quiz_id bigint;
  target_question_id bigint;
  target_quiz_status text;
  quiz_classroom_id bigint;
  question_classroom_id bigint;
  question_status text;
begin
  target_quiz_id =
    case when tg_op = 'DELETE' then old.quiz_id else new.quiz_id end;
  target_question_id =
    case when tg_op = 'DELETE' then old.question_id else new.question_id end;

  select status, classroom_id
  into target_quiz_status, quiz_classroom_id
  from quizzes
  where id = target_quiz_id;

  if target_quiz_status in ('published', 'closed', 'archived') then
    raise exception 'Published quiz questions are immutable'
      using errcode = '23514';
  end if;

  if tg_op <> 'DELETE' then
    select qs.classroom_id, q.status
    into question_classroom_id, question_status
    from questions q
    join question_sets qs on qs.id = q.question_set_id
    where q.id = target_question_id;

    if quiz_classroom_id is not null
       and question_classroom_id is not null
       and quiz_classroom_id <> question_classroom_id then
      raise exception 'Quiz question belongs to another classroom'
        using errcode = '23514';
    end if;

    if question_status <> 'approved' then
      raise exception 'Only approved questions can be attached to a quiz'
        using errcode = '23514';
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger quiz_questions_enforce_consistency
before insert or update or delete on quiz_questions
for each row execute function enforce_quiz_question_consistency();

-- Lock the quiz row while allocating attempts. This makes the sequential
-- attempt-number and attempts_allowed checks safe under concurrent requests.
create function enforce_quiz_attempt_consistency()
returns trigger
language plpgsql
set search_path = vlearn, pg_temp
as $$
declare
  target_quiz quizzes%rowtype;
  expected_attempt_number integer;
begin
  if tg_op = 'UPDATE' then
    if new.quiz_id is distinct from old.quiz_id
       or new.student_id is distinct from old.student_id
       or new.attempt_number is distinct from old.attempt_number then
      raise exception 'Attempt quiz, student and number are immutable'
        using errcode = '23514';
    end if;
    return new;
  end if;

  select *
  into target_quiz
  from quizzes
  where id = new.quiz_id
  for update;

  if not found then
    return new; -- The foreign key reports the missing quiz.
  end if;

  if target_quiz.status <> 'published' then
    raise exception 'Attempts can only start on a published quiz'
      using errcode = '23514';
  end if;

  if target_quiz.opens_at is not null and now() < target_quiz.opens_at then
    raise exception 'Quiz is not open yet' using errcode = '23514';
  end if;

  if target_quiz.closes_at is not null and now() >= target_quiz.closes_at then
    raise exception 'Quiz is already closed' using errcode = '23514';
  end if;

  if target_quiz.quiz_type = 'practice' then
    if target_quiz.owner_student_id <> new.student_id then
      raise exception 'Only the practice quiz owner can attempt it'
        using errcode = '23514';
    end if;
  elsif not exists (
    select 1
    from classroom_enrollments ce
    where ce.classroom_id = target_quiz.classroom_id
      and ce.student_id = new.student_id
      and ce.status = 'active'
  ) then
    raise exception 'Student must be actively enrolled to attempt this quiz'
      using errcode = '23514';
  end if;

  select coalesce(max(qa.attempt_number), 0) + 1
  into expected_attempt_number
  from quiz_attempts qa
  where qa.quiz_id = new.quiz_id
    and qa.student_id = new.student_id;

  if new.attempt_number <> expected_attempt_number then
    raise exception 'Expected attempt number %, received %',
      expected_attempt_number, new.attempt_number using errcode = '23514';
  end if;

  if new.attempt_number > target_quiz.attempts_allowed then
    raise exception 'Quiz attempt limit (%) exceeded',
      target_quiz.attempts_allowed using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger quiz_attempts_enforce_consistency
before insert or update of quiz_id, student_id, attempt_number on quiz_attempts
for each row execute function enforce_quiz_attempt_consistency();

create function prevent_graded_attempt_mutation()
returns trigger
language plpgsql
set search_path = vlearn, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    raise exception
      'Quiz attempts are retained for audit; change related entities to inactive or archived'
      using errcode = '23514';
  end if;

  if old.status = 'graded' then
    raise exception 'Graded attempts are immutable'
      using errcode = '23514';
  end if;

  if new.status is distinct from old.status
     and not (
       (old.status = 'in_progress' and new.status = 'submitted')
       or
       (old.status = 'submitted' and new.status in ('grading', 'graded'))
       or
       (old.status = 'grading' and new.status = 'graded')
     ) then
    raise exception 'Invalid attempt status transition: % -> %',
      old.status, new.status using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger quiz_attempts_prevent_graded_mutation
before update or delete on quiz_attempts
for each row execute function prevent_graded_attempt_mutation();

create function enforce_quiz_response_consistency()
returns trigger
language plpgsql
set search_path = vlearn, pg_temp
as $$
declare
  attempt_status text;
  expected_points numeric(8, 2);
  target_attempt_id bigint;
  target_question_id bigint;
begin
  target_attempt_id =
    case when tg_op = 'DELETE' then old.attempt_id else new.attempt_id end;
  target_question_id =
    case when tg_op = 'DELETE' then old.question_id else new.question_id end;

  select qa.status, qq.points
  into attempt_status, expected_points
  from quiz_attempts qa
  join quiz_questions qq
    on qq.quiz_id = qa.quiz_id
   and qq.question_id = target_question_id
  where qa.id = target_attempt_id;

  if not found then
    raise exception 'Response question is not part of the attempted quiz'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    if attempt_status <> 'in_progress' then
      raise exception 'Responses are immutable after submission'
        using errcode = '23514';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' and attempt_status <> 'in_progress' then
    raise exception 'Responses can only be added to an in-progress attempt'
      using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' then
    if old.attempt_id is distinct from new.attempt_id
       or old.question_id is distinct from new.question_id
       or old.max_score is distinct from new.max_score then
      raise exception 'Response attempt, question and max_score are immutable'
        using errcode = '23514';
    end if;

    if attempt_status = 'graded' then
      raise exception 'Responses of a graded attempt are immutable'
        using errcode = '23514';
    end if;

    if old.answer_text is distinct from new.answer_text
       and attempt_status <> 'in_progress' then
      raise exception 'Answer content is immutable after submission'
        using errcode = '23514';
    end if;
  end if;

  if new.max_score <> expected_points then
    raise exception 'Response max_score must equal quiz question points (%)',
      expected_points using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger quiz_responses_enforce_consistency
before insert or update or delete on quiz_responses
for each row execute function enforce_quiz_response_consistency();

create function enforce_selected_option_consistency()
returns trigger
language plpgsql
set search_path = vlearn, pg_temp
as $$
declare
  response_question_id bigint;
  option_question_id bigint;
  attempt_status text;
  target_question_type text;
begin
  select qr.question_id, qa.status, q.question_type
  into response_question_id, attempt_status, target_question_type
  from quiz_responses qr
  join quiz_attempts qa on qa.id = qr.attempt_id
  join questions q on q.id = qr.question_id
  where qr.id =
    case when tg_op = 'DELETE' then old.response_id else new.response_id end
  for update of qr;

  if attempt_status <> 'in_progress' then
    raise exception 'Selected options are immutable after submission'
      using errcode = '23514';
  end if;

  if tg_op <> 'DELETE' then
    if tg_op = 'UPDATE'
       and new.response_id is distinct from old.response_id then
      raise exception 'Selected option response_id is immutable'
        using errcode = '23514';
    end if;

    select qo.question_id
    into option_question_id
    from question_options qo
    where qo.id = new.option_id;

    if option_question_id is not null
       and option_question_id <> response_question_id then
      raise exception 'Selected option belongs to another question'
        using errcode = '23514';
    end if;

    if target_question_type not in ('single_choice', 'multiple_choice') then
      raise exception 'Text questions cannot have selected options'
        using errcode = '23514';
    end if;

    if target_question_type = 'single_choice' then
      if tg_op = 'INSERT' and exists (
        select 1
        from response_selected_options rso
        where rso.response_id = new.response_id
      ) then
        raise exception 'Single-choice responses can select only one option'
          using errcode = '23514';
      elsif tg_op = 'UPDATE' and exists (
        select 1
        from response_selected_options rso
        where rso.response_id = new.response_id
          and rso.option_id <> old.option_id
      ) then
        raise exception 'Single-choice responses can select only one option'
          using errcode = '23514';
      end if;
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create trigger response_selected_options_enforce_consistency
before insert or update or delete on response_selected_options
for each row execute function enforce_selected_option_consistency();

create function enforce_grading_run_consistency()
returns trigger
language plpgsql
set search_path = vlearn, pg_temp
as $$
declare
  response_max_score numeric(8, 2);
  attempt_status text;
begin
  select qr.max_score, qa.status
  into response_max_score, attempt_status
  from quiz_responses qr
  join quiz_attempts qa on qa.id = qr.attempt_id
  where qr.id = new.response_id;

  if response_max_score is not null
     and new.proposed_score > response_max_score then
    raise exception 'Proposed score exceeds response max_score'
      using errcode = '23514';
  end if;

  if attempt_status not in ('submitted', 'grading') then
    raise exception 'Grading runs require a submitted or grading attempt'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger grading_runs_enforce_consistency
before insert or update of response_id, proposed_score on grading_runs
for each row execute function enforce_grading_run_consistency();

-- A graded attempt must be a complete, internally consistent snapshot.
create function validate_graded_attempt()
returns trigger
language plpgsql
set search_path = vlearn, pg_temp
as $$
declare
  target_attempt_id bigint;
  target_attempt quiz_attempts%rowtype;
  question_count integer;
  response_count integer;
  scored_response_count integer;
  calculated_score numeric(10, 2);
  calculated_max_score numeric(10, 2);
begin
  if tg_table_name = 'quiz_attempts' then
    target_attempt_id =
      case when tg_op = 'DELETE' then old.id else new.id end;
  else
    target_attempt_id =
      case when tg_op = 'DELETE' then old.attempt_id else new.attempt_id end;
  end if;

  select *
  into target_attempt
  from quiz_attempts
  where id = target_attempt_id;

  if not found or target_attempt.status <> 'graded' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select count(*)
  into question_count
  from quiz_questions qq
  where qq.quiz_id = target_attempt.quiz_id;

  select
    count(*),
    count(*) filter (
      where coalesce(qr.final_score, qr.auto_score) is not null
    ),
    coalesce(sum(coalesce(qr.final_score, qr.auto_score)), 0),
    coalesce(sum(qr.max_score), 0)
  into
    response_count,
    scored_response_count,
    calculated_score,
    calculated_max_score
  from quiz_responses qr
  where qr.attempt_id = target_attempt_id;

  if response_count <> question_count
     or scored_response_count <> response_count then
    raise exception
      'Graded attempt % must contain a scored response for every quiz question',
      target_attempt_id using errcode = '23514';
  end if;

  if target_attempt.total_score <> calculated_score
     or target_attempt.max_score <> calculated_max_score then
    raise exception
      'Graded attempt % totals do not match its responses',
      target_attempt_id using errcode = '23514';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create constraint trigger quiz_attempts_validate_graded
after insert or update or delete on quiz_attempts
deferrable initially deferred
for each row execute function validate_graded_attempt();

create constraint trigger quiz_responses_validate_graded_attempt
after insert or update or delete on quiz_responses
deferrable initially deferred
for each row execute function validate_graded_attempt();

-- ============================================================================
-- 9. DERIVED READ MODELS FOR DASHBOARDS
-- These are regular views for correctness and simplicity. Convert to
-- materialized views only after measuring a real performance need.
-- ============================================================================

create view student_topic_performance as
select
  qa.student_id,
  qz.classroom_id,
  q.topic_id,
  count(qr.id) as answered_count,
  count(qr.id) filter (
    where coalesce(qr.final_score, qr.auto_score, 0) >= qr.max_score
  ) as correct_count,
  sum(coalesce(qr.final_score, qr.auto_score, 0)) as earned_points,
  sum(qr.max_score) as possible_points,
  round(
    100.0 * (
      1 - (
        sum(coalesce(qr.final_score, qr.auto_score, 0))
        / nullif(sum(qr.max_score), 0)
      )
    ),
    2
  ) as knowledge_gap_percent
from quiz_attempts qa
join quizzes qz on qz.id = qa.quiz_id
join quiz_responses qr on qr.attempt_id = qa.id
join questions q on q.id = qr.question_id
where
  qa.status = 'graded'
  and q.topic_id is not null
group by
  qa.student_id,
  qz.classroom_id,
  q.topic_id;

create view classroom_quiz_summary as
select
  qz.classroom_id,
  qz.id as quiz_id,
  qz.title,
  count(distinct qa.student_id) as participating_students,
  count(qa.id) as attempt_count,
  round(
    avg(qa.total_score / nullif(qa.max_score, 0) * 100)
      filter (where qa.status = 'graded'),
    2
  ) as average_score_percent,
  count(qa.id) filter (where qa.status = 'graded') as graded_attempt_count
from quizzes qz
left join quiz_attempts qa on qa.quiz_id = qz.id
group by qz.classroom_id, qz.id, qz.title;

-- Backend-only security baseline. The schema owner keeps access, while PUBLIC
-- receives no implicit access. Grant narrowly scoped privileges to a dedicated
-- backend role after choosing the authentication/session mechanism.
revoke all on schema vlearn from public;
revoke all on all tables in schema vlearn from public;
revoke all on all sequences in schema vlearn from public;

commit;
