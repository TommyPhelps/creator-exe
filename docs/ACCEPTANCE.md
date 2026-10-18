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

## v0.1.2

**Your data survives**
1. Install 0.1.2 over 0.1.1 (or over the 0.2.0 preview, if you tried it). Pass if the boot screen reports schema v4, and your game library, Creator Memory, imported videos, projects and thumbnails are all still there.
2. Make a backup (Backup, top right), then File → Restore from backup. Pass if nothing is lost.

**Find an idea → start a project → see how to begin**
1. Idea Machine → Generate → Start project on a card for one of your games. Pass if the project opens on the **Recording sheet** showing the game, the hook, why someone would watch, two or three approaches to pick from, where to start, moments to capture (as a checklist), what you need (listed once) and the next step.
2. Pass if every older planning field (research, equipment, structure, upload info and the rest) is under **More notes**, and an older project still shows what you wrote in it.
3. Start the same idea again from the Inbox. Pass if it reopens the same project instead of creating a second one.
4. Add **My notes** to an idea in the Inbox, then start it. Pass if the notes are on the recording sheet.

**Game-specific ideas** (judge these yourself)
1. Type **Warband** in *Build around games* and generate. Pass if all three ideas are Warband videos of different kinds.
2. Try **modded Skyrim**, **Minecraft modpacks**, **itch.io horror**, **Morrowind**, **Elden Ring, Thief**. Pass if each gives ideas about what you typed, with real places, systems or events from the game as moments, and none reads like a template with the name swapped in.
3. Type a game the app doesn't know (e.g. **Ultrakill**). Pass if it says it has no notes on that game and offers general formats that don't claim anything about it.
4. With your library imported, ask for a game you've played for hours. Pass if there's no "first time" idea for it and the app says why.
5. Pass if no idea is titled "Is X an overlooked classic?", "Is X still worth playing?" or "Why X is underrated".

**Feedback steers, it doesn't take over**
1. Choose *I like this kind of video* on a mechanics idea, then generate a batch of six. Pass if most of the batch is still other kinds of video.

**Your channel, your look**
1. Channel DNA → Your channel. Pass if the description is exactly yours, line breaks included, and edits you make are kept.
2. Pass if nothing in the app writes jokes, scripts or voices or generates thumbnails; visual beats on a recording sheet only point at situations.

**Four steps and 1440p**
1. Video Workshop. Pass if the board has four columns, Plan, Record, Edit and Publish, each card shows its exact stage, and dragging a card to the next column moves it.
2. On a project, the Step buttons move it between the four steps; the stage dropdown still sets the exact stage.
3. Control Room shows the current project's step and a Continue button first. Tonight lists projects you could pick up instead.
4. Pass if a notification never blocks a button you need: they disappear on their own, and clicking one dismisses it.
