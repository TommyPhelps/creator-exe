// Idea -> project in one step. Starting the same idea again opens the
// project it already has instead of making a duplicate.
import type { Db } from "../platform/types.ts";
import { createProject, findProjectForIdea } from "../db/repos.ts";
import { projectFromIdea } from "./projects.ts";
import type { Idea, Project } from "./types.ts";

export async function startProjectFromIdea(db: Db, idea: Idea, opts: { tonight?: boolean } = {}): Promise<{ project: Project; existed: boolean }> {
  const existing = await findProjectForIdea(db, idea.id);
  if (existing) return { project: existing, existed: true };
  return { project: await createProject(db, projectFromIdea(idea, opts)), existed: false };
}
