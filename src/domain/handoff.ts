// Idea -> project in one step. Starting the same idea again opens the
// project it already has instead of making a duplicate.
import type { Db } from "../platform/types.ts";
import { createProject, findProjectForIdea } from "../db/repos.ts";
import { projectFromIdea } from "./projects.ts";
import { planStream } from "./streams.ts";
import type { Destination, Idea, Project } from "./types.ts";

export async function startProjectFromIdea(db: Db, idea: Idea, opts: { tonight?: boolean; destination?: Destination } = {}): Promise<{ project: Project; existed: boolean }> {
  const existing = await findProjectForIdea(db, idea.id);
  if (existing) return { project: existing, existed: true };
  const project = await createProject(db, projectFromIdea(idea, opts));
  // A stream gets a planned session (Casual Live or Concept Stream) and the pre-stream checklist.
  if (project.destination !== "youtube") await planStream(db, project, idea.details?.reason === "casual-live" ? "casual" : "concept", idea);
  return { project, existed: false };
}
