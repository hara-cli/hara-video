# hara-video

**Produce videos from your terminal — in [hara](https://github.com/hara-cli/hara), Claude Code, or Codex.**
Describe the video; your agent scripts it, voices it (local TTS, no API key), captions it, and renders a
real MP4 — on the open-source [HyperFrames](https://github.com/heygen-com/hyperframes) engine.

The agent authors only the **composition HTML + assets**; the engine owns deterministic rendering.
What this skill adds on top of the raw engine:

- **A staged production workflow** with quality gates: brief → script (approve first) → voice+timing →
  compose → live preview (conversational editing: "cut 2s off scene 2" → HTML edit → hot reload) → render.
- **Curated seeds & recipes** — 口播 (talking-head shorts), product promo, 科普 explainer — each with
  script rules distilled from 120+ shipped episodes.
- **Chinese-first captioning** — font stacks, line-length, punctuation and sync discipline, plus
  `hara-video srt` to convert any SRT into the engine's word-level caption JSON (a gap upstream).
- **Platform presets** — 抖音 / 视频号 / 小红书 / B站 / YouTube / Shorts canvases, durations, render flags.
- **AI-clip lane (roadmap)** — text-to-video clips (BYO key) as *ingredients* placed into compositions;
  generation is never the final video, composition is.

## Install

```bash
npm i -g @nanhara/hara-video
hara-video install            # as a hara plugin
hara-video install --claude   # or: link into Claude Code (~/.claude/skills/video)
hara-video install --codex    # or: Codex (~/.agents/skills/video)
hara-video doctor             # checks node / ffmpeg / hyperframes
```

Engine prerequisites: Node ≥ 22, ffmpeg, and HyperFrames (fetched by `npx` on first use — Apache-2.0,
free at any company size). For engine authoring depth, also install the official skills:
`npx skills add heygen-com/hyperframes`.

## Use

In your agent: *"做一条 45 秒的抖音口播,讲 XX,用我的音色…"* — the `video` skill drives the whole
pipeline and hands you a preview URL before anything renders.

CLI helpers:

```bash
hara-video srt subs.srt --words   # SRT → HyperFrames caption JSON (CJK per-character beats)
```

## License

Apache-2.0. HyperFrames is a separate Apache-2.0 project by HeyGen — this skill drives it and adds
curation; it does not redistribute it.
