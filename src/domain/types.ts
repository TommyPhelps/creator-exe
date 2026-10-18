// Core domain types shared by the UI, repositories and generators.

// ---------- Creator profile ----------

export const PROFILE_KINDS = [
  "favorite_subject",
  "favorite_game",
  "current_interest",
  "tired_of",
  "format_enjoyed",
  "production_style",
  "equipment",
  "budget",
  "on_camera",
  "voiceover",
  "thumbnail_pref",
  "avoid",
] as const;
export type ProfileKind = (typeof PROFILE_KINDS)[number];
export type Durability = "enduring" | "temporary";
/**
 * Which recommendations a profile entry influences:
 * channel = things you want to make videos about (used by the Idea Machine),
 * personal = things you enjoy in life, watching = things you like to watch.
 * Personal and watching entries are remembered but never steer ideas.
 */
export type ProfileScope = "channel" | "personal" | "watching";

export interface ProfileItem {
  id: string;
  kind: ProfileKind;
  value: string;
  durability: Durability;
  scope: ProfileScope;
  note: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- Channel ----------

export type Availability = "public" | "unlisted" | "private" | "deleted" | "unknown";

/** Where a piece of channel data came from. Shown next to every number. */
export type EvidenceSource =
  | "public_feed" // YouTube public RSS feed
  | "public_api" // YouTube Data API v3 (public data)
  | "studio_export" // CSV exported from YouTube Studio by the creator
  | "manual" // typed in by the creator
  | "local_file"; // inspected from an original file on disk

export interface Video {
  id: string;
  title: string;
  description: string;
  publishedAt: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  availability: Availability;
  firstSource: EvidenceSource;
  lastSyncedAt: string | null;
  userCategory: string;
  userFormat: string;
  userEffort: number | null;
  userNotes: string;
  /** Subject IDs you assigned yourself; when set they replace the automatic topics. */
  userSubjects: string[];
  relatedProjectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VideoMetric {
  videoId: string;
  metric: string;
  source: EvidenceSource;
  value: number;
  capturedAt: string;
}

export const FEEDBACK_FLAGS = [
  { id: "loved_making", label: "I loved making this" },
  { id: "enjoyed_recording", label: "I enjoyed recording this" },
  { id: "enjoyed_editing", label: "I enjoyed editing this" },
  { id: "proud", label: "I am proud of this" },
  { id: "would_repeat", label: "I would make something similar" },
  { id: "no_repeat", label: "I do not want to repeat this" },
  { id: "exhausting", label: "This was creatively exhausting" },
  { id: "concept_not_execution", label: "I liked the concept but not the execution" },
] as const;
export type FeedbackFlag = (typeof FEEDBACK_FLAGS)[number]["id"];

export interface VideoFeedback {
  videoId: string;
  flags: FeedbackFlag[];
  enjoyOverall: number | null;
  enjoyRecording: number | null;
  enjoyEditing: number | null;
  pride: number | null;
  effort: number | null;
  revisit: number | null;
  updatedAt: string;
}

// ---------- Ideas ----------

export type Effort = "tiny" | "small" | "medium" | "ambitious";
export type TimeBox = "30m" | "1h" | "afternoon" | "day" | "weekend" | "long";
export type Energy = "low" | "medium" | "high";
export type RecordingStyle = "screen" | "voiceover" | "face" | "real-world";
export type ContentFormat = "long" | "short" | "either";
export type Collab = "solo" | "friends" | "either";
export type Depth = "light" | "moderate" | "deep";
export type Direction = "lighthearted" | "curious" | "informational" | "experimental" | "unpredictable";
export type Originality = "well-trodden" | "uncommon" | "rare";

export interface TonightPlan {
  needs: string[];
  firstFive: string;
  minimumVideo: string;
  expansion: string;
}

export interface IdeaDetails {
  premise: string;
  why: string;
  whatYouDo: string;
  worthExploring: string;
  audience: string;
  requirements: string[];
  budgetUsd: number;
  budgetNote: string;
  effort: Effort;
  time: TimeBox;
  energy: Energy;
  recording: RecordingStyle[];
  format: ContentFormat;
  collab: Collab;
  research: Depth;
  direction: Direction[];
  thumbnail: string;
  firstStep: string;
  alternatives: string[];
  series: boolean;
  originality: Originality;
  tonight: TonightPlan | null;
  /** Why the generator surfaced it (filled at generation time). */
  reasons: string[];
  /** Since v0.1.1: what kind of video, which content domain and which games. */
  videoType?: string;
  domain?: string;
  games?: string[];
  /** Ownership/price status at the time the idea was generated, in words. */
  access?: string;
  /** Since v0.1.2: game-specific depth (filled where hand-written notes exist). */
  hook?: string;
  watchAppeal?: string;
  approaches?: Approach[];
  startingSituation?: string;
  moments?: string[];
  visualBeats?: string[];
  /** True when hook/moments/approaches were written for this specific game, not a template. */
  specific?: boolean;
}

export interface Approach {
  name: string;
  how: string;
}

export type IdeaStatus = "inbox" | "saved" | "maybe" | "rejected" | "started" | "done";
export type IdeaOrigin = "library" | "capture" | "manual" | "ai";

export interface Idea {
  id: string;
  origin: IdeaOrigin;
  libraryKey: string | null;
  title: string;
  premise: string;
  /** Your own notes on the idea; carried into the project. */
  notes: string;
  details: IdeaDetails | null;
  subjects: string[];
  status: IdeaStatus;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export const REACTIONS = [
  { id: "love", label: "Love this" },
  { id: "save", label: "Save for later" },
  { id: "maybe", label: "Maybe" },
  { id: "not_interested", label: "Not interested" },
  { id: "too_expensive", label: "Too expensive" },
  { id: "too_complicated", label: "Too complicated" },
  { id: "too_similar", label: "Too similar" },
  { id: "not_in_mood", label: "Not in the mood" },
  { id: "already_done", label: "Already done" },
  { id: "like_game", label: "I like this game" },
  { id: "like_format", label: "I like this kind of video" },
  { id: "like_topic", label: "Like the topic, not this take on it" },
  { id: "more_like", label: "More like this" },
  { id: "less_like", label: "Less like this" },
  { id: "not_this_type", label: "I don't want this type of video" },
] as const;
export type Reaction = (typeof REACTIONS)[number]["id"];

/** What the reaction was about, recorded with it so the right thing is learned. */
export interface FeedbackDetail {
  seedKey?: string;
  videoType?: string;
  games?: string[];
  domain?: string;
}

export interface IdeaFeedback {
  id: string;
  ideaKey: string;
  reaction: Reaction;
  subjects: string[];
  detail: FeedbackDetail;
  createdAt: string;
}

// ---------- Projects ----------

export const STAGES = [
  { id: "idea", label: "Idea" },
  { id: "researching", label: "Researching" },
  { id: "preparing", label: "Preparing" },
  { id: "ready_to_record", label: "Ready to record" },
  { id: "recording", label: "Recording" },
  { id: "editing", label: "Editing" },
  { id: "thumbnail", label: "Thumbnail" },
  { id: "packaging", label: "Packaging" },
  { id: "ready_to_upload", label: "Ready to upload" },
  { id: "published", label: "Published" },
  { id: "archived", label: "Archived" },
] as const;
export type Stage = (typeof STAGES)[number]["id"];
export type Complexity = "quick" | "standard" | "ambitious";

export interface ProjectDetails {
  research: string;
  recordingRequirements: string;
  equipment: string;
  locations: string;
  questions: string;
  thingsToCapture: string;
  references: string;
  structure: string;
  assets: string;
  thumbnailConcepts: string;
  uploadInfo: string;
  notes: string;
  links: { label: string; url: string }[];
  /** Free-form custom status label, shown alongside the stage. */
  customStatus: string;
  /** Snapshot of the idea the project started from (if any). */
  origin: string;
  // ---- v0.1.2 recording sheet (structured; empty for older projects) ----
  game: string;
  videoType: string;
  /** Ownership / price in words, as known when the project started. */
  access: string;
  hook: string;
  watchAppeal: string;
  approaches: Approach[];
  /** Index into approaches, or null when you haven't picked one. */
  chosenApproach: number | null;
  startingSituation: string;
  visualBeats: string[];
  /** What you need, listed once (not duplicated into a checklist). */
  needs: string[];
  whySuits: string[];
  firstFive: string;
  smallestVideo: string;
  ifItGoesWell: string;
  /** Your notes from the idea, then anything you add. */
  myNotes: string;
  /** Where the project came from. */
  source: { ideaId: string; ideaKey: string | null; seedKey: string | null; startedAt: string } | null;
}

/** Where a project is headed. A stream and a later upload are separate outcomes. */
export type Destination = "youtube" | "twitch" | "both";
export const DESTINATIONS: { id: Destination; label: string }[] = [
  { id: "youtube", label: "YouTube" },
  { id: "twitch", label: "Twitch" },
  { id: "both", label: "Both" },
];

/** Casual Live: just stream, no premise needed. Concept Stream: there's a particular thing to explore. */
export type StreamMode = "casual" | "concept";

export interface StreamSession {
  id: string;
  projectId: string;
  mode: StreamMode;
  title: string;
  category: string;
  goLiveNote: string;
  goal: string;
  talkingPoints: string;
  startedAt: string | null;
  endedAt: string | null;
  vodUrl: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

/** Something worth revisiting: typed by you, never picked automatically. */
export interface Moment {
  id: string;
  projectId: string;
  sessionId: string | null;
  /** A VOD timestamp like 1:23:45, or anything you type. */
  atText: string;
  /** Seconds since the session started, when marked with the button. */
  offsetSeconds: number | null;
  note: string;
  createdAt: string;
}

export interface Project {
  id: string;
  title: string;
  premise: string;
  why: string;
  stage: Stage;
  complexity: Complexity;
  priority: number;
  nextAction: string;
  folderPath: string | null;
  ideaId: string | null;
  subjects: string[];
  details: ProjectDetails;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  openedAt: string | null;
  destination: Destination;
  /** Set on a YouTube project made from a stream: the stream project it came from. */
  sourceProjectId: string | null;
}

export type TaskList = "prep" | "recording" | "upload" | "stream";

export interface ProjectTask {
  id: string;
  projectId: string;
  list: TaskList;
  label: string;
  done: boolean;
  position: number;
  createdAt: string;
}

export interface ProjectEvent {
  id: string;
  projectId: string;
  kind: string;
  detail: string;
  createdAt: string;
}

// ---------- Research ----------

export type ResearchKind = "source" | "note" | "question";
export type Verification = "unverified" | "verified" | "speculation" | "disputed";
export type SourceType =
  | "article"
  | "documentation"
  | "video"
  | "archive"
  | "primary"
  | "community"
  | "book"
  | "other";

export interface ResearchItem {
  id: string;
  projectId: string | null;
  kind: ResearchKind;
  title: string;
  url: string;
  publisher: string;
  publishedAt: string;
  checkedAt: string | null;
  sourceType: SourceType;
  verification: Verification;
  summary: string;
  myNotes: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- Titles & packaging ----------

export interface TitleCandidate {
  id: string;
  projectId: string;
  text: string;
  style: string;
  favorite: boolean;
  thumbnailId: string | null;
  createdAt: string;
}

export interface PackageContent {
  title: string;
  description: string;
  summary: string;
  tags: string[];
  hashtags: string[];
  credits: string;
  sources: string;
  pinnedComment: string;
  chapters: string;
  disclosures: Record<string, boolean>;
  checklist: Record<string, boolean>;
}

export interface UploadPackage {
  id: string;
  projectId: string;
  label: string;
  content: PackageContent;
  createdAt: string;
  updatedAt: string;
}

// ---------- Thumbnails ----------

export interface ThumbnailRecord {
  id: string;
  projectId: string | null;
  name: string;
  doc: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
}
