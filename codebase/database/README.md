# VLearn PostgreSQL database

`schema.sql` implements the initial database for the two product roles:

- `admin`: instructor/classroom administrator.
- `user`: student.

## Main data flow

1. An admin creates a classroom and enrolls students.
2. A PDF is uploaded to private object storage. `documents` and
   `document_versions` store its metadata.
3. Extracted text is stored page-by-page in `document_pages`; no vector
   embedding is used.
4. An LLM run creates a `question_set` and draft `questions`.
5. The admin reviews the set and approved questions are attached to a `quiz`.
6. Student work is stored in `quiz_attempts` and `quiz_responses`.
7. `student_topic_performance` calculates personal knowledge gaps from graded
   responses.

## Important implementation rules

- Do not store PDF binary data in PostgreSQL. Use private object storage and
  save only `storage_path`.
- Do not store raw API keys. `ai_provider_configs.secret_reference` must point
  to a backend secret manager or vault entry.
- Never send `questions.answer_key_text` or
  `question_options.is_correct` to a student before submission.
- Set `questions.topic_id`; otherwise the response cannot contribute to the
  knowledge-gap view.
- Generate a new `document_versions` row when a PDF changes so existing
  question citations remain reproducible.
- `ai_runs` is the trace used for prompt/model evaluation and debugging.

## Install PostgreSQL and `psql` on Windows

This project needs a running PostgreSQL database, so installing the complete
PostgreSQL package is more useful than installing only the `psql` client.

Open PowerShell as Administrator and run:

```powershell
winget install --exact --id PostgreSQL.PostgreSQL.17 --source winget
```

During installation:

1. Keep `PostgreSQL Server` and `Command Line Tools` selected.
2. Keep port `5432` unless it is already in use.
3. Set and save the password for the `postgres` database user.
4. `pgAdmin` and `Stack Builder` are optional for this project.

Close and reopen PowerShell, then verify:

```powershell
psql --version
```

If PowerShell cannot find `psql`, temporarily add its default installation
directory to the current terminal:

```powershell
$env:Path += ";C:\Program Files\PostgreSQL\17\bin"
psql --version
```

To make the change permanent, add
`C:\Program Files\PostgreSQL\17\bin` to the Windows user `Path` environment
variable.

## Create the local database

From PowerShell:

```powershell
createdb --host localhost --port 5432 --username postgres vlearn
```

The command prompts for the `postgres` password configured during installation.

If the database already exists, PostgreSQL returns an error that can be safely
ignored.

## Run the schema

Run this command from the repository root:

```powershell
psql `
  --host localhost `
  --port 5432 `
  --username postgres `
  --dbname vlearn `
  --set ON_ERROR_STOP=1 `
  --file .\codebase\database\schema.sql
```

Verify the result:

```powershell
psql --host localhost --username postgres --dbname vlearn
```

Inside the `psql` terminal:

```text
\dn
\dt vlearn.*
\dv vlearn.*
\q
```

The schema intentionally does not include authentication-specific Row-Level
Security policies yet. Add those when the backend authentication mechanism is
chosen, because Supabase `auth.uid()`, a custom JWT subject, and a server-side
session require different policies.
