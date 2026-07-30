\set ON_ERROR_STOP on

begin;
set search_path to vlearn, public;

create temporary table schema_test_results (
  test_name text primary key
);

create function pg_temp.expect_failure(test_name text, statement text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
    set constraints all immediate;
  exception
    when others then
      set constraints all deferred;
      insert into schema_test_results values (test_name);
      raise notice 'PASS: % was rejected (%).', test_name, sqlerrm;
      return;
  end;

  set constraints all deferred;
  raise exception 'FAIL: % should have been rejected.', test_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Valid fixture: two isolated classrooms and one fully graded quiz attempt.
-- ---------------------------------------------------------------------------

insert into app_users (auth_subject, email, full_name, role)
values
  ('admin-1', 'admin1@example.com', 'Admin 1', 'admin'),
  ('student-1', 'student1@example.com', 'Student 1', 'user'),
  ('admin-2', 'admin2@example.com', 'Admin 2', 'admin'),
  ('student-2', 'student2@example.com', 'Student 2', 'user');

insert into classrooms (name, owner_admin_id)
values
  ('Class 1', 1),
  ('Class 2', 3);

insert into classroom_enrollments (classroom_id, student_id)
values
  (1, 2),
  (2, 4);

insert into documents (
  classroom_id,
  title,
  status,
  is_visible_to_students,
  created_by
)
values
  (1, 'Document 1', 'ready', true, 1),
  (2, 'Document 2', 'ready', true, 3);

insert into document_versions (
  document_id,
  version_number,
  storage_path,
  original_filename,
  file_size_bytes,
  file_sha256,
  extraction_status,
  created_by
)
values
  (1, 1, 'class1/doc1.pdf', 'doc1.pdf', 100, 'sha-class-1', 'completed', 1),
  (2, 1, 'class2/doc2.pdf', 'doc2.pdf', 100, 'sha-class-2', 'completed', 3);

insert into document_pages (
  document_version_id,
  page_number,
  extracted_text
)
values
  (1, 1, 'Class 1 content'),
  (2, 1, 'Class 2 content');

insert into topics (classroom_id, name)
values
  (1, 'Topic 1'),
  (2, 'Topic 2');

insert into question_sets (
  classroom_id,
  document_version_id,
  title,
  status,
  created_by,
  reviewed_by,
  reviewed_at
)
values
  (1, 1, 'Set 1', 'approved', 1, 1, now()),
  (2, 2, 'Set 2', 'approved', 3, 3, now());

insert into questions (
  question_set_id,
  topic_id,
  question_type,
  difficulty,
  content,
  explanation,
  status,
  display_order
)
values
  (1, 1, 'single_choice', 'medium', 'Question 1', 'Explanation 1', 'approved', 1),
  (2, 2, 'single_choice', 'medium', 'Question 2', 'Explanation 2', 'approved', 1),
  (1, 1, 'single_choice', 'medium', 'Draft with two answers', 'Draft explanation', 'draft', 2),
  (1, 1, 'single_choice', 'medium', 'Draft without source', 'Draft explanation', 'draft', 3);

insert into question_options (
  question_id,
  content,
  is_correct,
  display_order
)
values
  (1, 'Q1 correct', true, 1),
  (1, 'Q1 wrong', false, 2),
  (2, 'Q2 correct', true, 1),
  (2, 'Q2 wrong', false, 2),
  (3, 'Q3 correct one', true, 1),
  (3, 'Q3 correct two', true, 2),
  (4, 'Q4 correct', true, 1),
  (4, 'Q4 wrong', false, 2);

insert into question_sources (question_id, document_page_id, source_quote)
values
  (1, 1, 'Class 1 content'),
  (2, 2, 'Class 2 content'),
  (3, 1, 'Class 1 content');

insert into quizzes (
  classroom_id,
  title,
  quiz_type,
  created_by,
  attempts_allowed
)
values
  (1, 'Quiz 1', 'assigned', 1, 1),
  (1, 'Quiz 2', 'assigned', 1, 1),
  (1, 'Empty Quiz', 'assigned', 1, 1),
  (1, 'Cross-scope Test Quiz', 'assigned', 1, 1);

insert into quiz_questions (quiz_id, question_id, display_order, points)
values
  (1, 1, 1, 1),
  (2, 1, 1, 1);

update quizzes
set status = 'published'
where id in (1, 2);

insert into quiz_attempts (quiz_id, student_id, attempt_number)
values
  (1, 2, 1),
  (2, 2, 1);

insert into quiz_responses (attempt_id, question_id, max_score)
values
  (1, 1, 1),
  (2, 1, 1);

insert into response_selected_options (response_id, option_id)
values
  (1, 1);

update quiz_attempts
set status = 'submitted', submitted_at = now()
where id = 1;

update quiz_responses
set auto_score = 1, grading_status = 'auto_graded'
where id = 1;

update quiz_attempts
set
  status = 'graded',
  graded_at = now(),
  total_score = 1,
  max_score = 1
where id = 1;

set constraints all immediate;
set constraints all deferred;

-- ---------------------------------------------------------------------------
-- Previously reproducible invalid states must now be rejected.
-- ---------------------------------------------------------------------------

select pg_temp.expect_failure(
  'student_admin_document',
  $sql$
    insert into documents (classroom_id, title, created_by)
    values (1, 'Invalid student-owned document', 2)
  $sql$
);

select pg_temp.expect_failure(
  'cross_class_question_set',
  $sql$
    insert into question_sets (
      classroom_id,
      document_version_id,
      title,
      created_by
    )
    values (2, 1, 'Invalid cross-class set', 3)
  $sql$
);

select pg_temp.expect_failure(
  'cross_class_topic',
  $sql$
    update questions set topic_id = 2 where id = 3
  $sql$
);

select pg_temp.expect_failure(
  'cross_document_source',
  $sql$
    insert into question_sources (question_id, document_page_id)
    values (3, 2)
  $sql$
);

select pg_temp.expect_failure(
  'cross_class_quiz_question',
  $sql$
    insert into quiz_questions (quiz_id, question_id, display_order)
    values (4, 2, 1)
  $sql$
);

select pg_temp.expect_failure(
  'student_assigned_quiz',
  $sql$
    insert into quizzes (classroom_id, title, quiz_type, created_by)
    values (1, 'Invalid student-assigned quiz', 'assigned', 2)
  $sql$
);

select pg_temp.expect_failure(
  'student_reviewer',
  $sql$
    update question_sets
    set reviewed_by = 2, reviewed_at = now()
    where id = 1
  $sql$
);

select pg_temp.expect_failure(
  'admin_approval_without_review',
  $sql$
    insert into question_sets (
      classroom_id,
      document_version_id,
      title,
      status,
      created_by
    )
    values (1, 1, 'Invalid unreviewed approval', 'approved', 1)
  $sql$
);

select pg_temp.expect_failure(
  'classroom_owner_reassignment',
  $sql$
    update classrooms set owner_admin_id = 3 where id = 1
  $sql$
);

select pg_temp.expect_failure(
  'document_reparent',
  $sql$
    update documents
    set classroom_id = 2, created_by = 3
    where id = 1
  $sql$
);

select pg_temp.expect_failure(
  'topic_reparent',
  $sql$
    update topics set classroom_id = 2 where id = 1
  $sql$
);

select pg_temp.expect_failure(
  'draft_quiz_reparent',
  $sql$
    update quizzes
    set classroom_id = 2, created_by = 3
    where id = 4
  $sql$
);

select pg_temp.expect_failure(
  'attempt_limit',
  $sql$
    insert into quiz_attempts (quiz_id, student_id, attempt_number)
    values (1, 2, 2)
  $sql$
);

select pg_temp.expect_failure(
  'admin_attempt',
  $sql$
    insert into quiz_attempts (quiz_id, student_id, attempt_number)
    values (1, 1, 1)
  $sql$
);

select pg_temp.expect_failure(
  'response_unassigned_question',
  $sql$
    insert into quiz_responses (attempt_id, question_id, max_score)
    values (2, 2, 1)
  $sql$
);

select pg_temp.expect_failure(
  'option_other_question',
  $sql$
    insert into response_selected_options (response_id, option_id)
    values (2, 3)
  $sql$
);

select pg_temp.expect_failure(
  'option_after_publish',
  $sql$
    insert into question_options (
      question_id,
      content,
      is_correct,
      display_order
    )
    values (1, 'Late option', false, 3)
  $sql$
);

select pg_temp.expect_failure(
  'single_choice_two_correct',
  $sql$
    update questions set status = 'approved' where id = 3
  $sql$
);

select pg_temp.expect_failure(
  'approved_without_source',
  $sql$
    update questions set status = 'approved' where id = 4
  $sql$
);

select pg_temp.expect_failure(
  'publish_empty_quiz',
  $sql$
    update quizzes set status = 'published' where id = 3
  $sql$
);

select pg_temp.expect_failure(
  'mutate_published_quiz',
  $sql$
    delete from quiz_questions where quiz_id = 1 and question_id = 1
  $sql$
);

select pg_temp.expect_failure(
  'delete_in_progress_attempt',
  $sql$
    delete from quiz_attempts where id = 2
  $sql$
);

insert into response_selected_options (response_id, option_id)
values (2, 1);

select pg_temp.expect_failure(
  'single_choice_multiple_selections',
  $sql$
    insert into response_selected_options (response_id, option_id)
    values (2, 2)
  $sql$
);

update quiz_attempts
set status = 'submitted', submitted_at = now()
where id = 2;

update quiz_responses
set auto_score = 1, grading_status = 'auto_graded'
where id = 2;

select pg_temp.expect_failure(
  'attempt_status_reversal',
  $sql$
    update quiz_attempts
    set status = 'in_progress', submitted_at = null
    where id = 2
  $sql$
);

select pg_temp.expect_failure(
  'delete_submitted_response',
  $sql$
    delete from quiz_responses where id = 2
  $sql$
);

select pg_temp.expect_failure(
  'graded_total_mismatch',
  $sql$
    update quiz_attempts
    set
      status = 'graded',
      graded_at = now(),
      total_score = 0,
      max_score = 1
    where id = 2
  $sql$
);

-- ---------------------------------------------------------------------------
-- Structural checks.
-- ---------------------------------------------------------------------------

do $$
declare
  passed_count integer;
  missing_fk_index_count integer;
  gap_count integer;
begin
  select count(*) into passed_count from schema_test_results;
  if passed_count <> 26 then
    raise exception 'Expected 26 rejected invalid states, got %', passed_count;
  end if;

  select count(*)
  into missing_fk_index_count
  from pg_constraint c
  join pg_attribute a
    on a.attrelid = c.conrelid
   and a.attnum = any(c.conkey)
  where c.contype = 'f'
    and c.connamespace = 'vlearn'::regnamespace
    and not exists (
      select 1
      from pg_index i
      where i.indrelid = c.conrelid
        and a.attnum = any(i.indkey)
    );

  if missing_fk_index_count <> 0 then
    raise exception 'Found % unindexed foreign-key columns',
      missing_fk_index_count;
  end if;

  select count(*)
  into gap_count
  from student_topic_performance
  where student_id = 2
    and classroom_id = 1
    and topic_id = 1
    and knowledge_gap_percent = 0;

  if gap_count <> 1 then
    raise exception 'Knowledge-gap view did not return the valid graded result';
  end if;

  raise notice
    'PASS: valid flow, 26 rejection cases, FK indexes and analytics view.';
end;
$$;

rollback;
