// Builds the generator's CreatorContext from everything stored locally.
import type { Db } from "../../platform/types.ts";
import { listIdeaFeedback, listIdeas, listImpressions, listProfile, listVideoFeedback, listVideos } from "../../db/repos.ts";
import { readVideo, satisfactionBySubject } from "../channel/analyze.ts";
import type { CreatorContext } from "./generator.ts";
import { SUBJECT_BY_ID, subjectsForText } from "./subjects.ts";

function toSubjects(values: string[]): Set<string> {
  const out = new Set<string>();
  for (const v of values) {
    if (SUBJECT_BY_ID.has(v)) out.add(v);
    for (const s of subjectsForText(v)) out.add(s);
  }
  return out;
}

export async function loadCreatorContext(db: Db): Promise<CreatorContext> {
  const [profile, videos, videoFeedback, feedback, impressions, ideas] = await Promise.all([
    listProfile(db),
    listVideos(db),
    listVideoFeedback(db),
    listIdeaFeedback(db),
    listImpressions(db),
    listIdeas(db),
  ]);
  const values = (kind: string) => profile.filter((p) => p.kind === kind).map((p) => p.value);
  const familiar = new Set<string>();
  for (const v of videos) for (const s of readVideo(v).subjects) if (!s.id.startsWith("user:")) familiar.add(s.id);
  return {
    familiarSubjects: familiar,
    favoriteSubjects: toSubjects(values("favorite_subject")),
    tiredSubjects: toSubjects(values("tired_of")),
    currentInterests: values("current_interest"),
    avoidTerms: values("avoid"),
    onCameraNotes: values("on_camera"),
    voiceoverNotes: values("voiceover"),
    feedback,
    impressions,
    takenKeys: new Set(ideas.filter((i) => i.libraryKey && i.status !== "rejected").map((i) => i.libraryKey as string)),
    satisfaction: satisfactionBySubject(videos, videoFeedback),
  };
}
