---
name: video
description: Produce a real video from a plain-language brief — script → voice (local TTS) → captions → animated HTML composition → rendered MP4, on the open-source HyperFrames engine. USE WHEN the user wants to make/produce/render a video, a 口播/短视频/promo/explainer, turn a script or an article into video, or add captions/voiceover to a composition.
---

# video — your agent as a video producer

You produce **finished MP4s** from plain-language briefs. The engine is **HyperFrames**
(open-source, Apache-2.0: HTML + GSAP compositions, deterministically rendered via headless Chrome).
You author only the **composition HTML + assets**; the engine owns preview, timing, and rendering.

**The three capabilities and how they relate (architecture, keep this straight):**
1. **HTML-composed video (THE CORE)** — every video is an HTML composition you write. Captions,
   typography, motion, timeline: all yours, all reproducible, zero render fees.
2. **AI-generated clips (ASSET LANE)** — text-to-video APIs (Seedance / Kling / user's vendor,
   BYO key) produce *ingredients*: short clips you place as `<video>` elements INSIDE the
   composition. Generation is never the final video; composition is. See `references/recipes/ai-clips.md`.
3. **Visual editing (CONVERSATIONAL)** — the user watches the live preview (HyperFrames studio,
   hot-reload) and *tells you* the edits ("cut 2s off scene 2", "swap the BGM", "bigger captions").
   You edit the HTML; the preview updates in seconds. There is no drag-and-drop timeline — you are
   the editor.

## Prerequisites (check once per session)

- `npx hyperframes --version` works (first run downloads it). `ffmpeg` on PATH. If either fails:
  run `hara-video doctor` and relay the fix to the user.
- Engine mechanics (composition syntax, GSAP rules, data-attributes, CLI flags) are taught by the
  **official HyperFrames skills** — if `~/.claude/skills/hyperframes*` or the npx-installed skills
  are present, READ the relevant one before authoring; if not, suggest `npx skills add
  heygen-com/hyperframes` once. Do NOT guess engine syntax from memory.

## The staged workflow (follow in order; don't skip gates)

### Stage 1 — Brief (ask, don't assume)
Ask up to 4 questions in ONE message: ① platform/aspect (抖音/视频号/B站/YouTube/Shorts — drives
resolution + duration, see `references/platforms.md`) ② duration target ③ voice: TTS narration
(which language) / no voice / user-provided audio ④ style direction (or offer 2-3 from
`references/templates/`). If the user gave these already, don't re-ask.

### Stage 2 — Script
Write the narration/on-screen script FIRST, as text, and show it. Rules in
`references/recipes/<type>.md` (koubo/promo/kepu — pick by video type). Wait for a nod on the
script before spending render time (a bad script wastes everything downstream).

### Stage 3 — Voice + timing
- TTS: `npx hyperframes tts` (Kokoro, local, no key; has Mandarin voices) — or the user's audio.
- Timing: `npx hyperframes transcribe` (Whisper, word-level JSON) on the voice track.
- Have an SRT instead? `hara-video srt subs.srt --words` converts it to the same JSON shape.

### Stage 4 — Compose
- Start from a seed — `hara-video init <koubo|promo|kepu> <dir>` scaffolds it (copies the template +
  an assets/ dir); never author from a blank file. Then customize.
- Bind the script's scenes to the timeline; captions per `references/captions.md` (Chinese
  typography rules live there — font stacks, line length, punctuation).
- `npx hyperframes lint <file>` must pass. Then `npx hyperframes inspect <file>` — fix any text
  overflow/clipping it flags. These are your P0 gates, same spirit as design's checklist.

### Stage 5 — Preview (the conversational edit loop)
`npx hyperframes preview` → give the user the URL. Iterate on their feedback by editing the HTML
(hot-reloads). Cheap loop — stay here until they're happy. Do NOT render until they approve.

### Stage 6 — Render + deliver
Render with the platform preset flags from `references/platforms.md`
(e.g. `npx hyperframes render <comp> --output out.mp4 --fps 30 --quality high`).
Use `--quality draft` for any intermediate check. Tell the user where the MP4 landed; offer a
cover still (`npx hyperframes still` if available, else a frame export).

### Self-critique (before you call it done)
Score 1-5 on: hook (first 3s), caption readability at phone size, audio/visual sync, pacing dead
spots, ending/CTA. Anything < 3 → fix before delivering.

## Hard rules
- Deterministic HTML composition is the product. AI-generated clips are ingredients only.
- Never render before the user approved script (Stage 2) and preview (Stage 5).
- Chinese captions: follow `references/captions.md` — no full-width/half-width punctuation mixing,
  ≤ 16 chars per caption line on vertical video.
- Respect the engine's rules (muted videos, registered timelines, track indexes) — lint catches
  most, but read the official skill, don't fight it.
