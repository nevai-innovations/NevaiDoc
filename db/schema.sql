-- NevaiDoc schema. Safe to run multiple times.
-- Every change below is additive (CREATE ... IF NOT EXISTS / ADD COLUMN IF
-- NOT EXISTS), so running it against a live database never breaks an
-- already-deployed older version of the app.

CREATE TABLE IF NOT EXISTS pages (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  content     TEXT NOT NULL DEFAULT '',
  "order"     INTEGER NOT NULL DEFAULT 0,
  parent_id   TEXT REFERENCES pages(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pages_parent_id_idx ON pages(parent_id);

-- Folders: a nested tree that documents are filed into. Deleting a folder
-- deletes its sub-folders, but documents inside are moved back to the top
-- level (folder_id -> NULL) rather than deleted.
CREATE TABLE IF NOT EXISTS folders (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  parent_id   TEXT REFERENCES folders(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS folders_parent_id_idx ON folders(parent_id);

-- Document metadata.
-- status: draft | in_review | changes_requested | approved
ALTER TABLE pages ADD COLUMN IF NOT EXISTS folder_id   TEXT REFERENCES folders(id) ON DELETE SET NULL;
ALTER TABLE pages ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN IF NOT EXISTS tags        TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE pages ADD COLUMN IF NOT EXISTS owner       TEXT NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE pages ADD COLUMN IF NOT EXISTS reviewer    TEXT NOT NULL DEFAULT '';
ALTER TABLE pages ADD COLUMN IF NOT EXISTS version     INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS pages_folder_id_idx ON pages(folder_id);
CREATE INDEX IF NOT EXISTS pages_status_idx ON pages(status);

-- Version history: one row per saved version of a document's title/content.
-- pages.version always equals the highest version number here.
CREATE TABLE IF NOT EXISTS page_versions (
  id          TEXT PRIMARY KEY,
  page_id     TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,
  author      TEXT NOT NULL DEFAULT '',
  note        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (page_id, version)
);

-- Pages created before version history existed get their current state
-- recorded as version 1.
INSERT INTO page_versions (id, page_id, version, title, content, note, created_at)
SELECT gen_random_uuid()::text, p.id, p.version, p.title, p.content, 'Initial version', p.updated_at
FROM pages p
WHERE NOT EXISTS (SELECT 1 FROM page_versions v WHERE v.page_id = p.id);

-- Approval workflow audit trail.
-- action: submitted | approved | changes_requested | reopened
CREATE TABLE IF NOT EXISTS approval_events (
  id          TEXT PRIMARY KEY,
  page_id     TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  actor       TEXT NOT NULL DEFAULT '',
  comment     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS approval_events_page_id_idx ON approval_events(page_id, created_at);

-- Uploaded images and architecture diagrams. Stored in Postgres so the app
-- needs no extra storage service on Vercel; uploads are capped at 4 MB each
-- (Vercel rejects request bodies over 4.5 MB).
-- kind: image | diagram
CREATE TABLE IF NOT EXISTS attachments (
  id          TEXT PRIMARY KEY,
  page_id     TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL DEFAULT 'image',
  filename    TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  size        INTEGER NOT NULL,
  caption     TEXT NOT NULL DEFAULT '',
  data        BYTEA NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attachments_page_id_idx ON attachments(page_id, created_at);

CREATE TABLE IF NOT EXISTS templates (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category    TEXT NOT NULL DEFAULT 'General',
  content     TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workspace-wide key/value settings (workspace name, display name, …).
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL
);
