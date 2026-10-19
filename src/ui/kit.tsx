// Interface primitives (0.2.0: flat, square, near-black).
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon } from "./icons.tsx";
import type { Level as LevelValue } from "../domain/ideas/generator.ts";

export function Win(props: { title: ReactNode; icon?: string; meta?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; scroll?: boolean; idle?: boolean }) {
  return (
    <section className={`win ${props.scroll ? "scroll" : ""} ${props.idle ? "idle" : ""} ${props.className ?? ""}`}>
      <div className="titlebar">
        {props.icon ? <Icon name={props.icon} /> : null}
        <span>{props.title}</span>
        <span className="tb-spacer" />
        {props.meta ? <span className="tb-meta">{props.meta}</span> : null}
        {props.actions}
      </div>
      <div className="content">{props.children}</div>
    </section>
  );
}

type BtnProps = {
  children?: ReactNode;
  onClick?: () => void;
  icon?: string;
  title?: string;
  disabled?: boolean;
  variant?: "primary" | "danger" | "flat";
  size?: "small" | "big";
  on?: boolean;
  type?: "button" | "submit";
  className?: string;
};

export function Button(p: BtnProps) {
  const cls = ["btn", p.variant ?? "", p.size ?? "", p.on ? "on" : "", !p.children ? "icon" : "", p.className ?? ""].join(" ");
  return (
    <button type={p.type ?? "button"} className={cls} onClick={p.onClick} disabled={p.disabled} title={p.title} aria-pressed={p.on}>
      {p.icon ? <Icon name={p.icon} /> : null}
      {p.children}
    </button>
  );
}

export function Field(p: { label: ReactNode; children: (id: string) => ReactNode; hint?: ReactNode; className?: string }) {
  const id = useId();
  return (
    <div className={`field ${p.className ?? ""}`}>
      <label htmlFor={id}>{p.label}</label>
      {p.children(id)}
      {p.hint ? <span className="dim small">{p.hint}</span> : null}
    </div>
  );
}

/** Text input that keeps its own draft and commits on change after a short pause (autosave). */
export function TextInput(p: { value: string; onCommit: (v: string) => void; id?: string; placeholder?: string; delay?: number; type?: string; className?: string; autoFocus?: boolean; onEnter?: () => void }) {
  const [draft, setDraft] = useState(p.value);
  const timer = useRef<number | null>(null);
  const latest = useRef(p.value);
  useEffect(() => {
    if (p.value !== latest.current) {
      latest.current = p.value;
      setDraft(p.value);
    }
  }, [p.value]);
  const flush = (v: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    if (v !== latest.current) {
      latest.current = v;
      p.onCommit(v);
    }
  };
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  return (
    <input
      id={p.id}
      className={`input ${p.className ?? ""}`}
      type={p.type ?? "text"}
      value={draft}
      placeholder={p.placeholder}
      autoFocus={p.autoFocus}
      spellCheck
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => flush(v), p.delay ?? 600);
      }}
      onBlur={() => flush(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && p.onEnter) {
          flush(draft);
          p.onEnter();
        }
      }}
    />
  );
}

export function TextArea(p: { value: string; onCommit: (v: string) => void; id?: string; placeholder?: string; rows?: number; delay?: number; className?: string }) {
  const [draft, setDraft] = useState(p.value);
  const timer = useRef<number | null>(null);
  const latest = useRef(p.value);
  useEffect(() => {
    if (p.value !== latest.current) {
      latest.current = p.value;
      setDraft(p.value);
    }
  }, [p.value]);
  const flush = (v: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    if (v !== latest.current) {
      latest.current = v;
      p.onCommit(v);
    }
  };
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  return (
    <textarea
      id={p.id}
      className={`textarea ${p.className ?? ""}`}
      value={draft}
      rows={p.rows ?? 3}
      placeholder={p.placeholder}
      spellCheck
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => flush(v), p.delay ?? 800);
      }}
      onBlur={() => flush(draft)}
    />
  );
}

