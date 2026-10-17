# Acceptance tests

Run these on the installed app. Each maps to a success workflow in the brief.

## Phase 1

**A — No idea what to make (target: under a minute)**
1. Open the app. Click **TONIGHT.EXE** (or Ctrl+2).
2. Three ideas appear with "Why it might interest you", "First five minutes" and a minimum viable video.
3. Press **START THIS VIDEO** on one. A project opens with title, premise, equipment, next action and a checklist filled in.
4. Pass if you went from launch to a populated project without typing anything.

**C — Organise a concept**
1. In the project, fill Research, Equipment, Things to capture. Change Stage to *Ready to record*.
2. Open **Video Workshop** (Ctrl+4); drag the card to *Recording*. Right-click it for more actions.
3. Close and reopen the app. Pass if every field and the stage survived.

**D — Thumbnail**
1. Thumbnail Lab → type your thumbnail text → **Generate 7 concepts** → **Open in editor**.
2. Move, resize and rotate the text; add an image (drag a PNG from Explorer); hide and lock layers; Ctrl+Z / Ctrl+Y.
3. Export PNG (1280×720), SVG and OpenRaster (.ora). Open the .ora in Krita.
4. Pass if Krita shows separate layers with the right names, and the PNG is 1280×720.

**E — Packaging**
1. Packaging Lab → pick the project → **Title Lab**: generate candidates, star two, edit one.
2. **Description, tags & checklist**: assemble the description, copy it, tick the checklist, save a version.
3. Pass if nothing in the description was invented (no fake timestamps, sponsors or sources).

**F — Channel**
1. Channel DNA → Import & data → **Read public feed** (works with `@TamsterCo` or the UC ID).
2. Review the import preview, then apply. Rate one video and tick "I loved making this".
3. Re-run the import. Pass if your notes and ratings were not overwritten and nothing duplicated.
4. Optional: add a free YouTube Data API key in Settings and import the full channel (all 37 uploads, with lengths).

**Data safety**
1. File → Back up data… → save the JSON. Make a change. File → Restore from backup….
2. Pass if the preview shows counts before anything changes and the change is reverted after restore.
3. Confirm the backup file contains no API key (search it for your key).

**Creator Memory**
1. First launch shows "Creator Memory starts with 19 interests from your brief".
2. Delete one, add one ("Tired of: food challenges"). Generate ideas. Pass if food-challenge ideas sink and the deleted interest doesn't come back on restart.


## Phase 2 — Tamster identity, local video evidence and gaming-first ideas

1. **Back up the installed v0.1.0 database before upgrading** using File → Back up data.
2. Install the Phase 2 build over v0.1.0. Confirm your 15 imported uploads, saved Morrowind project, reactions and Creator Memory remain.
3. Channel DNA → Tamster branding: verify display name **Tamster**, red-laser-cat avatar note, handmade pink/cat/old-PC banner note, and the exact three-paragraph description. Edit a phrase, reopen the app, confirm it persists, then restore the original if desired.
4. Idea Machine: Content Focus → Gaming first. Generate several batches in Tonight, Random, and Completely new. Every recommendation should stay gaming or gaming-adjacent tech. Gaming only must exclude pure tech. Variety must allow broader experiments. Confirm user feedback and existing projects persist.
5. Channel DNA → Patterns & evidence: imported gaming uploads must **not** all appear as Film & media because their descriptions mention TV.
6. Channel DNA → Local video evidence: select one imported upload. Choose an original MP4, MOV, MKV, or WebM file on your PC (not a YouTube URL). With FFmpeg + FFprobe on PATH, wait for local analysis. Expect total duration/resolution and scene/quiet-audio markers for **at most the first 90 seconds**. A scene marker is not a confirmed editing cut.
7. Import an actual **SRT or WebVTT** transcript for the same video. Confirm that timecodes and words appear; TXT imports honestly say they are not timecoded.
8. Import one of your original thumbnail PNG/JPG files. Confirm six observed color swatches appear. They are pixel samples, not alleged AI design judgments.
9. Write personal observations and tags, switch to another video and back, and restart the app. Confirm the right evidence stays attached to each stable YouTube video ID.
10. File → Back up data: verify the backup includes a video_forensics table but **no API keys**. Restore only after inspecting the preview; old v0.1.0 backups should also import.
11. If no FFmpeg is installed, the video button must show an actionable message rather than claiming analysis completed.

### Current limits
- This phase inspects local original footage only with user permission. It cannot automatically watch YouTube videos or download them; it cannot identify jokes, intent, personalities or edit decisions.
- FFmpeg/FFprobe are separate optional tools; no automatic binary download is bundled.
- No automatic video frame gallery, semantic thumbnail analysis or YouTube OAuth yet; future phases may extend these.
- There is no Comedy Engine or Editing Companion.
