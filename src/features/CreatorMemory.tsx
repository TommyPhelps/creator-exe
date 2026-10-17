import { useState } from "react";
import { useAction, useApp, useData } from "../app/context.tsx";
import { addProfileItem, deleteAllGames, deleteIdeaFeedback, deleteProfileItem, listGames, listIdeaFeedback, listIdeas, listProfile, saveGames, updateProfileItem } from "../db/repos.ts";
import { REACTIONS, type Durability, type ProfileKind, type ProfileScope } from "../domain/types.ts";
import { GAME_CATALOG } from "../domain/games/catalog.ts";
import { confirmOwned, parseGameLibrary, type LibraryImport } from "../domain/games/library.ts";
import { subjectLabel, subjectsForText, SUBJECTS } from "../domain/ideas/subjects.ts";
import { relativeTime } from "../lib/util.ts";
import { Button, Check, Chip, Dialog, Empty, Note, PageHead, Segmented, Win } from "../ui/kit.tsx";

const KINDS: { id: ProfileKind; label: string; hint: string; placeholder: string }[] = [
  { id: "favorite_game", label: "Games I like", hint: "Channel entries make ideas about these games (and similar ones) more likely.", placeholder: "e.g. Elden Ring" },
  { id: "favorite_subject", label: "Favorite subjects", hint: "Channel entries boost matching ideas; personal ones are only remembered.", placeholder: "e.g. classic RPGs" },
  { id: "current_interest", label: "Currently curious about", hint: "Steers suggestions this month (channel entries only).", placeholder: "e.g. immersive sims" },
  { id: "tired_of", label: "Tired of", hint: "Pushes matching ideas down, whatever the scope.", placeholder: "e.g. survival games" },
  { id: "avoid", label: "Never suggest", hint: "Ideas containing these words are hidden, whatever the scope.", placeholder: "e.g. competitive multiplayer" },
  { id: "format_enjoyed", label: "Formats I enjoy", hint: "", placeholder: "e.g. one-day experiments" },
  { id: "production_style", label: "Production styles I prefer", hint: "", placeholder: "e.g. screen recording with voiceover" },
  { id: "equipment", label: "Equipment I have", hint: "", placeholder: "e.g. USB mic, old ThinkPad, phone tripod" },
  { id: "budget", label: "Budget preferences", hint: "", placeholder: "e.g. under $20 per video" },
  { id: "on_camera", label: "Being on camera", hint: "Notes like \"rather not\" keep face-only ideas out of the top results.", placeholder: "e.g. fine on camera sometimes" },
  { id: "voiceover", label: "Voiceover", hint: "", placeholder: "e.g. happy to do voiceover" },
  { id: "thumbnail_pref", label: "Thumbnail preferences", hint: "", placeholder: "e.g. no big red arrows" },
];

const SCOPED: ProfileKind[] = ["favorite_game", "favorite_subject", "current_interest", "format_enjoyed", "production_style"];
const SCOPES: { id: ProfileScope; label: string }[] = [
  { id: "channel", label: "Channel" },
  { id: "personal", label: "Personal" },
  { id: "watching", label: "Watching" },
];

type Item = { id: string; value: string; durability: Durability; scope: ProfileScope; note: string };

