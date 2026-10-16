import { useMemo, useRef, useState } from "react";
import { useAction, useApp, useData } from "../app/context.tsx";
import { deleteAllChannelData, deleteVideo, listMetrics, listProjects, listVideoFeedback, listVideos, saveVideoFeedback, setManualMetric, updateVideoAnnotations } from "../db/repos.ts";
import { feedUrl, parseChannelFeed } from "../domain/channel/feed.ts";
import { importChannelViaApi } from "../domain/channel/dataApi.ts";
import { parseStudioCsv } from "../domain/channel/studioCsv.ts";
import { applyMerge, extractVideoId, planMerge, type MergePlan } from "../domain/channel/merge.ts";
import { summarizeChannel } from "../domain/channel/analyze.ts";
import type { ImportBatch } from "../domain/channel/types.ts";
import { SECRET_YOUTUBE_KEY } from "../domain/settings.ts";
import { FEEDBACK_FLAGS, type EvidenceSource, type FeedbackFlag, type Video, type VideoFeedback } from "../domain/types.ts";
import { formatDate, formatDuration, relativeTime } from "../lib/util.ts";
import { Button, Check, Chip, Dialog, Empty, Field, Note, PageHead, Progress, Rating, Segmented, Select, Tabs, TextArea, TextInput, Win } from "../ui/kit.tsx";
import { Icon } from "../ui/icons.tsx";

export const SOURCE_LABEL: Record<EvidenceSource, string> = {
  public_feed: "PUBLIC FEED",
  public_api: "DATA API",
  studio_export: "STUDIO EXPORT",
  manual: "MANUAL",
  local_file: "LOCAL FILE",
};

const METRIC_LABEL: Record<string, string> = {
  views: "Views",
  likes: "Likes",
  comments: "Comments",
  ratings: "Ratings (feed)",
  watch_time_hours: "Watch time (hours)",
  impressions: "Impressions",
  ctr_percent: "Impressions CTR (%)",
  avg_view_duration_seconds: "Avg view duration (s)",
  avg_percent_viewed: "Avg % viewed",
  subscribers_gained_net: "Subscribers (net)",
};

type Method = "feed" | "api" | "studio" | "manual";

