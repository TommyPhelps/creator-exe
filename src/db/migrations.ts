// Versioned schema migrations. Never edit a migration that has shipped:
// add a new one instead so existing user databases upgrade in place.

import type { Db } from "../platform/types.ts";

export interface Migration {
  version: number;
  name: string;
  statements: string[];
  /** Programmatic step for changes that depend on what is already there. Must be idempotent. */
  run?: (db: Db) => Promise<string[]>;
}

/**
 * The two different "schema v2" layouts that shipped:
 * - v0.1.1 (release): games, game_info, profile_items.scope, videos.user_subjects, idea_feedback.detail
 * - 0.2.0 Phase 2 dev preview: video_forensics
 * v3 makes any database contain both, without dropping or rewriting anything.
 */
const V011_COLUMNS: { table: string; column: string; ddl: string }[] = [
  { table: "profile_items", column: "scope", ddl: "ALTER TABLE profile_items ADD COLUMN scope TEXT NOT NULL DEFAULT 'channel'" },
  { table: "videos", column: "user_subjects", ddl: "ALTER TABLE videos ADD COLUMN user_subjects TEXT NOT NULL DEFAULT '[]'" },
  { table: "idea_feedback", column: "detail", ddl: "ALTER TABLE idea_feedback ADD COLUMN detail TEXT NOT NULL DEFAULT '{}'" },
];

const V011_TABLES = [
  `CREATE TABLE IF NOT EXISTS games (
    canon TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    platform TEXT NOT NULL DEFAULT 'PC',
    ownership TEXT NOT NULL DEFAULT 'unknown',
    status TEXT,
    rating INTEGER,
    favorite INTEGER NOT NULL DEFAULT 0,
    playtime_min INTEGER,
    steam_app_id INTEGER,
    release_year INTEGER,
    tags TEXT NOT NULL DEFAULT '[]',
    source TEXT NOT NULL,
    imported_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS game_info (
    canon TEXT PRIMARY KEY,
    query TEXT NOT NULL,
    status TEXT NOT NULL,
    steam_app_id INTEGER,
    steam_name TEXT,
    image_url TEXT,
    is_free INTEGER,
    price_text TEXT,
    source TEXT NOT NULL,
    checked_at TEXT NOT NULL
  )`,
];

/** The 0.2.0 preview's table, kept (with any data in it) for a later Phase 2 release. */
const PHASE2_TABLE = `CREATE TABLE IF NOT EXISTS video_forensics (
    video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
    media_json TEXT NOT NULL DEFAULT 'null',
    transcript_json TEXT NOT NULL DEFAULT 'null',
    transcript_filename TEXT NOT NULL DEFAULT '',
    thumbnail_palette TEXT NOT NULL DEFAULT '[]',
    thumbnail_filename TEXT NOT NULL DEFAULT '',
    creator_notes TEXT NOT NULL DEFAULT '',
    creator_tags TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL
  )`;

async function columnNames(db: Db, table: string): Promise<Set<string>> {
  const rows = await db.select<{ name: string }>(`SELECT name FROM pragma_table_info('${table}')`);
  return new Set(rows.map((r) => r.name));
}

async function tableNames(db: Db): Promise<Set<string>> {
  const rows = await db.select<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
  return new Set(rows.map((r) => r.name));
}

/** Adds whatever either v2 layout is missing. Never drops, renames or rewrites existing rows. */
export async function convergeSchema(db: Db): Promise<string[]> {
  const done: string[] = [];
  const before = await tableNames(db);
  for (const ddl of [...V011_TABLES, PHASE2_TABLE]) {
    const name = /IF NOT EXISTS (\w+)/.exec(ddl)?.[1] ?? "";
    if (!before.has(name)) {
      await db.execute(ddl);
      done.push(`added table ${name}`);
    }
  }
  for (const c of V011_COLUMNS) {
    if (!(await columnNames(db, c.table)).has(c.column)) {
      await db.execute(c.ddl);
      done.push(`added ${c.table}.${c.column}`);
    }
  }
  return done;
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
    name: "content focus, game library, feedback detail, topic overrides",
    statements: [
      `ALTER TABLE profile_items ADD COLUMN scope TEXT NOT NULL DEFAULT 'channel'`,
      `ALTER TABLE videos ADD COLUMN user_subjects TEXT NOT NULL DEFAULT '[]'`,
      `ALTER TABLE idea_feedback ADD COLUMN detail TEXT NOT NULL DEFAULT '{}'`,
      `CREATE TABLE games (
        canon TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'PC',
        ownership TEXT NOT NULL DEFAULT 'unknown',
        status TEXT,
        rating INTEGER,
        favorite INTEGER NOT NULL DEFAULT 0,
        playtime_min INTEGER,
        steam_app_id INTEGER,
        release_year INTEGER,
        tags TEXT NOT NULL DEFAULT '[]',
        source TEXT NOT NULL,
        imported_at TEXT NOT NULL
      )`,
      `CREATE TABLE game_info (
        canon TEXT PRIMARY KEY,
        query TEXT NOT NULL,
        status TEXT NOT NULL,
        steam_app_id INTEGER,
        steam_name TEXT,
        image_url TEXT,
        is_free INTEGER,
        price_text TEXT,
        source TEXT NOT NULL,
        checked_at TEXT NOT NULL
      )`,
    ],
  },
  {
    version: 3,
    name: "repair: merge both schema v2 layouts (v0.1.1 release and 0.2.0 preview)",
    statements: [],
    run: convergeSchema,
  },
  {
    version: 4,
    name: "your notes on ideas",
    statements: [],
    run: async (db) => {
      const have = await columnNames(db, "ideas");
      if (have.has("notes")) return [];
      await db.execute("ALTER TABLE ideas ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
      return ["added ideas.notes"];
    },
  },
  {
    version: 5,
    name: "YouTube and Twitch: destinations, stream sessions, moments, game metadata",
    statements: [],
    run: addStreamsAndMeta,
  },
  {
    version: 6,
    name: "Thumbnail Lab: your cut-outs and screenshots",
    statements: [],
    run: addThumbAssets,
  },
];

