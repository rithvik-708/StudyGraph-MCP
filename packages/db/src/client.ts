import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";
import fs from "node:fs";
import path from "node:path";

export type DB = BetterSQLite3Database<typeof schema>;

const DDL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  color TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS subjects_user_id_idx ON subjects(user_id);

CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  parent_topic_id INTEGER,
  order_index INTEGER NOT NULL DEFAULT 0,
  weight REAL NOT NULL DEFAULT 1.0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS topics_user_id_idx ON topics(user_id);
CREATE INDEX IF NOT EXISTS topics_subject_order_idx ON topics(subject_id, order_index);

CREATE TABLE IF NOT EXISTS topic_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER NOT NULL UNIQUE REFERENCES topics(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','completed','needs_review')),
  mastery_pct REAL NOT NULL DEFAULT 0 CHECK (mastery_pct >= 0 AND mastery_pct <= 100),
  last_practiced_at INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS topic_progress_user_id_idx ON topic_progress(user_id);

CREATE TABLE IF NOT EXISTS study_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  topic_id INTEGER REFERENCES topics(id),
  started_at INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  notes TEXT,
  focus_rating INTEGER CHECK (focus_rating IS NULL OR (focus_rating >= 1 AND focus_rating <= 5)),
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS study_sessions_user_started_idx ON study_sessions(user_id, started_at);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  exam_date INTEGER NOT NULL,
  weight REAL NOT NULL DEFAULT 1.0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS exams_user_id_idx ON exams(user_id);

CREATE TABLE IF NOT EXISTS exam_subjects (
  exam_id INTEGER NOT NULL REFERENCES exams(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  PRIMARY KEY (exam_id, subject_id)
);

CREATE TABLE IF NOT EXISTS exam_topics (
  exam_id INTEGER NOT NULL REFERENCES exams(id),
  topic_id INTEGER NOT NULL REFERENCES topics(id),
  coverage_weight REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY (exam_id, topic_id)
);
`;

let singleton: { sqlite: Database.Database; db: DB } | null = null;

export function createDb(dbPath: string): { sqlite: Database.Database; db: DB } {
  const dir = path.dirname(dbPath);
  if (dir && dir !== "." && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(DDL);
  const db = drizzle(sqlite, { schema });
  return { sqlite, db };
}

/** Process-wide singleton, resolved from DATABASE_PATH. Use createDb() directly in tests for isolated instances. */
export function getDb(): { sqlite: Database.Database; db: DB } {
  if (!singleton) {
    const dbPath = process.env.DATABASE_PATH ?? "./data/studygraph.db";
    singleton = createDb(dbPath);
  }
  return singleton;
}
