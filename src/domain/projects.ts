// Turning ideas into projects, and helpers for project state.
import type { NewProjectInput } from "../db/repos.ts";
import type { Approach, Complexity, Idea, IdeaDetails, Project, ProjectTask, Stage } from "./types.ts";
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

/** Approaches for an idea: hand-written ones, else what you'd do plus the listed alternatives. */
export function approachesFor(d: IdeaDetails): Approach[] {
  if (d.approaches?.length) return d.approaches;
  return [{ name: "As planned", how: d.whatYouDo }, ...d.alternatives.map((a) => ({ name: a, how: "" }))];
}

/**
 * Turns an idea into a project, carrying everything over once: the game, the
 * hook, approaches, moments to capture (as the recording checklist), what you
 * need (listed once, not duplicated into checklists), ownership, why it suits
 * you, your notes and where it came from.
 */
export function projectFromIdea(idea: Idea, opts: { tonight?: boolean } = {}): NewProjectInput {
  const d = idea.details;
  const tonight = d?.tonight ?? null;
  const lines = (xs: string[]) => xs.map((x) => `- ${x}`).join("\n");
  const firstFive = (opts.tonight ? tonight?.firstFive : undefined) ?? d?.firstStep ?? tonight?.firstFive ?? "";
  return {
    title: idea.title,
    premise: idea.premise,
    why: d?.why ?? "",
    complexity: opts.tonight ? "quick" : complexityFor(d),
    nextAction: firstFive || "Write one sentence about why you want to make this.",
    ideaId: idea.id,
    subjects: idea.subjects,
    stage: "preparing",
    details: d
      ? {
          research: d.research === "light" ? "Light research: a couple of sources to confirm facts." : d.research === "moderate" ? "Moderate research: gather a handful of reliable sources." : "Deep research: build a source list before recording.",
          recordingRequirements: d.recording.map((r) => RECORDING_LABEL[r] ?? r).join(", "),
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
          game: (d.games ?? []).join(" + "),
          videoType: d.videoType ?? "",
          access: d.access ?? "",
          hook: d.hook ?? idea.premise,
          watchAppeal: d.watchAppeal ?? d.worthExploring,
          approaches: approachesFor(d),
          chosenApproach: null,
          startingSituation: d.startingSituation ?? "",
          visualBeats: d.visualBeats ?? [],
          needs: tonight && opts.tonight ? tonight.needs : d.requirements,
          whySuits: d.reasons.length ? d.reasons : [d.why],
          firstFive,
          smallestVideo: tonight?.minimumVideo ?? "",
          ifItGoesWell: tonight?.expansion ?? "",
          myNotes: idea.notes,
          source: { ideaId: idea.id, ideaKey: idea.libraryKey, seedKey: idea.libraryKey ? (idea.libraryKey.split(":")[0] ?? null) : null, startedAt: new Date().toISOString() },
        }
      : { myNotes: idea.notes, hook: idea.premise, source: { ideaId: idea.id, ideaKey: idea.libraryKey, seedKey: null, startedAt: new Date().toISOString() } },
    // Moments to capture become the recording checklist, so you can tick them off while recording.
    tasks: (d?.moments ?? []).map((label) => ({ list: "recording" as const, label })),
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
