-- NevaiDoc schema. Safe to run multiple times.
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
