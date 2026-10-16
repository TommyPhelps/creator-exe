// Small hand-drawn retro icon set (24x24). Two-tone: currentColor plus the
// theme accent, so icons follow the active theme.
import type { ReactElement } from "react";

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
const A = { fill: "var(--accent)", stroke: "currentColor", strokeWidth: 1.2 };

const ICONS: Record<string, ReactElement> = {
  control: (
    <>
      <rect x="2.5" y="3.5" width="19" height="13" rx="1.5" {...S} />
      <rect x="5" y="6" width="14" height="8" {...A} />
      <path d="M8 20.5h8M12 16.5v4" {...S} />
      <path d="M7.5 11.5l2.5-2.5 2 2 3-3" {...S} />
    </>
  ),
  tonight: (
    <>
      <path d="M15.5 3.5a8.5 8.5 0 1 0 5 13.6A7 7 0 0 1 15.5 3.5z" {...A} />
      <path d="M6 4.5v3M4.5 6h3M19.5 7.5v2M18.5 8.5h2" {...S} />
    </>
  ),
  ideas: (
    <>
      <path d="M12 2.8a6.3 6.3 0 0 0-3.8 11.3c.8.7 1.3 1.6 1.3 2.6h5c0-1 .5-1.9 1.3-2.6A6.3 6.3 0 0 0 12 2.8z" {...A} />
      <path d="M9.5 19h5M10.3 21.2h3.4" {...S} />
    </>
  ),
  projects: (
    <>
      <path d="M2.5 7.5v11.5h19V9H12l-2-2.5H2.5z" {...A} />
      <path d="M2.5 9h19" {...S} />
      <path d="M6 13.5h6M6 16h9" {...S} />
    </>
  ),
  research: (
    <>
      <path d="M4.5 2.5h9l4 4v6" {...S} />
      <path d="M4.5 2.5v18h7" {...S} />
      <circle cx="15.5" cy="15.5" r="4" {...A} />
      <path d="M18.5 18.5l3 3M7 7h5M7 10h6" {...S} />
    </>
  ),
  thumbnail: (
    <>
      <rect x="2.5" y="4.5" width="19" height="15" {...S} />
      <path d="M2.5 16.5l5-5 4 4 3-3 7 6" {...A} />
      <circle cx="16" cy="9" r="2" {...S} />
    </>
  ),
  packaging: (
    <>
      <path d="M3 7.5l9-4 9 4v9.5l-9 4-9-4z" {...A} />
      <path d="M3 7.5l9 4 9-4M12 11.5v9.5M7.5 5.5l9 4" {...S} />
    </>
  ),
  channel: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="1" {...S} />
      <circle cx="8" cy="12" r="2.6" {...A} />
      <circle cx="16" cy="12" r="2.6" {...A} />
      <path d="M8 18.5h8" {...S} />
    </>
  ),
  memory: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="1" {...S} />
      <rect x="6.5" y="3" width="11" height="6.5" {...A} />
      <path d="M14.5 4.5v3.5" {...S} />
      <path d="M7 14h10M7 17h7" {...S} />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" {...A} />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" {...S} />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" {...S} strokeWidth={2} />,
  trash: (
    <>
      <path d="M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 14h9l1-14" {...S} />
    </>
  ),
  eye: (
    <>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" {...S} />
      <circle cx="12" cy="12" r="2.8" {...A} />
    </>
  ),
  eyeoff: (
    <>
      <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" {...S} opacity={0.45} />
      <path d="M4 20L20 4" {...S} />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" {...A} />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" {...S} />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" {...S} opacity={0.6} />
      <path d="M8 10.5V8a4 4 0 0 1 7.6-1.7" {...S} opacity={0.6} />
    </>
  ),
  up: <path d="M6 14l6-6 6 6" {...S} strokeWidth={2} />,
  down: <path d="M6 10l6 6 6-6" {...S} strokeWidth={2} />,
  copy: (
    <>
      <rect x="8.5" y="8.5" width="12" height="12" {...A} />
      <path d="M15.5 8.5V3.5h-12v12h5" {...S} />
    </>
  ),
  save: (
    <>
      <path d="M3.5 3.5h14l3 3v14h-17z" {...S} />
      <rect x="7" y="3.5" width="9" height="6" {...A} />
      <rect x="6.5" y="13.5" width="11" height="7" {...S} />
    </>
  ),
  export: (
    <>
      <path d="M12 3v12M7.5 7.5L12 3l4.5 4.5" {...S} strokeWidth={1.9} />
      <path d="M4 14v6.5h16V14" {...S} />
    </>
  ),
  import: (
    <>
      <path d="M12 15V3M7.5 10.5L12 15l4.5-4.5" {...S} strokeWidth={1.9} />
      <path d="M4 14v6.5h16V14" {...S} />
    </>
  ),
  undo: <path d="M9 7H5V3M5.3 7A8 8 0 1 1 4 12" {...S} strokeWidth={1.9} />,
  redo: <path d="M15 7h4V3M18.7 7A8 8 0 1 0 20 12" {...S} strokeWidth={1.9} />,
  folder: (
    <>
      <path d="M2.5 6.5v13h19v-11H11l-2-2z" {...A} />
    </>
  ),
  star: <path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.9 6.4 20l1.3-6.2L3 9.5l6.3-.7z" {...A} />,
  staroff: <path d="M12 3l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.9 6.4 20l1.3-6.2L3 9.5l6.3-.7z" {...S} />,
  check: <path d="M4.5 12.5l5 5 10-11" {...S} strokeWidth={2.2} />,
  x: <path d="M6 6l12 12M18 6L6 18" {...S} strokeWidth={2} />,
  refresh: <path d="M19.5 9A8 8 0 0 0 5 7.5M4.5 15A8 8 0 0 0 19 16.5M19.5 3.5V9H14M4.5 20.5V15H10" {...S} />,
  play: <path d="M7 4.5v15l12-7.5z" {...A} />,
  dice: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" {...A} />
      <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
    </>
  ),
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" {...S} />,
  text: <path d="M5 6V4h14v2M12 4v16M9 20h6" {...S} strokeWidth={2} />,
  shape: (
    <>
      <rect x="3.5" y="10.5" width="10" height="10" {...A} />
      <circle cx="15.5" cy="8.5" r="5" {...S} />
    </>
  ),
  image: (
    <>
      <rect x="3" y="5" width="18" height="14" {...S} />
      <path d="M3 16l5-4.5 4 3.5 3-2.5 6 4.5" {...A} />
    </>
  ),
  layers: (
    <>
      <path d="M12 3.5l9 4.5-9 4.5-9-4.5z" {...A} />
      <path d="M3 12l9 4.5 9-4.5M3 16l9 4.5 9-4.5" {...S} />
    </>
  ),
  bolt: <path d="M13 2.5L4.5 13.5H11L10 21.5l9-11.5h-6.5z" {...A} />,
  rescue: (
    <>
      <circle cx="12" cy="12" r="8.5" {...S} />
      <circle cx="12" cy="12" r="4" {...A} />
      <path d="M6 6l3.2 3.2M18 6l-3.2 3.2M6 18l3.2-3.2M18 18l-3.2-3.2" {...S} />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" {...S} />
      <path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" {...S} />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="15" r="4.5" {...A} />
      <path d="M11.5 12l8-8M16.5 7l2.5 2.5M14.5 9l2 2" {...S} />
    </>
  ),
};

export function Icon({ name, title }: { name: string; title?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden={title ? undefined : true} role={title ? "img" : undefined}>
      {title ? <title>{title}</title> : null}
      {ICONS[name] ?? ICONS.control}
    </svg>
  );
}

export function AppMark() {
  return (
    <svg viewBox="0 0 256 256" aria-hidden>
      <rect x="20" y="22" width="216" height="172" rx="18" fill="#4d6584" stroke="#0a0f18" strokeWidth="8" />
      <rect x="40" y="44" width="176" height="128" rx="10" fill="#07111c" stroke="#0a0f18" strokeWidth="6" />
      <polygon points="110,78 110,138 158,108" fill="var(--led)" />
      <rect x="58" y="146" width="40" height="8" fill="var(--led)" />
      <rect x="60" y="208" width="136" height="24" rx="6" fill="#4d6584" stroke="#0a0f18" strokeWidth="6" />
    </svg>
  );
}
