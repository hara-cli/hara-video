---
name: video
description: Design and produce a finished video from a plain-language brief using HyperFrames — visual direction, approved script, shot-by-shot storyboard, sourced or generated footage/images, voice, captions, deterministic motion, preview, quality audit, and rendered MP4. Use when the user asks to make, redesign, animate, edit, preview, or render a 口播, short, promo, explainer, article-to-video, or other video.
---

# Video production

Produce a designed video, not a subtitle slideshow. Act as the video designer/director before acting as
the editor. Persist the creative decisions in project artifacts so another turn can resume without
guessing.

HyperFrames owns deterministic HTML/GSAP preview and rendering. Author the composition and its assets;
use generated imagery or clips as ingredients inside that composition.

## Read before production

- Read `references/platforms.md` for the target canvas and delivery settings.
- Read `references/visual-direction.md` before visual design and storyboarding.
- Read `references/captions.md` before building captions.
- Read the matching `references/recipes/<type>.md`.
- Read `references/recipes/ai-clips.md` when generated clips are justified.
- Read the installed official HyperFrames authoring guidance when available. Do not guess engine syntax.

## Prerequisites

Run `hara-video doctor` once per session. Require Node 22+, ffmpeg, and
`npx hyperframes --version`. If a check fails, explain the concrete fix before authoring.
Do not hand-write a replacement scaffold when `hara-video` or HyperFrames is missing: fix the same-Node
PATH/runtime first, then run the official initializer. A missing prerequisite is a blocker, not permission
to bypass the production contract.

## Production contract

Create the project with:

```bash
hara-video init <koubo|promo|kepu> <dir>
```

This creates:

- `DESIGN.md` — visual thesis, theme, motion grammar, pacing, constraints;
- `SCRIPT.md` — approved narration/on-screen copy and timing source;
- `STORYBOARD.md` — every beat, primary visual, asset, motion, transition, and audio cue;
- `index.html` — deterministic composition scaffold;
- `assets/{audio,images,video}/` — project media.

Never skip the three Markdown artifacts. The HTML seed is scaffolding, not the creative plan.

## Hara specialist gates

When Hara lists `video-director` and `video-quality-reviewer` under `# Specialist roles`, use both for
a new or substantially redesigned finished video. They are bounded read-only reviewers; the main agent
still owns decisions, edits, approvals, and delivery.

1. After drafting `DESIGN.md`, `SCRIPT.md`, and `STORYBOARD.md`, call `agent` with role
   `video-director`. Give it only the brief, artifact paths, constraints, and desired verdict. Resolve
   every `REVISE` finding before composition and record the accepted direction in the artifacts.
2. After `hara-video verify .` has produced passing snapshots, call `agent` with role
   `video-quality-reviewer`. Give it the artifact paths, composition path, verification result, and an
   honest description of the inspected snapshots. Resolve every `REVISE` finding, verify again, and only
   then open preview.

Do not call both reviewers at the start, do not delegate editing, and do not ignore a gate verdict. If
the host does not expose these roles, perform their checklists yourself and clearly label that fallback;
never pretend a specialist or a visual inspection ran.

## Staged workflow

### 1. Resolve the brief

Use facts already supplied. Otherwise ask at most four questions in one message:

1. platform/aspect and audience;
2. target duration;
3. voice/language and music expectations;
4. style direction, or two to three relevant choices.

Record the result in `DESIGN.md`.

### 2. Design the video

Before writing composition code:

1. Write one visual thesis for the theme.
2. Choose palette, type, depth/texture, caption treatment, camera/transition grammar, and pacing curve.
3. Choose coherent motion recipes.
4. Design the hook, proof/turn, payoff, and CTA as visual states.
5. Produce one representative style frame and freeze the continuity tokens before bulk generation.
6. Show the concise direction to the user when it materially affects the result.

Save the approved style frame under `assets/images/style-frame.png` and record that exact relative path
in `DESIGN.md`. Set `Status: approved` only after the user approves the design direction; never fabricate
approval to satisfy a gate.

Do not interpret “dynamic” as constant zooming. Make motion reveal meaning, guide focus, compare states,
or connect evidence.

### 3. Write and approve the script

Write `SCRIPT.md` before voice or assets. Show the narration and key on-screen copy. Wait for approval
before spending generation or render time. A revised script invalidates downstream timing; update the
revision and regenerate timing. Keep `Status: draft` until the user approves the script.

### 4. Build the storyboard and asset plan

Create one `STORYBOARD.md` row for every substantive beat. Each row must state:

- exact timing and narration/message;
- one primary visual: footage, image, UI/code, diagram/map, data graphic, or a short kinetic-type beat;
- asset path or an executable capture/search/generation prompt;
- motion recipe, camera behavior, transition, and audio cue.

Then complete asset coverage. Capture, source, or generate missing assets before composition:

