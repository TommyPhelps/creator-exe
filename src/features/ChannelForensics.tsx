import { useState } from "react";
import { useAction, useApp, useData } from "../app/context.tsx";
import { loadForensics, paletteFromPixels, saveForensics } from "../domain/channel/forensics.ts";
import { parseTranscript } from "../domain/channel/transcript.ts";
import type { Video } from "../domain/types.ts";
import { formatDuration } from "../lib/util.ts";
import { Button, Field, Note, Select, TextArea, Win } from "../ui/kit.tsx";

async function paletteOfImage(base64: string, file: string): Promise<string[]> {
  if (base64.length > 20_000_000) throw new Error("Thumbnail is too large to inspect safely (limit about 15 MB).");
  const mime = file.toLowerCase().endsWith(".png") ? "image/png" : file.toLowerCase().endsWith(".webp") ? "image/webp" : "image/jpeg";
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Couldn't decode this image. Use a normal PNG, JPG or WebP file."));
    img.src = `data:${mime};base64,${base64}`;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 96; canvas.height = 54;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Couldn't start the thumbnail color analyzer.");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return paletteFromPixels(ctx.getImageData(0, 0, canvas.width, canvas.height).data, 6);
}

function TimestampMarkers({ length, marks, color }: { length: number; marks: number[]; color: string }) {
  return (
    <div style={{ position: "relative", height: 20, background: "var(--sunken, #080f20)", border: "1px solid var(--line, #3b5676)", overflow: "hidden" }} aria-label={`${marks.length} markers in ${Math.round(length)} seconds`}>
      {marks.map((mark, i) => (
        <span key={i} title={formatDuration(Math.round(mark))} style={{ position: "absolute", left: `${Math.min(100, Math.max(0, (mark / Math.max(1, length)) * 100))}%`, top: 0, bottom: 0, width: 3, background: color }} />
      ))}
    </div>
  );
}

