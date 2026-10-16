import type { Availability, EvidenceSource } from "../types.ts";

/** A video as reported by one import source, before merging. */
export interface ImportedVideo {
  id: string;
  title: string;
  description?: string;
  publishedAt?: string | null;
  durationSeconds?: number | null;
  thumbnailUrl?: string | null;
  availability?: Availability;
  metrics: Record<string, number>;
}

export interface ImportBatch {
  source: EvidenceSource;
  /** Human-readable description of exactly what was read. */
  label: string;
  videos: ImportedVideo[];
  warnings: string[];
  channel?: { id: string; title: string; description?: string; subscriberCount?: number | null; videoCount?: number | null };
}
