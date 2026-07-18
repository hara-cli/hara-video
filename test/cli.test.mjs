import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

function makeCliSandbox(prefix, skillNames = []) {
  const sandbox = mkdtempSync(join(tmpdir(), prefix));
  const app = join(sandbox, "app");
  const home = join(sandbox, "home");
  const cli = join(app, "bin", "hara-video.mjs");
  mkdirSync(join(app, "bin"), { recursive: true });
  mkdirSync(join(app, "scripts"), { recursive: true });
  mkdirSync(home, { recursive: true });
  copyFileSync(new URL("../bin/hara-video.mjs", import.meta.url), cli);
  copyFileSync(new URL("../scripts/node-version.mjs", import.meta.url), join(app, "scripts", "node-version.mjs"));
  copyFileSync(new URL("../scripts/audit-composition.mjs", import.meta.url), join(app, "scripts", "audit-composition.mjs"));
  copyFileSync(new URL("../plugin.json", import.meta.url), join(app, "plugin.json"));
  for (const name of skillNames) {
    const source = join(app, "skills", name);
    mkdirSync(source, { recursive: true });
    writeFileSync(join(source, "SKILL.md"), `---\nname: ${name}\ndescription: test ${name}\n---\n`);
  }
  return { sandbox, app, home, cli };
}

function runCli(cli, home, ...args) {
  return spawnSync(process.execPath, [cli, ...args], {
    env: { ...process.env, HOME: home, USERPROFILE: home },
    encoding: "utf8",
  });
}

test("npm package and Hara plugin ship the same version plus both specialist role directories", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const plugin = JSON.parse(readFileSync(new URL("../plugin.json", import.meta.url), "utf8"));
  assert.equal(plugin.version, pkg.version);
  assert.deepEqual(plugin.agents, ["agents"]);
  assert.ok(pkg.files.includes("agents"));
  for (const role of ["video-director", "video-quality-reviewer"]) {
    const content = readFileSync(new URL(`../agents/${role}.md`, import.meta.url), "utf8");
    assert.match(content, new RegExp(`^---[\\s\\S]*name: ${role}\\n`));
    assert.match(content, /^readOnly: true$/m);
    assert.doesNotMatch(content, /disable-model-invocation:\s*true/i);
  }
});

