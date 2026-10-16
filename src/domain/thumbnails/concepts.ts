// Thumbnail concept generator. Every concept is built from real, editable
// layers (text, shapes, gradients and optional image slots) using only the
// words the creator provides.
import {
  THUMB_H,
  THUMB_W,
  newBackground,
  newDoc,
  newShape,
  newText,
  type ImageLayer,
  type Layer,
  type ShapeLayer,
  type TextLayer,
  type ThumbnailDoc,
} from "./model.ts";
import { estimateTextBox } from "./render.ts";

export interface ConceptInput {
  headline: string;
  /** Optional photo or screenshot to place (already a data URL image layer). */
  image?: ImageLayer | null;
  measure?: (text: string, font: string) => number;
}

export interface ThumbnailConcept {
  id: string;
  name: string;
  premise: string;
  layout: string;
  placement: string;
  background: string;
  typography: string;
  palette: string[];
  imageNeeds: string;
  reasoning: string;
  drawbacks: string;
  build: (input: ConceptInput) => ThumbnailDoc;
}

/** Splits a headline into balanced lines of at most `maxChars` characters. */
export function wrapHeadline(text: string, maxChars = 14, maxLines = 3): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) cur = w;
    else if ((cur + " " + w).length <= maxChars) cur += " " + w;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const head = lines.slice(0, maxLines - 1);
    head.push(lines.slice(maxLines - 1).join(" "));
    return head.join("\n");
  }
  return lines.join("\n");
}

const MAX_TEXT_W = THUMB_W - 80;

/** Builds a text layer and shrinks its font until it fits inside the canvas. */
function text(input: ConceptInput, t: string, patch: Partial<TextLayer>, maxW = MAX_TEXT_W): TextLayer {
  let l: TextLayer = { ...newText(t), ...patch } as TextLayer;
  let box = estimateTextBox(l, input.measure);
  for (let i = 0; i < 6 && box.w > maxW && l.fontSize > 16; i++) {
    l = { ...l, fontSize: Math.max(16, Math.floor(l.fontSize * (maxW / box.w) * 0.98)) };
    box = estimateTextBox(l, input.measure);
  }
  return { ...l, w: patch.w ?? box.w, h: box.h };
}

function shape(kind: ShapeLayer["shape"], fill: string, x: number, y: number, w: number, h: number, patch: Partial<ShapeLayer> = {}): ShapeLayer {
  return { ...newShape(kind, fill), x, y, w, h, ...patch };
}

function placeImage(input: ConceptInput, x: number, y: number, w: number, h: number, patch: Partial<ImageLayer> = {}): Layer[] {
  if (!input.image) {
    return [shape("rect", "#3a4658", x, y, w, h, { name: "Photo slot (replace with your image)", radius: 8, stroke: { color: "#8a9ab0", width: 4 } })];
  }
  const img = input.image;
  // Cover the slot while preserving aspect ratio, by cropping the source.
  const slotRatio = w / h;
  const imgRatio = img.naturalW / img.naturalH;
  let crop = { x: 0, y: 0, w: 1, h: 1 };
  if (imgRatio > slotRatio) {
    const cw = slotRatio / imgRatio;
    crop = { x: (1 - cw) / 2, y: 0, w: cw, h: 1 };
  } else if (imgRatio < slotRatio) {
    const ch = imgRatio / slotRatio;
    crop = { x: 0, y: (1 - ch) / 2, w: 1, h: ch };
  }
  return [{ ...img, x, y, w, h, crop, ...patch }];
}

const doc = (name: string, concept: string, layers: Layer[]): ThumbnailDoc => {
  const d = newDoc(name, layers);
  d.meta.concept = concept;
  return d;
};

