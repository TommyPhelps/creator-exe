# CREATOR.EXE

A personal YouTube creative workstation for Windows 11, built like multimedia software from
2003. It helps you find ideas you actually want to make, organise projects, keep research
honest, design layered thumbnails and package uploads.

**You are the creator. CREATOR.EXE is the support team.** It doesn't write jokes, script your
personality or tell you where to cut.

## Install

Download from [Releases](https://github.com/TommyPhelps/creator-exe/releases):

- `CREATOR.EXE_x.y.z_x64-setup.exe`: recommended installer (per-user, no admin needed)
- `CREATOR.EXE_x.y.z_x64_en-US.msi`: MSI installer
- `CREATOR.EXE_x.y.z_x64_portable.exe`: runs without installing (needs the WebView2 runtime, which Windows 11 already has)

The installers aren't code-signed, so SmartScreen may say "Windows protected your PC". Click
**More info → Run anyway**. `SHA256SUMS.txt` lets you verify the download.

Upgrading: run the newer installer over the old one. Your data lives in
`%APPDATA%\com.tommyphelps.creatorexe\creator.db` and is migrated automatically.

## First run

1. **TONIGHT.EXE** gives you three small ideas. **START THIS VIDEO** creates a ready project.
2. **Channel DNA → Import & data → Read public feed** imports your latest uploads (`@TamsterCo` is preset).
   For the full archive with lengths, add a free YouTube Data API key in **Settings**.
3. **Creator Memory** starts with interests from your brief. Edit anything that's wrong.

Press **F1** for keyboard shortcuts.

## What works without AI

Everything in this version. The status bar says `AI: OFF` because nothing is sent to any AI
service. Optional local (Ollama) and bring-your-own-key cloud AI come in Phase 3.

## Develop

```bash
npm ci
npm run check          # strict tsc + tests + production bundle
npm run tauri dev      # run the desktop app (Windows, with Rust + WebView2)
npm run tauri build    # NSIS + MSI installers
```

Tests use Node 22's built-in SQLite and run the real migrations and repositories.

## Docs

- [Architecture](docs/ARCHITECTURE.md): stack, data model, evidence rules, build pipeline
- [Acceptance tests](docs/ACCEPTANCE.md): what to try after installing
- [Channel notes](docs/CHANNEL-NOTES.md): what's known about the channel, and from where
- [Release notes](docs/release-notes/)