test("uninstall removes a managed symlink after its package target disappears", { skip: process.platform === "win32" }, () => {
  const { sandbox, app, home, cli } = makeCliSandbox("hara-video-cli-");
  try {
    const installed = join(home, ".agents", "skills", "video");
    mkdirSync(join(app, "skills"), { recursive: true });
    mkdirSync(join(home, ".agents", "skills"), { recursive: true });
    const missingSkill = join(realpathSync(app), "skills", "video");
    symlinkSync(missingSkill, installed, "dir");

    const result = runCli(cli, home, "uninstall", "--codex");

    assert.equal(result.status, 0, result.stderr);
    assert.throws(() => lstatSync(installed), { code: "ENOENT" });
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("install links both skills idempotently and uninstall removes only managed links", { skip: process.platform === "win32" }, () => {
  const { sandbox, app, home, cli } = makeCliSandbox("hara-video-install-", ["video", "video-publish"]);
  try {
    const first = runCli(cli, home, "install", "--codex");
    assert.equal(first.status, 0, first.stderr);
    for (const name of ["video", "video-publish"]) {
      const installed = join(home, ".agents", "skills", name);
      assert.equal(lstatSync(installed).isSymbolicLink(), true);
      assert.equal(realpathSync(installed), realpathSync(join(app, "skills", name)));
    }

    const second = runCli(cli, home, "install", "--codex");
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /already linked/);

    const removed = runCli(cli, home, "uninstall", "--codex");
    assert.equal(removed.status, 0, removed.stderr);
    assert.equal(existsSync(join(home, ".agents", "skills", "video")), false);
    assert.equal(existsSync(join(home, ".agents", "skills", "video-publish")), false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("install preflights every selected skill before changing a destination", { skip: process.platform === "win32" }, () => {
  const { sandbox, home, cli } = makeCliSandbox("hara-video-conflict-", ["video", "video-publish"]);
  try {
    const skillsRoot = join(home, ".agents", "skills");
    const custom = join(skillsRoot, "video-publish");
    mkdirSync(custom, { recursive: true });
    writeFileSync(join(custom, "SKILL.md"), "user-owned\n");

    const result = runCli(cli, home, "install", "--codex");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Nothing was changed/);
    assert.equal(existsSync(join(skillsRoot, "video")), false, "preflight prevents a partial install");
    assert.equal(readFileSync(join(custom, "SKILL.md"), "utf8"), "user-owned\n");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("uninstall preflights every selected skill before removing a managed entry", { skip: process.platform === "win32" }, () => {
  const { sandbox, home, cli } = makeCliSandbox("hara-video-uninstall-conflict-", ["video", "video-publish"]);
  try {
    const installed = runCli(cli, home, "install", "--codex");
    assert.equal(installed.status, 0, installed.stderr);
    const root = join(home, ".agents", "skills");
    rmSync(join(root, "video-publish"), { recursive: true, force: true });
    mkdirSync(join(root, "video-publish"));
    writeFileSync(join(root, "video-publish", "SKILL.md"), "user-owned\n");

    const result = runCli(cli, home, "uninstall", "--codex");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Nothing was removed/);
    assert.equal(lstatSync(join(root, "video")).isSymbolicLink(), true, "managed sibling remains installed");
    assert.equal(readFileSync(join(root, "video-publish", "SKILL.md"), "utf8"), "user-owned\n");
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("copied skills carry an ownership receipt and uninstall without --force", () => {
  const { sandbox, home, cli } = makeCliSandbox("hara-video-copy-", ["video", "video-publish"]);
  try {
    const installed = runCli(cli, home, "install", "--codex", "--copy");
    assert.equal(installed.status, 0, installed.stderr);
    const root = join(home, ".agents", "skills");
    for (const name of ["video", "video-publish"]) {
      assert.equal(lstatSync(join(root, name)).isDirectory(), true);
      const receipt = JSON.parse(readFileSync(join(root, name, ".hara-video-managed.json"), "utf8"));
      assert.deepEqual(receipt, { manager: "@nanhara/hara-video", skill: name });
    }

    const removed = runCli(cli, home, "uninstall", "--codex");
    assert.equal(removed.status, 0, removed.stderr);
    assert.equal(existsSync(join(root, "video")), false);
    assert.equal(existsSync(join(root, "video-publish")), false);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("--skill limits installation to one bundled skill", { skip: process.platform === "win32" }, () => {
  const { sandbox, home, cli } = makeCliSandbox("hara-video-select-", ["video", "video-publish"]);
  try {
    const result = runCli(cli, home, "install", "--codex", "--skill", "video-publish");
    assert.equal(result.status, 0, result.stderr);
    const root = join(home, ".agents", "skills");
    assert.equal(existsSync(join(root, "video")), false);
    assert.equal(lstatSync(join(root, "video-publish")).isSymbolicLink(), true);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("srt --words reaches the converter even when node is absent from PATH", () => {
  const sandbox = mkdtempSync(join(tmpdir(), "hara-video-srt-"));
  try {
    const input = join(sandbox, "captions.srt");
    writeFileSync(input, "1\n00:00:00,000 --> 00:00:01,000\n南荒\n");

    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("../bin/hara-video.mjs", import.meta.url)),
      "srt",
      input,
      "--words",
    ], {
      env: { ...process.env, PATH: "" },
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    const transcript = JSON.parse(result.stdout);
    assert.deepEqual(
      transcript.segments[0].words.map(({ word }) => word),
      ["南", "荒"],
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("verify fails closed at the strict audit instead of running later engine gates", () => {
  const { sandbox, home, cli } = makeCliSandbox("hara-video-verify-");
  const project = join(sandbox, "project");
  try {
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "index.html"), `<main data-composition-id="unfinished" data-start="0" data-duration="20">[REPLACE]</main>`);

    const result = runCli(cli, home, "verify", project);

    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /\[1\/4\] video quality audit/);
    assert.doesNotMatch(result.stdout, /\[2\/4\] HyperFrames lint/);
    assert.match(result.stderr, /verify stopped at video quality audit/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("edit refuses to start a preview until the complete verification gate passes", () => {
  const { sandbox, home, cli } = makeCliSandbox("hara-video-edit-gate-");
  const project = join(sandbox, "project");
  try {
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "index.html"), `<main data-composition-id="unfinished" data-start="0" data-duration="20">[REPLACE]</main>`);

    const result = runCli(cli, home, "edit", project, "--no-open");

    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /\[1\/4\] video quality audit/);
    assert.match(result.stderr, /Preview blocked/);
    assert.doesNotMatch(result.stdout + result.stderr, /preview running in the background/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("doctor detects a stale copied Hara plugin and gives the exact refresh command", { skip: process.platform === "win32" }, () => {
  const { sandbox, home, cli } = makeCliSandbox("hara-video-doctor-");
  const fakeBin = join(sandbox, "fake-bin");
  const engine = join(fakeBin, "hyperframes");
  try {
    mkdirSync(join(home, ".hara", "plugins", "video"), { recursive: true });
    writeFileSync(join(home, ".hara", "plugins", "video", "plugin.json"), JSON.stringify({ name: "video", version: "0.1.0" }));
    mkdirSync(fakeBin, { recursive: true });
    for (const executable of [engine, join(fakeBin, "ffmpeg")]) {
      writeFileSync(executable, "#!/bin/sh\nexit 0\n");
      chmodSync(executable, 0o755);
    }

    const result = spawnSync(process.execPath, [cli, "doctor"], {
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        PATH: `${fakeBin}:${process.env.PATH ?? ""}`,
        HARA_VIDEO_HYPERFRAMES_BIN: engine,
      },
      encoding: "utf8",
    });

    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stdout, /Hara video plugin v0\.1\.0 is stale/);
    assert.match(result.stdout, /refresh the copied Hara plugin: hara-video install/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});

test("verify can use a preinstalled HyperFrames binary without invoking npx", { skip: process.platform === "win32" }, () => {
  const { sandbox, home, cli } = makeCliSandbox("hara-video-engine-");
  const project = join(sandbox, "project");
  const calls = join(sandbox, "engine-calls.log");
  const engine = join(sandbox, "hyperframes");
  try {
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "index.html"), `
      <main data-composition-id="ready" data-start="0" data-duration="1">
        <section data-visual-role="brand-cta" data-motion="reveal-mask"></section>
      </main>
    `);
    mkdirSync(join(project, "assets", "images"), { recursive: true });
    writeFileSync(join(project, "assets", "images", "style-frame.png"), "approved-style-frame");
    writeFileSync(join(project, "DESIGN.md"), "# DESIGN.md\n\nStatus: approved\n\n- Style frame: assets/images/style-frame.png\n");
    writeFileSync(join(project, "SCRIPT.md"), "# SCRIPT.md\n\nStatus: approved\n");
    writeFileSync(join(project, "STORYBOARD.md"), "# STORYBOARD.md\n\nStatus: approved\n");
    writeFileSync(engine, `#!/usr/bin/env node
      const { appendFileSync } = require("node:fs");
      appendFileSync(process.env.HF_CALLS, process.argv.slice(2).join(" ") + "\\n");
    `);
    chmodSync(engine, 0o755);

    const result = spawnSync(process.execPath, [cli, "verify", project], {
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        HARA_VIDEO_HYPERFRAMES_BIN: engine,
        HF_CALLS: calls,
      },
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      readFileSync(calls, "utf8").trim().split("\n").map((line) => line.split(" ")[0]),
      ["lint", "check", "snapshot"],
    );
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
