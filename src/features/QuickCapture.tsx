import { useState } from "react";
import { useApp } from "../app/context.tsx";
import { Button, Dialog, Field } from "../ui/kit.tsx";
import { createProject, saveIdea } from "../db/repos.ts";
import { subjectsForText } from "../domain/ideas/subjects.ts";

export function QuickCapture({ onClose }: { onClose: () => void }) {
  const { db, toast, changed, go } = useApp();
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (start: boolean) => {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const subjects = subjectsForText(`${title} ${note}`);
      const idea = await saveIdea(db, { origin: "capture", title, premise: note, subjects, status: "inbox" });
      if (start) {
        const p = await createProject(db, { title, premise: note, ideaId: idea.id, subjects, nextAction: "Write one sentence about why you want to make this." });
        changed();
        toast("PROJECT INITIALIZED", title);
        go({ section: "workshop", projectId: p.id });
      } else {
        changed();
        toast("BRAIN BUFFER SAVED", "Captured to the Idea Inbox.");
      }
      onClose();
    } catch (e) {
      toast("ERROR", e instanceof Error ? e.message : String(e), "err");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Quick capture"
      icon="bolt"
      onClose={onClose}
      actions={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save(true)} disabled={!title.trim() || busy}>
            Start as project
          </Button>
          <Button variant="primary" onClick={() => void save(false)} disabled={!title.trim() || busy}>
            Save to inbox
          </Button>
        </>
      }
    >
      <Field label="The idea, in a few words">
        {(id) => (
          <input
            id={id}
            className="input"
            autoFocus
            value={title}
            placeholder="e.g. what was on the PC my school threw away"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void save(false)}
          />
        )}
      </Field>
      <Field label="Anything else worth remembering (optional)">
        {(id) => <textarea id={id} className="textarea" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />}
      </Field>
    </Dialog>
  );
}