export function ChannelForensics({ videos }: { videos: Video[] }) {
  const { db, platform, toast } = useApp();
  const act = useAction();
  const [videoId, setVideoId] = useState("");
  const [busy, setBusy] = useState("");
  const active = videoId || videos[0]?.id || "";
  const video = videos.find(v => v.id === active);
  const { data } = useData(async () => active ? loadForensics(db, active) : null, [active]);
  const filename = (path: string) => path.split(/[\\/]/).pop() ?? path;
  const save = (patch: Parameters<typeof saveForensics>[2], message: string) => void act(
    () => saveForensics(db, active, patch), { title: "EVIDENCE SAVED", body: message },
  );

  const chooseMedia = async () => {
    if (!active) return;
    setBusy("Reading original footage locally; this may take a little while...");
    try {
      const path = await platform.dialogs.openFile("Choose an original recording you own", [{ name: "Videos", extensions: ["mp4", "mov", "mkv", "webm", "avi"] }]);
      if (!path) return;
      const result = await platform.inspectVideo(path);
      save({ media: result }, "Stored local technical observations, not presumed editing decisions.");
    } catch (e) { toast("VIDEO INSPECTION FAILED", e instanceof Error ? e.message : String(e), "err"); }
    finally { setBusy(""); }
  };
  const chooseTranscript = async () => {
    if (!active) return;
    setBusy("Importing subtitles...");
    try {
      const path = await platform.dialogs.openFile("Choose a transcript you own", [{ name: "Subtitles and text", extensions: ["srt", "vtt", "txt"] }]);
      if (!path) return;
      const result = parseTranscript(await platform.files.readText(path), filename(path));
      if (result.cues.length === 0) throw new Error("The transcript contains no usable cues or text.");
      save({ transcript: result, transcriptFilename: filename(path) }, `Imported ${result.cues.length} segments; ${result.warnings.join(" ")}`);
    } catch (e) { toast("TRANSCRIPT FAILED", e instanceof Error ? e.message : String(e), "err"); }
    finally { setBusy(""); }
  };
  const chooseThumbnail = async () => {
    if (!active) return;
    setBusy("Inspecting colors from your original image...");
    try {
      const path = await platform.dialogs.openFile("Choose your own thumbnail image", [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }]);
      if (!path) return;
      const colors = await paletteOfImage(await platform.files.readBinary(path), path);
      save({ thumbnailPalette: colors, thumbnailFilename: filename(path) }, "Palette based on observed pixels; layout and creative intent remain yours.");
    } catch (e) { toast("THUMBNAIL IMPORT FAILED", e instanceof Error ? e.message : String(e), "err"); }
    finally { setBusy(""); }
  };

  return (
    <div className="stack">
      <Win title="CHANNEL DNA :: LOCAL EVIDENCE" icon="channel">
        <p className="small">
          Link an original recording, transcript, or your own thumbnail to a video below. Files stay on this computer.
          Nothing here automatically identifies jokes, your editing intentions, or personality.
        </p>
        <Field label="Which upload does this evidence belong to?">
          {(id) => <Select id={id} value={active} options={videos.map(v => ({ id: v.id, label: v.title }))} onChange={setVideoId} />}
        </Field>
        {video ? <p className="dim small">Selected: {video.title} — {video.id}. You choose which local file belongs to it.</p> : <Note>Import at least one video in the Library or Import tab first.</Note>}
      </Win>
      {video ? (
        <>
          <div className="grid cols-3">
            <Win title="ORIGINAL VIDEO :: FFmpeg" icon="play">
              <p className="dim small">Uses FFprobe and FFmpeg if installed on your PC. Examines at most the first 90 seconds; it does not upload video.</p>
              <Button variant="primary" onClick={() => void chooseMedia()} disabled={Boolean(busy)}>Choose local video...</Button>
              {data?.media ? (
                <div className="stack tight" style={{ marginTop: 8 }}>
                  <b className="small">{data.media.fileName}</b>
                  <p className="small">{formatDuration(Math.round(data.media.durationSeconds))} full length · analyzed {formatDuration(Math.round(data.media.inspectedSeconds))} · {data.media.width ?? "?"} × {data.media.height ?? "?"}</p>
                  <p className="dim small">{data.media.sceneSeconds.length} estimated visual differences; {data.media.silenceRanges.length} quiet audio intervals.</p>
                  <TimestampMarkers length={data.media.inspectedSeconds} marks={data.media.sceneSeconds} color="#92bbf1"/>
                  <p className="dim small">Blue marks: substantial frame changes, NOT confirmed cuts.</p>
                  <TimestampMarkers length={data.media.inspectedSeconds} marks={data.media.silenceRanges.map(r => r.start)} color="#e4bc65"/>
                  <p className="dim small">Gold marks: beginning of detected quiet periods, NOT necessarily pauses in speech.</p>
                </div>
              ) : <p className="dim small">No footage analyzed. This is unknown, not automatically inferred from your title.</p>}
            </Win>
            <Win title="TRANSCRIPT :: SRT / VTT / TXT" icon="channel">
              <Button variant="primary" onClick={() => void chooseTranscript()} disabled={Boolean(busy)}>Import my subtitles...</Button>
              {data?.transcript ? (
                <div className="stack tight" style={{ marginTop: 8 }}>
                  <b className="small">{data.transcriptFilename}</b>
                  <p className="small">{data.transcript.cues.length} segments · {data.transcript.wordCount} words · {data.transcript.kind.toUpperCase()}</p>
                  {data.transcript.warnings.map((w,i) => <p key={i} className="dim small">{w}</p>)}
                  <details>
                    <summary>Read first transcript segments (source text)</summary>
                    <div className="stack tight" style={{ maxHeight: 300, overflow: "auto" }}>
                      {data.transcript.cues.slice(0, 25).map((c,i) => <p key={i} className="small selectable"><span className="dim">{formatDuration(Math.round(c.start))}</span> {c.text}</p>)}
                    </div>
                  </details>
                </div>
              ) : <p className="dim small">No transcript imported. We cannot infer spoken words from titles or covers.</p>}
            </Win>
            <Win title="YOUR THUMBNAIL :: COLOR EVIDENCE" icon="thumbnail">
              <Button variant="primary" onClick={() => void chooseThumbnail()} disabled={Boolean(busy)}>Inspect my image...</Button>
              {data?.thumbnailPalette.length ? (
                <div className="stack tight" style={{ marginTop: 8 }}>
                  <p className="small">{data.thumbnailFilename} · sampled pixel colors, not an AI style judgment</p>
                  <div className="row">
                    {data.thumbnailPalette.map(c => <div key={c} title={c} style={{ width: 48, height: 40, background: c, border: "2px solid #51647e" }}/>)}
                  </div>
                  <p className="dim small">{data.thumbnailPalette.join(" · ")}</p>
                </div>
              ) : <p className="dim small">No local thumbnail analyzed. The image on YouTube is not automatically treated as an editable source file.</p>}
            </Win>
          </div>
          {busy ? <Note>{busy}</Note> : null}
          <Win title="CREATOR REVIEW :: YOU DECIDE WHAT IT MEANS" icon="memory">
            <p className="dim small">These are your observations. Mark a favorite moment, a technique you used, something you disliked, or whatever you remember about making the video.</p>
            <Field label="What do you actually remember about this video?">
              {(id) => <TextArea id={id} rows={5} value={data?.creatorNotes ?? ""} onCommit={v => save({ creatorNotes: v }, "Your original notes were preserved.")} />}
            </Field>
            <Field label="Your tags (comma-separated, optional)">
              {(id) => <TextArea id={id} rows={2} value={(data?.creatorTags ?? []).join(", ")} onCommit={v => save({ creatorTags: v.split(",").map(x=>x.trim()).filter(Boolean) }, "Your own technique tags were saved.")} />}
            </Field>
            <p className="dim small">You can add files to other uploads without losing this video's notes. These records are included in your normal CREATOR.EXE JSON backup.</p>
          </Win>
        </>
      ) : null}
    </div>
  );
}