export function Select<T extends string>(p: { value: T; options: readonly { id: T; label: string }[]; onChange: (v: T) => void; id?: string; className?: string }) {
  return (
    <select id={p.id} className={`select ${p.className ?? ""}`} value={p.value} onChange={(e) => p.onChange(e.target.value as T)}>
      {p.options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Check(p: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; radio?: boolean; name?: string }) {
  return (
    <label className="check">
      <input type={p.radio ? "radio" : "checkbox"} name={p.name} checked={p.checked} onChange={(e) => p.onChange(e.target.checked)} />
      <span>{p.children}</span>
    </label>
  );
}

export function Segmented<T extends string>(p: { value: T | null; options: readonly { id: T; label: string }[]; onChange: (v: T | null) => void; allowNone?: boolean; label?: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={p.label}>
      {p.options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={p.value === o.id}
          className={p.value === o.id ? "on" : ""}
          onClick={() => p.onChange(p.allowNone && p.value === o.id ? null : o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs<T extends string>(p: { value: T; tabs: readonly { id: T; label: string; badge?: number | string }[]; onChange: (v: T) => void }) {
  return (
    <div className="tabs" role="tablist">
      {p.tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={p.value === t.id} className={p.value === t.id ? "on" : ""} onClick={() => p.onChange(t.id)}>
          {t.label}
          {t.badge !== undefined && t.badge !== 0 ? <span className="dim"> ({t.badge})</span> : null}
        </button>
      ))}
    </div>
  );
}

export function LevelMeter({ value, label }: { value: LevelValue; label?: string }) {
  const n = value === "low" ? 1 : value === "medium" ? 2 : value === "high" ? 3 : 0;
  if (value === "unknown") {
    return (
      <span className="level unknown" title={label ? `${label}: unknown until you rate videos or react to ideas` : "unknown"} aria-label={label ? `${label}: unknown` : "unknown"}>
        ???
      </span>
    );
  }
  return (
    <span className="level" title={label ? `${label}: ${value}` : value} aria-label={label ? `${label}: ${value}` : value}>
      {[1, 2, 3].map((i) => (
        <i key={i} className={i <= n ? "on" : ""} />
      ))}
    </span>
  );
}

export function Rating(p: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  return (
    <div className="row nowrap" role="radiogroup" aria-label={p.label}>
      <span className="small grow">{p.label}</span>
      <span className="segmented">
        {[1, 2, 3, 4, 5].map((i) => (
          <button key={i} type="button" className={p.value === i ? "on" : ""} aria-checked={p.value === i} role="radio" onClick={() => p.onChange(p.value === i ? null : i)}>
            {i}
          </button>
        ))}
      </span>
    </div>
  );
}

export function Empty(p: { icon?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div className="empty">
      {p.icon ? <Icon name={p.icon} /> : null}
      <b>{p.title}</b>
      {p.children}
    </div>
  );
}

export function Note(p: { children: ReactNode; kind?: "warn" | "err" }) {
  return <div className={`note ${p.kind ?? ""}`}>{p.children}</div>;
}

export function Progress({ value, max }: { value: number; max: number | null }) {
  const pct = max ? Math.max(0, Math.min(100, (value / max) * 100)) : 100;
  return (
    <div className="progress" role="progressbar" aria-valuenow={value} aria-valuemax={max ?? undefined}>
      <div className="bar" style={{ width: `${pct}%`, opacity: max ? 1 : 0.5 }} />
    </div>
  );
}

export function Dialog(p: { title: string; icon?: string; onClose: () => void; children: ReactNode; actions?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") p.onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <div className={`win dialog ${p.wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-label={p.title}>
        <div className="titlebar">
          {p.icon ? <Icon name={p.icon} /> : null}
          <span>{p.title}</span>
          <span className="tb-spacer" />
          <button className="btn small icon" onClick={p.onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="content">
          {p.children}
          {p.actions ? <div className="actions">{p.actions}</div> : null}
        </div>
      </div>
    </div>
  );
}

export function Chip(p: { children: ReactNode; kind?: "accent" | "ok" | "warn" | "err"; onRemove?: () => void; title?: string }) {
  return (
    <span className={`chip ${p.kind ?? ""}`} title={p.title}>
      {p.children}
      {p.onRemove ? (
        <button onClick={p.onRemove} aria-label="Remove">
          ×
        </button>
      ) : null}
    </span>
  );
}

export function PageHead(p: { sys: string; title: string; lede?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div className="stack tight grow">
        <span className="sys">{p.sys}</span>
        <h1>{p.title}</h1>
        {p.lede ? <p className="lede">{p.lede}</p> : null}
      </div>
      {p.actions ? <div className="row">{p.actions}</div> : null}
    </header>
  );
}

/**
 * A drag handle between two panes. Reports the new size of the pane on its
 * left (or right, with `side="right"`), clamped to min/max.
 */
export function Splitter(p: { value: number; onChange: (v: number) => void; onDone?: (v: number) => void; min: number; max: number; side?: "left" | "right"; label: string }) {
  const [drag, setDrag] = useState<{ x: number; v: number } | null>(null);
  const last = useRef(p.value);
  return (
    <div
      className={`splitter ${drag ? "dragging" : ""}`}
      role="separator"
      aria-orientation="vertical"
      aria-label={p.label}
      aria-valuenow={Math.round(p.value)}
      tabIndex={0}
      onPointerDown={(e) => {
        (e.currentTarget as Element).setPointerCapture(e.pointerId);
        setDrag({ x: e.clientX, v: p.value });
      }}
      onPointerMove={(e) => {
        if (!drag) return;
        const dx = (e.clientX - drag.x) * (p.side === "right" ? -1 : 1);
        last.current = Math.max(p.min, Math.min(p.max, drag.v + dx));
        p.onChange(last.current);
      }}
      onPointerUp={() => {
        if (drag) p.onDone?.(last.current);
        setDrag(null);
      }}
      onDoubleClick={() => p.onDone?.(p.value)}
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        const dir = (e.key === "ArrowRight" ? 1 : -1) * (p.side === "right" ? -1 : 1);
        const v = Math.max(p.min, Math.min(p.max, p.value + dir * 16));
        p.onChange(v);
        p.onDone?.(v);
      }}
    />
  );
}

/** A pane width remembered on this PC (per screen), for resizable layouts. */
export function usePaneWidth(key: string, initial: number): [number, (v: number) => void, (v: number) => void] {
  const [w, setW] = useState(() => {
    try {
      const v = Number(window.localStorage.getItem(`pane:${key}`));
      return Number.isFinite(v) && v > 0 ? v : initial;
    } catch {
      return initial;
    }
  });
  const save = (v: number) => {
    try {
      window.localStorage.setItem(`pane:${key}`, String(Math.round(v)));
    } catch {
      /* storage unavailable: the width just isn't remembered */
    }
  };
  return [w, setW, save];
}