/**
 * v6 (v0.2.0). Additive: a library of the cut-outs and screenshots you add in
 * the Thumbnail Lab, so a face cut once can be reused. Existing thumbnails are
 * untouched (their images stay embedded in each thumbnail).
 */
export async function addThumbAssets(db: Db): Promise<string[]> {
  const have = await tableNames(db);
  if (have.has("thumb_assets")) return [];
  await db.execute(`CREATE TABLE IF NOT EXISTS thumb_assets (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
    src TEXT NOT NULL,
    preview TEXT NOT NULL DEFAULT '',
    w INTEGER NOT NULL,
    h INTEGER NOT NULL,
    alpha_box TEXT,
    created_at TEXT NOT NULL
  )`);
  await db.execute("CREATE INDEX IF NOT EXISTS idx_thumb_assets_kind ON thumb_assets(kind, created_at)");
  return ["added table thumb_assets"];
}

/**
 * v5 (v0.1.3). Additive and existence-checked like v3/v4: every existing
 * project becomes a YouTube project (what it already was), nothing is
 * rewritten, and running it twice does nothing.
 */
export async function addStreamsAndMeta(db: Db): Promise<string[]> {
  const out: string[] = [];
  const projectCols = await columnNames(db, "projects");
  if (!projectCols.has("destination")) {
    await db.execute("ALTER TABLE projects ADD COLUMN destination TEXT NOT NULL DEFAULT 'youtube'");
    out.push("added projects.destination");
  }
  if (!projectCols.has("source_project_id")) {
    await db.execute("ALTER TABLE projects ADD COLUMN source_project_id TEXT");
    out.push("added projects.source_project_id");
  }
  const have = await tableNames(db);
  if (!have.has("stream_sessions")) {
    await db.execute(`CREATE TABLE IF NOT EXISTS stream_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      mode TEXT NOT NULL DEFAULT 'casual',
      title TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '',
      go_live_note TEXT NOT NULL DEFAULT '',
      goal TEXT NOT NULL DEFAULT '',
      talking_points TEXT NOT NULL DEFAULT '',
      started_at TEXT,
      ended_at TEXT,
      vod_url TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`);
    await db.execute("CREATE INDEX IF NOT EXISTS idx_sessions_project ON stream_sessions(project_id)");
    out.push("added table stream_sessions");
  }
  if (!have.has("moments")) {
    await db.execute(`CREATE TABLE IF NOT EXISTS moments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      session_id TEXT REFERENCES stream_sessions(id) ON DELETE SET NULL,
      at_text TEXT NOT NULL DEFAULT '',
      offset_seconds INTEGER,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`);
    await db.execute("CREATE INDEX IF NOT EXISTS idx_moments_project ON moments(project_id)");
    out.push("added table moments");
  }
  if (!have.has("game_meta")) {
    // One row per game per source (Steam now; IGDB from v0.1.4), with the date checked.
    await db.execute(`CREATE TABLE IF NOT EXISTS game_meta (
      canon TEXT NOT NULL,
      source TEXT NOT NULL,
      source_id TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      developers TEXT NOT NULL DEFAULT '[]',
      publishers TEXT NOT NULL DEFAULT '[]',
      genres TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      modes TEXT NOT NULL DEFAULT '[]',
      release_year INTEGER,
      checked_at TEXT NOT NULL,
      PRIMARY KEY (canon, source)
    )`);
    out.push("added table game_meta");
  }
  return out;
}

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
  "games",
  "game_info",
  "video_forensics",
  "stream_sessions",
  "moments",
  "game_meta",
  "thumb_assets",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];
