#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_COMPOSITION_BYTES = 8 * 1024 * 1024;
const MAX_SUPPORT_FILE_BYTES = 2 * 1024 * 1024;
const MAX_HTML_ELEMENTS = 50_000;
const MAX_MEDIA_ELEMENTS = 2_000;
const MAX_AUDIO_PROBES = 16;
const AUDIO_PROBE_TOTAL_MS = 15_000;
const REQUIRED_PROJECT_FILES = ["DESIGN.md", "SCRIPT.md", "STORYBOARD.md"];
const VISUAL_TAGS = new Set(["img", "video", "svg", "canvas", "iframe"]);

function boundedRead(path, maxBytes) {
  const info = statSync(path);
  if (!info.isFile()) throw new Error(`not a regular file: ${path}`);
  if (info.size > maxBytes) throw new Error(`file is too large to audit safely (${info.size} bytes; maximum ${maxBytes}): ${path}`);
  return readFileSync(path, "utf8");
}

function resolveAuditInput(input) {
  const requested = resolve(input || ".");
  if (!existsSync(requested)) throw new Error(`no such file or directory: ${requested}`);
  const canonical = realpathSync(requested);
  const info = lstatSync(canonical);
  if (info.isDirectory()) {
    const htmlPath = join(canonical, "index.html");
    if (!existsSync(htmlPath)) throw new Error(`project has no index.html: ${canonical}`);
    return { htmlPath, projectDir: canonical, projectMode: true };
  }
  if (!info.isFile()) throw new Error(`not a regular file or project directory: ${canonical}`);
  if (extname(canonical).toLowerCase() !== ".html") throw new Error(`composition must be an HTML file: ${canonical}`);
  return { htmlPath: canonical, projectDir: dirname(canonical), projectMode: false };
}

