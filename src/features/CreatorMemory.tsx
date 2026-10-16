import { useState } from "react";
import { useAction, useApp, useData } from "../app/context.tsx";
import { addProfileItem, deleteIdeaFeedback, deleteProfileItem, listIdeaFeedback, listIdeas, listProfile, updateProfileItem } from "../db/repos.ts";
import { REACTIONS, type Durability, type ProfileKind } from "../domain/types.ts";
import { subjectLabel, subjectsForText, SUBJECTS } from "../domain/ideas/subjects.ts";
import { relativeTime } from "../lib/util.ts";
import { Button, Chip, Empty, PageHead, Segmented, Win } from "../ui/kit.tsx";

const KINDS: { id: ProfileKind; label: string; hint: string; placeholder: string }[] = [
  { id: "favorite_subject", label: "Favorite subjects", hint: "Strongly boosts matching ideas.", placeholder: "e.g. old operating systems" },
  { id: "current_interest", label: "Currently curious about", hint: "Steers suggestions this month.", placeholder: "e.g. thrift store electronics" },
  { id: "tired_of", label: "Tired of", hint: "Pushes matching ideas down.", placeholder: "e.g. horror games" },
  { id: "avoid", label: "Never suggest", hint: "Ideas containing these words are hidden.", placeholder: "e.g. food challenges" },
  { id: "format_enjoyed", label: "Formats I enjoy", hint: "", placeholder: "e.g. one-day experiments" },
  { id: "production_style", label: "Production styles I prefer", hint: "", placeholder: "e.g. screen recording with voiceover" },
  { id: "equipment", label: "Equipment I have", hint: "", placeholder: "e.g. USB mic, old ThinkPad, phone tripod" },
  { id: "budget", label: "Budget preferences", hint: "", placeholder: "e.g. under $20 per video" },
  { id: "on_camera", label: "Being on camera", hint: "Notes like \"rather not\" keep face-only ideas out of the top results.", placeholder: "e.g. fine on camera sometimes" },
  { id: "voiceover", label: "Voiceover", hint: "", placeholder: "e.g. happy to do voiceover" },
  { id: "thumbnail_pref", label: "Thumbnail preferences", hint: "", placeholder: "e.g. no big red arrows" },
];

function KindBox({ kind, items, onAdd }: { kind: (typeof KINDS)[number]; items: { id: string; value: string; durability: Durability }[]; onAdd: (v: string, d: Durability) => void }) {
  const { db } = useApp();
  const act = useAction();
  const [draft, setDraft] = useState("");
  const [dur, setDur] = useState<Durability>(kind.id === "current_interest" ? "temporary" : "enduring");
  const add = () => {
    if (!draft.trim()) return;
    onAdd(draft.trim(), dur);
    setDraft("");
  };
  const matched = kind.id === "favorite_subject" || kind.id === "tired_of" || kind.id === "current_interest";
  return (
    <Win title={kind.label.toUpperCase()} icon="memory" meta={`${items.length}`}>
      {kind.hint ? <p className="dim small">{kind.hint}</p> : null}
      <div className="stack tight">
        {items.map((it) => (
          <div key={it.id} className="row nowrap">
            <span className="grow selectable">
              {it.value}
              {matched ? (
                <span className="dim small">
                  {" "}
                  {subjectsForText(it.value).length ? `(matches: ${subjectsForText(it.value).map(subjectLabel).join(", ")})` : "(free text)"}
                </span>
              ) : null}
            </span>
            <Button size="small" variant="flat" title="Switch between lasting preference and passing mood" onClick={() => void act(() => updateProfileItem(db, it.id, { durability: it.durability === "enduring" ? "temporary" : "enduring" }))}>
              {it.durability === "enduring" ? "lasting" : "for now"}
            </Button>
            <Button size="small" icon="x" title="Remove" onClick={() => void act(() => deleteProfileItem(db, it.id))} />
          </div>
        ))}
      </div>
      <div className="row nowrap">
        <input className="input grow" placeholder={kind.placeholder} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} aria-label={`Add to ${kind.label}`} list={matched ? "subject-list" : undefined} />
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
        lede='Everything here is written by you and can be changed or deleted at any time. "For now" entries are moods, not identity; old reactions fade on their own after a few weeks.'
      />
      <datalist id="subject-list">
        {SUBJECTS.map((s) => (
          <option key={s.id} value={s.label} />
        ))}
      </datalist>
      <div className="grid cols-3">
        {KINDS.map((k) => (
          <KindBox key={k.id} kind={k} items={profile.filter((p) => p.kind === k.id)} onAdd={(v, d) => void act(() => addProfileItem(db, k.id, v, d), { title: "MEMORY UPDATED" })} />
        ))}
      </div>
      <div className="grid cols-2">
        <Win title="REACTIONS TO IDEAS" icon="ideas" meta={`${data?.feedback.length ?? 0}`} scroll>
          <p className="dim small">These tune suggestions. Delete any that no longer reflect you.</p>
          {data?.feedback.length ? (
            <table className="table">
              <tbody>
                {data.feedback.slice(0, 200).map((f) => (
                  <tr key={f.id}>
                    <td>
                      <Chip kind={f.reaction === "love" || f.reaction === "save" ? "ok" : f.reaction === "maybe" ? undefined : "warn"}>{REACTIONS.find((r) => r.id === f.reaction)?.label}</Chip>
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
