// Core domain types shared by the UI, repositories and generators.

// ---------- Creator profile ----------

export const PROFILE_KINDS = [
  "favorite_subject",
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

export interface ProfileItem {
  id: string;
  kind: ProfileKind;
  value: string;
  durability: Durability;
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
}

export type IdeaStatus = "inbox" | "saved" | "maybe" | "rejected" | "started" | "done";
export type IdeaOrigin = "library" | "capture" | "manual" | "ai";

export interface Idea {
  id: string;
  origin: IdeaOrigin;
  libraryKey: string | null;
  title: string;
  premise: string;
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
] as const;
export type Reaction = (typeof REACTIONS)[number]["id"];

export interface IdeaFeedback {
  id: string;
  ideaKey: string;
  reaction: Reaction;
  subjects: string[];
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
}

export type TaskList = "prep" | "recording" | "upload";

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
