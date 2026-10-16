import { useMemo, useState } from "react";
import { useAction, useApp, useData } from "../app/context.tsx";
import { deleteResearch, listProjects, listResearch, saveResearch, type ResearchInput } from "../db/repos.ts";
import type { ResearchItem, ResearchKind, SourceType, Verification } from "../domain/types.ts";
import { formatDate, relativeTime } from "../lib/util.ts";
import { Button, Chip, Dialog, Empty, Field, Note, PageHead, Segmented, Select, Win } from "../ui/kit.tsx";

export const SOURCE_TYPES: { id: SourceType; label: string }[] = [
  { id: "article", label: "Article" },
  { id: "documentation", label: "Official documentation" },
  { id: "primary", label: "Primary source" },
  { id: "archive", label: "Archive" },
  { id: "video", label: "Video" },
  { id: "book", label: "Book" },
  { id: "community", label: "Community / forum" },
  { id: "other", label: "Other" },
];
export const VERIFICATION: { id: Verification; label: string }[] = [
  { id: "unverified", label: "Not checked yet" },
  { id: "verified", label: "Verified" },
  { id: "speculation", label: "Speculation" },
  { id: "disputed", label: "Conflicting sources" },
];
const KINDS: { id: ResearchKind; label: string }[] = [
  { id: "source", label: "Source" },
  { id: "note", label: "My note" },
  { id: "question", label: "Open question" },
];

export function ResearchEditor(props: { item: ResearchItem | null; defaultProjectId: string | null; onClose: () => void; onSave: (input: ResearchInput & { id?: string }) => Promise<void> }) {
  const { db } = useApp();
  const { data: projects } = useData(() => listProjects(db), []);
  const it = props.item;
  const [f, setF] = useState<ResearchInput & { id?: string }>({
    id: it?.id,
    projectId: it?.projectId ?? props.defaultProjectId,
    kind: it?.kind ?? "source",
    title: it?.title ?? "",
    url: it?.url ?? "",
    publisher: it?.publisher ?? "",
    publishedAt: it?.publishedAt ?? "",
    sourceType: it?.sourceType ?? "article",
    verification: it?.verification ?? "unverified",
    summary: it?.summary ?? "",
    myNotes: it?.myNotes ?? "",
    checkedAt: it?.checkedAt ?? null,
  });
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });
  const urlOk = !f.url || /^https?:\/\/\S+\.\S+/.test(f.url);
  const projectOptions = [{ id: "", label: "(not linked to a project)" }, ...(projects ?? []).map((p) => ({ id: p.id, label: p.title }))];
  return (
    <Dialog
      title={it ? "Edit research item" : "Add research"}
      icon="research"
      wide
      onClose={props.onClose}
      actions={
        <>
          <Button onClick={props.onClose}>Cancel</Button>
          <Button variant="primary" disabled={!f.title.trim() || !urlOk} onClick={() => void props.onSave({ ...f, checkedAt: f.url && f.url !== it?.url ? new Date().toISOString() : f.checkedAt })}>
            Save
          </Button>
        </>
      }
    >
      <div className="row">
        <Segmented value={f.kind ?? "source"} options={KINDS} onChange={(v) => set({ kind: v ?? "source" })} label="Kind" />
      </div>
      <div className="grid cols-2">
        <Field label="Title">{(id) => <input id={id} className="input" autoFocus value={f.title} onChange={(e) => set({ title: e.target.value })} />}</Field>
        <Field label="Project">{(id) => <Select id={id} value={f.projectId ?? ""} options={projectOptions} onChange={(v) => set({ projectId: v || null })} />}</Field>
        {f.kind === "source" ? (
          <>
            <Field label="Link" hint={urlOk ? "The original page, so you can always reopen it." : "That doesn't look like a web address."}>
              {(id) => <input id={id} className="input" value={f.url} placeholder="https://" onChange={(e) => set({ url: e.target.value.trim() })} />}
            </Field>
            <Field label="Publisher / author">{(id) => <input id={id} className="input" value={f.publisher} onChange={(e) => set({ publisher: e.target.value })} />}</Field>
            <Field label="Published (as stated by the source)">{(id) => <input id={id} className="input" value={f.publishedAt} placeholder="e.g. 2003-08-12" onChange={(e) => set({ publishedAt: e.target.value })} />}</Field>
            <Field label="Source type">{(id) => <Select id={id} value={f.sourceType ?? "article"} options={SOURCE_TYPES} onChange={(v) => set({ sourceType: v })} />}</Field>
          </>
        ) : null}
        <Field label="Verification">{(id) => <Select id={id} value={f.verification ?? "unverified"} options={VERIFICATION} onChange={(v) => set({ verification: v })} />}</Field>
      </div>
      <Field label={f.kind === "source" ? "What the source says (summarize in your own words)" : "Details"}>
        {(id) => <textarea id={id} className="textarea" rows={4} value={f.summary} onChange={(e) => set({ summary: e.target.value })} />}
      </Field>
      <Field label="My conclusions">{(id) => <textarea id={id} className="textarea" rows={3} value={f.myNotes} onChange={(e) => set({ myNotes: e.target.value })} />}</Field>
      {it?.checkedAt ? <p className="dim small">Link last checked {formatDate(it.checkedAt)}.</p> : null}
    </Dialog>
  );
}

