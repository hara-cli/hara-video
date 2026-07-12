import test from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("uninstall removes a managed symlink after its package target disappears", { skip: process.platform === "win32" }, () => {
  const sandbox = mkdtempSync(join(tmpdir(), "hara-video-cli-"));
  try {
    const app = join(sandbox, "app");
    const home = join(sandbox, "home");
    const cli = join(app, "bin", "hara-video.mjs");
    const installed = join(home, ".agents", "skills", "video");
    mkdirSync(join(app, "bin"), { recursive: true });
    mkdirSync(join(app, "skills"), { recursive: true });
    mkdirSync(join(home, ".agents", "skills"), { recursive: true });
    const missingSkill = join(realpathSync(app), "skills", "video");
    copyFileSync(new URL("../bin/hara-video.mjs", import.meta.url), cli);
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
