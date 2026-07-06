# Captions — from timing JSON to on-screen text (Chinese-first)

## The pipeline
1. Timing source, one of:
   - `npx hyperframes transcribe voice.wav` → word-level JSON (preferred; exact)
   - `hara-video srt subs.srt --words` → same JSON shape from an SRT (per-character CJK beats,
     evenly timed inside each cue — good enough for karaoke/highlight styles)
2. Render captions as HTML text elements driven by the timeline. HyperFrames' registry has 15
   caption components (`caption-highlight`, `caption-karaoke`, …) — `npx hyperframes add <name>`;
   prefer one of those over hand-rolling, restyle with your tokens.

## Chinese typography rules (hard requirements)
- **Font stack (sans, default)**: `"PingFang SC", "Source Han Sans SC", "Noto Sans SC", sans-serif`
  **Serif (文化/文艺调)**: `"Source Han Serif SC", "Noto Serif SC", "Songti SC", serif`
  Never let captions fall through to a Japanese-first CJK font (JP glyph variants read "off" to CN
  eyes — 直/骨/海 etc. differ).
- **Line length**: vertical video ≤ **16 chars/line**, max 2 lines; horizontal ≤ 24 chars/line.
- **Readability floor**: ≥ 44px on a 1080×1920 canvas, with either a text stroke
  (`-webkit-text-stroke: 1px rgba(0,0,0,.85)`) or a scrim/backdrop bar — captions must survive a
  bright background at phone size.
- **Punctuation**: full-width for CJK text(,。!?);no trailing 句号 on caption lines;
  numerals + latin stay half-width; add a thin space between CJK and latin/number runs.
- **Emphasis**: highlight the 1-3 keyword characters per line (color/weight), not whole lines.
- **Safe areas**: bottom 12% (progress bars/UI) and top 8% stay empty on vertical platforms.

## Sync discipline
- Caption enters ≤ 100ms after its first word's audio; leaves with the last word (don't linger > 300ms).
- One thought per caption. If a cue runs > ~4s, split it.
- After compose, run `npx hyperframes inspect --samples 15` — any overflow/clipping it flags is a P0.
