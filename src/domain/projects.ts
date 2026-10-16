// Turning ideas into projects, and helpers for project state.
import type { NewProjectInput } from "../db/repos.ts";
import type { Complexity, Idea, IdeaDetails, Project, ProjectTask, Stage } from "./types.ts";
import { STAGES } from "./types.ts";
import { subjectLabel } from "./ideas/subjects.ts";

export function complexityFor(details: IdeaDetails | null): Complexity {
  if (!details) return "standard";
  if (details.effort === "tiny" || details.effort === "small") return "quick";
  if (details.effort === "ambitious") return "ambitious";
  return "standard";
}

const RECORDING_LABEL: Record<string, string> = {
  screen: "screen recording",
  voiceover: "voiceover",
  face: "face camera",
  "real-world": "real-world footage",
};

export function projectFromIdea(idea: Idea, opts: { tonight?: boolean } = {}): NewProjectInput {
  const d = idea.details;
  const tonight = opts.tonight ? d?.tonight ?? null : null;
  const lines = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");
  const prep = d ? [...(tonight?.needs ?? d.requirements)] : [];
  return {
    title: idea.title,
    premise: idea.premise,
    why: d?.why ?? "",
    complexity: tonight ? "quick" : complexityFor(d),
    nextAction: tonight?.firstFive ?? d?.firstStep ?? "Write one sentence about why you want to make this.",
    ideaId: idea.id,
    subjects: idea.subjects,
    stage: "preparing",
    details: d
      ? {
          research: d.research === "light" ? "Light research: a couple of sources to confirm facts." : d.research === "moderate" ? "Moderate research: gather a handful of reliable sources." : "Deep research: build a source list before recording.",
          recordingRequirements: d.recording.map((r) => RECORDING_LABEL[r] ?? r).join(", "),
          equipment: lines(d.requirements),
          structure: tonight ? `Minimum viable video: ${tonight.minimumVideo}\nIf it goes well: ${tonight.expansion}` : "",
          thumbnailConcepts: d.thumbnail,
          origin: [
            `What you'd actually do: ${d.whatYouDo}`,
            `Worth exploring because: ${d.worthExploring}`,
            `Possible audience: ${d.audience}`,
            `Budget: ${d.budgetNote}`,
            d.alternatives.length ? `Alternative approaches:\n${lines(d.alternatives)}` : "",
            idea.subjects.length ? `Subjects: ${idea.subjects.map(subjectLabel).join(", ")}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        }
      : {},
    tasks: [
      ...prep.map((label) => ({ list: "prep" as const, label })),
      ...(tonight ? [{ list: "recording" as const, label: tonight.firstFive }] : d ? [{ list: "prep" as const, label: d.firstStep }] : []),
    ],
  };
}

export function stageLabel(stage: Stage): string {
  return STAGES.find((s) => s.id === stage)?.label ?? stage;
}

export function stageIndex(stage: Stage): number {
  return STAGES.findIndex((s) => s.id === stage);
}

export const ACTIVE_STAGES: Stage[] = ["idea", "researching", "preparing", "ready_to_record", "recording", "editing", "thumbnail", "packaging", "ready_to_upload"];

export function isUnfinished(p: Project): boolean {
  return !p.archived && ACTIVE_STAGES.includes(p.stage);
}

/** Suggests what to do next when a project has no explicit next action. */
export function suggestedNextAction(p: Project, tasks: ProjectTask[]): string {
  if (p.nextAction.trim()) return p.nextAction.trim();
  const open = tasks.filter((t) => t.projectId === p.id && !t.done).sort((a, b) => a.position - b.position);
  if (open[0]) return open[0].label;
  switch (p.stage) {
    case "idea":
      return "Write one sentence about why you want to make this.";
    case "researching":
      return "Save two sources you trust.";
    case "preparing":
      return "List the three things you must capture.";
    case "ready_to_record":
      return "Set up and record the first take.";
    case "recording":
      return "Record the next section.";
    case "editing":
      return "Edit at your own pace; mark the stage when you're done.";
    case "thumbnail":
      return "Open Thumbnail Lab and pick a concept.";
    case "packaging":
      return "Choose a title and paste the description.";
    case "ready_to_upload":
      return "Upload it.";
    default:
      return "";
  }
}

/** Ideas for getting unstuck, scaled to the project's state. Never more than a few. */
export function rescueOptions(p: Project): { id: string; label: string; detail: string }[] {
  const opts = [
    { id: "simplify", label: "Make a smaller version", detail: "Switch the project to Quick and keep only the core moment." },
    { id: "first-action", label: "Do only the first recording action", detail: "Record five minutes of anything related. It does not have to be usable." },
    { id: "less-research", label: "Cut the research", detail: "Keep the sources you already have; mark the rest as optional." },
    { id: "park", label: "Park it for later", detail: "Archive it with a note. It stays safe and can be restored any time." },
    { id: "switch", label: "Make something else tonight", detail: "Open Make Something Tonight for three small options." },
  ];
  if (p.complexity === "quick") return opts.filter((o) => o.id !== "simplify");
  return opts;
}