interface WikiHit {
  title: string;
  snippet: string;
  timestamp: string;
}

function WikipediaLookup({ onSaved }: { onSaved: () => void }) {
  const { platform, db, toast, changed } = useApp();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<WikiHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; extract: string; url: string; timestamp: string } | null>(null);

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const res = await platform.http(`https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=8&srprop=snippet|timestamp&srsearch=${encodeURIComponent(q.trim())}`, {
        headers: { "Api-User-Agent": "CREATOR.EXE desktop app" },
      });
      if (!res.ok) throw new Error(`Wikipedia returned HTTP ${res.status}`);
      const body = JSON.parse(res.text) as { query?: { search?: { title: string; snippet: string; timestamp: string }[] } };
      setHits((body.query?.search ?? []).map((h) => ({ title: h.title, snippet: h.snippet.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&"), timestamp: h.timestamp })));
    } catch (e) {
      setError(`Could not reach Wikipedia: ${e instanceof Error ? e.message : String(e)}. You can still add sources by hand.`);
      setHits(null);
    } finally {
      setBusy(false);
    }
  };

  const open = async (title: string) => {
    try {
      const res = await platform.http(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const s = JSON.parse(res.text) as { title: string; extract?: string; timestamp?: string; content_urls?: { desktop?: { page?: string } } };
      setPreview({ title: s.title, extract: s.extract ?? "", url: s.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`, timestamp: s.timestamp ?? "" });
    } catch (e) {
      toast("ERROR", `Could not load the article: ${e instanceof Error ? e.message : String(e)}`, "err");
    }
  };

  const save = async () => {
    if (!preview) return;
    try {
      await saveResearch(db, {
        title: `${preview.title} (Wikipedia)`,
        url: preview.url,
        publisher: "Wikipedia",
        publishedAt: preview.timestamp ? `last edited ${preview.timestamp.slice(0, 10)}` : "",
        sourceType: "article",
        verification: "unverified",
        summary: `Wikipedia's own summary (quoted, not verified): ${preview.extract}`,
      });
      changed();
      toast("RABBIT HOLE DETECTED", "Saved to research. Check its references before relying on it.");
      onSaved();
    } catch (e) {
      toast("ERROR", e instanceof Error ? e.message : String(e), "err");
    }
  };

  return (
    <Win title="LOOK UP A TOPIC" icon="globe" meta="Wikipedia">
      <div className="row nowrap">
        <input className="input grow" placeholder="e.g. Windows XP, BeOS, Flash games" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void search()} aria-label="Search Wikipedia" />
        <Button variant="primary" onClick={() => void search()} disabled={busy}>
          {busy ? "Searching..." : "Search"}
        </Button>
      </div>
      {error ? <Note kind="warn">{error}</Note> : null}
      {hits ? (
        hits.length ? (
          <div className="stack tight">
            {hits.map((h) => (
              <button key={h.title} className="btn" style={{ justifyContent: "flex-start", textAlign: "left", height: "auto", padding: 8 }} onClick={() => void open(h.title)}>
                <span className="stack tight">
                  <b>{h.title}</b>
                  <span className="dim small">{h.snippet}...</span>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="dim">No articles found.</p>
        )
      ) : (
        <p className="dim small">Real articles only. Results show what Wikipedia says; treat it as a starting point and follow its references to primary sources.</p>
      )}
      {preview ? (
        <div className="inset stack">
          <b>{preview.title}</b>
          <p className="selectable">{preview.extract}</p>
          <span className="dim small">
            {preview.url} {preview.timestamp ? `:: last edited ${preview.timestamp.slice(0, 10)}` : ""}
          </span>
          <div className="row">
            <Button variant="primary" icon="save" onClick={() => void save()}>
              Save as source
            </Button>
            <Button icon="link" onClick={() => void platform.openUrl(preview.url)}>
              Open article
            </Button>
          </div>
        </div>
      ) : null}
    </Win>
  );
}

export function Research() {
  const { db, platform, confirm } = useApp();
  const act = useAction();
  const [editing, setEditing] = useState<ResearchItem | "new" | null>(null);
  const [filter, setFilter] = useState<Verification | null>(null);
  const [query, setQuery] = useState("");
  const { data } = useData(async () => ({ items: await listResearch(db), projects: await listProjects(db, true) }), []);
  const items = useMemo(() => {
    const q = query.toLowerCase();
    return (data?.items ?? []).filter((r) => (!filter || r.verification === filter) && (!q || `${r.title} ${r.summary} ${r.myNotes} ${r.url}`.toLowerCase().includes(q)));
  }, [data, filter, query]);
  const projectName = (id: string | null) => (id ? data?.projects.find((p) => p.id === id)?.title ?? "(deleted project)" : "Unassigned");

  return (
    <div className="page">
      <PageHead
        sys="RESEARCH :: SOURCES & NOTES"
        title="Research desk"
        lede="Every source keeps its link, publisher, date and when you last checked it. Your own conclusions live separately from what sources say."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>
            Add source or note
          </Button>
        }
      />
      <Note>The visual topic map (Rabbit Hole) and AI-assisted source summaries arrive in a later phase. Today: saving, organizing and Wikipedia lookups.</Note>
      <div className="split" style={{ gridTemplateColumns: "minmax(320px, 420px) 1fr" }}>
        <WikipediaLookup onSaved={() => undefined} />
        <Win title="ALL RESEARCH" icon="research" meta={`${items.length}`}>
          <div className="row">
            <input className="input" style={{ width: 240 }} placeholder="Search research" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search research" />
            <Segmented value={filter} options={VERIFICATION} onChange={setFilter} allowNone label="Verification filter" />
          </div>
          {items.length ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Project</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id} onDoubleClick={() => setEditing(r)}>
                    <td>
                      <div>{r.title}</div>
                      <div className="dim small">{r.kind === "source" ? r.publisher || r.url || "source" : KINDS.find((k) => k.id === r.kind)?.label}</div>
                    </td>
                    <td className="small">{projectName(r.projectId)}</td>
                    <td>
                      <Chip kind={r.verification === "verified" ? "ok" : r.verification === "disputed" ? "err" : r.verification === "speculation" ? "warn" : undefined}>{VERIFICATION.find((v) => v.id === r.verification)?.label}</Chip>
                    </td>
                    <td className="dim small">{relativeTime(r.updatedAt)}</td>
                    <td>
                      <span className="row nowrap">
                        {r.url ? <Button size="small" icon="link" title="Open original" onClick={() => void platform.openUrl(r.url)} /> : null}
                        <Button size="small" onClick={() => setEditing(r)}>
                          Edit
                        </Button>
                        <Button
                          size="small"
                          icon="trash"
                          title="Delete"
                          onClick={async () => {
                            if (await confirm({ title: "Delete research item", message: `Delete "${r.title}"?`, confirm: "Delete", danger: true })) void act(() => deleteResearch(db, r.id));
                          }}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty icon="research" title="No research yet">
              Look something up on the left, or add a link you found.
            </Empty>
          )}
        </Win>
      </div>
      {editing ? (
        <ResearchEditor
          item={editing === "new" ? null : editing}
          defaultProjectId={null}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            await act(() => saveResearch(db, input), { title: "RESEARCH SAVED" });
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