function KindBox({ kind, items, onAdd }: { kind: (typeof KINDS)[number]; items: Item[]; onAdd: (v: string, d: Durability, scope: ProfileScope) => void }) {
  const { db } = useApp();
  const act = useAction();
  const [draft, setDraft] = useState("");
  const [dur, setDur] = useState<Durability>(kind.id === "current_interest" ? "temporary" : "enduring");
  const scoped = SCOPED.includes(kind.id);
  const add = () => {
    if (!draft.trim()) return;
    onAdd(draft.trim(), dur, "channel");
    setDraft("");
  };
  const matched = kind.id === "favorite_subject" || kind.id === "tired_of" || kind.id === "current_interest";
  const channelCount = items.filter((i) => i.scope === "channel").length;
  return (
    <Win title={kind.label.toUpperCase()} icon="memory" meta={scoped ? `${channelCount} channel / ${items.length}` : `${items.length}`}>
      {kind.hint ? <p className="dim small">{kind.hint}</p> : null}
      <div className="stack tight">
        {items.map((it) => (
          <div key={it.id} className="row nowrap" style={{ alignItems: "flex-start" }}>
            <span className={`grow selectable ${scoped && it.scope !== "channel" ? "dim" : ""}`} title={it.note || undefined}>
              {it.value}
              {matched ? (
                <span className="dim small">
                  {" "}
                  {subjectsForText(it.value).length ? `(matches: ${subjectsForText(it.value).map(subjectLabel).join(", ")})` : "(free text)"}
                </span>
              ) : null}
            </span>
            {scoped ? (
              <select className="select" style={{ width: "auto" }} value={it.scope} aria-label={`Who "${it.value}" is for`} title="Channel = steers video ideas. Personal / Watching = remembered, never steers ideas." onChange={(e) => void act(() => updateProfileItem(db, it.id, { scope: e.target.value as ProfileScope }))}>
                {SCOPES.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.label}
                  </option>
                ))}
              </select>
            ) : null}
            <Button size="small" variant="flat" title="Switch between lasting preference and passing mood" onClick={() => void act(() => updateProfileItem(db, it.id, { durability: it.durability === "enduring" ? "temporary" : "enduring" }))}>
              {it.durability === "enduring" ? "lasting" : "for now"}
            </Button>
            <Button size="small" icon="x" title="Remove" onClick={() => void act(() => deleteProfileItem(db, it.id))} />
          </div>
        ))}
      </div>
      <div className="row nowrap">
        <input className="input grow" placeholder={kind.placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-label={`Add to ${kind.label}`} list={kind.id === "favorite_game" ? "game-list" : matched ? "subject-list" : undefined} />
        <Segmented<Durability>
          value={dur}
          options={[
            { id: "enduring", label: "Lasting" },
            { id: "temporary", label: "For now" },
          ]}
          onChange={(v) => setDur(v ?? "enduring")}
          label="How long this applies"
        />
        <Button icon="plus" onClick={add} title="Add" />
      </div>
    </Win>
  );
}

function GameLibrary() {
  const { db, platform, toast, confirm } = useApp();
  const act = useAction();
  const { data: games } = useData(() => listGames(db), []);
  const [preview, setPreview] = useState<LibraryImport | null>(null);
  const [mine, setMine] = useState(false);
  const [replace, setReplace] = useState(false);
  const owned = (games ?? []).filter((g) => g.ownership === "owned").length;

  const pick = async () => {
    try {
      const path = await platform.dialogs.openFile("Choose your game list (REWIND backup, CSV or text)", [{ name: "Game lists", extensions: ["json", "csv", "txt"] }]);
      if (!path) return;
      const text = await platform.files.readText(path);
      setPreview(parseGameLibrary(text, path));
      setMine(false);
      setReplace(false);
    } catch (e) {
      toast("IMPORT FAILED", e instanceof Error ? e.message : String(e), "err");
    }
  };

  const apply = async () => {
    if (!preview) return;
    const imp = !preview.hasOwnership && mine ? confirmOwned(preview) : preview;
    const n = await act(() => saveGames(db, imp.games, replace ? "replace" : "merge"), { title: "LIBRARY IMPORTED", body: `${imp.games.length} games from ${imp.label}.` });
    if (n !== undefined) setPreview(null);
  };

  return (
    <Win title="GAME LIBRARY" icon="import" meta={games?.length ? `${games.length} games, ${owned} owned` : "not imported"}>
      <p className="small">
        Lets ideas say which games you own, and lets Zero budget use them. Import a REWIND backup (File &gt; Back up in REWIND), a CSV with a title column, or a text file with one game per line. CREATOR.EXE never reads REWIND's database directly; it only reads the file you pick.
      </p>
      <div className="row">
        <Button variant="primary" icon="import" onClick={() => void pick()}>
          Import game list...
        </Button>
        {games?.length ? (
          <Button
            variant="danger"
            icon="trash"
            onClick={async () => {
              if (await confirm({ title: "Clear game library", message: "Remove every imported game? Your ideas and projects are not affected.", confirm: "Clear", danger: true })) await act(() => deleteAllGames(db));
            }}
          >
            Clear
          </Button>
        ) : null}
      </div>
      {games?.length ? (
        <p className="dim small">
          {games.slice(0, 12).map((g) => g.title).join(", ")}
          {games.length > 12 ? `, and ${games.length - 12} more` : ""}.
        </p>
      ) : (
        <p className="dim small">Until you import one, ideas show game ownership as unknown, and Zero budget only uses free games.</p>
      )}
      {preview ? (
        <Dialog
          title="Import game list"
          icon="import"
          onClose={() => setPreview(null)}
          actions={
            <>
              <Button onClick={() => setPreview(null)}>Cancel</Button>
              <Button variant="primary" onClick={() => void apply()} disabled={!preview.games.length}>
                Import {preview.games.length} games
              </Button>
            </>
          }
        >
          <div className="stack">
            <p>
              <b>{preview.label}</b>: {preview.games.filter((g) => g.ownership === "owned").length} marked owned, {preview.games.filter((g) => g.ownership === "unknown").length} with unknown ownership.
            </p>
            {preview.warnings.map((w) => (
              <Note key={w} kind="warn">
                {w}
              </Note>
            ))}
            {!preview.hasOwnership ? (
              <Check checked={mine} onChange={setMine}>
                These are games I own (mark every game in this list as owned)
              </Check>
            ) : null}
            <Check checked={replace} onChange={setReplace}>
              Replace my current library instead of merging
            </Check>
            <p className="dim small">{preview.games.slice(0, 15).map((g) => g.title).join(", ")}{preview.games.length > 15 ? ", ..." : ""}</p>
          </div>
        </Dialog>
      ) : null}
    </Win>
  );
}

