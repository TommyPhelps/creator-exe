// Typed repositories over the SQLite schema. Every function takes the Db so it
// runs identically in the Windows app and in tests.

import type { Db, Statement } from "../platform/types.ts";
import type { LibraryGame } from "../domain/games/library.ts";
import { newId, nowIso, parseJson } from "../lib/util.ts";
import { EMPTY_START_PLAN } from "../domain/startGuide.ts";
import type {
  Complexity,
  Destination,
  Durability,
  EvidenceSource,
  FeedbackDetail,
  FeedbackFlag,
  Idea,
  IdeaDetails,
  IdeaFeedback,
  IdeaOrigin,
  IdeaStatus,
  Moment,
  PackageContent,
  ProfileItem,
  ProfileKind,
  ProfileScope,
  Project,
  ProjectDetails,
  ProjectEvent,
  ProjectTask,
  Reaction,
  ResearchItem,
  Stage,
  StreamMode,
  StreamSession,
  TaskList,
  ThumbnailRecord,
  TitleCandidate,
  UploadPackage,
  Video,
  VideoFeedback,
  VideoMetric,
} from "../domain/types.ts";

type Row = Record<string, unknown>;
const str = (v: unknown): string => (typeof v === "string" ? v : v === null || v === undefined ? "" : String(v));
const strOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): number => (typeof v === "number" ? v : Number(v ?? 0));
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

// ---------------------------------------------------------------- settings

export async function getSetting<T>(db: Db, key: string, fallback: T): Promise<T> {
  const rows = await db.select<Row>("SELECT value FROM settings WHERE key = ?", [key]);
  return rows[0] ? parseJson<T>(rows[0].value, fallback) : fallback;
}

export async function setSetting(db: Db, key: string, value: unknown): Promise<void> {
  await db.execute(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, JSON.stringify(value)],
  );
}

// ---------------------------------------------------------------- profile

