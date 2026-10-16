// YouTube Data API v3 (public data, API key). Free quota: 10,000 units/day;
// a full import of a small channel costs a handful of units.
import type { HttpResult } from "../../platform/types.ts";
import type { ImportBatch, ImportedVideo } from "./types.ts";

export type HttpGet = (url: string, signal?: AbortSignal) => Promise<HttpResult>;

const API = "https://www.googleapis.com/youtube/v3";

export class YouTubeApiError extends Error {
  readonly reason: string;
  constructor(message: string, reason: string) {
    super(message);
    this.reason = reason;
  }
}

/** Parses an ISO 8601 duration like PT1H2M3S into seconds. */
export function parseIsoDuration(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(iso);
  if (!m) return null;
  const [, d, h, min, s] = m;
  return Number(d ?? 0) * 86400 + Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Math.round(Number(s ?? 0));
}

/** Accepts a channel ID, a channel URL, an @handle or a handle URL. */
export function parseChannelInput(input: string): { channelId?: string; handle?: string } {
  const t = input.trim();
  const id = /(UC[\w-]{22})/.exec(t);
  if (id?.[1]) return { channelId: id[1] };
  const handle = /@([\w.-]{3,30})/.exec(t);
  if (handle?.[1]) return { handle: `@${handle[1]}` };
  return {};
}

function explain(res: HttpResult): YouTubeApiError {
  let reason = "unknown";
  let message = `YouTube API request failed (HTTP ${res.status}).`;
  try {
    const body = JSON.parse(res.text) as { error?: { message?: string; errors?: { reason?: string }[] } };
    reason = body.error?.errors?.[0]?.reason ?? reason;
    if (body.error?.message) message = body.error.message.replace(/<[^>]+>/g, "");
  } catch {
    /* not JSON */
  }
  if (reason === "keyInvalid" || /API key not valid/i.test(message)) return new YouTubeApiError("The YouTube API key was rejected. Check it in Settings.", reason);
  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") return new YouTubeApiError("Today's free YouTube API quota is used up. It resets at midnight Pacific time.", reason);
  if (reason === "accessNotConfigured" || /has not been used|is disabled/i.test(message))
    return new YouTubeApiError("YouTube Data API v3 is not enabled for this key's Google Cloud project. Enable it in the Google Cloud console.", reason);
  return new YouTubeApiError(message, reason);
}

async function getJson<T>(get: HttpGet, url: string, signal?: AbortSignal): Promise<T> {
  const res = await get(url, signal);
  if (!res.ok) throw explain(res);
  return JSON.parse(res.text) as T;
}

interface ChannelsResponse {
  items?: {
    id: string;
    snippet?: { title?: string; description?: string };
    contentDetails?: { relatedPlaylists?: { uploads?: string } };
    statistics?: { subscriberCount?: string; videoCount?: string; hiddenSubscriberCount?: boolean };
  }[];
}
interface PlaylistItemsResponse {
  nextPageToken?: string;
  items?: { contentDetails?: { videoId?: string } }[];
}
interface VideosResponse {
  items?: {
    id: string;
    snippet?: { title?: string; description?: string; publishedAt?: string; thumbnails?: Record<string, { url?: string }> };
    contentDetails?: { duration?: string };
    statistics?: { viewCount?: string; likeCount?: string; commentCount?: string };
    status?: { privacyStatus?: string };
  }[];
}

export interface ProgressFn {
  (done: number, total: number | null, message: string): void;
}

export async function importChannelViaApi(
  get: HttpGet,
  apiKey: string,
  channelInput: string,
  opts: { signal?: AbortSignal; onProgress?: ProgressFn } = {},
): Promise<ImportBatch> {
  const { signal, onProgress } = opts;
  const parsed = parseChannelInput(channelInput);
  if (!parsed.channelId && !parsed.handle) throw new Error("Enter a channel ID (starts with UC) or an @handle.");
  const key = `key=${encodeURIComponent(apiKey)}`;
  const selector = parsed.channelId ? `id=${parsed.channelId}` : `forHandle=${encodeURIComponent(parsed.handle ?? "")}`;
  onProgress?.(0, null, "Looking up channel");
  const ch = await getJson<ChannelsResponse>(get, `${API}/channels?part=snippet,contentDetails,statistics&${selector}&${key}`, signal);
  const channel = ch.items?.[0];
  if (!channel) throw new Error("YouTube did not return a channel for that ID or handle.");
  const uploads = channel.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("This channel has no public uploads playlist.");

  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    signal?.throwIfAborted();
    const page = await getJson<PlaylistItemsResponse>(
      get,
      `${API}/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}${pageToken ? `&pageToken=${pageToken}` : ""}&${key}`,
      signal,
    );
    for (const it of page.items ?? []) if (it.contentDetails?.videoId) ids.push(it.contentDetails.videoId);
    pageToken = page.nextPageToken;
    onProgress?.(ids.length, null, `Found ${ids.length} uploads`);
  } while (pageToken);

  const videos: ImportedVideo[] = [];
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 50) {
    signal?.throwIfAborted();
    const chunk = unique.slice(i, i + 50);
    const res = await getJson<VideosResponse>(get, `${API}/videos?part=snippet,contentDetails,statistics,status&id=${chunk.join(",")}&${key}`, signal);
    const returned = new Set<string>();
    for (const v of res.items ?? []) {
      returned.add(v.id);
      const thumbs = v.snippet?.thumbnails ?? {};
      const metrics: Record<string, number> = {};
      const add = (k: string, s?: string) => {
        if (s !== undefined && s !== "" && Number.isFinite(Number(s))) metrics[k] = Number(s);
      };
      add("views", v.statistics?.viewCount);
      add("likes", v.statistics?.likeCount);
      add("comments", v.statistics?.commentCount);
      const privacy = v.status?.privacyStatus;
      videos.push({
        id: v.id,
        title: v.snippet?.title ?? "(untitled)",
        description: v.snippet?.description ?? "",
        publishedAt: v.snippet?.publishedAt ?? null,
        durationSeconds: parseIsoDuration(v.contentDetails?.duration),
        thumbnailUrl: thumbs.maxres?.url ?? thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url ?? null,
        availability: privacy === "unlisted" ? "unlisted" : privacy === "private" ? "private" : "public",
        metrics,
      });
    }
    for (const id of chunk) {
      if (!returned.has(id)) videos.push({ id, title: "(unavailable video)", availability: "deleted", metrics: {} });
    }
    onProgress?.(Math.min(i + 50, unique.length), unique.length, "Reading video details");
  }

  const statedCount = Number(channel.statistics?.videoCount ?? NaN);
  const warnings: string[] = [];
  if (Number.isFinite(statedCount) && statedCount > videos.length) {
    warnings.push(
      `YouTube reports ${statedCount} videos but only ${videos.length} are visible with an API key. Private and some unlisted videos need YouTube Studio exports or OAuth (planned).`,
    );
  }
  return {
    source: "public_api",
    label: `YouTube Data API: ${videos.length} uploads from "${channel.snippet?.title ?? channel.id}"`,
    videos,
    warnings,
    channel: {
      id: channel.id,
      title: channel.snippet?.title ?? "",
      description: channel.snippet?.description ?? "",
      subscriberCount: channel.statistics?.hiddenSubscriberCount || !Number.isFinite(Number(channel.statistics?.subscriberCount)) ? null : Number(channel.statistics?.subscriberCount),
      videoCount: Number.isFinite(statedCount) ? statedCount : null,
    },
  };
}