export const CONCEPTS: ThumbnailConcept[] = [
  {
    id: "minimal",
    name: "Minimal",
    premise: "One clear phrase on a calm background, nothing else competing for attention.",
    layout: "Centered text block with a thin accent bar underneath.",
    placement: "Text centered; no subject photo.",
    background: "Deep navy to charcoal gradient.",
    typography: "Heavy sans-serif (Arial Black), white, generous spacing.",
    palette: ["#0f1626", "#1b2333", "#ffffff", "#7dd87f"],
    imageNeeds: "None.",
    reasoning: "Reads instantly at small sizes and stands out among busy thumbnails.",
    drawbacks: "Relies entirely on the words; weak if the phrase is vague.",
    build: (input) => {
      const t = text(input, wrapHeadline(input.headline, 16, 2), { fontFamily: "Arial Black", fontSize: 104, align: "middle", stroke: null, shadow: { color: "#000000", blur: 20, dx: 0, dy: 8, opacity: 0.5 } });
      t.x = (THUMB_W - t.w) / 2;
      t.y = (THUMB_H - t.h) / 2 - 30;
      return doc(input.headline, "minimal", [
        newBackground(["#1b2333", "#0b111c"], "linear"),
        t,
        shape("rect", "#7dd87f", THUMB_W / 2 - 90, t.y + t.h + 30, 180, 12, { name: "Accent bar", radius: 6 }),
      ]);
    },
  },
  {
    id: "bold",
    name: "Bold",
    premise: "Big outlined words on one side, your photo on the other, an arrow tying them together.",
    layout: "Text left two-thirds, photo slot right, arrow pointing from text to photo.",
    placement: "Subject on the right third, looking toward the text.",
    background: "Saturated yellow to orange gradient.",
    typography: "Impact, white fill, thick black outline, slight drop shadow.",
    palette: ["#ffd23f", "#ff7b00", "#ffffff", "#000000", "#e63946"],
    imageNeeds: "A cut-out or tightly cropped photo of you or the subject.",
    reasoning: "High contrast survives YouTube's small sizes and dark mode alike.",
    drawbacks: "Common style; can feel generic if the photo is weak.",
    build: (input) => {
      const t = text(input, wrapHeadline(input.headline.toUpperCase(), 12, 3), { fontSize: 128, uppercase: true }, 680);
      t.x = 60;
      t.y = Math.max(40, (THUMB_H - t.h) / 2);
      return doc(input.headline, "bold", [
        newBackground(["#ffd23f", "#ff7b00"], "linear"),
        ...placeImage(input, 760, 120, 480, 560),
        t,
        shape("arrow", "#e63946", 560, 470, 220, 120, { name: "Arrow", rotation: -18, stroke: { color: "#000000", width: 6 } }),
      ]);
    },
  },
  {
    id: "mysterious",
    name: "Mysterious",
    premise: "A dark scene with one small, lit detail that makes people want to know more.",
    layout: "Dark vignette, a glowing circle highlighting one region, small text in a corner.",
    placement: "Subject small and off-center, partly in shadow.",
    background: "Radial gradient from dim teal to near black.",
    typography: "Small, quiet Tahoma caps with wide letter spacing.",
    palette: ["#0a1a22", "#000000", "#9fe8ff", "#c9d1dc"],
    imageNeeds: "A screenshot or photo with one intriguing detail.",
    reasoning: "Curiosity comes from what is hidden; good for investigations and mysteries.",
    drawbacks: "Can read as too dark on small screens; check the mobile preview.",
    build: (input) => {
      const t = text(input, wrapHeadline(input.headline.toUpperCase(), 22, 2), {
        fontFamily: "Tahoma",
        fontWeight: 700,
        fontSize: 54,
        letterSpacing: 6,
        color: "#c9d1dc",
        stroke: null,
        shadow: { color: "#000000", blur: 10, dx: 0, dy: 2, opacity: 0.9 },
      });
      t.x = 70;
      t.y = THUMB_H - t.h - 60;
      return doc(input.headline, "mysterious", [
        newBackground(["#123642", "#000000"], "radial"),
        ...placeImage(input, 560, 90, 520, 400, { opacity: 0.85 }),
        shape("ellipse", "#9fe8ff", 760, 210, 180, 180, { name: "Highlight ring", fill: "none", stroke: { color: "#9fe8ff", width: 8 }, shadow: { color: "#9fe8ff", blur: 30, dx: 0, dy: 0, opacity: 0.9 } }),
        t,
      ]);
    },
  },
  {
    id: "nostalgic",
    name: "Nostalgic (classic window)",
    premise: "Your headline presented as an old-school dialog box on a retro desktop.",
    layout: "Teal desktop, a gray window with a blue title bar centered, two buttons.",
    placement: "Optional photo inside the window or as a desktop wallpaper.",
    background: "Classic teal desktop color.",
    typography: "Tahoma/Verdana, black on gray, like system dialogs.",
    palette: ["#008080", "#c0c0c0", "#000080", "#1084d0", "#000000"],
    imageNeeds: "Optional screenshot.",
    reasoning: "Instantly signals retro computing and early-2000s software.",
    drawbacks: "Small dialog text gets tiny on phones; keep the headline short.",
    build: (input) => {
      const t = text(input, wrapHeadline(input.headline, 20, 2), { fontFamily: "Verdana", fontWeight: 700, fontSize: 64, color: "#000000", stroke: null, shadow: null }, 860);
      t.x = 230;
      t.y = 300;
      return doc(input.headline, "nostalgic", [
        newBackground(["#008080", "#008080"], "solid"),
        shape("rect", "#c0c0c0", 160, 140, 960, 460, { name: "Window", stroke: { color: "#ffffff", width: 4 }, shadow: { color: "#000000", blur: 0, dx: 8, dy: 8, opacity: 0.8 } }),
        shape("rect", "#000080", 172, 152, 936, 64, { name: "Title bar" }),
        text(input, `${(input.headline.split(/\s+/)[0] ?? "VIDEO").toUpperCase().replace(/[^A-Z0-9]/g, "") || "VIDEO"}.EXE`, { name: "Title bar text", x: 192, y: 160, fontFamily: "Tahoma", fontWeight: 700, fontSize: 40, color: "#ffffff", stroke: null, shadow: null }),
        t,
        shape("rect", "#c0c0c0", 720, 490, 170, 70, { name: "Button 1", stroke: { color: "#000000", width: 3 } }),
        shape("rect", "#c0c0c0", 910, 490, 170, 70, { name: "Button 2", stroke: { color: "#000000", width: 3 } }),
        text(input, "OK", { name: "Button 1 label", x: 780, y: 500, fontFamily: "Tahoma", fontSize: 40, color: "#000000", stroke: null, shadow: null }),
        text(input, "Cancel", { name: "Button 2 label", x: 940, y: 500, fontFamily: "Tahoma", fontSize: 40, color: "#000000", stroke: null, shadow: null }),
      ]);
    },
  },
  {
    id: "absurd",
    name: "Absurd",
    premise: "Clashing colors, tilted elements and a starburst: it looks like it should not be allowed.",
    layout: "Rotated headline over a starburst, photo slot tilted the other way.",
    placement: "Subject slightly tilted, overlapping the starburst.",
    background: "Hot pink to electric blue gradient.",
    typography: "Comic Sans or Impact, yellow with purple outline.",
    palette: ["#ff3fa4", "#2d6bff", "#fff200", "#5a00a8"],
    imageNeeds: "A photo with an exaggerated expression or an odd object.",
    reasoning: "Signals that the video does not take itself seriously.",
    drawbacks: "Easy to overdo; may clash with a more thoughtful video.",
    build: (input) => {
      const t = text(input, wrapHeadline(input.headline, 12, 3), { fontFamily: "Comic Sans MS", fontWeight: 700, fontSize: 96, color: "#fff200", stroke: { color: "#5a00a8", width: 10 }, rotation: -8 }, 640);
      t.x = 70;
      t.y = 90;
      return doc(input.headline, "absurd", [
        newBackground(["#ff3fa4", "#2d6bff"], "linear"),
        shape("star", "#fff200", 640, 60, 600, 600, { name: "Starburst", rotation: 12, opacity: 0.9 }),
        ...placeImage(input, 720, 170, 420, 420, { rotation: 7 }),
        t,
      ]);
    },
  },
  {
    id: "cinematic",
    name: "Cinematic",
    premise: "A wide, moody frame with letterbox bars, like a still from a documentary.",
    layout: "Full-bleed image, black bars top and bottom, small spaced title centered low.",
    placement: "Subject in the middle third, horizon on a third line.",
    background: "Full-frame photo or a dusky gradient.",
    typography: "Georgia, light, widely spaced capitals.",
    palette: ["#000000", "#2b2f3a", "#e8d9b5", "#ffffff"],
    imageNeeds: "A wide real-world photo with atmosphere.",
    reasoning: "Suits personal documentaries and real-world stories.",
    drawbacks: "Small text; the image has to do most of the work.",
    build: (input) => {
      const t = text(input, input.headline.toUpperCase(), { fontFamily: "Georgia", fontWeight: 400, fontSize: 58, letterSpacing: 10, color: "#e8d9b5", align: "middle", stroke: null, shadow: { color: "#000000", blur: 16, dx: 0, dy: 4, opacity: 0.8 } });
      t.x = (THUMB_W - t.w) / 2;
      t.y = 520;
      return doc(input.headline, "cinematic", [
        newBackground(["#3a3f4f", "#0d0f14"], "linear"),
        ...placeImage(input, 0, 0, THUMB_W, THUMB_H),
        shape("rect", "#000000", 0, 0, THUMB_W, 90, { name: "Letterbox top" }),
        shape("rect", "#000000", 0, THUMB_H - 90, THUMB_W, 90, { name: "Letterbox bottom" }),
        t,
      ]);
    },
  },
  {
    id: "meme",
    name: "Meme-influenced",
    premise: "Classic image-macro layout: your words split across the top and bottom of the frame.",
    layout: "Top line and bottom line of white Impact text, image in between.",
    placement: "Subject centered.",
    background: "Image full-frame, or flat gray if none.",
    typography: "Impact, white, black outline, all caps.",
    palette: ["#ffffff", "#000000", "#808080"],
    imageNeeds: "A centered photo or screenshot.",
    reasoning: "Instantly recognisable internet-culture format.",
    drawbacks: "Strongly dated look; best for videos about memes or internet culture.",
    build: (input) => {
      const words = input.headline.trim().split(/\s+/);
      const mid = Math.ceil(words.length / 2);
      const top = text(input, words.slice(0, mid).join(" "), { fontSize: 110, uppercase: true, align: "middle", stroke: { color: "#000000", width: 8 }, shadow: null });
      const bottom = text(input, words.slice(mid).join(" ") || " ", { name: "Bottom text", fontSize: 110, uppercase: true, align: "middle", stroke: { color: "#000000", width: 8 }, shadow: null });
      top.x = (THUMB_W - top.w) / 2;
      top.y = 24;
      bottom.x = (THUMB_W - bottom.w) / 2;
      bottom.y = THUMB_H - bottom.h - 24;
      return doc(input.headline, "meme", [newBackground(["#6d6d6d", "#4a4a4a"], "solid"), ...placeImage(input, 0, 0, THUMB_W, THUMB_H), { ...top, name: "Top text" }, bottom]);
    },
  },
];

export function buildAllConcepts(input: ConceptInput): { concept: ThumbnailConcept; doc: ThumbnailDoc }[] {
  return CONCEPTS.map((concept) => ({ concept, doc: concept.build(input) }));
}
