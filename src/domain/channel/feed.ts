// YouTube's public channel feed: no key needed, but it only lists the 15 most
// recent public uploads and has no durations.
import { decodeXml, tagAttr, tagText } from "./xml.ts";
import type { ImportBatch, ImportedVideo } from "./types.ts";

export function feedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
}

/** The public channel page for an @handle (handle includes the @). */
export function channelPageUrl(handle: string): string {
  const h = handle.startsWith("@") ? handle : `@${handle}`;
  return `https://www.youtube.com/${encodeURIComponent(h).replace(/^%40/, "@")}`;
}

/**
 * Finds the channel's own UC... ID in its public channel page. Only markers
 * that describe the page's channel are used (canonical link, RSS link, page
 * metadata), never IDs of featured or linked channels elsewhere on the page.
 */
export function extractChannelIdFromPage(html: string): string | null {
  const patterns = [
    /<link[^>]+rel="canonical"[^>]+href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})"/i,
    /<link[^>]+type="application\/rss\+xml"[^>]+channel_id=(UC[\w-]{22})/i,
    /<meta[^>]+itemprop="(?:identifier|channelId)"[^>]+content="(UC[\w-]{22})"/i,
    /"externalId":"(UC[\w-]{22})"/,
  ];
  for (const p of patterns) {
    const m = p.exec(html);
    if (m?.[1]) return m[1];
  }
  return null;
}

export function parseChannelFeed(xml: string): ImportBatch {
  if (!/<feed[\s>]/i.test(xml)) throw new Error("The response was not a YouTube channel feed.");
  const channelTitle = tagText(xml.split(/<entry[\s>]/i)[0] ?? "", "title") ?? "";
  const channelId = tagText(xml, "yt:channelId") ?? "";
  const videos: ImportedVideo[] = [];
  const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  for (const entry of entries) {
    const id = tagText(entry, "yt:videoId");
    if (!id) continue;
    const views = tagAttr(entry, "media:statistics", "views");
    const metrics: Record<string, number> = {};
    if (views !== null && views !== "" && Number.isFinite(Number(views))) metrics.views = Number(views);
    const ratingCount = tagAttr(entry, "media:starRating", "count");
    if (ratingCount !== null && Number.isFinite(Number(ratingCount))) metrics.ratings = Number(ratingCount);
    videos.push({
      id,
      title: tagText(entry, "title") ?? tagText(entry, "media:title") ?? "(untitled)",
      description: tagText(entry, "media:description") ?? "",
      publishedAt: tagText(entry, "published"),
      thumbnailUrl: tagAttr(entry, "media:thumbnail", "url") ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      availability: "public",
      metrics,
    });
  }
  return {
    source: "public_feed",
    label: `Public channel feed (${videos.length} most recent public uploads)`,
    videos,
    warnings: [
      "The public feed only includes the 15 most recent public uploads and no video lengths. Add a free YouTube Data API key in Settings to import the full channel.",
    ],
    channel: { id: channelId, title: decodeXml(channelTitle) },
  };
}
