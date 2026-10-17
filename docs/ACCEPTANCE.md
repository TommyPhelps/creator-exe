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

## v0.1.1

**Gaming first**
1. Install over 0.1.0 and open the app. A notice says how many interests moved to Personal and which gaming preferences were added.
2. Idea Machine → Generate five times. Pass if every idea is about games (an occasional "Gaming-adjacent tech" card is expected) and nothing like "build a website with 2003 tools" or "draw an object every day" appears.
3. Try Tonight, Zero budget, Deep dive, Random, and each Interest option. Pass if none of them leaves gaming.
4. Press **Explore outside my niche**. Pass if unrelated ideas appear *with* a banner, and the next normal Generate is back to gaming.

**Content Focus**
1. Pick **Gaming only**, generate a few batches. Pass if no tech cards appear.
2. Type 50 / 50 / 0. Pass if the preset shows Custom and tech cards become frequent.

**Your library**
1. In REWIND, back up your library; in CREATOR.EXE → Creator Memory → Game Library → Import, pick that file.
2. Generate with **Zero budget**. Pass if every idea says In your library, Free, or needs no game, and none says you'd need to buy something.
3. Pass if an idea about a game you don't own says "Not in your imported library".

**Feedback**
1. On a Morrowind idea choose *I like Morrowind*; generate three batches. Pass if Morrowind shows up again but not in every batch, and never twice in one batch.
2. On a modding idea choose *No mods & modpacks videos*. Pass if that kind of video mostly disappears for a while (it fades over months).
3. Press **More like this** on a card. Pass if the new batch is related (same kind of video or topic) but not the same idea.

**Channel DNA**
1. Re-import the public feed. Pass if your gaming videos are labelled with games/genres from their titles, nothing is labelled Film & media because of a link, and unclear videos say Unknown.
2. Open a video, add a topic yourself. Pass if it replaces the automatic ones and "Back to automatic" restores them.

**Readability**
1. On the 1440p monitor, pass if idea cards are readable without leaning in, three cards fill the width, and Details expands the rest.
