export const MIGRATIONS: { id: string; sql: string }[] = [
  {
    id: "001_phase1_foundation",
    sql: `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  email_verified_at TIMESTAMPTZ,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_google_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_sub TEXT NOT NULL UNIQUE,
  account_type TEXT NOT NULL DEFAULT 'personal',
  refresh_token_enc TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT true,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, google_sub)
);

CREATE UNIQUE INDEX IF NOT EXISTS user_google_one_primary
  ON user_google_accounts (user_id) WHERE is_primary = true;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS otp_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS org_members (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
  PRIMARY KEY (organization_id, user_id)
);

CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'TODO',
  completion_mode TEXT NOT NULL DEFAULT 'ANY' CHECK (completion_mode IN ('ANY', 'ALL')),
  max_assignees INT,
  allow_claim BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  deleted_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, code)
);

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DONE', 'REMOVED')),
  personal_note TEXT,
  completed_at TIMESTAMPTZ,
  completed_source TEXT,
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS task_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id UUID,
  actor_via TEXT NOT NULL DEFAULT 'user',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS processed_events (
  event_id UUID PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE IF NOT EXISTS task_code_seq START 1;
`,
  },
  {
    id: "002_auth_email_invites",
    sql: `
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS org_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('OWNER', 'ADMIN', 'MEMBER')),
  token_hash TEXT NOT NULL UNIQUE,
  invited_by UUID NOT NULL REFERENCES users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_invitations_org_email_idx
  ON org_invitations (organization_id, email);
`,
  },
  {
    id: "003_chat_alpha",
    sql: `
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('GROUP', 'TASK_THREAD', 'DM')),
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS conversations_group_chat_uidx
  ON conversations (group_id) WHERE type = 'GROUP' AND group_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_task_thread_uidx
  ON conversations (task_id) WHERE type = 'TASK_THREAD' AND task_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_seq INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  seq INT NOT NULL,
  client_msg_id TEXT,
  sender_user_id UUID NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  UNIQUE (conversation_id, seq),
  UNIQUE (conversation_id, client_msg_id)
);

CREATE INDEX IF NOT EXISTS messages_conv_seq_idx ON messages (conversation_id, seq);
`,
  },
  {
    id: "004_google_sync_jobs",
    sql: `
CREATE TABLE IF NOT EXISTS sync_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_hash TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sync_jobs_pending_idx
  ON sync_jobs (status, next_run_at)
  WHERE status IN ('PENDING', 'RETRY');

CREATE UNIQUE INDEX IF NOT EXISTS sync_jobs_dedupe_pending
  ON sync_jobs (user_id, job_type, aggregate_id)
  WHERE status IN ('PENDING', 'RETRY', 'RUNNING');

CREATE TABLE IF NOT EXISTS google_task_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  google_tasklist_id TEXT NOT NULL,
  google_task_id TEXT NOT NULL,
  etag TEXT,
  content_hash TEXT,
  status TEXT NOT NULL DEFAULT 'LINKED',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, user_id),
  UNIQUE (google_tasklist_id, google_task_id)
);
`,
  },
  {
    id: "005_chat_files_reactions_search",
    sql: `
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  uploader_user_id UUID NOT NULL REFERENCES users(id),
  object_key TEXT NOT NULL,
  original_name TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT NOT NULL DEFAULT 0,
  sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'UPLOADING',
  scan_status TEXT NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ready_at TIMESTAMPTZ,
  orphan_after TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours')
);

CREATE INDEX IF NOT EXISTS files_group_sha_idx ON files (group_id, sha256)
  WHERE sha256 IS NOT NULL AND status = 'READY';
CREATE INDEX IF NOT EXISTS files_orphan_idx ON files (orphan_after)
  WHERE status = 'UPLOADING';

CREATE TABLE IF NOT EXISTS message_attachments (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  PRIMARY KEY (message_id, file_id)
);

CREATE TABLE IF NOT EXISTS message_reactions (
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS message_reactions_msg_idx ON message_reactions (message_id);

ALTER TABLE messages ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES messages(id) ON DELETE SET NULL;

-- Full-text search tiếng Việt (unaccent)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS body_tsv tsvector;
UPDATE messages SET body_tsv = to_tsvector('simple', unaccent(coalesce(body, '')))
  WHERE body_tsv IS NULL;
CREATE INDEX IF NOT EXISTS messages_body_tsv_idx ON messages USING GIN (body_tsv);

CREATE OR REPLACE FUNCTION messages_body_tsv_trigger() RETURNS trigger AS $$
BEGIN
  NEW.body_tsv := to_tsvector('simple', unaccent(coalesce(NEW.body, '')));
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_messages_body_tsv ON messages;
CREATE TRIGGER trg_messages_body_tsv
  BEFORE INSERT OR UPDATE OF body ON messages
  FOR EACH ROW EXECUTE FUNCTION messages_body_tsv_trigger();

ALTER TABLE user_google_accounts
  ADD COLUMN IF NOT EXISTS tasks_sync_cursor TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tasks_last_pull_at TIMESTAMPTZ;
`,
  },
  {
    id: "006_phase3_4_6a_scaffold",
    sql: `
CREATE TABLE IF NOT EXISTS google_chat_event_dedupe (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_sheets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  spreadsheet_id TEXT,
  sheet_title TEXT NOT NULL DEFAULT 'Tasks',
  drive_file_id TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  last_push_at TIMESTAMPTZ,
  last_pull_at TIMESTAMPTZ,
  content_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id)
);

CREATE TABLE IF NOT EXISTS ai_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_sessions_user_idx ON ai_sessions (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS ai_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES ai_sessions(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_audit_user_idx ON ai_audit (user_id, created_at DESC);
`,
  },
  {
    id: "007_phase35_6c_6e_scaffold",
    sql: `
ALTER TABLE messages ADD COLUMN IF NOT EXISTS origin TEXT NOT NULL DEFAULT 'APP';

CREATE TABLE IF NOT EXISTS google_chat_spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_name TEXT NOT NULL UNIQUE,
  group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  chat_ingest_enabled BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS google_message_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  google_message_name TEXT NOT NULL UNIQUE,
  google_update_time TIMESTAMPTZ,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  space_id UUID REFERENCES google_chat_spaces(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_watch_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES google_chat_spaces(id) ON DELETE CASCADE,
  expire_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  last_renew_at TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (space_id)
);

CREATE TABLE IF NOT EXISTS content_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  group_id UUID REFERENCES groups(id) ON DELETE CASCADE,
  chunk_text TEXT NOT NULL,
  embedding JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS content_embeddings_group_idx ON content_embeddings (group_id);
`,
  },
  {
    id: "008_phase16_17_deepen",
    sql: `
CREATE TABLE IF NOT EXISTS device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  token TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

CREATE INDEX IF NOT EXISTS device_tokens_user_idx ON device_tokens (user_id);

CREATE TABLE IF NOT EXISTS push_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_jobs_pending_idx
  ON push_jobs (status, created_at)
  WHERE status IN ('PENDING', 'RETRY');

CREATE TABLE IF NOT EXISTS file_download_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS file_download_audit_file_idx ON file_download_audit (file_id, created_at DESC);
`,
  },
  {
    id: "009_phase2_25_deepen",
    sql: `
ALTER TABLE google_task_links
  ADD COLUMN IF NOT EXISTS field_hashes JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE user_google_accounts
  ADD COLUMN IF NOT EXISTS tasks_poll_interval_s INT NOT NULL DEFAULT 300,
  ADD COLUMN IF NOT EXISTS tasks_next_poll_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tasks_empty_streak INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS user_google_accounts_next_poll_idx
  ON user_google_accounts (tasks_next_poll_at)
  WHERE is_primary = true AND refresh_token_enc IS NOT NULL;
`,
  },
  {
    id: "010_phase4_5_sheets_hardening",
    sql: `
ALTER TABLE group_sheets
  ADD COLUMN IF NOT EXISTS row_hashes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS writable_columns TEXT[] NOT NULL DEFAULT ARRAY['status','personal_note']::TEXT[],
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS drive_watch_channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  file_id TEXT NOT NULL,
  channel_id TEXT NOT NULL UNIQUE,
  resource_id TEXT,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS drive_watch_channels_group_idx ON drive_watch_channels (group_id);
CREATE INDEX IF NOT EXISTS drive_watch_channels_expires_idx ON drive_watch_channels (expires_at)
  WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS sync_jobs_failed_idx ON sync_jobs (status, updated_at DESC)
  WHERE status IN ('FAILED', 'AUTH_REQUIRED');
`,
  },
  {
    id: "011_google_account_email_multi",
    sql: `
ALTER TABLE user_google_accounts
  ADD COLUMN IF NOT EXISTS email TEXT;
`,
  },
  {
    id: "012_task_due_date",
    sql: `
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date DATE;
`,
  },
  {
    id: "013_dm_pair_key",
    sql: `
ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS dm_pair_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_dm_pair_uidx
  ON conversations (group_id, dm_pair_key)
  WHERE type = 'DM' AND group_id IS NOT NULL AND dm_pair_key IS NOT NULL;
`,
  },
  {
    id: "014_google_chat_space_link_meta",
    sql: `
ALTER TABLE google_chat_spaces
  ADD COLUMN IF NOT EXISTS linked_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS display_name TEXT,
  ADD COLUMN IF NOT EXISTS space_type TEXT;
CREATE INDEX IF NOT EXISTS google_chat_spaces_group_idx
  ON google_chat_spaces (group_id) WHERE group_id IS NOT NULL;
`,
  },
  {
    id: "015_task_parent_id",
    sql: `
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES tasks(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS tasks_group_parent_idx ON tasks (group_id, parent_id);
`,
  },
  {
    id: "016_task_starred",
    sql: `
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS starred BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS tasks_group_starred_idx ON tasks (group_id, starred) WHERE starred = true;
`,
  },
  {
    id: "017_user_group_tasklist_maps",
    sql: `
CREATE TABLE IF NOT EXISTS user_group_tasklist_maps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  google_tasklist_id TEXT NOT NULL,
  google_tasklist_title TEXT,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  UNIQUE (user_id, group_id),
  UNIQUE (user_id, google_tasklist_id)
);
CREATE INDEX IF NOT EXISTS user_group_tasklist_maps_user_idx
  ON user_group_tasklist_maps (user_id);
`,
  },
];
