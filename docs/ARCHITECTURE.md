# CREATOR.EXE — Architecture (Phase 0)

CREATOR.EXE is a standalone Windows 11 desktop app: a personal producer, research desk,
thumbnail workstation and upload-packaging assistant. **The creator makes the creative
decisions; the app handles everything around them.** There is no Comedy Engine, no Editing
Companion, no joke generation and no editing instructions anywhere in the codebase.

## Stack

| Layer | Choice | Why |
|---|---|---|
| Shell | Tauri 2 (Rust) | Small installer (~3 MB NSIS), native dialogs, WebView2, no Electron runtime |
| UI | React 19 + strict TypeScript + Vite 7 | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`-style checks on |
| Data | SQLite via `rusqlite` (bundled) | One local file, versioned migrations, transactional batches |
| Secrets | Windows Credential Manager via `keyring` | API keys never enter the database or backups |
| Network | `tauri-plugin-http` with an allow-list | Only YouTube, Google APIs, Wikipedia/Wikimedia, archive.org, local Ollama and two optional AI APIs |
| Build | GitHub Actions on `windows-latest` | NSIS `.exe`, `.msi`, portable `.exe`, SHA-256 sums |

No paid service is required. No hosted backend exists.

## Layout

```
src/
  app/        App shell: menu bar, toolbar, navigation, status bar, dialogs, shortcuts
  features/   One file per screen (ControlRoom, Tonight, IdeaMachine, Projects, Workshop,
              Research, thumbnail/ThumbnailLab+Editor, PackagingLab, ChannelDna,
              CreatorMemory, Settings, QuickCapture)
  domain/     Pure product logic, no UI: ideas/ (library, subjects, generator, context),
              channel/ (feed, Data API, Studio CSV, merge, analyze), thumbnails/ (layer model,
              concepts, SVG render, OpenRaster, history), titles, packaging, projects,
              backup, brief, settings
  db/         migrations.ts (versioned), migrate.ts, repos.ts (all SQL lives here)
  platform/   The OS boundary: types.ts (interface), tauri.ts (real app), bridge.ts (test harness)
  ui/         kit.tsx (beveled controls, windows, meters), icons.tsx (retro pixel icons)
src-tauri/src/
  lib.rs      Commands: db_select/db_execute/db_batch, app_info, files, folders, secrets,
              reveal_folder, launch_program
  db.rs       SQLite connection, WAL, foreign keys, parameter conversion
  files.rs    Safe file writes (temp + rename), project-folder creation, name sanitising
  secrets.rs  Credential Manager wrapper with name validation
tests/        node:test suites that run the real migrations and repositories against
              Node's built-in SQLite
