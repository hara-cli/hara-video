#!/usr/bin/env node
// hara-video — local helper for the video plugin. Mirrors hara-design's proven install machinery:
// the bundled skill (skills/video/) is exposed to a host CLI by symlink (default) or copy.
//   install [--claude|--codex]   link skills/video into ~/.claude/skills or ~/.agents/skills
//   uninstall [--claude|--codex] undo (only ever touches our own link/copy)
//   doctor                       check the engine chain (node / ffmpeg / hyperframes / chrome dl)
//   srt <file.srt>               convert an SRT into HyperFrames caption JSON (stdout)
import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, symlinkSync, rmSync, cpSync, realpathSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, ...rest] = process.argv.slice(2);
function flag(name) { return rest.includes(`--${name}`); }
function positional() { return rest.find((a) => !a.startsWith("--")); }

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
  hara-video doctor                         check node / ffmpeg / hyperframes availability
  hara-video srt <file.srt>                 SRT → HyperFrames caption JSON (stdout)

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
  check("node ≥22", "node", ["--version"]);
  const ff = check("ffmpeg", "ffmpeg", ["-version"]);
  const hf = check("hyperframes (npx)", "npx", ["--yes", "hyperframes", "--version"]);
  if (!ff) console.log("    install: brew install ffmpeg");
  if (!hf) console.log("    hyperframes will be fetched on first use (npx hyperframes init)");
  console.log(ff && hf ? "Ready." : "Fix the ✗ items above, then re-run.");
} else if (cmd === "srt") {
  const f = positional();
  if (!f) { console.error("usage: hara-video srt <file.srt>"); process.exit(2); }
  const r = spawnSync("node", [join(root, "scripts", "srt-to-captions.mjs"), f], { stdio: "inherit" });
  process.exit(r.status ?? 0);
} else {
  usage();
}
