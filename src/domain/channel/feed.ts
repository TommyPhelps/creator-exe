// YouTube's public channel feed: no key needed, but it only lists the 15 most
// recent public uploads and has no durations.
import { decodeXml, tagAttr, tagText } from "./xml.ts";
import type { ImportBatch, ImportedVideo } from "./types.ts";

export function feedUrl(channelId: string): string {
  return `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
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
