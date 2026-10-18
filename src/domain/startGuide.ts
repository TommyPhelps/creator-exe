// "Where do I start?" (v0.1.3): practical guidance on where to begin
// recording, so a video about hour twenty doesn't turn into twenty hours of
// footage. Fixed, readable rules; no script, no edit decisions. You choose.

export type SaveState = "existing" | "fresh" | "unsure";
export type AboutPart = "beginning" | "middle" | "anywhere";
export type ContextNeed = "none" | "little" | "lots";
export type StartChoice = "mid-save" | "recap" | "new-run";

export interface StartPlan {
  /** Do you have a save at or near the interesting part? */
  save: SaveState | null;
  /** Is the interesting part about how the game begins? */
  about: AboutPart | null;
  /** How much does a viewer need to know to follow it? */
  context: ContextNeed | null;
  /** Does it depend on earlier choices or story? */
  dependsOnChoices: boolean;
  /** Up to a few things a viewer must know, in your words. */
  viewerNeeds: string[];
  /** What you decided (or nothing yet). */
  choice: StartChoice | null;
  /** Extra footage you've ticked off. */
  captured: string[];
}

export const EMPTY_START_PLAN: StartPlan = { save: null, about: null, context: null, dependsOnChoices: false, viewerNeeds: [], choice: null, captured: [] };

export interface StartAdvice {
  /** The main suggestion, in a sentence or two. */
  headline: string;
  /** The choice this points to; you can pick another. */
  suggested: StartChoice | null;
  /** What viewers actually need to follow along. */
  viewersNeed: string[];
  /** Footage worth grabbing separately (a few seconds each). */
  capture: string[];
  /** Things worth knowing, as plain notes. */
  notes: string[];
}

export const CHOICE_LABEL: Record<StartChoice, string> = {
  "mid-save": "Start in the middle",
  recap: "Short recap, then start",
  "new-run": "Start a new game",
};

export function startAdvice(plan: StartPlan, hints: { startingSituation?: string; startFrom?: "new" | "save" | "anywhere"; hoursPlayed?: number | null; game?: string; fromStream?: boolean } = {}): StartAdvice {
  const game = hints.game?.split(" + ")[0] || "the game";
  const hours = hints.hoursPlayed && hints.hoursPlayed >= 1 ? Math.round(hints.hoursPlayed) : null;
  const notes: string[] = [];
  let headline: string;
  let suggested: StartChoice | null;

  const about = plan.about ?? (hints.startFrom === "new" ? "beginning" : null);
  if (hints.fromStream && about !== "beginning") {
    headline = "Your footage already exists: it's the stream. Start at the moment this video is about, and set it up in a sentence or two. Nobody needs the hours of stream before it.";
    suggested = plan.context === "lots" || plan.dependsOnChoices ? "recap" : "mid-save";
  } else if (about === "beginning") {
    headline = "This idea is about how the game begins, so the beginning is the content. Start a new game and record from the first screen.";
    suggested = "new-run";
  } else if (plan.save === "fresh") {
    headline = `You don't need to play your way there on camera. Get to the interesting part off camera (or use any save that gets you there), then start recording where it gets interesting.`;
    suggested = plan.context === "lots" ? "recap" : "mid-save";
  } else if (plan.context === "lots" || plan.dependsOnChoices) {
    headline = "Start in your save. Cover the background with a short recap (well under a minute) over a few clips or screenshots, then get to the point.";
    suggested = "recap";
  } else if (plan.save === "existing" || hints.startFrom === "save" || hours) {
    headline = `You don't need to show ${hours ? `the ${hours} hours you've played` : "everything that came before"}. Establish the situation in a sentence or two and start recording where the interesting part begins.`;
    suggested = "mid-save";
  } else {
    headline = "If you're not sure, record the interesting part first. You can decide later whether it needs any setup at all.";
    suggested = null;
  }

  const viewersNeed = [`What ${game} is, in one sentence`];
  if (plan.context !== "none") viewersNeed.push("Who you're playing as, or what you're trying to do right now");
  if (plan.context === "lots" || plan.dependsOnChoices) viewersNeed.push("Only the one or two earlier facts the moment depends on");
  for (const n of plan.viewerNeeds) if (n.trim()) viewersNeed.push(n.trim());

  const capture = ["A few seconds that establish the situation (your character, inventory, map or goal)", "A wide look at the place where it happens"];
  if (suggested === "recap" || plan.context === "lots") capture.push("A handful of clips or screenshots for the recap (title screen, a key place, a key character)");
  if (plan.dependsOnChoices) capture.push("Screenshots of the choices that matter (journal, quest log, dialogue)");

  if (hints.startingSituation) notes.push(`The idea suggests starting at: ${hints.startingSituation}`);
  notes.push("A new playthrough is only necessary when the idea is about the start itself, or your save can't do the thing anymore (wrong build, wrong choices).");
  if (suggested !== "new-run") notes.push("Viewers join stories in the middle all the time; a clear first sentence matters more than footage of how you got there.");

  return { headline, suggested, viewersNeed, capture, notes };
}