- still: `hara-video image "<production prompt>" -o assets/images/name.png`;
- video: use the user's configured video backend, then place the result under `assets/video/`;
- UI/code: record or build an inspectable mockup/diagram;
- audio: place narration, BGM, and SFX under `assets/audio/`.

Do not silently invent licensed media provenance. If a backend or asset is unavailable, stop at a clear
placeholder plan rather than pretending the video is finished.

For product promos, prefer real UI, deterministic HTML graphics, diagrams, counters, and annotations.
Default to no more than three generated key images; reuse them with purposeful crops, masks, parallax,
foreground cards, and camera movement. Generate independent approved assets in one batch, not one
model/tool round per image. Never generate readable product UI or captions inside an image.

After the `video-director` returns `PASS` and its accepted corrections are recorded, mark
`STORYBOARD.md` as `Status: approved`. A reviewer verdict does not replace the user's required design
and script approvals.

### 5. Produce voice and one timing source

Use final user audio, local HyperFrames TTS, or:

```bash
hara-video tts "<approved text>" -o assets/audio/voice.wav
npx hyperframes transcribe assets/audio/voice.wav
```

Convert an existing SRT with:

```bash
hara-video srt subs.srt --words
```

Derive caption, scene, and composition timing from the same final narration/transcript. Never maintain
an unrelated handwritten subtitle timeline. Document narration end, last caption end, last visual end,
and composition end in `STORYBOARD.md`.

### 6. Compose designed scenes

Customize `index.html` from the scaffold:

- bind every storyboard beat to a named scene/beat with the matching `data-beat-id`;
- add `data-visual-role="<type>"` to each primary visual;
- add `data-motion="<recipe>"` to planned moving beats;
- use footage/images/diagrams/UI/data as the visual layer and captions as support;
- drive all state from the registered timeline;
- keep one composition root and explicit timing metadata;
- avoid wall-clock timers and `Math.random()`;
- keep audio/video assets timed, muted where required, and on explicit tracks;
- mark voice with `data-audio-role="narration"` and supporting tracks as `music` or `sfx`.

Prefer reusable HyperFrames components for captions, transitions, footage, and graphics. A reusable
scene system plus theme tokens is better than cloning one full-video template for every topic.

### 7. Run quality and engine gates

Run the single fail-closed gate before asking for preview approval:

```bash
hara-video verify .
```

It runs strict design/timing audit, HyperFrames lint, runtime/layout/motion/contrast check, and snapshots
in order, and stops on the first failed stage. Use `check`, not deprecated `validate`.

Apply one cohesive repair pass for all reported codes, then run `hara-video verify .` once more. If the
same code remains after two repair passes, stop, preserve the artifacts/checklist, and report that exact
blocker. Never keep rewriting the whole HTML, never increase Hara's run deadline just to retry a failed
gate, and never open preview after a partial green result. Inspect verified snapshots at the hook, every
scene boundary, payoff, and end; run the engine overflow/clipping inspection when available.

`hara-video edit` runs the same fail-closed verification again and refuses to start the preview server
when any stage is red. Never bypass it with a direct `hyperframes preview` or `npx hyperframes preview`.

### 8. Preview and edit

Run:

```bash
hara-video edit .
```

It opens preview in the background and returns. Never launch the long-running preview server in the
foreground. Iterate conversationally. For precision edits, let the user click an element and read the
selection:

```bash
npx hyperframes preview --selection --json
```

Wait for explicit preview approval before final render.

### 9. Render and deliver

Render with the platform preset. Use draft quality only for intermediate checks. Re-run the strict audit
and engine checks after the last edit, then render the approved composition. Report the MP4 path and offer
a cover still.

## Visual quality rules

- Captions are accessibility/emphasis, never the entire scene.
- A video longer than 10 seconds cannot consist only of centered text over a static background.
- Give every substantive beat a non-caption primary visual.
- In short-form work, change visual state roughly every 2–4 seconds unless meaningful action continues.
- Use at least two coherent motion recipes for videos longer than 15 seconds.
- Make the first three seconds combine a promise/question with visual proof.
- Avoid repeated identical caption enter/exit animation across the whole video.
- Do not let captions or composition continue beyond narration unless an intentional music-only beat is
  designed and documented.
- Follow the Chinese typography and safe-area rules in `references/captions.md`.

## Long-task checkpointing

Treat each approved artifact as a resumable checkpoint:

1. finish and save the current stage;
2. update a checklist with completed and next stages;
3. report the next concrete action;
4. continue in a fresh turn when the run deadline is near.

Do not try to design, source assets, compose, preview, and render inside one unbounded agent turn.
When Hara warns that 20% of the current turn remains, finish only the current atomic stage, update the
checklist, and return a checkpoint. Start the next expensive stage with `/continue`; do not begin a new
image batch, transcription, verification, preview, or render near the deadline.

## Final self-critique

Score 1–5 on hook, visual storytelling, mobile caption readability, audio/visual sync, motion variety,
pacing, and ending/CTA. Fix any score below 3 before delivery.