```

### The platform boundary

Every OS call goes through `Platform` (`src/platform/types.ts`). Product logic depends only on
that interface, so the same code runs inside the Windows app (`tauri.ts`) and in tests against
a real SQLite database (`tests/helpers/sqliteDb.ts`). A plain browser cannot open the app's
database and gets a clear boot error instead of fake data.

## Data model (schema v3)

| Table | Holds |
|---|---|
| `settings` | App settings JSON (theme, density, text scale, channel, folder template, editor path, generator defaults) |
| `profile_items` | Creator Memory: kind, value, durability (lasting / for now), note |
| `videos` | Channel archive keyed by the stable YouTube video ID; title, description, dates, duration, thumbnail, availability, user notes, format, effort |
| `video_metrics` | One row per (video, source, metric) so public, Studio and manual numbers never mix |
| `video_feedback` | Satisfaction ratings and flags ("I loved making this", "creatively exhausting"…) |
| `ideas` / `idea_feedback` / `idea_impressions` | Saved ideas, reactions (love, too expensive, not in the mood…), and what was shown when, for variety |
| `projects` / `project_tasks` / `project_events` | Production projects, checklists, history |
| `research_items` | Sources and notes: URL, publisher, published date, last checked, verification status, the creator's own conclusions kept separate |
| `thumbnails` | Editable layered documents (JSON), linked to projects |
| `title_candidates` / `packages` | Title Lab candidates and versioned upload packages |
| `games` | Your imported game library (v2): title, ownership, playtime, Steam app ID, tags, source file |
| `game_info` | Cached Steam store lookups (v2): matched name, cover URL, free flag, price text, date checked |

v3 (v0.1.2) is a repair step, not new data: two different "v2" layouts shipped (v0.1.1's, and the 0.2.0 Phase 2 preview's `video_forensics` table). v3 adds whatever either is missing, with `CREATE TABLE IF NOT EXISTS` and column checks, so every database ends up with both and nothing is dropped. Phase 2 features will use v4+.

v2 also added `profile_items.scope` (channel / personal / watching), `videos.user_subjects` (your own topics) and `idea_feedback.detail` (what a reaction was about).

Migrations are append-only and run at boot; the boot screen reports the schema version and the
app shows a notice after an upgrade. A safety backup is written before restores.

## Recommendation engine (v0.1.1)

`src/domain/ideas/generator.ts` runs in a fixed order so modes and filters compose predictably:

1. Expand the library into candidates (concept × game). Each candidate has a content domain (gaming / gaming-tech / other), a video type, genres from the games catalog, an era and an ownership status (from your imported library only).
2. Hard gates that never relax: Content Focus (a 0% domain is ineligible), budget and no-purchase rules, time cap, avoid-list, blocked feedback, ideas already saved.
3. Soft filters (genre, era, style, effort...) relaxed least-important first, always inside the gates.
4. Scoring: channel-scope interests, favorite games, library, inspiration games, learned weights per subject / game / video type / concept (fading, capped), interest direction within the focus, mode shaping, recency penalties.
5. Slots assigned to domains by deficit against the focus over recent batches (`focus.ts`), filled greedily with no repeated concept, game or video type; one slot is reserved for something new.

## Evidence model

Every channel number carries its source: `public_feed`, `public_api`, `studio_export`,
`manual` or `local_file`, shown as a label next to the value. Channel DNA patterns link back
to the titles and descriptions that produced them and say plainly that labels come from
keyword matching, not from watching videos. Idea ratings are three-step levels
(low / medium / high / unknown) with listed plus and minus factors, never percentages.

## Navigation

MAKE: Control Room · Tonight.exe · Idea Machine (Generate / Inbox / Compare = Idea Advisor) ·
Video Workshop (board + list + per-project workshop)
PREPARE: Research · Thumbnail Lab · Packaging Lab (Title Lab + description/tags/checklist)
YOU: Channel DNA · Creator Memory · Settings

Ctrl+1…0 switch sections, Ctrl+N new project, Ctrl+K quick capture, F1 lists every shortcut.

## Integration plan

| Source | Phase | Status |
|---|---|---|
| Public channel feed (15 latest, no key) | 1 | Done; accepts UC ID, channel URL or @handle |
| YouTube Data API v3 (free key, full public archive) | 1 | Done; key stored in Credential Manager |
| YouTube Studio CSV export (private analytics, labelled) | 1 | Done |
| Manual entry (deleted/private videos) | 1 | Done |
| Google OAuth + YouTube Analytics API | 6 | Planned |
| Transcript files, local video inspection (FFmpeg) | 2 | Planned |
| Wikipedia search for research | 1 | Done |
| Ollama (local AI) / user-key cloud AI | 3 | Allow-listed, not implemented; status bar shows `AI: OFF` |
| Canva handoff | 5 | Planned, only through a supported, authorised workflow |

## Build workflow

`.github/workflows/build.yml` runs on every push:

1. **web** (Ubuntu): `npm ci`, strict `tsc --noEmit`, `npm test`, `vite build`.
2. **windows** (windows-latest): `cargo test --lib`, `tauri build` → NSIS + MSI, plus the raw
   portable exe; SHA-256 sums; artifacts uploaded.
3. Release: a commit message containing `[release]` publishes `v<version>`; any other push
   replaces the rolling `dev-<branch>` prerelease.

Results are posted as workflow annotations so the summary page shows tsc/test/cargo output.
