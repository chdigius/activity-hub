import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'activityhub.db'));

db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  scope TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT,
  summary TEXT,
  content_html TEXT,
  url TEXT NOT NULL,
  media_json TEXT,
  tags_json TEXT,
  published_at TEXT NOT NULL,
  fingerprint TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_events_published ON events(published_at DESC);

CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  activity_json TEXT NOT NULL,
  published_at TEXT NOT NULL,
  FOREIGN KEY(event_id) REFERENCES events(id)
);

CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  dest TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|ok|failed
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_error TEXT
);

CREATE TABLE IF NOT EXISTS followers (
  actor_id TEXT NOT NULL,
  follower TEXT NOT NULL,
  PRIMARY KEY (actor_id, follower)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_delivery ON deliveries(event_id, dest);
`);

export default db;
