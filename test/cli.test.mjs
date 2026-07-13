import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

test("uninstall removes a managed symlink after its package target disappears", { skip: process.platform === "win32" }, () => {
  const sandbox = mkdtempSync(join(tmpdir(), "hara-video-cli-"));
  try {
    const app = join(sandbox, "app");
    const home = join(sandbox, "home");
    const cli = join(app, "bin", "hara-video.mjs");
    const nodeVersion = join(app, "scripts", "node-version.mjs");
    const installed = join(home, ".agents", "skills", "video");
    mkdirSync(join(app, "bin"), { recursive: true });
    mkdirSync(join(app, "scripts"), { recursive: true });
    mkdirSync(join(app, "skills"), { recursive: true });
    mkdirSync(join(home, ".agents", "skills"), { recursive: true });
    const missingSkill = join(realpathSync(app), "skills", "video");
    copyFileSync(new URL("../bin/hara-video.mjs", import.meta.url), cli);
    copyFileSync(new URL("../scripts/node-version.mjs", import.meta.url), nodeVersion);
    symlinkSync(missingSkill, installed, "dir");

    const result = spawnSync(process.execPath, [cli, "uninstall", "--codex"], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
      encoding: "utf8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.throws(() => lstatSync(installed), { code: "ENOENT" });
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
