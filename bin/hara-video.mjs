#!/usr/bin/env node
// hara-video — local helper for the video plugin. Mirrors hara-design's proven install machinery:
// the bundled skill (skills/video/) is exposed to a host CLI by symlink (default) or copy.
//   install [--claude|--codex]   link skills/video into ~/.claude/skills or ~/.agents/skills
//   uninstall [--claude|--codex] undo (only ever touches our own link/copy)
//   doctor                       check the engine chain (node / ffmpeg / hyperframes / chrome dl)
//   init [koubo|promo|kepu] [dir]  scaffold a video project from a seed (copies a template + assets/ dir)
//   srt <file.srt>               convert an SRT into HyperFrames caption JSON (stdout)
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { existsSync, lstatSync, readlinkSync, mkdirSync, symlinkSync, rmSync, cpSync, realpathSync, readFileSync, openSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { isSupportedNode } from "../scripts/node-version.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, ...rest] = process.argv.slice(2);
function flag(name) { return rest.includes(`--${name}`); }
function positional() { return rest.find((a) => !a.startsWith("-")); }
function argVal(names) { for (const n of names) { const i = rest.indexOf(n); if (i >= 0 && rest[i + 1]) return rest[i + 1]; } return null; }

const skillSrc = join(root, "skills", "video");
function claudeSkillDir() { return join(homedir(), ".claude", "skills", "video"); }
function codexSkillDir() { return join(homedir(), ".agents", "skills", "video"); }

// Is `p` a symlink that already points at our source skill dir? (idempotency check)
function pointsAtSource(p) {
  try {
    if (!lstatSync(p).isSymbolicLink()) return false;
    return realpathSync(p) === realpathSync(skillSrc);
  } catch { return false; }
}

function isBrokenSymlink(p) {
  try { lstatSync(p); return !existsSync(p); } catch { return false; }
}

function isBrokenOurSymlink(p) {
  // a dangling symlink we can't resolve — treat as ours only if its target string is our source
  try { return lstatSync(p).isSymbolicLink() && readlinkSync(p) === skillSrc; } catch { return false; }
}

// Check the `hara-video` command itself is reachable on PATH; print a hint if not.
function checkOnPath() {
  try { execFileSync("bash", ["-c", "command -v hara-video"], { stdio: "ignore" }); return true; }
  catch { return false; }
}

function printNextSteps(dest, label) {
  console.log("");
  console.log(`Next steps (${label}):`);
  if (label === "Claude Code") {
    console.log(`  • Restart Claude Code (or start a new session) so it picks up the new skill.`);
    console.log(`  • Then ask it to "video a landing page…", or invoke /video.`);
  } else {
    console.log(`  • Start a new Codex session so it discovers the skill under ~/.agents/skills/.`);
    console.log(`  • Then ask it to "video a landing page…", or reference $video.`);
  }
  console.log(`  • The 'video' skill launches preview/export via the 'hara-video' command on your PATH.`);
  if (!checkOnPath()) {
    console.log("");
    console.log(`  ⚠ 'hara-video' is not on your PATH yet. Install it globally so the skill can call it:`);
    console.log(`      npm i -g @nanhara/hara-video`);
  }
}

function installSkillInto(dest, label) {
  if (!existsSync(skillSrc)) {
    console.error(`Cannot find the bundled skill at ${skillSrc} — is this a complete install of @nanhara/hara-video?`);
    process.exit(1);
  }
  const useCopy = flag("copy");
  const force = flag("force");

  // Already correctly linked → nothing to do (idempotent).
  if (!useCopy && pointsAtSource(dest)) {
    console.log(`✓ ${label}: already linked  (${dest} → ${skillSrc})`);
    return printNextSteps(dest, label);
  }

  // Something is already at `dest`. NEVER blind-delete a user's files.
  if (existsSync(dest) || isBrokenSymlink(dest)) {
    const isOurs = pointsAtSource(dest) || isBrokenOurSymlink(dest);
    if (!force && !isOurs) {
      console.error(`✗ ${label}: ${dest} already exists and is not managed by hara-video.`);
      console.error(`  Refusing to overwrite. Re-run with --force to replace it, or move it aside first.`);
      process.exit(1);
    }
    // Ours (stale link) or --force: safe to remove and recreate.
    try { rmSync(dest, { recursive: true, force: true }); }
    catch (e) { console.error(`✗ ${label}: could not remove existing ${dest}: ${e.message}`); process.exit(1); }
  }

  mkdirSync(dirname(dest), { recursive: true });
  try {
    if (useCopy) {
      cpSync(skillSrc, dest, { recursive: true, dereference: true });
      console.log(`✓ ${label}: copied skill → ${dest}`);
    } else {
      symlinkSync(skillSrc, dest, "dir");
      console.log(`✓ ${label}: linked skill  ${dest} → ${skillSrc}`);
    }
  } catch (e) {
    console.error(`✗ ${label}: install failed: ${e.message}`);
    process.exit(1);
  }
  printNextSteps(dest, label);
}

function uninstallSkillFrom(dest, label) {
  if (!existsSync(dest) && !isBrokenSymlink(dest)) {
    console.log(`${label}: nothing installed at ${dest}.`);
    return;
  }
  const ours = pointsAtSource(dest) || isBrokenOurSymlink(dest);
  if (!ours && !flag("force")) {
    console.error(`✗ ${label}: ${dest} is not a hara-video link (looks like your own files). Not removing.`);
    console.error(`  If you really want it gone, remove it yourself or re-run with --force.`);
    process.exit(1);
  }
  try { rmSync(dest, { recursive: true, force: true }); console.log(`✓ ${label}: removed ${dest}`); }
  catch (e) { console.error(`✗ ${label}: could not remove ${dest}: ${e.message}`); process.exit(1); }
}


function usage() {
  console.log(`hara-video — local helper for the video plugin

  hara-video install    [--claude|--codex]  install the video skill into a CLI
                                            (no flag) → register as a hara plugin
                                            --claude  → link skills/video → ~/.claude/skills/video
                                            --codex   → link skills/video → ~/.agents/skills/video
                          add --copy to copy instead of symlink · --force to replace an existing dir
  hara-video uninstall  [--claude|--codex]  undo the matching install
  hara-video init [koubo|promo|kepu] [dir]  scaffold a project from a seed (default: koubo → ./video)
  hara-video edit [dir]                     open the live web preview for editing (background server +
                                            browser; never blocks). Extra flags pass to hyperframes preview.
  hara-video image "<prompt>" [-o out.png]  generate a still image via a pluggable backend
                                            (--cmd / HARA_VIDEO_IMAGE_CMD template; auto-detects z-image)
  hara-video tts   "<text>"   [-o out.wav]  generate voice via a pluggable backend
                                            (HARA_VIDEO_TTS_CMD; falls back to local hyperframes tts)
  hara-video doctor                         check Node >=22 / ffmpeg / hyperframes availability
  hara-video srt <file.srt> [--words]       SRT → HyperFrames caption JSON (stdout)

Engine: HyperFrames (Apache-2.0, npx hyperframes). The skill drives it; this helper just installs/checks.`);
}

if (cmd === "install") {
  if (flag("claude")) installSkillInto(claudeSkillDir(), "Claude Code");
  else if (flag("codex")) installSkillInto(codexSkillDir(), "Codex");
  else {
    const r = spawnSync("hara", ["plugin", "add", `file:${root}`], { stdio: "inherit" });
    if (r.error) console.error("Could not run `hara` — install it (npm i -g @nanhara/hara) or use --claude / --codex.");
  }
} else if (cmd === "uninstall") {
  if (flag("claude")) uninstallSkillFrom(claudeSkillDir(), "Claude Code");
  else if (flag("codex")) uninstallSkillFrom(codexSkillDir(), "Codex");
  else console.log("For hara: `hara plugin remove video`. For others: --claude / --codex.");
} else if (cmd === "doctor") {
  const check = (name, cmd, args) => {
    try { execFileSync(cmd, args, { stdio: "ignore", timeout: 15000 }); console.log(`  ✓ ${name}`); return true; }
    catch { console.log(`  ✗ ${name} — not found`); return false; }
  };
  console.log("hara-video doctor:");
  const nodeVersion = process.versions.node;
  const nodeOk = isSupportedNode(nodeVersion);
  console.log(nodeOk
    ? `  ✓ Node v${nodeVersion} (>=22)`
    : `  ✗ Node v${nodeVersion} — Node >=22 is required`);
  const ff = check("ffmpeg", "ffmpeg", ["-version"]);
  const hf = check("hyperframes (npx)", "npx", ["--yes", "hyperframes", "--version"]);
  if (!nodeOk) console.log("    install: https://nodejs.org/ or use a version manager such as nvm");
  if (!ff) console.log("    install: brew install ffmpeg");
  if (!hf) console.log("    hyperframes will be fetched on first use (npx hyperframes init)");
  console.log(nodeOk && ff && hf ? "Ready." : "Fix the ✗ items above, then re-run.");
} else if (cmd === "init") {
  // Scaffold a ready-to-render HyperFrames project from one of our seeds. Fill the [REPLACE] marks +
  // drop assets in — no blank-file starts, no manual cp of templates.
  const seeds = { koubo: "koubo-vertical.html", promo: "promo-vertical.html", kepu: "kepu-horizontal.html" };
  const which = positional() && seeds[positional()] ? positional() : "koubo";
  const dirArg = rest.find((a) => !a.startsWith("--") && !seeds[a]);
  const dir = resolve(dirArg || "video");
  if (existsSync(join(dir, "index.html")) && !flag("force")) {
    console.error(`✗ ${join(dir, "index.html")} already exists — pass --force to overwrite, or choose another dir.`);
    process.exit(1);
  }
  mkdirSync(join(dir, "assets"), { recursive: true });
  cpSync(join(root, "skills", "video", "references", "templates", seeds[which]), join(dir, "index.html"));
  console.log(`✓ scaffolded a "${which}" project → ${dir}`);
  console.log(`  1. drop your voice.wav / bg image / bgm into ${join(dir, "assets")}/`);
  console.log(`  2. edit index.html — replace every [REPLACE], bind scenes to the timeline`);
  console.log(`  3. npx hyperframes lint ${dir} · preview ${dir} · render ${dir} --output out.mp4`);
  console.log(`  (in an agent: just ask it to "make a ${which} video about …" — the video skill drives all of this)`);
} else if (cmd === "srt") {
  const f = positional();
  if (!f) { console.error("usage: hara-video srt <file.srt> [--words]"); process.exit(2); }
  const args = [join(root, "scripts", "srt-to-captions.mjs"), f];
  if (flag("words")) args.push("--words");
  const r = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (r.error) {
    console.error(`hara-video srt: could not start Node — ${r.error.message}`);
    process.exit(1);
  }
  process.exit(r.status ?? 1);
} else if (cmd === "edit" || cmd === "preview") {
  // Open the live web preview for editing. `hyperframes preview` is a LONG-RUNNING server that never
  // exits — running it in the FOREGROUND is the classic "hara hangs during video generation". So we spawn
  // it DETACHED (survives this process, never blocks the agent), let it open the browser itself, and tail
  // its log briefly to surface the URL. Extra flags (--port, --no-open, --browser-path) pass through.
  const dir = resolve(positional() || ".");
  if (!existsSync(dir)) { console.error(`hara-video edit: no such directory: ${dir}`); process.exit(2); }
  (async () => {
    const logPath = join(tmpdir(), `hara-video-preview-${process.pid}.log`);
    const out = openSync(logPath, "a");
    const extra = rest.filter((a) => a.startsWith("--"));
    const child = spawn("npx", ["--yes", "hyperframes", "preview", ...extra], { cwd: dir, detached: true, stdio: ["ignore", out, out] });
    child.on("error", (e) => { console.error(`hara-video edit: could not start preview — ${e.message}`); process.exit(1); });
    child.unref();
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let url = "";
    for (let i = 0; i < 20 && !url; i++) {
      await sleep(500);
      try { const m = readFileSync(logPath, "utf8").match(/https?:\/\/[^\s)"']+/); if (m) url = m[0]; } catch { /* not written yet */ }
    }
    console.log(`▶ preview running in the background (pid ${child.pid})${url ? ` — ${url}` : " — starting (browser will open; first run fetches the engine)"}`);
    console.log(`  Edit the composition HTML; the preview hot-reloads. Do NOT run 'hyperframes preview' in the foreground — it never returns.`);
    console.log(`  Precision edit: click an element in the browser, then read exactly what you clicked with:`);
    console.log(`      npx hyperframes preview --selection --json   (→ sourceFile · target · boundingBox · currentTime)`);
    console.log(`  Stop it: npx hyperframes preview --kill-all       ·   log: ${logPath}`);
    process.exit(0);
  })();
} else if (cmd === "image" || cmd === "tts") {
  // Pluggable generator: hara-video doesn't hardcode a vendor. The backend is a COMMAND TEMPLATE the user
  // supplies (a local model, an API-wrapping script, anything), with {prompt}/{out} placeholders that are
  // shell-quoted before substitution (data, never code — safe from injection). Resolution order:
  // --cmd flag → env var → auto-detected default → guidance. This keeps local + API both open, BYO.
  const isImg = cmd === "image";
  const prompt = positional();
  const outVal = argVal(["-o", "--out"]) || (isImg ? "image.png" : "voice.wav");
  const cmdFlag = argVal(["--cmd"]);
  const envVar = isImg ? "HARA_VIDEO_IMAGE_CMD" : "HARA_VIDEO_TTS_CMD";
  if (!prompt) { console.error(`usage: hara-video ${cmd} "<${isImg ? "prompt" : "text"}>" [-o ${outVal}] [--cmd "<template>"]`); process.exit(2); }
  // Auto-detect a sensible default only when nothing is configured.
  const onPath = (b) => { try { execFileSync("bash", ["-c", `command -v ${b}`], { stdio: "ignore" }); return true; } catch { return false; } };
  let tmpl = cmdFlag || process.env[envVar];
  if (!tmpl && isImg && onPath("z-image")) tmpl = `z-image {prompt} -o {out}`;
  if (!tmpl && !isImg && onPath("hyperframes")) tmpl = `hyperframes tts {prompt} -o {out}`;
  if (!tmpl) {
    console.error(`hara-video ${cmd}: no generator configured.
  Set a command template (any local model, API script, or tool — {prompt}/{out} are auto-quoted):
    export ${envVar}='${isImg ? "z-image {prompt} -o {out}" : "npx hyperframes tts {prompt} -o {out}"}'
  or pass one:  hara-video ${cmd} "..." --cmd '<template>'
  ${isImg ? "Examples — local codex-image: '~/.claude/skills/codex-image/scripts/gen-image.sh {prompt} {out}'; an API: your curl/script wrapper.\n  Local default (no key): npx hyperframes tts is for VOICE; for IMAGES install z-image or wire codex-image/an API." : "Local (no key): 'npx hyperframes tts {prompt} -o {out}'. API TTS (字节/Azure/ElevenLabs…): your script wrapper."}`);
    process.exit(2);
  }
  const q = (s) => "'" + String(s).replace(/'/g, "'\\''") + "'";
  const command = tmpl.replaceAll("{prompt}", q(prompt)).replaceAll("{text}", q(prompt)).replaceAll("{out}", q(resolve(outVal)));
  const r = spawnSync("bash", ["-c", command], { stdio: "inherit" });
  if ((r.status ?? 1) === 0 && existsSync(resolve(outVal))) { console.log(`✓ ${cmd} → ${outVal}`); process.exit(0); }
  console.error(`✗ ${cmd} failed (exit ${r.status ?? "?"})${existsSync(resolve(outVal)) ? "" : ` — no ${outVal} produced`}. Check the template: ${tmpl}`);
  process.exit(r.status ?? 1);
} else {
  usage();
}
