// Versioned schema migrations. Never edit a migration that has shipped:
// add a new one instead so existing user databases upgrade in place.

export interface Migration {
  version: number;
  name: string;
  statements: string[];
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    name: "initial schema",
    statements: [
      `CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      `CREATE TABLE profile_items (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        value TEXT NOT NULL,
        durability TEXT NOT NULL DEFAULT 'enduring',
        note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX idx_profile_kind ON profile_items(kind)`,
      `CREATE TABLE videos (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        published_at TEXT,
        duration_seconds INTEGER,
        thumbnail_url TEXT,
        availability TEXT NOT NULL DEFAULT 'public',
        first_source TEXT NOT NULL,
        last_synced_at TEXT,
        user_category TEXT NOT NULL DEFAULT '',
        user_format TEXT NOT NULL DEFAULT '',
        user_effort INTEGER,
        user_notes TEXT NOT NULL DEFAULT '',
        related_project_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE video_metrics (
        video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        metric TEXT NOT NULL,
        source TEXT NOT NULL,
        value REAL NOT NULL,
        captured_at TEXT NOT NULL,
        PRIMARY KEY (video_id, metric, source)
      )`,
      `CREATE TABLE video_feedback (
        video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
        flags TEXT NOT NULL DEFAULT '[]',
        enjoy_overall INTEGER,
        enjoy_recording INTEGER,
        enjoy_editing INTEGER,
        pride INTEGER,
        effort INTEGER,
        revisit INTEGER,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE ideas (
        id TEXT PRIMARY KEY,
        origin TEXT NOT NULL,
        library_key TEXT,
        title TEXT NOT NULL,
        premise TEXT NOT NULL DEFAULT '',
        details TEXT NOT NULL DEFAULT '{}',
        subjects TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'inbox',
        priority INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX idx_ideas_status ON ideas(status)`,
      `CREATE TABLE idea_feedback (
        id TEXT PRIMARY KEY,
        idea_key TEXT NOT NULL,
        reaction TEXT NOT NULL,
        subjects TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX idx_feedback_key ON idea_feedback(idea_key)`,
      `CREATE TABLE idea_impressions (
        idea_key TEXT NOT NULL,
        shown_at TEXT NOT NULL
      )`,
      `CREATE INDEX idx_impressions_key ON idea_impressions(idea_key)`,
      `CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        premise TEXT NOT NULL DEFAULT '',
        why TEXT NOT NULL DEFAULT '',
        stage TEXT NOT NULL DEFAULT 'idea',
        complexity TEXT NOT NULL DEFAULT 'standard',
        priority INTEGER NOT NULL DEFAULT 0,
        next_action TEXT NOT NULL DEFAULT '',
        folder_path TEXT,
        idea_id TEXT,
        subjects TEXT NOT NULL DEFAULT '[]',
        details TEXT NOT NULL DEFAULT '{}',
        archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        opened_at TEXT
      )`,
      `CREATE INDEX idx_projects_stage ON projects(stage)`,
      `CREATE TABLE project_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        list TEXT NOT NULL DEFAULT 'prep',
        label TEXT NOT NULL,
        done INTEGER NOT NULL DEFAULT 0,
        position INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX idx_tasks_project ON project_tasks(project_id)`,
      `CREATE TABLE project_events (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        detail TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX idx_events_project ON project_events(project_id)`,
      `CREATE TABLE research_items (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        kind TEXT NOT NULL DEFAULT 'source',
        title TEXT NOT NULL,
        url TEXT NOT NULL DEFAULT '',
        publisher TEXT NOT NULL DEFAULT '',
        published_at TEXT NOT NULL DEFAULT '',
        checked_at TEXT,
        source_type TEXT NOT NULL DEFAULT 'article',
        verification TEXT NOT NULL DEFAULT 'unverified',
        summary TEXT NOT NULL DEFAULT '',
        my_notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE INDEX idx_research_project ON research_items(project_id)`,
      `CREATE TABLE thumbnails (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        name TEXT NOT NULL,
        doc TEXT NOT NULL,
        preview TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE title_candidates (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        style TEXT NOT NULL DEFAULT 'custom',
        favorite INTEGER NOT NULL DEFAULT 0,
        thumbnail_id TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE packages (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        content TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    name: "local video forensics and creator-controlled evidence",
    statements: [
      `CREATE TABLE video_forensics (
        video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
        media_json TEXT NOT NULL DEFAULT 'null',
        transcript_json TEXT NOT NULL DEFAULT 'null',
        transcript_filename TEXT NOT NULL DEFAULT '',
        thumbnail_palette TEXT NOT NULL DEFAULT '[]',
        thumbnail_filename TEXT NOT NULL DEFAULT '',
        creator_notes TEXT NOT NULL DEFAULT '',
        creator_tags TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL
      )`,
    ],
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]?.version ?? 0;

/** Tables included in JSON backups, in an order that satisfies foreign keys. */
export const BACKUP_TABLES = [
  "settings",
  "profile_items",
  "videos",
  "video_metrics",
  "video_feedback",
  "ideas",
  "idea_feedback",
  "idea_impressions",
  "projects",
  "project_tasks",
  "project_events",
  "research_items",
  "thumbnails",
  "title_candidates",
  "packages",
  "video_forensics",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];
