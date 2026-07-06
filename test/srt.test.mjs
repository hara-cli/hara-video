// srt-to-captions — the SRT gap-filler. Pins: time parsing, tolerant SRT parsing (BOM/CRLF/no-index),
// CJK per-character word splitting, and the Whisper-shaped output contract.
import { test } from "node:test";
import assert from "node:assert/strict";
import { srtTime, parseSrt, cueWords, srtToTranscript } from "../scripts/srt-to-captions.mjs";

test("srtTime: comma + dot millis, bad input → null", () => {
  assert.equal(srtTime("00:00:01,500"), 1.5);
  assert.equal(srtTime("01:02:03.250"), 3723.25);
  assert.equal(srtTime("1:00:00,05"), 3600.05, "short hour + 2-digit millis padded");
  assert.equal(srtTime("nonsense"), null);
});

test("parseSrt: tolerant of BOM, CRLF, missing index, multiline cues; skips broken blocks", () => {
  const raw = "﻿1\r\n00:00:00,000 --> 00:00:02,000\r\nHello world\r\n\r\n00:00:02,000 --> 00:00:04,000\r\n两行\r\n字幕\r\n\r\nbroken block no timing\r\n\r\n3\r\n00:00:09,000 --> 00:00:05,000\r\nend before start dropped\r\n";
  const cues = parseSrt(raw);
  assert.equal(cues.length, 2, "two valid cues (no-index cue kept, broken + inverted dropped)");
  assert.equal(cues[0].text, "Hello world");
  assert.equal(cues[1].text, "两行\n字幕", "multiline preserved at cue level");
  assert.equal(cues[1].start, 2);
});

test("cueWords: latin splits by space, CJK per character, time evenly distributed", () => {
  const latin = cueWords({ start: 0, end: 2, text: "hello brave world" });
  assert.equal(latin.length, 3);
  assert.equal(latin[1].word, "brave");
  assert.ok(Math.abs(latin[1].start - 0.667) < 0.01 && Math.abs(latin[2].end - 2) < 0.01);
  const cjk = cueWords({ start: 0, end: 2, text: "南荒科技" });
  assert.equal(cjk.length, 4, "one beat per Han character");
  assert.equal(cjk[3].word, "技");
  const mixed = cueWords({ start: 0, end: 3, text: "用 AI 做视频" });
  assert.deepEqual(mixed.map((w) => w.word), ["用", "AI", "做", "视", "频"], "mixed CJK+latin tokenization");
});

test("srtToTranscript: Whisper-shaped output; --words opt-in", () => {
  const raw = "1\n00:00:00,000 --> 00:00:01,000\n你好\n";
  const plain = srtToTranscript(raw);
  assert.deepEqual(plain, { segments: [{ text: "你好", start: 0, end: 1 }] });
  const withWords = srtToTranscript(raw, { words: true });
  assert.equal(withWords.segments[0].words.length, 2);
  assert.equal(withWords.segments[0].words[0].word, "你");
});

// init scaffold — the bin copies a seed + makes assets/. Test the FILE-LEVEL contract (no CLI spawn).
import { mkdtempSync, existsSync, readFileSync as rf, mkdirSync as mk, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pj, resolve as pr, dirname } from "node:path";
import { fileURLToPath } from "node:url";

test("init: each seed exists, is lint-shaped (has data-start + composition-id), copyable into a project", () => {
  const root = pr(dirname(fileURLToPath(import.meta.url)), "..");
  const seeds = { koubo: "koubo-vertical.html", promo: "promo-vertical.html", kepu: "kepu-horizontal.html" };
  for (const [name, file] of Object.entries(seeds)) {
    const src = pj(root, "skills/video/references/templates", file);
    assert.ok(existsSync(src), `seed present: ${name}`);
    const html = rf(src, "utf8");
    assert.match(html, /data-start="0"/, `${name}: root has data-start (lint P0)`);
    assert.match(html, /data-composition-id="/, `${name}: has a composition id`);
    assert.match(html, /window\.__timelines/, `${name}: registers a GSAP timeline`);
    // simulate the scaffold copy
    const dir = mkdtempSync(pj(tmpdir(), "hv-init-"));
    mk(pj(dir, "assets"), { recursive: true });
    cpSync(src, pj(dir, "index.html"));
    assert.ok(existsSync(pj(dir, "index.html")) && existsSync(pj(dir, "assets")), `${name}: scaffold shape`);
  }
});
