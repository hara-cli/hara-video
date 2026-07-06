#!/usr/bin/env node
// SRT → HyperFrames caption JSON. Zero-dependency. This fills the engine's one real gap: HyperFrames
// consumes word/segment-level transcript JSON (Whisper-shaped) but has no native SRT importer — and
// SRT is what the wider world (and existing CN pipelines) speak.
//
//   node srt-to-captions.mjs subs.srt            → segments JSON to stdout
//   node srt-to-captions.mjs subs.srt --words    → naive per-word timing (evenly split inside each cue;
//                                                  CJK counts per-character — good enough for karaoke-style
//                                                  captions when no word-level ASR is available)
//
// Output shape (Whisper-compatible): { "segments": [{ "text", "start", "end", "words": [...] }] }
import { readFileSync } from "node:fs";

/** "HH:MM:SS,mmm" (SRT) or "HH:MM:SS.mmm" → seconds. */
export function srtTime(t) {
  const m = /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/.exec(t.trim());
  if (!m) return null;
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, "0")) / 1000;
}

/** Parse an SRT string into [{ index, start, end, text }]. Tolerates BOM, CRLF, blank-line variance. */
export function parseSrt(raw) {
  const text = raw.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const cues = [];
  for (const block of text.split(/\n{2,}/)) {
    const lines = block.split("\n").filter((l) => l.trim() !== "");
    if (lines.length < 2) continue;
    // index line is optional in the wild — find the timing line
    const ti = lines.findIndex((l) => l.includes("-->"));
    if (ti === -1) continue;
    const [a, b] = lines[ti].split("-->").map((s) => srtTime(s));
    if (a == null || b == null || b < a) continue;
    const body = lines.slice(ti + 1).join("\n").trim();
    if (!body) continue;
    cues.push({ index: cues.length + 1, start: a, end: b, text: body });
  }
  return cues;
}

/** Split a cue's text into timed "words". Latin words split on whitespace; CJK runs split per character
 *  (each Han/kana char is a caption beat). Time is distributed evenly across units — an approximation,
 *  but visually right for karaoke/highlight captions when only cue-level timing exists. */
export function cueWords(cue) {
  const units = [];
  const re = /([⺀-鿿぀-ヿ豈-﫿])|(\S+)/g;
  let m;
  while ((m = re.exec(cue.text.replace(/\n/g, " ")))) units.push(m[0]);
  if (!units.length) return [];
  const span = (cue.end - cue.start) / units.length;
  return units.map((w, i) => ({
    word: w,
    start: Number((cue.start + i * span).toFixed(3)),
    end: Number((cue.start + (i + 1) * span).toFixed(3)),
  }));
}

/** Full conversion: SRT text → Whisper-shaped transcript JSON. */
export function srtToTranscript(raw, { words = false } = {}) {
  const segments = parseSrt(raw).map((c) => ({
    text: c.text.replace(/\n/g, " "),
    start: c.start,
    end: c.end,
    ...(words ? { words: cueWords(c) } : {}),
  }));
  return { segments };
}

// CLI
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const file = process.argv[2];
  if (!file || file.startsWith("--")) {
    console.error("usage: srt-to-captions.mjs <file.srt> [--words]");
    process.exit(2);
  }
  const out = srtToTranscript(readFileSync(file, "utf8"), { words: process.argv.includes("--words") });
  process.stdout.write(JSON.stringify(out, null, 2) + "\n");
}