const toProfile = (r: Row): ProfileItem => ({
  id: str(r.id),
  kind: str(r.kind) as ProfileKind,
  value: str(r.value),
  durability: str(r.durability) as Durability,
  scope: (str(r.scope) || "channel") as ProfileScope,
  note: str(r.note),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

export async function listProfile(db: Db): Promise<ProfileItem[]> {
  return (await db.select<Row>("SELECT * FROM profile_items ORDER BY kind, created_at")).map(toProfile);
}

export async function addProfileItem(
  db: Db,
  kind: ProfileKind,
  value: string,
  durability: Durability = "enduring",
  note = "",
  scope: ProfileScope = "channel",
): Promise<ProfileItem> {
  const t = nowIso();
  const item: ProfileItem = { id: newId(), kind, value: value.trim(), durability, scope, note, createdAt: t, updatedAt: t };
  await db.execute(
    "INSERT INTO profile_items (id, kind, value, durability, scope, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    [item.id, kind, item.value, durability, scope, note, t, t],
  );
  return item;
}

export async function updateProfileItem(db: Db, id: string, patch: Partial<Pick<ProfileItem, "value" | "durability" | "note" | "kind" | "scope">>): Promise<void> {
  const rows = await db.select<Row>("SELECT * FROM profile_items WHERE id = ?", [id]);
  if (!rows[0]) return;
  const cur = toProfile(rows[0]);
  const next = { ...cur, ...patch };
  await db.execute("UPDATE profile_items SET kind = ?, value = ?, durability = ?, scope = ?, note = ?, updated_at = ? WHERE id = ?", [
    next.kind,
    next.value,
    next.durability,
    next.scope,
    next.note,
    nowIso(),
    id,
  ]);
}

export async function deleteProfileItem(db: Db, id: string): Promise<void> {
  await db.execute("DELETE FROM profile_items WHERE id = ?", [id]);
}

// ---------------------------------------------------------------- videos

const toVideo = (r: Row): Video => ({
  id: str(r.id),
  title: str(r.title),
  description: str(r.description),
  publishedAt: strOrNull(r.published_at),
  durationSeconds: numOrNull(r.duration_seconds),
  thumbnailUrl: strOrNull(r.thumbnail_url),
  availability: str(r.availability) as Video["availability"],
  firstSource: str(r.first_source) as EvidenceSource,
  lastSyncedAt: strOrNull(r.last_synced_at),
  userCategory: str(r.user_category),
  userFormat: str(r.user_format),
  userEffort: numOrNull(r.user_effort),
  userNotes: str(r.user_notes),
  userSubjects: parseJson<string[]>(r.user_subjects, []),
  relatedProjectId: strOrNull(r.related_project_id),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

export async function listVideos(db: Db): Promise<Video[]> {
  return (await db.select<Row>("SELECT * FROM videos ORDER BY COALESCE(published_at, created_at) DESC")).map(toVideo);
}

export async function getVideo(db: Db, id: string): Promise<Video | null> {
  const rows = await db.select<Row>("SELECT * FROM videos WHERE id = ?", [id]);
  return rows[0] ? toVideo(rows[0]) : null;
}

export async function updateVideoAnnotations(
  db: Db,
  id: string,
  patch: Partial<Pick<Video, "userCategory" | "userFormat" | "userEffort" | "userNotes" | "relatedProjectId" | "userSubjects">>,
): Promise<void> {
  const v = await getVideo(db, id);
  if (!v) return;
  const n = { ...v, ...patch };
  await db.execute(
    "UPDATE videos SET user_category = ?, user_format = ?, user_effort = ?, user_notes = ?, related_project_id = ?, user_subjects = ?, updated_at = ? WHERE id = ?",
    [n.userCategory, n.userFormat, n.userEffort, n.userNotes, n.relatedProjectId, JSON.stringify(n.userSubjects), nowIso(), id],
  );
}

export async function addManualVideo(db: Db, input: { id?: string; title: string; publishedAt?: string | null; durationSeconds?: number | null; description?: string }): Promise<Video> {
  const t = nowIso();
  const id = input.id?.trim() || `manual-${newId()}`;
  await db.execute(
    `INSERT INTO videos (id, title, description, published_at, duration_seconds, thumbnail_url, availability, first_source, last_synced_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'unknown', 'manual', NULL, ?, ?)`,
    [id, input.title.trim(), input.description ?? "", input.publishedAt ?? null, input.durationSeconds ?? null, input.id ? `https://i.ytimg.com/vi/${input.id}/mqdefault.jpg` : null, t, t],
  );
  const v = await getVideo(db, id);
  if (!v) throw new Error("video insert failed");
  return v;
}

export async function deleteVideo(db: Db, id: string): Promise<void> {
  await db.execute("DELETE FROM videos WHERE id = ?", [id]);
}

export async function deleteAllChannelData(db: Db): Promise<void> {
  await db.batch([{ sql: "DELETE FROM video_metrics" }, { sql: "DELETE FROM video_feedback" }, { sql: "DELETE FROM videos" }]);
}

const toMetric = (r: Row): VideoMetric => ({
  videoId: str(r.video_id),
  metric: str(r.metric),
  source: str(r.source) as EvidenceSource,
  value: num(r.value),
  capturedAt: str(r.captured_at),
});

export async function listMetrics(db: Db, videoId?: string): Promise<VideoMetric[]> {
  const rows = videoId
    ? await db.select<Row>("SELECT * FROM video_metrics WHERE video_id = ? ORDER BY metric", [videoId])
    : await db.select<Row>("SELECT * FROM video_metrics ORDER BY video_id, metric");
  return rows.map(toMetric);
}

export async function setManualMetric(db: Db, videoId: string, metric: string, value: number | null): Promise<void> {
  if (value === null || !Number.isFinite(value)) {
    await db.execute("DELETE FROM video_metrics WHERE video_id = ? AND metric = ? AND source = 'manual'", [videoId, metric]);
    return;
  }
  await db.execute(
    `INSERT INTO video_metrics (video_id, metric, source, value, captured_at) VALUES (?, ?, 'manual', ?, ?)
     ON CONFLICT(video_id, metric, source) DO UPDATE SET value = excluded.value, captured_at = excluded.captured_at`,
    [videoId, metric, value, nowIso()],
  );
}

const toFeedback = (r: Row): VideoFeedback => ({
  videoId: str(r.video_id),
  flags: parseJson<FeedbackFlag[]>(r.flags, []),
  enjoyOverall: numOrNull(r.enjoy_overall),
  enjoyRecording: numOrNull(r.enjoy_recording),
  enjoyEditing: numOrNull(r.enjoy_editing),
  pride: numOrNull(r.pride),
  effort: numOrNull(r.effort),
  revisit: numOrNull(r.revisit),
  updatedAt: str(r.updated_at),
});

export async function listVideoFeedback(db: Db): Promise<VideoFeedback[]> {
  return (await db.select<Row>("SELECT * FROM video_feedback")).map(toFeedback);
}

export async function saveVideoFeedback(db: Db, fb: Omit<VideoFeedback, "updatedAt">): Promise<void> {
  await db.execute(
    `INSERT INTO video_feedback (video_id, flags, enjoy_overall, enjoy_recording, enjoy_editing, pride, effort, revisit, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(video_id) DO UPDATE SET flags = excluded.flags, enjoy_overall = excluded.enjoy_overall,
       enjoy_recording = excluded.enjoy_recording, enjoy_editing = excluded.enjoy_editing, pride = excluded.pride,
       effort = excluded.effort, revisit = excluded.revisit, updated_at = excluded.updated_at`,
    [fb.videoId, JSON.stringify(fb.flags), fb.enjoyOverall, fb.enjoyRecording, fb.enjoyEditing, fb.pride, fb.effort, fb.revisit, nowIso()],
  );
}

// ---------------------------------------------------------------- ideas

const toIdea = (r: Row): Idea => ({
  id: str(r.id),
  origin: str(r.origin) as IdeaOrigin,
  libraryKey: strOrNull(r.library_key),
  title: str(r.title),
  premise: str(r.premise),
  notes: str(r.notes),
  details: parseJson<IdeaDetails | null>(r.details, null),
  subjects: parseJson<string[]>(r.subjects, []),
  status: str(r.status) as IdeaStatus,
  priority: num(r.priority),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

export async function listIdeas(db: Db, statuses?: IdeaStatus[]): Promise<Idea[]> {
  if (statuses && statuses.length) {
    const q = statuses.map(() => "?").join(",");
    return (await db.select<Row>(`SELECT * FROM ideas WHERE status IN (${q}) ORDER BY priority DESC, updated_at DESC`, statuses)).map(toIdea);
  }
  return (await db.select<Row>("SELECT * FROM ideas ORDER BY priority DESC, updated_at DESC")).map(toIdea);
}

export async function getIdea(db: Db, id: string): Promise<Idea | null> {
  const rows = await db.select<Row>("SELECT * FROM ideas WHERE id = ?", [id]);
  return rows[0] ? toIdea(rows[0]) : null;
}

export async function findIdeaByKey(db: Db, key: string): Promise<Idea | null> {
  const rows = await db.select<Row>("SELECT * FROM ideas WHERE library_key = ? ORDER BY updated_at DESC LIMIT 1", [key]);
  return rows[0] ? toIdea(rows[0]) : null;
}

export async function saveIdea(
  db: Db,
  input: { origin: IdeaOrigin; libraryKey?: string | null; title: string; premise?: string; notes?: string; details?: IdeaDetails | null; subjects?: string[]; status?: IdeaStatus; priority?: number },
): Promise<Idea> {
  if (input.libraryKey) {
    const existing = await findIdeaByKey(db, input.libraryKey);
    if (existing) {
      if (input.status && input.status !== existing.status) await setIdeaStatus(db, existing.id, input.status);
      return (await getIdea(db, existing.id)) ?? existing;
    }
  }
  const t = nowIso();
  const idea: Idea = {
    id: newId(),
    origin: input.origin,
    libraryKey: input.libraryKey ?? null,
    title: input.title.trim(),
    premise: input.premise?.trim() ?? "",
    notes: input.notes ?? "",
    details: input.details ?? null,
    subjects: input.subjects ?? [],
    status: input.status ?? "inbox",
    priority: input.priority ?? 0,
    createdAt: t,
    updatedAt: t,
  };
  await db.execute(
    "INSERT INTO ideas (id, origin, library_key, title, premise, notes, details, subjects, status, priority, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [idea.id, idea.origin, idea.libraryKey, idea.title, idea.premise, idea.notes, JSON.stringify(idea.details), JSON.stringify(idea.subjects), idea.status, idea.priority, t, t],
  );
  return idea;
}

export async function updateIdea(db: Db, id: string, patch: Partial<Pick<Idea, "title" | "premise" | "priority" | "status" | "subjects" | "notes">>): Promise<void> {
  const cur = await getIdea(db, id);
  if (!cur) return;
  const n = { ...cur, ...patch };
  await db.execute("UPDATE ideas SET title = ?, premise = ?, notes = ?, priority = ?, status = ?, subjects = ?, updated_at = ? WHERE id = ?", [
    n.title,
    n.premise,
    n.notes,
    n.priority,
    n.status,
    JSON.stringify(n.subjects),
    nowIso(),
    id,
  ]);
}

/** The project already started from this idea, if any (so Start never makes a duplicate). */
export async function findProjectForIdea(db: Db, ideaId: string): Promise<Project | null> {
  const rows = await db.select<Row>("SELECT * FROM projects WHERE idea_id = ? ORDER BY archived ASC, updated_at DESC LIMIT 1", [ideaId]);
  return rows[0] ? toProject(rows[0]) : null;
}

export async function setIdeaStatus(db: Db, id: string, status: IdeaStatus): Promise<void> {
  await db.execute("UPDATE ideas SET status = ?, updated_at = ? WHERE id = ?", [status, nowIso(), id]);
}

export async function deleteIdea(db: Db, id: string): Promise<void> {
  await db.execute("DELETE FROM ideas WHERE id = ?", [id]);
}

const toFeedbackRow = (r: Row): IdeaFeedback => ({
  id: str(r.id),
  ideaKey: str(r.idea_key),
  reaction: str(r.reaction) as Reaction,
  subjects: parseJson<string[]>(r.subjects, []),
  detail: parseJson<FeedbackDetail>(r.detail, {}),
  createdAt: str(r.created_at),
});

export async function recordIdeaFeedback(db: Db, ideaKey: string, reaction: Reaction, subjects: string[], detail: FeedbackDetail = {}): Promise<IdeaFeedback> {
  const fb: IdeaFeedback = { id: newId(), ideaKey, reaction, subjects, detail, createdAt: nowIso() };
  await db.execute("INSERT INTO idea_feedback (id, idea_key, reaction, subjects, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)", [
    fb.id,
    ideaKey,
    reaction,
    JSON.stringify(subjects),
    JSON.stringify(detail),
    fb.createdAt,
  ]);
  return fb;
}

export async function listIdeaFeedback(db: Db): Promise<IdeaFeedback[]> {
  return (await db.select<Row>("SELECT * FROM idea_feedback ORDER BY created_at DESC")).map(toFeedbackRow);
}

export async function deleteIdeaFeedback(db: Db, id: string): Promise<void> {
  await db.execute("DELETE FROM idea_feedback WHERE id = ?", [id]);
}

export async function recordImpressions(db: Db, keys: string[]): Promise<void> {
  const t = nowIso();
  if (!keys.length) return;
  await db.batch(keys.map((k) => ({ sql: "INSERT INTO idea_impressions (idea_key, shown_at) VALUES (?, ?)", params: [k, t] })));
  // Keep the table small: only the last 400 impressions matter for variety.
  await db.execute(
    "DELETE FROM idea_impressions WHERE rowid NOT IN (SELECT rowid FROM idea_impressions ORDER BY shown_at DESC LIMIT 400)",
  );
}

export async function listImpressions(db: Db): Promise<{ ideaKey: string; shownAt: string }[]> {
  return (await db.select<Row>("SELECT idea_key, shown_at FROM idea_impressions ORDER BY shown_at DESC")).map((r) => ({
    ideaKey: str(r.idea_key),
    shownAt: str(r.shown_at),
  }));
}

// ---------------------------------------------------------------- projects

export const EMPTY_DETAILS: ProjectDetails = {
  research: "",
  recordingRequirements: "",
  equipment: "",
  locations: "",
  questions: "",
  thingsToCapture: "",
  references: "",
  structure: "",
  assets: "",
  thumbnailConcepts: "",
  uploadInfo: "",
  notes: "",
  links: [],
  customStatus: "",
  origin: "",
  game: "",
  videoType: "",
  access: "",
  hook: "",
  watchAppeal: "",
  approaches: [],
  chosenApproach: null,
  startingSituation: "",
  visualBeats: [],
  needs: [],
  whySuits: [],
  firstFive: "",
  smallestVideo: "",
  ifItGoesWell: "",
  myNotes: "",
  source: null,
  startPlan: EMPTY_START_PLAN,
  startFrom: null,
};

const toProject = (r: Row): Project => ({
  id: str(r.id),
  title: str(r.title),
  premise: str(r.premise),
  why: str(r.why),
  stage: str(r.stage) as Stage,
  complexity: str(r.complexity) as Complexity,
  priority: num(r.priority),
  nextAction: str(r.next_action),
  folderPath: strOrNull(r.folder_path),
  ideaId: strOrNull(r.idea_id),
  subjects: parseJson<string[]>(r.subjects, []),
  details: { ...EMPTY_DETAILS, ...parseJson<Partial<ProjectDetails>>(r.details, {}) },
  archived: num(r.archived) === 1,
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
  openedAt: strOrNull(r.opened_at),
  destination: (["youtube", "twitch", "both"].includes(str(r.destination)) ? str(r.destination) : "youtube") as Destination,
  sourceProjectId: strOrNull(r.source_project_id),
});

export async function listProjects(db: Db, includeArchived = false): Promise<Project[]> {
  const sql = includeArchived
    ? "SELECT * FROM projects ORDER BY priority DESC, updated_at DESC"
    : "SELECT * FROM projects WHERE archived = 0 ORDER BY priority DESC, updated_at DESC";
  return (await db.select<Row>(sql)).map(toProject);
}

export async function getProject(db: Db, id: string): Promise<Project | null> {
  const rows = await db.select<Row>("SELECT * FROM projects WHERE id = ?", [id]);
  return rows[0] ? toProject(rows[0]) : null;
}

export interface NewProjectInput {
  title: string;
  premise?: string;
  why?: string;
  complexity?: Complexity;
  nextAction?: string;
  ideaId?: string | null;
  subjects?: string[];
  details?: Partial<ProjectDetails>;
  tasks?: { list: TaskList; label: string }[];
  stage?: Stage;
  destination?: Destination;
  sourceProjectId?: string | null;
}

export async function createProject(db: Db, input: NewProjectInput): Promise<Project> {
  const t = nowIso();
  const id = newId();
  const details: ProjectDetails = { ...EMPTY_DETAILS, ...(input.details ?? {}) };
  const statements = [
    {
      sql: `INSERT INTO projects (id, title, premise, why, stage, complexity, priority, next_action, folder_path, idea_id, subjects, details, archived, created_at, updated_at, opened_at, destination, source_project_id)
            VALUES (?, ?, ?, ?, ?, ?, 0, ?, NULL, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
      params: [
        id,
        input.title.trim() || "Untitled video",
        input.premise ?? "",
        input.why ?? "",
        input.stage ?? "idea",
        input.complexity ?? "standard",
        input.nextAction ?? "",
        input.ideaId ?? null,
        JSON.stringify(input.subjects ?? []),
        JSON.stringify(details),
        t,
        t,
        t,
        input.destination ?? "youtube",
        input.sourceProjectId ?? null,
      ],
    },
    {
      sql: "INSERT INTO project_events (id, project_id, kind, detail, created_at) VALUES (?, ?, 'created', ?, ?)",
      params: [newId(), id, input.ideaId ? "Started from a saved idea" : "Project initialized", t],
    },
    ...(input.tasks ?? []).map((task, i) => ({
      sql: "INSERT INTO project_tasks (id, project_id, list, label, done, position, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
      params: [newId(), id, task.list, task.label, i, t],
    })),
  ];
  if (input.ideaId) {
    statements.push({ sql: "UPDATE ideas SET status = 'started', updated_at = ? WHERE id = ?", params: [t, input.ideaId] });
  }
  await db.batch(statements);
  const p = await getProject(db, id);
  if (!p) throw new Error("project insert failed");
  return p;
}

export type ProjectPatch = Partial<Pick<Project, "title" | "premise" | "why" | "stage" | "complexity" | "priority" | "nextAction" | "folderPath" | "subjects" | "archived" | "destination">> & {
  details?: Partial<ProjectDetails>;
};

export async function updateProject(db: Db, id: string, patch: ProjectPatch): Promise<Project | null> {
  const cur = await getProject(db, id);
  if (!cur) return null;
  const n: Project = { ...cur, ...patch, details: { ...cur.details, ...(patch.details ?? {}) } };
  const t = nowIso();
  const statements = [
    {
      sql: `UPDATE projects SET title = ?, premise = ?, why = ?, stage = ?, complexity = ?, priority = ?, next_action = ?, folder_path = ?,
            subjects = ?, details = ?, archived = ?, destination = ?, updated_at = ? WHERE id = ?`,
      params: [n.title, n.premise, n.why, n.stage, n.complexity, n.priority, n.nextAction, n.folderPath, JSON.stringify(n.subjects), JSON.stringify(n.details), n.archived ? 1 : 0, n.destination, t, id],
    },
  ];
  if (patch.stage && patch.stage !== cur.stage) {
    statements.push({
      sql: "INSERT INTO project_events (id, project_id, kind, detail, created_at) VALUES (?, ?, 'stage', ?, ?)",
      params: [newId(), id, `${cur.stage} -> ${patch.stage}`, t],
    });
  }
  if (patch.archived !== undefined && patch.archived !== cur.archived) {
    statements.push({
      sql: "INSERT INTO project_events (id, project_id, kind, detail, created_at) VALUES (?, ?, 'archive', ?, ?)",
      params: [newId(), id, patch.archived ? "Archived" : "Restored from archive", t],
    });
  }
  await db.batch(statements);
  return getProject(db, id);
}

export async function touchProject(db: Db, id: string): Promise<void> {
  await db.execute("UPDATE projects SET opened_at = ? WHERE id = ?", [nowIso(), id]);
}

export async function deleteProject(db: Db, id: string): Promise<void> {
  await db.execute("DELETE FROM projects WHERE id = ?", [id]);
}

export async function logProjectEvent(db: Db, projectId: string, kind: string, detail: string): Promise<void> {
  await db.execute("INSERT INTO project_events (id, project_id, kind, detail, created_at) VALUES (?, ?, ?, ?, ?)", [newId(), projectId, kind, detail, nowIso()]);
}

export async function listProjectEvents(db: Db, projectId: string): Promise<ProjectEvent[]> {
  return (await db.select<Row>("SELECT * FROM project_events WHERE project_id = ? ORDER BY created_at DESC", [projectId])).map((r) => ({
    id: str(r.id),
    projectId: str(r.project_id),
    kind: str(r.kind),
    detail: str(r.detail),
    createdAt: str(r.created_at),
  }));
}

const toTask = (r: Row): ProjectTask => ({
  id: str(r.id),
  projectId: str(r.project_id),
  list: str(r.list) as TaskList,
  label: str(r.label),
  done: num(r.done) === 1,
  position: num(r.position),
  createdAt: str(r.created_at),
});

export async function listTasks(db: Db, projectId?: string): Promise<ProjectTask[]> {
  const rows = projectId
    ? await db.select<Row>("SELECT * FROM project_tasks WHERE project_id = ? ORDER BY list, position", [projectId])
    : await db.select<Row>("SELECT * FROM project_tasks ORDER BY project_id, list, position");
  return rows.map(toTask);
}

export async function addTask(db: Db, projectId: string, list: TaskList, label: string): Promise<ProjectTask> {
  const rows = await db.select<Row>("SELECT COALESCE(MAX(position), -1) + 1 AS p FROM project_tasks WHERE project_id = ? AND list = ?", [projectId, list]);
  const task: ProjectTask = { id: newId(), projectId, list, label: label.trim(), done: false, position: num(rows[0]?.p), createdAt: nowIso() };
  await db.execute("INSERT INTO project_tasks (id, project_id, list, label, done, position, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)", [
    task.id,
    projectId,
    list,
    task.label,
    task.position,
    task.createdAt,
  ]);
  return task;
}

export async function setTaskDone(db: Db, id: string, done: boolean): Promise<void> {
  await db.execute("UPDATE project_tasks SET done = ? WHERE id = ?", [done ? 1 : 0, id]);
}

export async function renameTask(db: Db, id: string, label: string): Promise<void> {
  await db.execute("UPDATE project_tasks SET label = ? WHERE id = ?", [label, id]);
}

export async function deleteTask(db: Db, id: string): Promise<void> {
  await db.execute("DELETE FROM project_tasks WHERE id = ?", [id]);
}

// ---------------------------------------------------------------- research

const toResearch = (r: Row): ResearchItem => ({
  id: str(r.id),
  projectId: strOrNull(r.project_id),
  kind: str(r.kind) as ResearchItem["kind"],
  title: str(r.title),
  url: str(r.url),
  publisher: str(r.publisher),
  publishedAt: str(r.published_at),
  checkedAt: strOrNull(r.checked_at),
  sourceType: str(r.source_type) as ResearchItem["sourceType"],
  verification: str(r.verification) as ResearchItem["verification"],
  summary: str(r.summary),
  myNotes: str(r.my_notes),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

export async function listResearch(db: Db, projectId?: string | null): Promise<ResearchItem[]> {
  if (projectId === undefined) return (await db.select<Row>("SELECT * FROM research_items ORDER BY updated_at DESC")).map(toResearch);
  if (projectId === null) return (await db.select<Row>("SELECT * FROM research_items WHERE project_id IS NULL ORDER BY updated_at DESC")).map(toResearch);
  return (await db.select<Row>("SELECT * FROM research_items WHERE project_id = ? ORDER BY created_at", [projectId])).map(toResearch);
}

export type ResearchInput = Partial<Omit<ResearchItem, "id" | "createdAt" | "updatedAt">> & { title: string };

export async function saveResearch(db: Db, input: ResearchInput & { id?: string }): Promise<ResearchItem> {
  const t = nowIso();
  if (input.id) {
    const rows = await db.select<Row>("SELECT * FROM research_items WHERE id = ?", [input.id]);
    if (rows[0]) {
      const n = { ...toResearch(rows[0]), ...input };
      await db.execute(
        `UPDATE research_items SET project_id = ?, kind = ?, title = ?, url = ?, publisher = ?, published_at = ?, checked_at = ?, source_type = ?,
         verification = ?, summary = ?, my_notes = ?, updated_at = ? WHERE id = ?`,
        [n.projectId, n.kind, n.title, n.url, n.publisher, n.publishedAt, n.checkedAt, n.sourceType, n.verification, n.summary, n.myNotes, t, n.id],
      );
      return { ...n, updatedAt: t };
    }
  }
  const item: ResearchItem = {
    id: input.id ?? newId(),
    projectId: input.projectId ?? null,
    kind: input.kind ?? "source",
    title: input.title.trim(),
    url: input.url?.trim() ?? "",
    publisher: input.publisher ?? "",
    publishedAt: input.publishedAt ?? "",
    checkedAt: input.checkedAt ?? (input.url ? t : null),
    sourceType: input.sourceType ?? "article",
    verification: input.verification ?? "unverified",
    summary: input.summary ?? "",
    myNotes: input.myNotes ?? "",
    createdAt: t,
    updatedAt: t,
  };
  await db.execute(
    `INSERT INTO research_items (id, project_id, kind, title, url, publisher, published_at, checked_at, source_type, verification, summary, my_notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [item.id, item.projectId, item.kind, item.title, item.url, item.publisher, item.publishedAt, item.checkedAt, item.sourceType, item.verification, item.summary, item.myNotes, t, t],
  );
  return item;
}

export async function deleteResearch(db: Db, id: string): Promise<void> {
  await db.execute("DELETE FROM research_items WHERE id = ?", [id]);
}

// ---------------------------------------------------------------- thumbnails

const toThumb = (r: Row): ThumbnailRecord => ({
  id: str(r.id),
  projectId: strOrNull(r.project_id),
  name: str(r.name),
  doc: str(r.doc),
  preview: str(r.preview),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

export async function listThumbnails(db: Db, projectId?: string): Promise<ThumbnailRecord[]> {
  const rows = projectId
    ? await db.select<Row>("SELECT id, project_id, name, '' AS doc, preview, created_at, updated_at FROM thumbnails WHERE project_id = ? ORDER BY updated_at DESC", [projectId])
    : await db.select<Row>("SELECT id, project_id, name, '' AS doc, preview, created_at, updated_at FROM thumbnails ORDER BY updated_at DESC");
  return rows.map(toThumb);
}

export async function getThumbnail(db: Db, id: string): Promise<ThumbnailRecord | null> {
  const rows = await db.select<Row>("SELECT * FROM thumbnails WHERE id = ?", [id]);
  return rows[0] ? toThumb(rows[0]) : null;
}

export async function saveThumbnail(db: Db, rec: { id?: string; projectId: string | null; name: string; doc: string; preview: string }): Promise<ThumbnailRecord> {
  const t = nowIso();
  if (rec.id) {
    const existing = await getThumbnail(db, rec.id);
    if (existing) {
      await db.execute("UPDATE thumbnails SET project_id = ?, name = ?, doc = ?, preview = ?, updated_at = ? WHERE id = ?", [rec.projectId, rec.name, rec.doc, rec.preview, t, rec.id]);
      return { ...existing, ...rec, id: rec.id, updatedAt: t };
    }
  }
  const id = rec.id ?? newId();
  await db.execute("INSERT INTO thumbnails (id, project_id, name, doc, preview, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [id, rec.projectId, rec.name, rec.doc, rec.preview, t, t]);
  return { id, projectId: rec.projectId, name: rec.name, doc: rec.doc, preview: rec.preview, createdAt: t, updatedAt: t };
}

export async function deleteThumbnail(db: Db, id: string): Promise<void> {
  await db.execute("DELETE FROM thumbnails WHERE id = ?", [id]);
}

// ---------------------------------------------------------------- titles & packages

const toTitle = (r: Row): TitleCandidate => ({
  id: str(r.id),
  projectId: str(r.project_id),
  text: str(r.text),
  style: str(r.style),
  favorite: num(r.favorite) === 1,
  thumbnailId: strOrNull(r.thumbnail_id),
  createdAt: str(r.created_at),
});

export async function listTitles(db: Db, projectId: string): Promise<TitleCandidate[]> {
  return (await db.select<Row>("SELECT * FROM title_candidates WHERE project_id = ? ORDER BY favorite DESC, created_at", [projectId])).map(toTitle);
}

export async function addTitle(db: Db, projectId: string, text: string, style: string): Promise<TitleCandidate> {
  const c: TitleCandidate = { id: newId(), projectId, text: text.trim(), style, favorite: false, thumbnailId: null, createdAt: nowIso() };
  await db.execute("INSERT INTO title_candidates (id, project_id, text, style, favorite, thumbnail_id, created_at) VALUES (?, ?, ?, ?, 0, NULL, ?)", [c.id, projectId, c.text, style, c.createdAt]);
  return c;
}

export async function updateTitle(db: Db, id: string, patch: Partial<Pick<TitleCandidate, "text" | "favorite" | "thumbnailId">>): Promise<void> {
  const rows = await db.select<Row>("SELECT * FROM title_candidates WHERE id = ?", [id]);
  if (!rows[0]) return;
  const n = { ...toTitle(rows[0]), ...patch };
  await db.execute("UPDATE title_candidates SET text = ?, favorite = ?, thumbnail_id = ? WHERE id = ?", [n.text, n.favorite ? 1 : 0, n.thumbnailId, id]);
}

export async function deleteTitle(db: Db, id: string): Promise<void> {
  await db.execute("DELETE FROM title_candidates WHERE id = ?", [id]);
}

const toPackage = (r: Row): UploadPackage => ({
  id: str(r.id),
  projectId: str(r.project_id),
  label: str(r.label),
  content: parseJson<PackageContent>(r.content, {} as PackageContent),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

export async function listPackages(db: Db, projectId: string): Promise<UploadPackage[]> {
  return (await db.select<Row>("SELECT * FROM packages WHERE project_id = ? ORDER BY created_at", [projectId])).map(toPackage);
}

export async function savePackage(db: Db, pkg: { id?: string; projectId: string; label: string; content: PackageContent }): Promise<UploadPackage> {
  const t = nowIso();
  if (pkg.id) {
    const res = await db.execute("UPDATE packages SET label = ?, content = ?, updated_at = ? WHERE id = ?", [pkg.label, JSON.stringify(pkg.content), t, pkg.id]);
    if (res.rowsAffected > 0) {
      const rows = await db.select<Row>("SELECT * FROM packages WHERE id = ?", [pkg.id]);
      if (rows[0]) return toPackage(rows[0]);
    }
  }
  const id = pkg.id ?? newId();
  await db.execute("INSERT INTO packages (id, project_id, label, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", [id, pkg.projectId, pkg.label, JSON.stringify(pkg.content), t, t]);
  return { id, projectId: pkg.projectId, label: pkg.label, content: pkg.content, createdAt: t, updatedAt: t };
}

export async function deletePackage(db: Db, id: string): Promise<void> {
  await db.execute("DELETE FROM packages WHERE id = ?", [id]);
}

// ---------------------------------------------------------------- game library (imported by you) and store lookups


const toGame = (r: Row): LibraryGame => ({
  title: str(r.title),
  canon: str(r.canon),
  platform: str(r.platform) || "PC",
  ownership: (str(r.ownership) || "unknown") as LibraryGame["ownership"],
  status: strOrNull(r.status),
  rating: numOrNull(r.rating),
  favorite: num(r.favorite) === 1,
  playtimeMin: numOrNull(r.playtime_min),
  steamAppId: numOrNull(r.steam_app_id),
  releaseYear: numOrNull(r.release_year),
  tags: parseJson<string[]>(r.tags, []),
  source: str(r.source),
});

export async function listGames(db: Db): Promise<LibraryGame[]> {
  return (await db.select<Row>("SELECT * FROM games ORDER BY title COLLATE NOCASE")).map(toGame);
}

/** Adds or updates games by canonical title. "replace" clears the library first. Returns how many rows were written. */
export async function saveGames(db: Db, games: LibraryGame[], mode: "merge" | "replace" = "merge"): Promise<number> {
  const t = nowIso();
  const statements: Statement[] = mode === "replace" ? [{ sql: "DELETE FROM games" }] : [];
  for (const g of games) {
    statements.push({
      sql: `INSERT INTO games (canon, title, platform, ownership, status, rating, favorite, playtime_min, steam_app_id, release_year, tags, source, imported_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(canon) DO UPDATE SET title = excluded.title, platform = excluded.platform,
              ownership = CASE WHEN excluded.ownership = 'unknown' THEN games.ownership ELSE excluded.ownership END,
              status = COALESCE(excluded.status, games.status), rating = COALESCE(excluded.rating, games.rating),
              favorite = MAX(excluded.favorite, games.favorite), playtime_min = COALESCE(excluded.playtime_min, games.playtime_min),
              steam_app_id = COALESCE(excluded.steam_app_id, games.steam_app_id), release_year = COALESCE(excluded.release_year, games.release_year),
              tags = excluded.tags, source = excluded.source, imported_at = excluded.imported_at`,
      params: [g.canon, g.title, g.platform, g.ownership, g.status, g.rating, g.favorite ? 1 : 0, g.playtimeMin, g.steamAppId, g.releaseYear, JSON.stringify(g.tags), g.source, t],
    });
  }
  return db.batch(statements);
}

export async function setGameOwnership(db: Db, canonTitle: string, ownership: LibraryGame["ownership"]): Promise<void> {
  await db.execute("UPDATE games SET ownership = ? WHERE canon = ?", [ownership, canonTitle]);
}

export async function deleteAllGames(db: Db): Promise<void> {
  await db.execute("DELETE FROM games");
}

export interface GameInfo {
  canon: string;
  query: string;
  status: "found" | "not_found" | "error";
  steamAppId: number | null;
  steamName: string | null;
  imageUrl: string | null;
  isFree: boolean | null;
  priceText: string | null;
  source: string;
  checkedAt: string;
}

const toGameInfo = (r: Row): GameInfo => ({
  canon: str(r.canon),
  query: str(r.query),
  status: str(r.status) as GameInfo["status"],
  steamAppId: numOrNull(r.steam_app_id),
  steamName: strOrNull(r.steam_name),
  imageUrl: strOrNull(r.image_url),
  isFree: r.is_free === null || r.is_free === undefined ? null : num(r.is_free) === 1,
  priceText: strOrNull(r.price_text),
  source: str(r.source),
  checkedAt: str(r.checked_at),
});

export async function getGameInfo(db: Db, canonTitle: string): Promise<GameInfo | null> {
  const rows = await db.select<Row>("SELECT * FROM game_info WHERE canon = ?", [canonTitle]);
  return rows[0] ? toGameInfo(rows[0]) : null;
}

export async function saveGameInfo(db: Db, info: GameInfo): Promise<void> {
  await db.execute(
    `INSERT INTO game_info (canon, query, status, steam_app_id, steam_name, image_url, is_free, price_text, source, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(canon) DO UPDATE SET query = excluded.query, status = excluded.status, steam_app_id = excluded.steam_app_id,
       steam_name = excluded.steam_name, image_url = excluded.image_url, is_free = excluded.is_free, price_text = excluded.price_text,
       source = excluded.source, checked_at = excluded.checked_at`,
    [info.canon, info.query, info.status, info.steamAppId, info.steamName, info.imageUrl, info.isFree === null ? null : info.isFree ? 1 : 0, info.priceText, info.source, info.checkedAt],
  );
}

export async function clearGameInfo(db: Db): Promise<void> {
  await db.execute("DELETE FROM game_info");
}

export async function getGame(db: Db, canonTitle: string): Promise<LibraryGame | null> {
  const rows = await db.select<Row>("SELECT * FROM games WHERE canon = ?", [canonTitle]);
  return rows[0] ? toGame(rows[0]) : null;
}

// ---------------------------------------------------------------- streams (v5)

const toSession = (r: Row): StreamSession => ({
  id: str(r.id),
  projectId: str(r.project_id),
  mode: (str(r.mode) === "concept" ? "concept" : "casual") as StreamMode,
  title: str(r.title),
  category: str(r.category),
  goLiveNote: str(r.go_live_note),
  goal: str(r.goal),
  talkingPoints: str(r.talking_points),
  startedAt: strOrNull(r.started_at),
  endedAt: strOrNull(r.ended_at),
  vodUrl: str(r.vod_url),
  notes: str(r.notes),
  createdAt: str(r.created_at),
  updatedAt: str(r.updated_at),
});

export async function listSessions(db: Db, projectId: string): Promise<StreamSession[]> {
  return (await db.select<Row>("SELECT * FROM stream_sessions WHERE project_id = ? ORDER BY created_at ASC", [projectId])).map(toSession);
}

export async function createSession(db: Db, projectId: string, input: Partial<Omit<StreamSession, "id" | "projectId" | "createdAt" | "updatedAt">> = {}): Promise<StreamSession> {
  const t = nowIso();
  const id = newId();
  await db.execute(
    `INSERT INTO stream_sessions (id, project_id, mode, title, category, go_live_note, goal, talking_points, started_at, ended_at, vod_url, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, projectId, input.mode ?? "casual", input.title ?? "", input.category ?? "", input.goLiveNote ?? "", input.goal ?? "", input.talkingPoints ?? "", input.startedAt ?? null, input.endedAt ?? null, input.vodUrl ?? "", input.notes ?? "", t, t],
  );
  return (await db.select<Row>("SELECT * FROM stream_sessions WHERE id = ?", [id])).map(toSession)[0]!;
}

export async function updateSession(db: Db, id: string, patch: Partial<Omit<StreamSession, "id" | "projectId" | "createdAt" | "updatedAt">>): Promise<StreamSession | null> {
  const cur = (await db.select<Row>("SELECT * FROM stream_sessions WHERE id = ?", [id])).map(toSession)[0];
  if (!cur) return null;
  const n = { ...cur, ...patch };
  await db.execute(
    `UPDATE stream_sessions SET mode = ?, title = ?, category = ?, go_live_note = ?, goal = ?, talking_points = ?, started_at = ?, ended_at = ?, vod_url = ?, notes = ?, updated_at = ? WHERE id = ?`,
    [n.mode, n.title, n.category, n.goLiveNote, n.goal, n.talkingPoints, n.startedAt, n.endedAt, n.vodUrl, n.notes, nowIso(), id],
  );
  return (await db.select<Row>("SELECT * FROM stream_sessions WHERE id = ?", [id])).map(toSession)[0] ?? null;
}

export async function deleteSession(db: Db, id: string): Promise<void> {
  await db.execute("DELETE FROM stream_sessions WHERE id = ?", [id]);
}

const toMoment = (r: Row): Moment => ({
  id: str(r.id),
  projectId: str(r.project_id),
  sessionId: strOrNull(r.session_id),
  atText: str(r.at_text),
  offsetSeconds: numOrNull(r.offset_seconds),
  note: str(r.note),
  createdAt: str(r.created_at),
});

export async function listMoments(db: Db, projectId: string): Promise<Moment[]> {
  return (await db.select<Row>("SELECT * FROM moments WHERE project_id = ? ORDER BY COALESCE(offset_seconds, 0), created_at", [projectId])).map(toMoment);
}

export async function addMoment(db: Db, projectId: string, input: { sessionId?: string | null; atText?: string; offsetSeconds?: number | null; note?: string }): Promise<Moment> {
  const id = newId();
  await db.execute("INSERT INTO moments (id, project_id, session_id, at_text, offset_seconds, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)", [
    id,
    projectId,
    input.sessionId ?? null,
    input.atText ?? "",
    input.offsetSeconds ?? null,
    input.note ?? "",
    nowIso(),
  ]);
  return (await db.select<Row>("SELECT * FROM moments WHERE id = ?", [id])).map(toMoment)[0]!;
}

export async function updateMoment(db: Db, id: string, patch: { atText?: string; note?: string }): Promise<void> {
  const cur = (await db.select<Row>("SELECT * FROM moments WHERE id = ?", [id])).map(toMoment)[0];
  if (!cur) return;
  await db.execute("UPDATE moments SET at_text = ?, note = ? WHERE id = ?", [patch.atText ?? cur.atText, patch.note ?? cur.note, id]);
}

export async function deleteMoment(db: Db, id: string): Promise<void> {
  await db.execute("DELETE FROM moments WHERE id = ?", [id]);
}

/** Projects made from this one (e.g. a YouTube video made from a stream). */
export async function listLinkedProjects(db: Db, sourceProjectId: string): Promise<Project[]> {
  return (await db.select<Row>("SELECT * FROM projects WHERE source_project_id = ? ORDER BY created_at", [sourceProjectId])).map(toProject);
}

// ---------------------------------------------------------------- game metadata (v5)

export interface GameMeta {
  canon: string;
  /** "steam" now; "igdb" from v0.1.4. */
  source: string;
  sourceId: string;
  name: string;
  developers: string[];
  publishers: string[];
  genres: string[];
  tags: string[];
  /** Single-player, co-op, multiplayer, PvP... as the source states them. */
  modes: string[];
  releaseYear: number | null;
  checkedAt: string;
}

const toMeta = (r: Row): GameMeta => ({
  canon: str(r.canon),
  source: str(r.source),
  sourceId: str(r.source_id),
  name: str(r.name),
  developers: parseJson<string[]>(r.developers, []),
  publishers: parseJson<string[]>(r.publishers, []),
  genres: parseJson<string[]>(r.genres, []),
  tags: parseJson<string[]>(r.tags, []),
  modes: parseJson<string[]>(r.modes, []),
  releaseYear: numOrNull(r.release_year),
  checkedAt: str(r.checked_at),
});

export async function listGameMeta(db: Db): Promise<GameMeta[]> {
  return (await db.select<Row>("SELECT * FROM game_meta ORDER BY canon, source")).map(toMeta);
}

export async function saveGameMeta(db: Db, m: GameMeta): Promise<void> {
  await db.execute(
    `INSERT INTO game_meta (canon, source, source_id, name, developers, publishers, genres, tags, modes, release_year, checked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(canon, source) DO UPDATE SET source_id = excluded.source_id, name = excluded.name, developers = excluded.developers,
       publishers = excluded.publishers, genres = excluded.genres, tags = excluded.tags, modes = excluded.modes,
       release_year = excluded.release_year, checked_at = excluded.checked_at`,
    [m.canon, m.source, m.sourceId, m.name, JSON.stringify(m.developers), JSON.stringify(m.publishers), JSON.stringify(m.genres), JSON.stringify(m.tags), JSON.stringify(m.modes), m.releaseYear, m.checkedAt],
  );
}