export function CreatorMemory() {
  const { db } = useApp();
  const act = useAction();
  const { data } = useData(async () => ({ profile: await listProfile(db), feedback: await listIdeaFeedback(db), ideas: await listIdeas(db, ["rejected"]) }), []);
  const profile = data?.profile ?? [];

  return (
    <div className="page">
      <PageHead
        sys="CREATOR MEMORY :: EDITABLE PROFILE"
        title="What CREATOR.EXE knows about you"
        lede='Everything here is yours to change or delete. "Channel" entries steer video ideas; "Personal" and "Watching" entries are remembered but never steer ideas. "For now" entries are moods, not identity; reactions fade on their own.'
      />
      <datalist id="game-list">
        {GAME_CATALOG.filter((g) => !g.generic).map((g) => (
          <option key={g.title} value={g.title} />
        ))}
      </datalist>
      <datalist id="subject-list">
        {SUBJECTS.map((s) => (
          <option key={s.id} value={s.label} />
        ))}
      </datalist>
      <div className="grid cols-3">
        {KINDS.map((k) => (
          <KindBox key={k.id} kind={k} items={profile.filter((p) => p.kind === k.id)} onAdd={(v, d, sc) => void act(() => addProfileItem(db, k.id, v, d, "", sc), { title: "MEMORY UPDATED" })} />
        ))}
      </div>
      <GameLibrary />
      <div className="grid cols-2">
        <Win title="REACTIONS TO IDEAS" icon="ideas" meta={`${data?.feedback.length ?? 0}`} scroll>
          <p className="dim small">These tune suggestions. Delete any that no longer reflect you.</p>
          {data?.feedback.length ? (
            <table className="table">
              <tbody>
                {data.feedback.slice(0, 200).map((f) => (
                  <tr key={f.id}>
                    <td>
                      <Chip kind={["love", "save", "like_game", "like_format", "like_topic", "more_like"].includes(f.reaction) ? "ok" : f.reaction === "maybe" ? undefined : "warn"}>{REACTIONS.find((r) => r.id === f.reaction)?.label}</Chip>
                    </td>
                    <td className="small">{f.ideaKey.replace(/[:-]/g, " ")}</td>
                    <td className="dim small">{f.subjects.map(subjectLabel).join(", ")}</td>
                    <td className="dim small">{relativeTime(f.createdAt)}</td>
                    <td>
                      <Button size="small" icon="x" title="Forget this reaction" onClick={() => void act(() => deleteIdeaFeedback(db, f.id))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty icon="ideas" title="No reactions yet">
              React to ideas in the Idea Machine and they show up here.
            </Empty>
          )}
        </Win>
        <Win title="REJECTED IDEAS" icon="x" meta={`${data?.ideas.length ?? 0}`}>
          {data?.ideas.length ? (
            <ul className="plain">
              {data.ideas.map((i) => (
                <li key={i.id}>{i.title}</li>
              ))}
            </ul>
          ) : (
            <p className="dim">Nothing rejected.</p>
          )}
          <p className="dim small">Change an idea's status back in Idea Machine &gt; Inbox (filter: Rejected).</p>
        </Win>
      </div>
    </div>
  );
}