function parseAttrs(source) {
  const attrs = {};
  const pattern = /([:@\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    attrs[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }
  return attrs;
}

function parseTags(html) {
  const tags = [];
  let truncated = false;
  const pattern = /<([a-z][\w:-]*)\b([^>]*)>/gi;
  for (const match of html.matchAll(pattern)) {
    if (tags.length >= MAX_HTML_ELEMENTS) {
      truncated = true;
      break;
    }
    tags.push({ tag: match[1].toLowerCase(), attrs: parseAttrs(match[2]), index: match.index ?? 0 });
  }
  return { tags, truncated };
}

function classes(tag) {
  return String(tag.attrs.class ?? "").split(/\s+/).filter(Boolean);
}

function hasClassLike(tag, pattern) {
  return classes(tag).some((name) => pattern.test(name));
}

function finiteNumber(value) {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function endOf(tag) {
  const start = finiteNumber(tag.attrs["data-start"]) ?? 0;
  const duration = finiteNumber(tag.attrs["data-duration"]);
  return duration === null ? null : start + duration;
}

function maxFinite(values) {
  const finite = values.filter((value) => Number.isFinite(value));
  return finite.length ? Math.max(...finite) : null;
}

function stripHtml(value) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, "")
    .trim();
}

function captionTexts(html, captionTags) {
  return captionTags.map((tag) => {
    const id = tag.attrs.id ? `#${tag.attrs.id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}` : null;
    if (id) {
      const exact = new RegExp(`<${tag.tag}\\b[^>]*id=["']${id.slice(1)}["'][^>]*>([\\s\\S]*?)<\\/${tag.tag}>`, "i").exec(html);
      if (exact) return stripHtml(exact[1]);
    }
    const tail = html.slice(tag.index);
    const generic = /^<[^>]+>([\s\S]*?)<\/[^>]+>/i.exec(tail);
    return generic ? stripHtml(generic[1]) : "";
  });
}

function localAssetPath(src, htmlPath) {
  if (!src || /^(?:https?:|data:|blob:|javascript:|#)/i.test(src)) return null;
  const clean = src.split(/[?#]/, 1)[0];
  return resolve(dirname(htmlPath), clean);
}

function audioRole(tag) {
  const explicit = String(tag.attrs["data-audio-role"] ?? "").trim().toLowerCase();
  if (explicit) return explicit;
  const label = [
    tag.attrs.id,
    tag.attrs.class,
    tag.attrs.src,
    tag.attrs["data-name"],
  ].filter(Boolean).join(" ").toLowerCase();
  if (/(?:voice|narrat|speech|dialog|tts|口播|旁白)/i.test(label)) return "narration";
  if (/(?:bgm|music|score|sfx|sound|音乐|音效)/i.test(label)) return "music";
  return "unknown";
}

function ffprobeDuration(path, timeoutMs) {
  if (timeoutMs <= 0) return null;
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    path,
  ], { encoding: "utf8", timeout: Math.min(3_000, timeoutMs) });
  if (result.status !== 0) return null;
  const duration = Number(result.stdout.trim());
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function timelineDuration(html) {
  const values = [];
  const patterns = [
    /\.set\(\s*\{\s*\}\s*,\s*\{\s*\}\s*,\s*(\d+(?:\.\d+)?)\s*\)/g,
    /duration\s*:\s*(\d+(?:\.\d+)?)\s*[,}]/g,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) values.push(Number(match[1]));
  }
  return maxFinite(values);
}

function finding(severity, code, message, fix) {
  return { severity, code, message, fix };
}

function readCaptionSource(projectDir) {
  const candidates = [
    join(projectDir, "assets", "subs.json"),
    join(projectDir, "assets", "captions.json"),
    join(projectDir, "subs.json"),
    join(projectDir, "captions.json"),
  ];
  const path = candidates.find((candidate) => existsSync(candidate));
  if (!path) return null;
  try {
    const parsed = JSON.parse(boundedRead(path, MAX_SUPPORT_FILE_BYTES));
    const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.segments) ? parsed.segments : null;
    if (!entries) return { path, error: "expected an array or { segments: [...] }" };
    return {
      path,
      entries: entries
        .filter((entry) => entry && typeof entry === "object")
        .map((entry) => ({
          text: stripHtml(String(entry.text ?? entry.word ?? "")),
          start: finiteNumber(entry.start),
          end: finiteNumber(entry.end),
        })),
    };
  } catch (error) {
    return { path, error: error instanceof Error ? error.message : String(error) };
  }
}

export function auditComposition(input = ".", options = {}) {
  const { htmlPath, projectDir, projectMode } = resolveAuditInput(input);
  const html = boundedRead(htmlPath, MAX_COMPOSITION_BYTES);
  const parsedTags = parseTags(html);
  const tags = parsedTags.tags;
  const findings = [];
  if (parsedTags.truncated) {
    findings.push(finding(
      "error",
      "too-many-html-elements",
      `The composition exceeds the ${MAX_HTML_ELEMENTS}-element audit limit.`,
      "Split or simplify the composition; do not feed generated element floods into preview/render tooling.",
    ));
  }
  const root = tags.find((tag) => Object.hasOwn(tag.attrs, "data-composition-id"));
  if (!root) {
    findings.push(finding("error", "missing-composition-root", "No element declares data-composition-id.", "Keep exactly one composition root with width, height, start, and duration metadata."));
  }

  const roots = tags.filter((tag) => Object.hasOwn(tag.attrs, "data-composition-id"));
  if (roots.length > 1) {
    findings.push(finding("error", "multiple-composition-roots", `${roots.length} composition roots were found.`, "Keep one root composition per HTML entry."));
  }

  const clipTags = tags.filter((tag) => hasClassLike(tag, /^clip$/i) || Object.hasOwn(tag.attrs, "data-start") || Object.hasOwn(tag.attrs, "data-duration"));
  const captionTags = tags.filter((tag) =>
    hasClassLike(tag, /(?:^|[-_])(?:caption|subtitle|sub)(?:$|[-_])/i)
    || /^(?:cap|caption|subtitle|sub)[-_]?\d*/i.test(String(tag.attrs.id ?? "")),
  );
  const declaredVisualTags = tags.filter((tag) => Object.hasOwn(tag.attrs, "data-visual-role"));
  const mediaVisualTags = tags.filter((tag) =>
    VISUAL_TAGS.has(tag.tag)
    || hasClassLike(tag, /(?:^|[-_])(?:visual|diagram|chart|mockup|footage|broll)(?:$|[-_])/i),
  );
  const sceneTags = tags.filter((tag) =>
    ["section", "article"].includes(tag.tag)
    || hasClassLike(tag, /(?:^|[-_])(?:scene|beat|card|page|chapter)(?:$|[-_])/i),
  );
  const persistentAmbientTags = tags.filter((tag) =>
    hasClassLike(tag, /(?:bg|background|ambient|particle|orb|glow|pulse|drift)/i)
    || /(?:bg|background|ambient|particle|orb|glow|pulse|drift)/i.test(String(tag.attrs.id ?? "")),
  );
  const motionRecipes = new Set(
    tags.flatMap((tag) => String(tag.attrs["data-motion"] ?? "").split(","))
      .map((value) => value.trim())
      .filter(Boolean),
  );

  const declaredDuration = finiteNumber(root?.attrs["data-duration"]);
  const clipEnd = maxFinite(clipTags.map(endOf));
  const captionEnd = maxFinite(captionTags.map(endOf));
  const duration = declaredDuration ?? maxFinite([clipEnd, timelineDuration(html)]) ?? 0;
  // A scene annotation is the inspectable beat contract. Do not inflate density by counting every nested
  // SVG/canvas/image inside that same beat. Legacy compositions without annotations fall back to media tags.
  const visualBeatCount = declaredVisualTags.length || mediaVisualTags.length;
  const nonAudioClipCount = clipTags.filter((tag) => tag.tag !== "audio").length;
  const captionShare = nonAudioClipCount ? captionTags.length / nonAudioClipCount : 0;

  if (html.includes("[REPLACE]")) {
    findings.push(finding("error", "unresolved-placeholders", "The composition still contains [REPLACE] placeholders.", "Resolve every placeholder before preview approval or rendering."));
  }

  const missingAssets = [];
  const audioObservations = [];
  const allMediaTags = tags.filter((candidate) => ["audio", "img", "video", "source"].includes(candidate.tag));
  if (allMediaTags.length > MAX_MEDIA_ELEMENTS) {
    findings.push(finding(
      "error",
      "too-many-media-elements",
      `${allMediaTags.length} media elements exceed the ${MAX_MEDIA_ELEMENTS}-element audit limit.`,
      "Consolidate generated media layers or split the project into bounded compositions.",
    ));
  }
  const probeDeadline = Date.now() + AUDIO_PROBE_TOTAL_MS;
  let audioProbes = 0;
  for (const tag of allMediaTags.slice(0, MAX_MEDIA_ELEMENTS)) {
    const path = localAssetPath(tag.attrs.src, htmlPath);
    let observedAudioEnd = tag.tag === "audio" ? endOf(tag) : null;
    if (path && !existsSync(path)) {
      missingAssets.push(tag.attrs.src);
    } else if (path && tag.tag === "audio" && audioProbes < MAX_AUDIO_PROBES) {
      audioProbes += 1;
      const probed = ffprobeDuration(path, probeDeadline - Date.now());
      if (probed !== null) {
        const start = finiteNumber(tag.attrs["data-start"]) ?? 0;
        observedAudioEnd = start + probed;
        const declared = finiteNumber(tag.attrs["data-duration"]);
        if (declared !== null && Math.abs(declared - probed) > 0.5) {
          findings.push(finding(
            "warning",
            "audio-duration-drift",
            `${tag.attrs.src} is ${probed.toFixed(2)}s but its data-duration is ${declared.toFixed(2)}s.`,
            "Use the probed media duration as the timeline source of truth.",
          ));
        }
      }
    }
    if (tag.tag === "audio") audioObservations.push({ tag, end: observedAudioEnd, role: audioRole(tag) });
  }
  if (missingAssets.length) {
    findings.push(finding(
      "error",
      "missing-assets",
      `Referenced local assets are missing: ${[...new Set(missingAssets)].join(", ")}.`,
      "Create or copy every referenced asset before preview and render.",
    ));
  }

  let narrationTracks = audioObservations.filter((track) => track.role === "narration");
  if (!narrationTracks.length) {
    const nonMusic = audioObservations.filter((track) => track.role !== "music");
    if (nonMusic.length === 1) narrationTracks = nonMusic;
    else if (audioObservations.length === 1) narrationTracks = audioObservations;
  }
  const audioEnd = maxFinite(narrationTracks.map((track) => track.end));
  if (captionTags.length && audioObservations.length > 1 && !narrationTracks.length) {
    findings.push(finding(
      "warning",
      "ambiguous-narration-track",
      "Multiple audio tracks exist, but none is identifiable as narration.",
      "Set data-audio-role=\"narration\" on the voice track and data-audio-role=\"music\" or \"sfx\" on supporting audio.",
    ));
  }
  if (captionEnd !== null && audioEnd !== null && captionEnd > audioEnd + 0.5) {
    findings.push(finding(
      "error",
      "caption-audio-overrun",
      `Captions continue to ${captionEnd.toFixed(2)}s, but narration ends at ${audioEnd.toFixed(2)}s.`,
      "Regenerate timings from the final narration, then derive captions and composition duration from the same source.",
    ));
  }
  if (duration && audioEnd !== null && duration > audioEnd + 2 && captionEnd !== null && captionEnd > audioEnd + 0.5) {
    findings.push(finding(
      "warning",
      "silent-tail",
      `The ${duration.toFixed(2)}s composition has a ${(duration - audioEnd).toFixed(2)}s tail after narration.`,
      "Shorten the composition or design an intentional music-only outro and document it in STORYBOARD.md.",
    ));
  }

  if (duration >= 10 && captionTags.length >= 4 && visualBeatCount === 0) {
    findings.push(finding(
      "error",
      "subtitle-only",
      `${captionTags.length} caption beats occupy a ${duration.toFixed(1)}s video with no footage, image, diagram, UI, canvas, SVG, or declared visual role.`,
      "Design a primary visual for every substantive beat; captions are an accessibility/emphasis layer, not the scene.",
    ));
  }
  if (captionTags.length >= 6 && captionShare >= 0.8) {
    findings.push(finding(
      "warning",
      "caption-dominance",
      `${Math.round(captionShare * 100)}% of timed non-audio elements are captions.`,
      "Add scene-level visual clips and transitions so the edit is not one repeated subtitle recipe.",
    ));
  }

  if (duration >= 15) {
    const minimumVisualBeats = Math.max(3, Math.ceil(duration / 10));
    if (visualBeatCount < minimumVisualBeats) {
      findings.push(finding(
        "warning",
        "low-visual-density",
        `${visualBeatCount} visual beat(s) were declared; a ${duration.toFixed(1)}s composition needs at least ${minimumVisualBeats} inspectable visual changes.`,
        "Add data-visual-role to each planned primary visual and vary footage, imagery, diagrams, UI, data, or kinetic graphics.",
      ));
    }
    if (motionRecipes.size < 2) {
      findings.push(finding(
        "warning",
        "low-motion-variety",
        `${motionRecipes.size} named motion recipe(s) were found.`,
        "Declare at least two purposeful data-motion recipes (for example reveal, parallax, push, mask, count-up) and drive them from the deterministic timeline.",
      ));
    }
  }
  if (projectMode && duration >= 10 && !declaredVisualTags.length && mediaVisualTags.length) {
    findings.push(finding(
      "warning",
      "unmapped-visual-beats",
      "Visual media exists, but no beat declares data-visual-role.",
      "Annotate the primary visual for each STORYBOARD.md beat so coverage is inspectable instead of inferred from raw element count.",
    ));
  }

  if (persistentAmbientTags.length) {
    const scriptText = html.slice(html.search(/<script\b/i));
    const unanimated = persistentAmbientTags.filter((tag) => {
      const selectors = [
        tag.attrs.id ? `#${tag.attrs.id}` : "",
        ...classes(tag).map((name) => `.${name}`),
      ].filter(Boolean);
      return selectors.length && !selectors.some((selector) => scriptText.includes(selector));
    });
    if (unanimated.length === persistentAmbientTags.length && !/@keyframes\b/.test(html)) {
      findings.push(finding(
        "warning",
        "static-ambient-layer",
        "Ambient/background layers are present but none are driven by the timeline or CSS keyframes.",
        "Add subtle deterministic drift, parallax, light, texture, or depth motion rather than leaving a static gradient.",
      ));
    }
  }

  const source = readCaptionSource(projectDir);
  if (source?.error) {
    findings.push(finding("warning", "invalid-caption-source", `${source.path}: ${source.error}.`, "Keep caption timing JSON valid and bounded."));
  } else if (source?.entries?.length && captionTags.length) {
    const rendered = captionTexts(html, captionTags);
    const sourceTexts = source.entries.map((entry) => entry.text);
    // Caption line-breaking and emphasis may legitimately merge/split approved timing segments. Compare the
    // ordered normalized text stream so formatting changes pass while omitted/reordered copy still fails.
    const same = rendered.join("") === sourceTexts.join("");
    if (!same) {
      findings.push(finding(
        "warning",
        "caption-source-drift",
        `Rendered captions no longer match ${source.path}.`,
        "Generate the HTML caption layer from the approved timing JSON instead of maintaining two divergent copies.",
      ));
    }
  }

  if (projectMode) {
    const missingDocs = REQUIRED_PROJECT_FILES.filter((name) => !existsSync(join(projectDir, name)));
    if (missingDocs.length) {
      findings.push(finding(
        "error",
        "missing-design-artifacts",
        `Project is missing ${missingDocs.join(", ")}.`,
        "Run the video-designer stages first and persist the approved design, script, and shot-by-shot storyboard.",
      ));
    }
    for (const name of REQUIRED_PROJECT_FILES.filter((file) => !missingDocs.includes(file))) {
      const path = join(projectDir, name);
      try {
        const content = boundedRead(path, MAX_SUPPORT_FILE_BYTES);
        if (content.includes("[REPLACE]")) {
          findings.push(finding("error", "unfinished-design-artifact", `${name} still contains [REPLACE] placeholders.`, `Complete and approve ${name} before composition.`));
        }
      } catch (error) {
        findings.push(finding("error", "invalid-design-artifact", `${name}: ${error instanceof Error ? error.message : String(error)}.`, "Replace it with a bounded regular Markdown file."));
      }
    }
  }

  if (!sceneTags.length && duration >= 10) {
    findings.push(finding(
      "warning",
      "no-scene-structure",
      "No inspectable scene/beat structure was found.",
      "Group the edit into named scene or beat elements aligned with STORYBOARD.md.",
    ));
  }

  const errors = findings.filter((item) => item.severity === "error").length;
  const warnings = findings.filter((item) => item.severity === "warning").length;
  const score = Math.max(0, 100 - errors * 25 - warnings * 8);
  const result = {
    version: 1,
    input: realpathSync(htmlPath),
    projectDir,
    projectMode,
    score,
    pass: errors === 0 && (!options.strict || warnings === 0),
    findings,
    metrics: {
      duration,
      captions: captionTags.length,
      scenes: sceneTags.length,
      visualBeats: visualBeatCount,
      motionRecipes: motionRecipes.size,
      audioEnd,
      captionEnd,
    },
  };
  return result;
}

export function formatAudit(result) {
  const errors = result.findings.filter((item) => item.severity === "error").length;
  const warnings = result.findings.filter((item) => item.severity === "warning").length;
  const lines = [
    `Video quality audit: ${result.input}`,
    `Score ${result.score}/100 · ${errors} error(s) · ${warnings} warning(s)`,
    `Metrics: ${result.metrics.duration.toFixed(2)}s · ${result.metrics.captions} captions · ${result.metrics.scenes} scenes · ${result.metrics.visualBeats} visual beats · ${result.metrics.motionRecipes} motion recipes`,
  ];
  for (const item of result.findings) {
    const mark = item.severity === "error" ? "✗" : "⚠";
    lines.push(`  ${mark} [${item.code}] ${item.message}`);
    lines.push(`    Fix: ${item.fix}`);
  }
  if (!result.findings.length) lines.push("  ✓ Design, timing, assets, and composition structure passed.");
  lines.push(result.pass ? "Result: PASS" : "Result: FAIL");
  return lines.join("\n");
}

function runCli(argv) {
  const json = argv.includes("--json");
  const strict = argv.includes("--strict");
  const input = argv.find((value) => !value.startsWith("-")) ?? ".";
  try {
    const result = auditComposition(input, { strict });
    process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${formatAudit(result)}\n`);
    process.exitCode = result.pass ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (json) process.stdout.write(`${JSON.stringify({ version: 1, pass: false, error: message }, null, 2)}\n`);
    else process.stderr.write(`hara-video audit: ${message}\n`);
    process.exitCode = 2;
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli(process.argv.slice(2));
}
