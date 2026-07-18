import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { auditComposition } from "../scripts/audit-composition.mjs";

function project() {
  const dir = mkdtempSync(join(tmpdir(), "hara-video-audit-"));
  mkdirSync(join(dir, "assets"), { recursive: true });
  return dir;
}

function writeApprovedDocs(dir) {
  mkdirSync(join(dir, "assets", "images"), { recursive: true });
  writeFileSync(join(dir, "assets", "images", "style-frame.png"), "approved-style-frame");
  writeFileSync(join(dir, "DESIGN.md"), "# DESIGN.md\n\nStatus: approved\n\n- Style frame: assets/images/style-frame.png\n");
  writeFileSync(join(dir, "SCRIPT.md"), "# SCRIPT.md\n\nStatus: approved\n");
  writeFileSync(join(dir, "STORYBOARD.md"), "# STORYBOARD.md\n\nStatus: approved\n");
}

test("audit rejects a subtitle-only composition whose captions outlive narration", () => {
  const dir = project();
  try {
    writeFileSync(join(dir, "index.html"), `<!doctype html>
      <div data-composition-id="bad" data-start="0" data-duration="30">
        <div class="bg-pulse"></div>
        <audio class="clip" data-start="0" data-duration="12"></audio>
        ${Array.from({ length: 8 }, (_, index) =>
          `<div id="cap-${index}" class="caption clip" data-start="${index * 3}" data-duration="3">caption ${index}</div>`).join("\n")}
      </div>
      <script>
        const tl = gsap.timeline({paused:true});
        document.querySelectorAll(".caption").forEach((el) => tl.to(el, {opacity:1,duration:.2}));
      </script>`);

    const result = auditComposition(dir, { strict: true });
    const codes = result.findings.map((item) => item.code);
    assert.equal(result.pass, false);
    assert.ok(codes.includes("subtitle-only"));
    assert.ok(codes.includes("caption-audio-overrun"));
    assert.ok(codes.includes("static-ambient-layer"));
    assert.ok(codes.includes("missing-design-artifacts"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("audit passes a designed, synchronized project with approved artifacts", () => {
  const dir = project();
  try {
    writeApprovedDocs(dir);
    writeFileSync(join(dir, "index.html"), `<!doctype html>
      <main data-composition-id="good" data-start="0" data-duration="20">
        <section class="scene" data-start="0" data-duration="5" data-visual-role="ui" data-motion="push-focus"><svg></svg></section>
        <section class="scene" data-start="5" data-duration="5" data-visual-role="diagram" data-motion="trace-path"><canvas></canvas></section>
        <section class="scene" data-start="10" data-duration="5" data-visual-role="data" data-motion="count-up"><svg></svg></section>
        <section class="scene" data-start="15" data-duration="5" data-visual-role="brand-cta" data-motion="reveal-mask"><svg></svg></section>
        <audio class="clip" data-start="0" data-duration="20"></audio>
      </main>
      <script>
        const tl = gsap.timeline({paused:true});
        tl.to(".scene", {opacity:1,duration:.4});
      </script>`);

    const result = auditComposition(dir, { strict: true });
    assert.equal(result.pass, true, JSON.stringify(result.findings));
    assert.equal(result.metrics.visualBeats, 4, "nested SVGs do not double-count their annotated scene beats");
    assert.equal(result.metrics.motionRecipes, 4);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("audit rejects an unapproved slideshow whose duration and implemented beats drift from the plan", () => {
  const dir = project();
  try {
    writeFileSync(join(dir, "DESIGN.md"), "# Design\n\n时长: ~30秒\n");
    writeFileSync(join(dir, "SCRIPT.md"), "# Script (~30秒)\n\nStatus: draft\n");
    writeFileSync(join(dir, "STORYBOARD.md"), `# Storyboard

Status: draft

| 镜号 | 时间 | 画面 |
|---|---|---|
| 1 | 0-5s | A |
| 2 | 5-10s | B |
| 3 | 10-15s | C |
| 4 | 15-20s | D |
| 5 | 20-25s | E |
| 6 | 25-30s | F |
`);
    writeFileSync(join(dir, "index.html"), `<main data-composition-id="drift" data-start="0" data-duration="17.36">
      <section data-start="0" data-duration="5"><img src="assets/a.png"></section>
      <section data-start="5" data-duration="5"><img src="assets/b.png"></section>
      <section data-start="10" data-duration="7.36"><img src="assets/c.png"></section>
    </main>`);

    const result = auditComposition(dir, { strict: true });
    const codes = new Set(result.findings.map((item) => item.code));
    assert.equal(result.pass, false);
    assert.ok(codes.has("unapproved-design-artifact"));
    assert.ok(codes.has("missing-approved-style-frame"));
    assert.ok(codes.has("declared-duration-drift"));
    assert.ok(codes.has("storyboard-composition-drift"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a longer BGM track cannot hide captions that outlive narration", () => {
  const dir = project();
  try {
    writeApprovedDocs(dir);
    writeFileSync(join(dir, "index.html"), `<!doctype html>
      <main data-composition-id="audio-roles" data-start="0" data-duration="20">
        <section class="scene clip" data-start="0" data-duration="20" data-visual-role="ui" data-motion="push-focus"><svg></svg></section>
        <div class="caption clip" data-start="0" data-duration="15">too long</div>
        <audio id="voice" data-audio-role="narration" data-start="0" data-duration="10"></audio>
        <audio id="bgm" data-audio-role="music" data-start="0" data-duration="20"></audio>
      </main>`);

    const result = auditComposition(dir);
    assert.equal(result.metrics.audioEnd, 10);
    assert.ok(result.findings.some((item) => item.code === "caption-audio-overrun"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("caption source comparison permits formatting splits without permitting changed copy", () => {
  const dir = project();
  try {
    writeApprovedDocs(dir);
    writeFileSync(join(dir, "assets", "subs.json"), JSON.stringify([
      { start: 0, end: 4, text: "one thought" },
    ]));
    writeFileSync(join(dir, "index.html"), `<!doctype html>
      <main data-composition-id="caption-split" data-start="0" data-duration="4">
        <section class="scene" data-visual-role="ui" data-motion="push-focus"><svg></svg></section>
        <div id="cap-1" class="caption clip" data-start="0" data-duration="2">one</div>
        <div id="cap-2" class="caption clip" data-start="2" data-duration="2">thought</div>
        <audio data-audio-role="narration" data-start="0" data-duration="4"></audio>
      </main>`);

    const result = auditComposition(dir);
    assert.equal(result.findings.some((item) => item.code === "caption-source-drift"), false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("audit detects drift between caption timing JSON and rendered captions", () => {
  const dir = project();
  try {
    writeApprovedDocs(dir);
    writeFileSync(join(dir, "assets", "subs.json"), JSON.stringify([
      { start: 0, end: 2, text: "approved one" },
      { start: 2, end: 4, text: "approved two" },
    ]));
    writeFileSync(join(dir, "index.html"), `<!doctype html>
      <main data-composition-id="drift" data-start="0" data-duration="4">
        <section class="scene" data-visual-role="ui" data-motion="push-focus"><svg></svg></section>
        <div id="cap-1" class="caption clip" data-start="0" data-duration="2">approved one</div>
        <div id="cap-2" class="caption clip" data-start="2" data-duration="2">changed copy</div>
        <audio class="clip" data-start="0" data-duration="4"></audio>
      </main>`);

    const result = auditComposition(dir);
    assert.ok(result.findings.some((item) => item.code === "caption-source-drift"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI strict mode exits non-zero and emits machine-readable findings", () => {
  const dir = project();
  try {
    writeFileSync(join(dir, "index.html"), `<div data-composition-id="bad" data-duration="20">[REPLACE]</div>`);
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("../bin/hara-video.mjs", import.meta.url)),
      "audit",
      dir,
      "--strict",
      "--json",
    ], { encoding: "utf8" });

    assert.equal(result.status, 1, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.pass, false);
    assert.ok(report.findings.some((item) => item.code === "unresolved-placeholders"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("audit bounds generated media floods before external probing can become unbounded", () => {
  const dir = project();
  try {
    writeApprovedDocs(dir);
    writeFileSync(join(dir, "index.html"), `<main data-composition-id="flood" data-duration="1">
      ${Array.from({ length: 2_001 }, (_, index) => `<audio id="a-${index}" data-duration="1"></audio>`).join("\n")}
    </main>`);

    const result = auditComposition(dir);
    assert.ok(result.findings.some((item) => item.code === "too-many-media-elements"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("init scaffolds the designer, script, storyboard, composition, and asset lanes", () => {
  const dir = mkdtempSync(join(tmpdir(), "hara-video-init-"));
  const output = join(dir, "project");
  try {
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("../bin/hara-video.mjs", import.meta.url)),
      "init",
      "koubo",
      output,
    ], { encoding: "utf8" });

    assert.equal(result.status, 0, result.stderr);
    for (const name of ["DESIGN.md", "SCRIPT.md", "STORYBOARD.md", "index.html"]) {
      assert.equal(existsSync(join(output, name)), true, name);
    }
    assert.match(result.stdout, /video designer/);
    for (const lane of ["audio", "images", "video"]) {
      assert.equal(existsSync(join(output, "assets", lane)), true, lane);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("all official seeds use deterministic Noto CJK families instead of undeclared host fonts", () => {
  for (const name of ["koubo-vertical.html", "promo-vertical.html", "kepu-horizontal.html"]) {
    const html = readFileSync(new URL(`../skills/video/references/templates/${name}`, import.meta.url), "utf8");
    assert.match(html, /"Noto Sans SC",sans-serif/, name);
    assert.doesNotMatch(html, /PingFang SC|Source Han (?:Sans|Serif) SC|Songti SC/, name);
    for (const visual of html.matchAll(/<[^>]+\bdata-visual-role=["'][^"']+["'][^>]*>/g)) {
      assert.match(visual[0], /\bdata-beat-id=["'][^"']+["']/, `${name}: every primary visual maps to a storyboard beat`);
    }
  }
});

test("init rejects an unknown seed instead of silently treating a second argument as something else", () => {
  const dir = mkdtempSync(join(tmpdir(), "hara-video-init-input-"));
  try {
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("../bin/hara-video.mjs", import.meta.url)),
      "init",
      "unknown",
      join(dir, "project"),
    ], { encoding: "utf8" });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Unknown seed 'unknown'/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