function ImportPanel({ onPlan }: { onPlan: (plan: MergePlan, batch: ImportBatch) => void }) {
  const { db, platform, settings, updateSettings, toast, go } = useApp();
  const [method, setMethod] = useState<Method>("feed");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number | null; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctrl = useRef<AbortController | null>(null);
  const [manual, setManual] = useState({ url: "", title: "", date: "", duration: "" });

  const run = async (fn: (signal: AbortSignal) => Promise<ImportBatch>) => {
    setBusy(true);
    setError(null);
    ctrl.current = new AbortController();
    try {
      const batch = await fn(ctrl.current.signal);
      const existing = await listVideos(db);
      const metrics = await listMetrics(db);
      const prev = new Map<string, Record<string, number>>();
      for (const m of metrics) {
        const k = `${m.videoId}|${m.source}`;
        prev.set(k, { ...(prev.get(k) ?? {}), [m.metric]: m.value });
      }
      onPlan(planMerge(existing, batch, prev), batch);
    } catch (e) {
      if (ctrl.current?.signal.aborted) setError("Import cancelled. Nothing was changed.");
      else setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const channelId = settings.channelInput.match(/UC[\w-]{22}/)?.[0] ?? "";

  return (
    <Win title="IMPORT CHANNEL DATA" icon="import">
      <Segmented<Method>
        value={method}
        options={[
          { id: "feed", label: "Public feed (no key)" },
          { id: "api", label: "YouTube Data API" },
          { id: "studio", label: "YouTube Studio export" },
          { id: "manual", label: "Add by hand" },
        ]}
        onChange={(v) => setMethod(v ?? "feed")}
        label="Import method"
      />
      <Field label="Your channel (ID, URL or @handle)">
        {(id) => <TextInput id={id} value={settings.channelInput} onCommit={(v) => void updateSettings({ channelInput: v.trim() })} />}
      </Field>
      {method === "feed" ? (
        <>
          <p className="small">Reads YouTube's public feed for your channel. Free and needs no account, but it only lists the 15 most recent public uploads, without video lengths.</p>
          {!channelId ? <Note kind="warn">The public feed needs a channel ID starting with UC. Handles (@name) work with the Data API.</Note> : null}
          <Button variant="primary" icon="import" disabled={busy || !channelId} onClick={() => void run(async (signal) => {
            const res = await platform.http(feedUrl(channelId), { signal });
            if (!res.ok) throw new Error(res.status === 404 ? "YouTube has no public feed for that channel ID." : `YouTube returned HTTP ${res.status}.`);
            return parseChannelFeed(res.text);
          })}>
            Read public feed
          </Button>
        </>
      ) : null}
      {method === "api" ? (
        <>
          <p className="small">
            Imports every public upload with lengths, views, likes and comment counts. Needs a free API key from Google Cloud (YouTube Data API v3). A full import of a small channel uses only a few of the 10,000 free daily quota units. No password is ever needed.
          </p>
          <div className="row">
            <Button variant="primary" icon="import" disabled={busy} onClick={() => void run(async (signal) => {
              const key = await platform.secrets.get(SECRET_YOUTUBE_KEY);
              if (!key) throw new Error("No YouTube API key saved yet. Add one in Settings > YouTube.");
              return importChannelViaApi((url, s) => platform.http(url, { signal: s ?? signal }), key, settings.channelInput, { signal, onProgress: (done, total, message) => setProgress({ done, total, message }) });
            })}>
              Import with Data API
            </Button>
            <Button onClick={() => go({ section: "settings" })}>API key settings</Button>
          </div>
        </>
      ) : null}
      {method === "studio" ? (
        <>
          <p className="small">
            In YouTube Studio open Analytics, then Advanced mode, choose the Content tab and a lifetime date range, and Export current view as CSV. Pick the "Table data.csv" file here. This adds private analytics like impressions and click-through rate, labelled as Studio data.
          </p>
          <Button variant="primary" icon="import" disabled={busy} onClick={() => void run(async () => {
            const path = await platform.dialogs.openFile("Choose the Studio export (Table data.csv)", [{ name: "CSV", extensions: ["csv"] }]);
            if (!path) throw new Error("No file chosen.");
            const text = await platform.files.readText(path);
            return parseStudioCsv(text, path.split(/[\\/]/).pop() ?? path);
          })}>
            Choose CSV file...
          </Button>
        </>
      ) : null}
      {method === "manual" ? (
        <div className="stack">
          <p className="small">Add a video yourself, for example a deleted or private one. A YouTube link or ID lets later imports merge with it.</p>
          <div className="grid cols-2">
            <Field label="YouTube link or ID (optional)">{(id) => <input id={id} className="input" value={manual.url} onChange={(e) => setManual({ ...manual, url: e.target.value })} />}</Field>
            <Field label="Title">{(id) => <input id={id} className="input" value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} />}</Field>
            <Field label="Published (YYYY-MM-DD, optional)">{(id) => <input id={id} className="input" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} />}</Field>
            <Field label="Length (mm:ss, optional)">{(id) => <input id={id} className="input" value={manual.duration} onChange={(e) => setManual({ ...manual, duration: e.target.value })} />}</Field>
          </div>
          <Button
            variant="primary"
            icon="plus"
            disabled={!manual.title.trim()}
            onClick={async () => {
              const vid = manual.url.trim() ? extractVideoId(manual.url) : null;
              if (manual.url.trim() && !vid) return toast("ERROR", "That doesn't look like a YouTube link or 11-character video ID.", "err");
              const dur = manual.duration.trim() ? manual.duration.split(":").map(Number).reduce((a, b) => a * 60 + b, 0) : null;
              const date = manual.date.trim() ? new Date(manual.date.trim()).toISOString() : null;
              await run(async () => ({
                source: "manual",
                label: "Added by hand",
                warnings: [],
                videos: [{ id: vid ?? `manual-${crypto.randomUUID()}`, title: manual.title.trim(), publishedAt: date, durationSeconds: dur !== null && Number.isFinite(dur) ? dur : null, thumbnailUrl: vid ? `https://i.ytimg.com/vi/${vid}/hqdefault.jpg` : null, availability: "unknown", metrics: {} }],
              }));
              setManual({ url: "", title: "", date: "", duration: "" });
            }}
          >
            Add video
          </Button>
        </div>
      ) : null}
      {busy ? (
        <div className="stack tight">
          <Progress value={progress?.done ?? 0} max={progress?.total ?? null} />
          <div className="row">
            <span className="dim small">{progress?.message ?? "Working..."}</span>
            <Button size="small" className="right" onClick={() => ctrl.current?.abort()}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      {error ? <Note kind="err">{error}</Note> : null}
    </Win>
  );
}

function PlanDialog({ plan, onClose }: { plan: MergePlan; onClose: () => void }) {
  const { db, toast, changed } = useApp();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const total = plan.added.length + plan.updated.length + plan.unchanged.length;
  const ctrl = useRef<AbortController | null>(null);
  const apply = async () => {
    setBusy(true);
    ctrl.current = new AbortController();
    try {
      const r = await applyMerge(db, plan, { signal: ctrl.current.signal, onProgress: (d) => setDone(d) });
      changed();
      toast(r.cancelled ? "IMPORT CANCELLED" : "IMPORT COMPLETE", r.cancelled ? "Finished chunks were kept; the rest was skipped." : `${r.added} added, ${r.updated} updated. Your notes and ratings were not touched.`);
      onClose();
    } catch (e) {
      toast("ERROR", e instanceof Error ? e.message : String(e), "err");
      setBusy(false);
    }
  };
  return (
    <Dialog
      title="Import preview"
      icon="import"
      wide
      onClose={() => !busy && onClose()}
      actions={
        busy ? (
          <Button onClick={() => ctrl.current?.abort()}>Cancel</Button>
        ) : (
          <>
            <Button onClick={onClose}>Discard</Button>
            <Button variant="primary" disabled={!plan.added.length && !plan.updated.length && !plan.unchanged.length} onClick={() => void apply()}>
              Merge into archive
            </Button>
          </>
        )
      }
    >
      <p>
        <b>{plan.label}</b>
      </p>
      <div className="row">
        <Chip kind="ok">{plan.added.length} new</Chip>
        <Chip kind="accent">{plan.updated.length} updated</Chip>
        <Chip>{plan.unchanged.length} unchanged</Chip>
        {plan.notReturned.length ? <Chip kind="warn">{plan.notReturned.length} not in this source</Chip> : null}
      </div>
      {plan.warnings.map((w) => (
        <Note key={w} kind="warn">
          {w}
        </Note>
      ))}
      <Note>Imported data updates public facts only. Your categories, notes and satisfaction ratings are never overwritten.</Note>
      {plan.updated.length ? (
        <details open={plan.updated.length < 10}>
          <summary>What changes</summary>
          <ul className="plain small">
            {plan.updated.map((u) => (
              <li key={u.video.id}>
                {u.existing.title}: {[...u.changes, ...u.metricChanges.map((m) => `${METRIC_LABEL[m] ?? m}`)].join(", ")}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {plan.notReturned.length ? (
        <details>
          <summary>Not returned by this source (kept as they are)</summary>
          <ul className="plain small">
            {plan.notReturned.map((v) => (
              <li key={v.id}>{v.title}</li>
            ))}
          </ul>
          <p className="dim small">This can mean the video is older than the feed's 15-video window, private, unlisted or deleted. Nothing is assumed; mark its availability yourself if you know.</p>
        </details>
      ) : null}
      {busy ? <Progress value={done} max={total} /> : null}
    </Dialog>
  );
}

function VideoDetail({ video, feedback, onClose }: { video: Video; feedback: VideoFeedback | null; onClose: () => void }) {
  const { db, platform, confirm } = useApp();
  const act = useAction();
  const { data } = useData(async () => ({ metrics: await listMetrics(db, video.id), projects: await listProjects(db, true) }), [video.id]);
  const fb: VideoFeedback = feedback ?? { videoId: video.id, flags: [], enjoyOverall: null, enjoyRecording: null, enjoyEditing: null, pride: null, effort: null, revisit: null, updatedAt: "" };
  const saveFb = (patch: Partial<VideoFeedback>) => void act(() => saveVideoFeedback(db, { ...fb, ...patch }));
  const toggle = (f: FeedbackFlag, on: boolean) => saveFb({ flags: on ? [...fb.flags, f] : fb.flags.filter((x) => x !== f) });
  const isYt = /^[\w-]{11}$/.test(video.id);
  const bySource = new Map<string, { metric: string; value: number; capturedAt: string }[]>();
  for (const m of data?.metrics ?? []) bySource.set(m.source, [...(bySource.get(m.source) ?? []), m]);

  return (
    <Win title="VIDEO DETAILS" icon="channel" actions={<Button size="small" icon="x" title="Close" onClick={onClose} />} scroll>
      <div className="vthumb">{video.thumbnailUrl ? <img src={video.thumbnailUrl} alt="" /> : <Icon name="channel" />}</div>
      <h3 className="selectable">{video.title}</h3>
      <div className="row small">
        <Chip>{formatDate(video.publishedAt)}</Chip>
        <Chip>{formatDuration(video.durationSeconds)}</Chip>
        <Chip kind={video.availability === "public" ? "ok" : video.availability === "deleted" ? "err" : "warn"}>{video.availability}</Chip>
        <span className="source-tag">first seen via {SOURCE_LABEL[video.firstSource]}</span>
      </div>
      {isYt ? (
        <Button size="small" icon="link" onClick={() => void platform.openUrl(`https://www.youtube.com/watch?v=${video.id}`)}>
          Open on YouTube
        </Button>
      ) : null}

      <div className="groupbox">
        <legend>Evidence: numbers by source</legend>
        {bySource.size ? (
          [...bySource.entries()].map(([source, ms]) => (
            <div key={source} className="stack tight">
              <span className="source-tag">{SOURCE_LABEL[source as EvidenceSource] ?? source}</span>
              <dl className="kv">
                {ms.map((m) => (
                  <div key={m.metric} style={{ display: "contents" }}>
                    <dt>{METRIC_LABEL[m.metric] ?? m.metric}</dt>
                    <dd>
                      {m.metric.includes("duration") ? formatDuration(m.value) : m.value.toLocaleString()} <span className="dim small">({relativeTime(m.capturedAt)})</span>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))
        ) : (
          <p className="dim small">No metrics imported for this video. Nothing is estimated.</p>
        )}
        <div className="row small">
          <span className="dim">Your own views count:</span>
          <input
            className="input"
            style={{ width: 120 }}
            inputMode="numeric"
            defaultValue={data?.metrics.find((m) => m.source === "manual" && m.metric === "views")?.value ?? ""}
            onBlur={(e) => void act(() => setManualMetric(db, video.id, "views", e.target.value.trim() === "" ? null : Number(e.target.value.replace(/,/g, ""))))}
            aria-label="Manual view count"
          />
        </div>
      </div>

      <div className="groupbox">
        <legend>How you felt making it</legend>
        <div className="stack tight">
          {FEEDBACK_FLAGS.map((f) => (
            <Check key={f.id} checked={fb.flags.includes(f.id)} onChange={(on) => toggle(f.id, on)}>
              {f.label}
            </Check>
          ))}
        </div>
        <div className="stack tight" style={{ marginTop: 8 }}>
          <Rating label="Enjoyed the overall project" value={fb.enjoyOverall} onChange={(v) => saveFb({ enjoyOverall: v })} />
          <Rating label="Enjoyed recording" value={fb.enjoyRecording} onChange={(v) => saveFb({ enjoyRecording: v })} />
          <Rating label="Enjoyed editing" value={fb.enjoyEditing} onChange={(v) => saveFb({ enjoyEditing: v })} />
          <Rating label="Proud of the result" value={fb.pride} onChange={(v) => saveFb({ pride: v })} />
          <Rating label="Production effort" value={fb.effort} onChange={(v) => saveFb({ effort: v })} />
          <Rating label="Want to revisit the subject" value={fb.revisit} onChange={(v) => saveFb({ revisit: v })} />
        </div>
        <p className="dim small">These feelings count more than view numbers when ideas are suggested.</p>
      </div>

      <div className="groupbox">
        <legend>Your notes</legend>
        <div className="grid cols-2">
          <Field label="Your category">{(id) => <TextInput id={id} value={video.userCategory} placeholder="e.g. survival challenge" onCommit={(v) => void act(() => updateVideoAnnotations(db, video.id, { userCategory: v }))} />}</Field>
          <Field label="Format">{(id) => <TextInput id={id} value={video.userFormat} placeholder="e.g. let's play with a rule" onCommit={(v) => void act(() => updateVideoAnnotations(db, video.id, { userFormat: v }))} />}</Field>
        </div>
        <Field label="Related project">
          {(id) => (
            <Select
              id={id}
              value={video.relatedProjectId ?? ""}
              options={[{ id: "", label: "(none)" }, ...(data?.projects ?? []).map((p) => ({ id: p.id, label: p.title }))]}
              onChange={(v) => void act(() => updateVideoAnnotations(db, video.id, { relatedProjectId: v || null }))}
            />
          )}
        </Field>
        <Field label="Notes">{(id) => <TextArea id={id} value={video.userNotes} rows={3} onCommit={(v) => void act(() => updateVideoAnnotations(db, video.id, { userNotes: v }))} />}</Field>
      </div>
      {video.description ? (
        <details>
          <summary className="dim">Description (from YouTube)</summary>
          <p className="small selectable" style={{ whiteSpace: "pre-wrap" }}>
            {video.description}
          </p>
        </details>
      ) : null}
      <Button
        variant="danger"
        size="small"
        icon="trash"
        onClick={async () => {
          if (await confirm({ title: "Remove from archive", message: `Remove "${video.title}" and your notes about it from CREATOR.EXE? Nothing on YouTube is affected.`, confirm: "Remove", danger: true })) {
            await act(() => deleteVideo(db, video.id));
            onClose();
          }
        }}
      >
        Remove from archive
      </Button>
    </Win>
  );
}

type Sort = "newest" | "oldest" | "views" | "longest" | "loved";

export function ChannelDna() {
  const { db, confirm } = useApp();
  const act = useAction();
  const [tab, setTab] = useState<"library" | "patterns" | "import">("library");
  const [plan, setPlan] = useState<MergePlan | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [subject, setSubject] = useState("");
  const { data } = useData(async () => {
    const [videos, metrics, feedback] = await Promise.all([listVideos(db), listMetrics(db), listVideoFeedback(db)]);
    return { videos, metrics, feedback, summary: summarizeChannel(videos, metrics) };
  }, []);

  const views = useMemo(() => {
    const m = new Map<string, number>();
    for (const x of data?.metrics ?? []) if (x.metric === "views") m.set(x.videoId, Math.max(m.get(x.videoId) ?? 0, x.value));
    return m;
  }, [data]);
  const fbMap = useMemo(() => new Map((data?.feedback ?? []).map((f) => [f.videoId, f])), [data]);
  const loved = (id: string) => {
    const f = fbMap.get(id);
    return f ? f.flags.filter((x) => ["loved_making", "proud", "would_repeat", "enjoyed_recording", "enjoyed_editing"].includes(x)).length + (f.enjoyOverall ?? 0) / 2 : -1;
  };

  const list = useMemo(() => {
    if (!data) return [];
    const q = query.toLowerCase();
    const items = data.videos.filter(
      (v) =>
        (!q || `${v.title} ${v.userNotes} ${v.userCategory} ${v.userFormat}`.toLowerCase().includes(q)) &&
        (!subject || (data.summary.readings.get(v.id)?.subjects.some((s) => s.id === subject) ?? false) || (data.summary.readings.get(v.id)?.formats.some((f) => f.label === subject) ?? false)),
    );
    const by: Record<Sort, (a: Video, b: Video) => number> = {
      newest: (a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""),
      oldest: (a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""),
      views: (a, b) => (views.get(b.id) ?? -1) - (views.get(a.id) ?? -1),
      longest: (a, b) => (b.durationSeconds ?? -1) - (a.durationSeconds ?? -1),
      loved: (a, b) => loved(b.id) - loved(a.id),
    };
    return [...items].sort(by[sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, query, sort, subject, views, fbMap]);

  const sel = data?.videos.find((v) => v.id === selected) ?? null;
  const s = data?.summary;

  return (
    <div className="page">
      <PageHead
        sys="CHANNEL DNA :: ARCHIVE"
        title="Your channel, with receipts"
        lede="Every pattern links to the videos and words that produced it. Labels come from simple keyword matches on titles and descriptions: nothing here has watched your videos."
      />
      <Tabs
        value={tab}
        tabs={[
          { id: "library", label: "Library", badge: data?.videos.length ?? 0 },
          { id: "patterns", label: "Patterns & evidence" },
          { id: "import", label: "Import & data" },
        ]}
        onChange={setTab}
      />
      <div className="tabpanel">
        {tab === "import" || (tab === "library" && data && data.videos.length === 0) ? (
          <div className="grid cols-2">
            <ImportPanel
              onPlan={(p) => {
                setPlan(p);
              }}
            />
            <Win title="DATA SOURCES" icon="settings">
              <dl className="kv small">
                <dt>
                  <span className="source-tag">PUBLIC FEED</span>
                </dt>
                <dd>Titles, dates, descriptions and view counts of the latest 15 public uploads.</dd>
                <dt>
                  <span className="source-tag">DATA API</span>
                </dt>
                <dd>All public uploads with lengths, views, likes, comments (your API key).</dd>
                <dt>
                  <span className="source-tag">STUDIO EXPORT</span>
                </dt>
                <dd>Private analytics you exported: impressions, CTR, watch time.</dd>
                <dt>
                  <span className="source-tag">MANUAL</span>
                </dt>
                <dd>Anything you type in.</dd>
              </dl>
              <Note>Planned for later phases: signing in with Google (OAuth) for private analytics and retention, transcript import, and optional analysis of your original video files.</Note>
              {data && data.videos.length ? (
                <Button
                  variant="danger"
                  icon="trash"
                  onClick={async () => {
                    if (await confirm({ title: "Delete imported channel data", message: `Remove all ${data.videos.length} videos, their metrics and your ratings of them from CREATOR.EXE? Your projects and ideas stay. Nothing on YouTube is affected.`, confirm: "Delete channel data", danger: true }))
                      void act(() => deleteAllChannelData(db), { title: "CHANNEL DATA CLEARED" });
                  }}
                >
                  Delete all channel data
                </Button>
              ) : null}
            </Win>
          </div>
        ) : null}

        {tab === "library" && data && data.videos.length > 0 ? (
          <div className="split" style={{ gridTemplateColumns: sel ? "1fr minmax(360px, 420px)" : "1fr" }}>
            <div className="stack">
              <div className="row">
                <input className="input" style={{ width: 260 }} placeholder="Search titles and notes" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search videos" />
                <Select
                  value={sort}
                  options={[
                    { id: "newest", label: "Newest first" },
                    { id: "oldest", label: "Oldest first" },
                    { id: "views", label: "Most views (any source)" },
                    { id: "longest", label: "Longest" },
                    { id: "loved", label: "Loved making most" },
                  ]}
                  onChange={(v) => setSort(v)}
                  className=""
                />
                <Select
                  value={subject}
                  options={[{ id: "", label: "All subjects & formats" }, ...(s?.subjects ?? []).map((x) => ({ id: x.id, label: `${x.label} (${x.count})` })), ...(s?.formats ?? []).map((f) => ({ id: f.label, label: `Format: ${f.label} (${f.count})` }))]}
                  onChange={(v) => setSubject(v)}
                  className=""
                />
                <span className="dim right">{list.length} videos</span>
              </div>
              <div className="vgrid">
                {list.map((v) => (
                  <button key={v.id} className={`vcard ${selected === v.id ? "sel" : ""}`} onClick={() => setSelected(v.id)}>
                    <div className="vthumb">
                      {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" loading="lazy" /> : <span>no thumbnail</span>}
                      {v.durationSeconds !== null ? <span className="dur">{formatDuration(v.durationSeconds)}</span> : null}
                    </div>
                    <div className="vtitle">{v.title}</div>
                    <div className="vmeta">
                      <span>{formatDate(v.publishedAt)}</span>
                      {views.has(v.id) ? <span>{views.get(v.id)?.toLocaleString()} views</span> : null}
                      {fbMap.get(v.id)?.flags.includes("loved_making") ? <span style={{ color: "var(--led)" }}>loved making</span> : null}
                      {v.availability !== "public" ? <span>{v.availability}</span> : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {sel ? <VideoDetail video={sel} feedback={fbMap.get(sel.id) ?? null} onClose={() => setSelected(null)} /> : null}
          </div>
        ) : null}

        {tab === "patterns" && s ? (
          s.videoCount === 0 ? (
            <Empty icon="channel" title="No videos imported yet">
              <Button onClick={() => setTab("import")}>Import your channel</Button>
            </Empty>
          ) : (
            <div className="stack">
              <div className="grid cols-4">
                <Win title="ARCHIVE" icon="channel">
                  <div className="lcd" style={{ padding: "8px 12px" }}>
                    <div className="lcd-line">{s.videoCount} VIDEOS</div>
                    <div className="lcd-line">{s.firstUpload ? `${s.firstUpload.slice(0, 4)}-${(s.lastUpload ?? "").slice(0, 4)}` : "NO DATES"}</div>
                  </div>
                </Win>
                <Win title="HIATUS" icon="tonight">
                  <div className="lcd" style={{ padding: "8px 12px" }}>
                    <div className="lcd-line">{s.gapDays !== null ? `${Math.floor(s.gapDays / 30)} MONTHS` : "UNKNOWN"}</div>
                    <div className="lcd-line">SINCE LAST UPLOAD</div>
                  </div>
                </Win>
                <Win title="TYPICAL LENGTH" icon="play">
                  <div className="lcd" style={{ padding: "8px 12px" }}>
                    <div className="lcd-line">{s.medianDurationSeconds !== null ? formatDuration(s.medianDurationSeconds) : "UNKNOWN"}</div>
                    <div className="lcd-line">MEDIAN</div>
                  </div>
                </Win>
                <Win title="RATED BY YOU" icon="star">
                  <div className="lcd" style={{ padding: "8px 12px" }}>
                    <div className="lcd-line">
                      {data?.feedback.length ?? 0} / {s.videoCount}
                    </div>
                    <div className="lcd-line">VIDEOS</div>
                  </div>
                </Win>
              </div>
              <div className="grid cols-2">
                <Win title="RECURRING SUBJECTS" icon="ideas">
                  <p className="dim small">Keyword matches on titles and descriptions. Click a row to see the videos.</p>
                  <table className="table">
                    <tbody>
                      {s.subjects.map((x) => (
                        <tr key={x.id} onClick={() => (setSubject(x.id), setTab("library"))}>
                          <td>{x.label}</td>
                          <td className="mono">{x.count}</td>
                          <td className="dim small">{[...new Set(x.videoIds.map((id) => s.readings.get(id)?.subjects.find((r) => r.id === x.id)?.because))].slice(0, 3).join("; ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Win>
                <Win title="FORMATS" icon="layers">
                  <table className="table">
                    <tbody>
                      {s.formats.map((f) => (
                        <tr key={f.label} onClick={() => (setSubject(f.label), setTab("library"))}>
                          <td>{f.label}</td>
                          <td className="mono">{f.count}</td>
                          <td className="dim small">{[...new Set(f.videoIds.map((id) => s.readings.get(id)?.formats.find((r) => r.label === f.label)?.because))].slice(0, 3).join("; ")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!s.formats.length ? <p className="dim">No format patterns detected from titles.</p> : null}
                </Win>
                <Win title="OVER TIME" icon="refresh">
                  <table className="table">
                    <tbody>
                      {s.byYear.map((y) => (
                        <tr key={y.year}>
                          <td className="mono">{y.year}</td>
                          <td className="mono">{y.count}</td>
                          <td className="dim small">{y.topSubjects.join(", ") || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Win>
                <Win title="WHAT DATA EXISTS" icon="settings">
                  <p className="dim small">Which numbers are available, from which source, for how many videos.</p>
                  <table className="table">
                    <tbody>
                      {s.metricCoverage.map((m) => (
                        <tr key={`${m.metric}${m.source}`}>
                          <td>{METRIC_LABEL[m.metric] ?? m.metric}</td>
                          <td>
                            <span className="source-tag">{SOURCE_LABEL[m.source as EvidenceSource] ?? m.source}</span>
                          </td>
                          <td className="mono">{m.videos}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!s.metricCoverage.length ? <p className="dim">No metrics imported.</p> : null}
                  <p className="dim small">Retention, impressions and traffic sources require a Studio export or (later) Google sign-in. Nothing is estimated.</p>
                </Win>
              </div>
              <Win title="VIDEOS YOU LOVED MAKING vs VIDEOS THAT PERFORMED" icon="star">
                <div className="grid cols-2">
                  <div>
                    <h3>Loved making</h3>
                    {(data?.videos ?? []).filter((v) => loved(v.id) >= 2).length ? (
                      <ul className="plain">
                        {(data?.videos ?? [])
                          .filter((v) => loved(v.id) >= 2)
                          .map((v) => (
                            <li key={v.id}>{v.title}</li>
                          ))}
                      </ul>
                    ) : (
                      <p className="dim small">Rate videos in the Library to fill this in.</p>
                    )}
                  </div>
                  <div>
                    <h3>Most views (age not adjusted)</h3>
                    <ul className="plain">
                      {[...(data?.videos ?? [])]
                        .filter((v) => views.has(v.id))
                        .sort((a, b) => (views.get(b.id) ?? 0) - (views.get(a.id) ?? 0))
                        .slice(0, 5)
                        .map((v) => (
                          <li key={v.id}>
                            {v.title} <span className="dim">({views.get(v.id)?.toLocaleString()})</span>
                          </li>
                        ))}
                    </ul>
                    <p className="dim small">Popular isn't the same as fulfilling. Fair, age-adjusted comparisons arrive with the Analytics module.</p>
                  </div>
                </div>
              </Win>
            </div>
          )
        ) : null}
      </div>
      {plan ? <PlanDialog plan={plan} onClose={() => setPlan(null)} /> : null}
    </div>
  );
}

