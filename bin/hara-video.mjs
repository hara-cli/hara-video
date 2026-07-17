#!/usr/bin/env node
// hara-video — local helper for the video plugin. Mirrors hara-design's proven install machinery:
// the bundled skills are exposed to a host CLI by symlink (default) or copy.
//   install [--claude|--codex]   link skills/* into ~/.claude/skills or ~/.agents/skills
//   uninstall [--claude|--codex] undo (only ever touches our own link/copy)
//   doctor                       check the engine chain (node / ffmpeg / hyperframes / chrome dl)
//   init [koubo|promo|kepu] [dir]  scaffold a video project from a seed (copies a template + assets/ dir)
//   audit [file|dir] [--strict]  reject subtitle-only, unsynced, or undesigned compositions
//   srt <file.srt>               convert an SRT into HyperFrames caption JSON (stdout)
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { existsSync, lstatSync, readlinkSync, mkdirSync, mkdtempSync, symlinkSync, rmSync, cpSync, realpathSync, readFileSync, openSync, renameSync, writeFileSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { isSupportedNode } from "../scripts/node-version.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, ...rest] = process.argv.slice(2);
function flag(name) { return rest.includes(`--${name}`); }
function positional() { return rest.find((a) => !a.startsWith("-")); }
function argVal(names) { for (const n of names) { const i = rest.indexOf(n); if (i >= 0 && rest[i + 1]) return rest[i + 1]; } return null; }

const managedCopyMarker = ".hara-video-managed.json";
const bundledSkills = ["video", "video-publish"].map((name) => ({
  name,
  source: join(root, "skills", name),
}));
function claudeSkillsDir() { return join(homedir(), ".claude", "skills"); }
function codexSkillsDir() { return join(homedir(), ".agents", "skills"); }

function selectedSkills() {
  const requested = argVal(["--skill"]);
  if (!requested) return bundledSkills;
  const selected = bundledSkills.filter(({ name }) => name === requested);
  if (!selected.length) {
    console.error(`Unknown skill '${requested}'. Choose: ${bundledSkills.map(({ name }) => name).join(", ")}.`);
    process.exit(2);
  }
  return selected;
}

function pathEntryExists(p) {
  try { lstatSync(p); return true; }
  catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

// Is `p` a symlink that already points at our source skill dir? (idempotency check)
function pointsAtSource(p, source) {
  try {
    if (!lstatSync(p).isSymbolicLink()) return false;
    return realpathSync(p) === realpathSync(source);
  } catch { return false; }
}

function isBrokenOurSymlink(p, source) {
  // a dangling symlink we can't resolve — treat as ours only if its target string is our source
  try { return lstatSync(p).isSymbolicLink() && readlinkSync(p) === source; } catch { return false; }
}

function isManagedCopy(p, skillName) {
  try {
    const info = lstatSync(p);
    if (!info.isDirectory() || info.isSymbolicLink()) return false;
    const marker = join(p, managedCopyMarker);
    const markerInfo = lstatSync(marker);
    if (!markerInfo.isFile() || markerInfo.isSymbolicLink() || markerInfo.size > 4096 || markerInfo.nlink > 1) return false;
    const parsed = JSON.parse(readFileSync(marker, "utf8"));
    return parsed?.manager === "@nanhara/hara-video" && parsed?.skill === skillName;
  } catch { return false; }
}

function isManagedEntry(dest, skill) {
  return pointsAtSource(dest, skill.source)
    || isBrokenOurSymlink(dest, skill.source)
    || isManagedCopy(dest, skill.name);
}

// Check the `hara-video` command itself is reachable on PATH; print a hint if not.
function checkOnPath() {
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM").split(";")
    : [""];
  return (process.env.PATH || "").split(delimiter).some((dir) =>
    dir && extensions.some((ext) => existsSync(join(dir, `hara-video${ext.toLowerCase()}`)) || existsSync(join(dir, `hara-video${ext.toUpperCase()}`))),
  );
}

function runtimeEnv() {
  const runtimeBin = dirname(process.execPath);
  const path = process.env.PATH ? `${runtimeBin}${delimiter}${process.env.PATH}` : runtimeBin;
  return { ...process.env, PATH: path };
}

function npxExecutable() {
  const local = join(dirname(process.execPath), process.platform === "win32" ? "npx.cmd" : "npx");
  return existsSync(local) ? local : (process.platform === "win32" ? "npx.cmd" : "npx");
}

function hyperFramesInvocation(args = []) {
  const configured = process.env.HARA_VIDEO_HYPERFRAMES_BIN?.trim();
  if (configured) return { command: configured, args };
  return {
    command: npxExecutable(),
    args: ["--yes", "hyperframes", ...args],
  };
}

function verifyProject(target) {
  const project = resolve(target || ".");
  if (!existsSync(project)) {
    console.error(`hara-video verify: no such project: ${project}`);
    return 2;
  }
  const hyperframes = (args) => hyperFramesInvocation(args);
  const steps = [
    {
      label: "video quality audit",
      command: process.execPath,
      args: [join(root, "scripts", "audit-composition.mjs"), project, "--strict"],
      timeout: 30_000,
    },
    {
      label: "HyperFrames lint",
      ...hyperframes(["lint", project]),
      timeout: 90_000,
    },
    {
      label: "HyperFrames runtime/layout/motion check",
      ...hyperframes(["check", "--strict", "--at-transitions", project]),
      timeout: 180_000,
    },
    {
      label: "HyperFrames snapshots",
      ...hyperframes(["snapshot", project]),
      timeout: 180_000,
    },
  ];
  for (const [index, step] of steps.entries()) {
    console.log(`\n[${index + 1}/${steps.length}] ${step.label}`);
    const result = spawnSync(step.command, step.args, {
      stdio: "inherit",
      env: runtimeEnv(),
      timeout: step.timeout,
    });
    if (result.error) {
      const timedOut = result.error.code === "ETIMEDOUT";
      console.error(`\n✗ verify stopped at ${step.label}: ${timedOut ? `timed out after ${Math.round(step.timeout / 1000)}s` : result.error.message}`);
      console.error("  Fix this stage once, then re-run `hara-video verify`. Do not skip ahead to preview or render.");
      return 1;
    }
    if ((result.status ?? 1) !== 0) {
      console.error(`\n✗ verify stopped at ${step.label} (exit ${result.status ?? "signal"}).`);
      console.error("  Fix the reported codes once, then re-run `hara-video verify`. If the same code remains after two repair passes, checkpoint and report the blocker instead of looping.");
      return result.status ?? 1;
    }
  }
  console.log(`\n✓ video verified — audit, lint, runtime/layout/motion, and snapshots all passed: ${project}`);
  return 0;
}

function printNextSteps(destRoot, label, skills) {
  console.log("");
  console.log(`Next steps (${label}):`);
  if (label === "Claude Code") {
    console.log(`  • Restart Claude Code (or start a new session) so it picks up the new skill.`);
    console.log(`  • Then ask it to "video a landing page…", or invoke /video.`);
  } else {
    console.log(`  • Start a new Codex session so it discovers the skill under ~/.agents/skills/.`);
    console.log(`  • Then ask it to create a video or publish an approved MP4, or reference $video / $video-publish.`);
  }
  console.log(`  • Installed: ${skills.map(({ name }) => name).join(", ")} under ${destRoot}.`);
  console.log(`  • The 'video' skill launches preview/export via the 'hara-video' command on your PATH; publication adapters remain private user configuration.`);
  if (!checkOnPath()) {
    console.log("");
    console.log(`  ⚠ 'hara-video' is not on your PATH yet. Install it globally so the skill can call it:`);
    console.log(`      npm i -g @nanhara/hara-video`);
  }
}

function installSkillsInto(destRoot, label) {
  const skills = selectedSkills();
  const missing = skills.filter(({ source }) => !existsSync(join(source, "SKILL.md")));
  if (missing.length) {
    console.error(`Cannot find bundled skill(s): ${missing.map(({ source }) => source).join(", ")} — is this a complete install of @nanhara/hara-video?`);
    process.exit(1);
  }
  const useCopy = flag("copy");
  const force = flag("force");
  const entries = skills.map((skill) => ({ ...skill, dest: join(destRoot, skill.name) }));
  const conflicts = entries.filter(({ dest, ...skill }) => pathEntryExists(dest) && !isManagedEntry(dest, skill));
  if (conflicts.length && !force) {
    for (const { dest } of conflicts) console.error(`✗ ${label}: ${dest} already exists and is not managed by hara-video.`);
    console.error(`  Nothing was changed. Move the conflicting skill aside, choose --skill <name>, or use --force to replace it.`);
    process.exit(1);
  }

  const unchanged = useCopy ? [] : entries.filter(({ dest, source }) => pointsAtSource(dest, source));
  const changes = entries.filter((entry) => !unchanged.includes(entry));
  for (const { dest, source } of unchanged) console.log(`✓ ${label}: already linked  (${dest} → ${source})`);
  if (!changes.length) return printNextSteps(destRoot, label, skills);

  mkdirSync(destRoot, { recursive: true });
  const transactionDir = mkdtempSync(join(destRoot, ".hara-video-install-"));
  const prepared = [];
  try {
    for (const [index, entry] of changes.entries()) {
      const staged = join(transactionDir, `${entry.name}-${index}.new`);
      const backup = join(transactionDir, `${entry.name}-${index}.backup`);
      if (useCopy) {
        cpSync(entry.source, staged, { recursive: true, dereference: true });
        writeFileSync(join(staged, managedCopyMarker), `${JSON.stringify({ manager: "@nanhara/hara-video", skill: entry.name }, null, 2)}\n`, "utf8");
      } else {
        symlinkSync(entry.source, staged, "dir");
      }
      prepared.push({ ...entry, staged, backup, hadBackup: false, committed: false });
    }

    for (const item of prepared) {
      if (pathEntryExists(item.dest)) {
        renameSync(item.dest, item.backup);
        item.hadBackup = true;
      }
      try {
        renameSync(item.staged, item.dest);
        item.committed = true;
      } catch (error) {
        if (item.hadBackup) renameSync(item.backup, item.dest);
        throw error;
      }
    }
  } catch (e) {
    for (const item of [...prepared].reverse()) {
      try {
        if (item.committed) rmSync(item.dest, { recursive: true, force: true });
        if (item.hadBackup && pathEntryExists(item.backup) && !pathEntryExists(item.dest)) renameSync(item.backup, item.dest);
        rmSync(item.staged, { recursive: true, force: true });
      } catch { /* retain the recovery path and report it below */ }
    }
    console.error(`✗ ${label}: install failed: ${e.message}`);
    const recoveries = prepared.filter(({ backup }) => pathEntryExists(backup)).map(({ backup }) => backup);
    if (recoveries.length) console.error(`  Previous content is preserved at: ${recoveries.join(", ")}`);
    else rmSync(transactionDir, { recursive: true, force: true });
    process.exit(1);
  }
  for (const item of prepared) {
    if (item.hadBackup) {
      try { rmSync(item.backup, { recursive: true, force: true }); }
      catch (error) { console.error(`⚠ ${label}: installed ${item.name}, but could not remove backup ${item.backup}: ${error.message}`); }
    }
    console.log(useCopy
      ? `✓ ${label}: copied ${item.name} → ${item.dest}`
      : `✓ ${label}: linked ${item.name}  ${item.dest} → ${item.source}`);
  }
  try { rmSync(transactionDir, { recursive: true, force: true }); }
  catch (error) { console.error(`⚠ ${label}: install succeeded, but temporary cleanup failed: ${error.message}`); }
  printNextSteps(destRoot, label, skills);
}

function uninstallSkillsFrom(destRoot, label) {
  const skills = selectedSkills();
  const entries = skills.map((skill) => ({ ...skill, dest: join(destRoot, skill.name) }));
  const existing = entries.filter(({ dest }) => pathEntryExists(dest));
  if (!existing.length) {
    console.log(`${label}: no selected hara-video skills are installed under ${destRoot}.`);
    return;
  }
  const conflicts = existing.filter(({ dest, ...skill }) => !isManagedEntry(dest, skill));
  if (conflicts.length && !flag("force")) {
    for (const { dest } of conflicts) console.error(`✗ ${label}: ${dest} is not managed by hara-video (looks like your own files).`);
    console.error(`  Nothing was removed. Remove it yourself, choose --skill <name>, or re-run with --force.`);
    process.exit(1);
  }
  const transactionDir = mkdtempSync(join(destRoot, ".hara-video-uninstall-"));
  const moved = [];
  try {
    for (const [index, entry] of existing.entries()) {
      const retained = join(transactionDir, `${entry.name}-${index}.removed`);
      renameSync(entry.dest, retained);
      moved.push({ ...entry, retained });
    }
  } catch (e) {
    for (const item of [...moved].reverse()) {
      try {
        if (!pathEntryExists(item.dest) && pathEntryExists(item.retained)) renameSync(item.retained, item.dest);
      } catch { /* preserve the retained path and report it below */ }
    }
    console.error(`✗ ${label}: uninstall failed before completion: ${e.message}`);
    const recoveries = moved.filter(({ retained }) => pathEntryExists(retained)).map(({ retained }) => retained);
    if (recoveries.length) console.error(`  Previous content is preserved at: ${recoveries.join(", ")}`);
    else rmSync(transactionDir, { recursive: true, force: true });
    process.exit(1);
  }
  try { rmSync(transactionDir, { recursive: true, force: true }); }
  catch (error) {
    console.error(`✗ ${label}: skills were detached, but cleanup failed; recoverable content remains at ${transactionDir}: ${error.message}`);
    process.exit(1);
  }
  for (const { dest, name } of existing) console.log(`✓ ${label}: removed ${name} (${dest})`);
}


function usage() {
  console.log(`hara-video — local helper for the video plugin

  hara-video install    [--claude|--codex]  install the video + video-publish skills into a CLI
                                            (no flag) → register as a hara plugin
                                            --claude  → link both under ~/.claude/skills/
                                            --codex   → link both under ~/.agents/skills/
                          add --skill <name> to select one · --copy to copy · --force to replace
  hara-video uninstall  [--claude|--codex]  undo the matching install
  hara-video init [koubo|promo|kepu] [dir]  scaffold a project from a seed (default: koubo → ./video)
  hara-video edit [dir]                     open the live web preview for editing (background server +
                                            browser; never blocks). Extra flags pass to hyperframes preview.
  hara-video image "<prompt>" [-o out.png]  generate a still image via a pluggable backend
                                            (--cmd / HARA_VIDEO_IMAGE_CMD template; auto-detects z-image)
  hara-video tts   "<text>"   [-o out.wav]  generate voice via a pluggable backend
                                            (HARA_VIDEO_TTS_CMD; falls back to local hyperframes tts)
  hara-video doctor                         check Node >=22 / ffmpeg / hyperframes availability
  hara-video audit [file|dir] [--strict]    audit design artifacts, visual density, motion variety,
                                            asset references, and audio/caption/composition timing
                          add --json for machine-readable output; --strict also rejects warnings
  hara-video verify [dir]                   fail-closed gate: strict audit → lint → check → snapshots
  hara-video srt <file.srt> [--words]       SRT → HyperFrames caption JSON (stdout)

Engine: HyperFrames (Apache-2.0, npx hyperframes). The skill drives it; this helper just installs/checks.
Offline/preinstalled override: HARA_VIDEO_HYPERFRAMES_BIN=/absolute/path/to/hyperframes`);
}

if (cmd === "install") {
  if (flag("claude")) installSkillsInto(claudeSkillsDir(), "Claude Code");
  else if (flag("codex")) installSkillsInto(codexSkillsDir(), "Codex");
  else {
    if (argVal(["--skill"])) {
      console.error("Hara registers the package as one plugin, so --skill is only available with --claude or --codex.");
      process.exit(2);
    }
    const r = spawnSync("hara", ["plugin", "add", `file:${root}`], { stdio: "inherit" });
    if (r.error) {
      console.error("Could not run `hara` — install it (npm i -g @nanhara/hara) or use --claude / --codex.");
      process.exit(1);
    }
    process.exit(r.status ?? 1);
  }
} else if (cmd === "uninstall") {
  if (flag("claude")) uninstallSkillsFrom(claudeSkillsDir(), "Claude Code");
  else if (flag("codex")) uninstallSkillsFrom(codexSkillsDir(), "Codex");
  else console.log("For hara: `hara plugin remove video`. For others: --claude / --codex.");
} else if (cmd === "doctor") {
  const check = (name, cmd, args) => {
    try { execFileSync(cmd, args, { stdio: "ignore", timeout: 15000, env: runtimeEnv() }); console.log(`  ✓ ${name}`); return true; }
    catch { console.log(`  ✗ ${name} — not found`); return false; }
  };
  console.log("hara-video doctor:");
  const nodeVersion = process.versions.node;
  const nodeOk = isSupportedNode(nodeVersion);
  console.log(nodeOk
    ? `  ✓ Node v${nodeVersion} (>=22)`
    : `  ✗ Node v${nodeVersion} — Node >=22 is required`);
  const ff = check("ffmpeg", "ffmpeg", ["-version"]);
  const hfCommand = hyperFramesInvocation(["--version"]);
  const hf = check(
    process.env.HARA_VIDEO_HYPERFRAMES_BIN ? "hyperframes (configured)" : "hyperframes (npx)",
    hfCommand.command,
    hfCommand.args,
  );
  if (!nodeOk) console.log("    install: https://nodejs.org/ or use a version manager such as nvm");
  if (!ff) console.log("    install: brew install ffmpeg");
  if (!hf) console.log("    hyperframes will be fetched on first use (npx hyperframes init)");
  console.log(nodeOk && ff && hf ? "Ready." : "Fix the ✗ items above, then re-run.");
} else if (cmd === "init") {
  // Scaffold the complete designer → script → storyboard → composition contract. Full-video HTML seeds
  // are only layout scaffolds; the three Markdown artifacts carry the creative decisions and timing truth.
  const seeds = { koubo: "koubo-vertical.html", promo: "promo-vertical.html", kepu: "kepu-horizontal.html" };
  const initArgs = rest.filter((a) => !a.startsWith("--"));
  if (initArgs.length > 1 && !seeds[initArgs[0]]) {
    console.error(`Unknown seed '${initArgs[0]}'. Choose koubo, promo, or kepu; or pass only one argument to use it as the default koubo output directory.`);
    process.exit(2);
  }
  const which = seeds[initArgs[0]] ? initArgs[0] : "koubo";
  const dirArg = seeds[initArgs[0]] ? initArgs[1] : initArgs[0];
  const dir = resolve(dirArg || "video");
  if (existsSync(join(dir, "index.html")) && !flag("force")) {
    console.error(`✗ ${join(dir, "index.html")} already exists — pass --force to overwrite, or choose another dir.`);
    process.exit(1);
  }
  mkdirSync(join(dir, "assets", "audio"), { recursive: true });
  mkdirSync(join(dir, "assets", "images"), { recursive: true });
  mkdirSync(join(dir, "assets", "video"), { recursive: true });
  cpSync(join(root, "skills", "video", "references", "templates", seeds[which]), join(dir, "index.html"));
  const projectTemplates = {
    "DESIGN.md": "DESIGN.template.md",
    "SCRIPT.md": "SCRIPT.template.md",
    "STORYBOARD.md": "STORYBOARD.template.md",
  };
  for (const [destination, source] of Object.entries(projectTemplates)) {
    const output = join(dir, destination);
    if (!existsSync(output)) {
      cpSync(join(root, "skills", "video", "references", "project", source), output);
    }
  }
  console.log(`✓ scaffolded a "${which}" project → ${dir}`);
  console.log(`  1. act as video designer: complete DESIGN.md, SCRIPT.md, and STORYBOARD.md`);
  console.log(`  2. create the storyboard assets under ${join(dir, "assets")}/, then compose index.html`);
  console.log(`  3. hara-video verify ${dir} (strict audit → lint → check → snapshots; fail closed)`);
  console.log(`  4. hara-video edit ${dir} for approval; render only after the user approves the preview`);
  console.log(`  (in an agent: just ask it to "make a ${which} video about …" — the video skill drives all of this)`);
} else if (cmd === "verify") {
  process.exit(verifyProject(positional() || "."));
} else if (cmd === "audit") {
  const target = positional() || ".";
  const args = [join(root, "scripts", "audit-composition.mjs"), target];
  if (flag("strict")) args.push("--strict");
  if (flag("json")) args.push("--json");
  const r = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (r.error) {
    console.error(`hara-video audit: could not start Node — ${r.error.message}`);
    process.exit(1);
  }
  process.exit(r.status ?? 1);
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
    const hfCommand = hyperFramesInvocation(["preview", ...extra]);
    const child = spawn(hfCommand.command, hfCommand.args, {
      cwd: dir,
      detached: true,
      stdio: ["ignore", out, out],
      env: runtimeEnv(),
    });
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
