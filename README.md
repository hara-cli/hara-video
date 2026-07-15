# hara-video

**Produce videos from your terminal — in [hara](https://github.com/hara-cli/hara), Claude Code, or Codex.**
Describe the video; your agent scripts it, voices it (local TTS, no API key), captions it, and renders a
real MP4 — on the open-source [HyperFrames](https://github.com/heygen-com/hyperframes) engine.

The agent authors only the **composition HTML + assets**; the engine owns deterministic rendering.
What the bundled skills add on top of the raw engine:

- **A staged production workflow** with quality gates: brief → script (approve first) → voice+timing →
  compose → live preview (conversational editing: "cut 2s off scene 2" → HTML edit → hot reload) → render.
- **Curated seeds & recipes** — 口播 (talking-head shorts), product promo, 科普 explainer — each with
  script rules distilled from 120+ shipped episodes.
- **Chinese-first captioning** — font stacks, line-length, punctuation and sync discipline, plus
  `hara-video srt` to convert any SRT into the engine's word-level caption JSON (a gap upstream).
- **Platform presets** — 抖音 / 视频号 / 小红书 / B站 / YouTube / Shorts canvases, durations, render flags.
- **Pluggable asset backends (local *or* API, no vendor lock-in)** — `hara-video image` / `hara-video tts`
  generate stills and voice through a command template you configure (a local model, a wrapper, or any
  API). Generated images/clips are *ingredients* placed into the composition — generation is never the
  final video, composition is.
- **Safe publication (`video-publish`)** — private account profiles, remote identity checks, explicit
  visibility/schedule review, bounded uploads, duplicate prevention, and redacted publication receipts.

## Install

```bash
npm i -g @nanhara/hara-video
hara-video install            # as a hara plugin
hara-video install --claude   # or: link both skills into Claude Code (~/.claude/skills/)
hara-video install --codex    # or: Codex (~/.agents/skills/)
hara-video doctor             # checks node / ffmpeg / hyperframes
```

Engine prerequisites: Node ≥ 22, ffmpeg, and HyperFrames (fetched by `npx` on first use — Apache-2.0,
free at any company size). For engine authoring depth, also install the official skills:
`npx skills add heygen-com/hyperframes`.

## Use

In your agent: *"做一条 45 秒的抖音口播,讲 XX,用我的音色…"* — the `video` skill drives the whole
pipeline and hands you a preview URL before anything renders.

When the approved MP4 is ready, ask *"publish this with profile studio to YouTube as unlisted"*. The
`video-publish` skill resolves a private profile from `.hara/video-publish/profiles/` or
`~/.hara/video-publish/profiles/`, verifies the remote account, shows the final plan, and records the
verified result without exposing credentials. See the bundled profile example before wiring an uploader
adapter; the open-source package contains no brand accounts, cookies, tokens, or private routing rules.

CLI helpers:

```bash
hara-video edit .                      # live web preview for editing (background server + browser; never blocks)
hara-video image "<prompt>" -o x.png   # generate a still image via your configured backend
hara-video tts   "<text>"   -o v.wav   # generate voice via your configured backend
hara-video srt subs.srt --words        # SRT → HyperFrames caption JSON (CJK per-character beats)
```

### Backends: images & voice (local *or* API — bring your own, no vendor lock-in)

`hara-video image` / `tts` don't hardcode a vendor. They run a **command template** you supply, with
`{prompt}` / `{out}` placeholders (shell-quoted for you, so a prompt can't inject). Configure via `--cmd`,
or the env vars `HARA_VIDEO_IMAGE_CMD` / `HARA_VIDEO_TTS_CMD`; `hara-video image` also auto-detects
`z-image` on PATH. A backend is just a command that reads a prompt/text and writes a file — local model
or API, your choice.

```bash
# Image — pick ONE (a local model, a codex-image wrapper, or an API script):
export HARA_VIDEO_IMAGE_CMD='z-image {prompt} -o {out}'          # a local image model on PATH
export HARA_VIDEO_IMAGE_CMD='~/my-image.sh {prompt} {out}'       # your wrapper (local SD, codex-image, or a curl to an API)
export HARA_IMAGE_SIZE=1080x1920                                 # portrait for 抖音/短; default 1920x1080

# Voice — local (no key) or an API:
export HARA_VIDEO_TTS_CMD='npx hyperframes tts {prompt} -o {out}'   # local Kokoro (Mandarin, no key) — the default fallback
export HARA_VIDEO_TTS_CMD='~/my-tts.sh {prompt} {out}'             # your wrapper (a voice clone, or 字节/Azure/ElevenLabs API)
```

## License

Apache-2.0. HyperFrames is a separate Apache-2.0 project by HeyGen — this skill drives it and adds
curation; it does not redistribute it.
