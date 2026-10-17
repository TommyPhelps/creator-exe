// Builds the generator's CreatorContext from everything stored locally.
// Only "channel" profile entries steer ideas; personal and watching interests
// are remembered but kept out of recommendations on purpose. Things you
// reject (tired of, never suggest) apply whatever their scope.
import type { Db } from "../../platform/types.ts";
import { listGames, listIdeaFeedback, listIdeas, listImpressions, listProfile, listVideoFeedback, listVideos } from "../../db/repos.ts";
import { channelBoilerplate, readVideo, satisfactionBySubject } from "../channel/analyze.ts";
import type { CreatorContext } from "./generator.ts";
import { SUBJECT_BY_ID, subjectsForText } from "./subjects.ts";
import { canon, catalogNames, findCatalogGame } from "../games/catalog.ts";
import { indexLibrary } from "../games/library.ts";

function toSubjects(values: string[]): Set<string> {
  const out = new Set<string>();
  for (const v of values) {
    if (SUBJECT_BY_ID.has(v)) out.add(v);
    for (const s of subjectsForText(v)) out.add(s);
  }
  return out;
}

export async function loadCreatorContext(db: Db): Promise<CreatorContext> {
  const [profile, videos, videoFeedback, feedback, impressions, ideas, games] = await Promise.all([
    listProfile(db),
    listVideos(db),
    listVideoFeedback(db),
    listIdeaFeedback(db),
    listImpressions(db),
    listIdeas(db),
    listGames(db),
  ]);
  const channel = (kind: string) => profile.filter((p) => p.kind === kind && p.scope === "channel").map((p) => p.value);
  const anyScope = (kind: string) => profile.filter((p) => p.kind === kind).map((p) => p.value);
  const familiar = new Set<string>();
  const boilerplate = channelBoilerplate(videos);
  for (const v of videos) for (const s of readVideo(v, { boilerplate }).subjects) if (!s.id.startsWith("user:") && s.confidence !== "low") familiar.add(s.id);
  const favoriteGames = new Set<string>();
  for (const name of channel("favorite_game")) {
    const cat = findCatalogGame(name);
    for (const n of cat ? catalogNames(cat) : [canon(name)]) favoriteGames.add(n);
  }
  const played = new Set(
    games.filter((g) => (g.playtimeMin ?? 0) >= 120 || (g.rating ?? 0) >= 4 || g.favorite || g.status === "completed" || g.status === "playing").map((g) => g.canon),
  );
  return {
    familiarSubjects: familiar,
    favoriteSubjects: toSubjects(channel("favorite_subject")),
    tiredSubjects: toSubjects(anyScope("tired_of")),
    currentInterests: channel("current_interest"),
    favoriteGames,
    avoidTerms: anyScope("avoid"),
    onCameraNotes: anyScope("on_camera"),
    voiceoverNotes: anyScope("voiceover"),
    feedback,
    impressions,
    takenKeys: new Set(ideas.filter((i) => i.libraryKey && i.status !== "rejected").map((i) => i.libraryKey as string)),
    satisfaction: satisfactionBySubject(videos, videoFeedback),
    library: indexLibrary(games),
    playedGames: played,
  };
}
