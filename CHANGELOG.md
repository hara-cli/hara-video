# Changelog

## 0.5.0 - 2026-07-15

### Added

- Ship an Agent Skills-compatible `video-publish` workflow for publishing finished videos through
  private, profile-scoped adapters with remote account identity checks, explicit publication plans,
  bounded execution, duplicate prevention, and redacted JSONL receipts.
- Add a public profile schema, adapter contract, and secret-free example while keeping all brand
  routing, account identifiers, credential locations, and tokens outside the package.

### Changed

- Install both the `video` and `video-publish` skills for Hara, Claude Code, and Codex.
- Describe production and publication as separate stages: HyperFrames owns deterministic rendering;
  platform adapters own credentials and external upload side effects.

## 0.4.2 - 2026-07-13

### Fixed

- Forward `--words` from `hara-video srt` to the bundled SRT converter.
- Run the converter with the current Node executable instead of relying on a potentially different `node` found on `PATH`.
- Make `hara-video doctor` enforce the documented Node 22 minimum against the runtime that is actually executing the CLI.

### Changed

- Declare the Node 22 minimum in npm package metadata.
- Synchronize npm and plugin versions and refresh the plugin description to match the current image, voice, preview, caption, and render workflow.
- Gate npm publishing on Node 22 and Node 24 tests, package inspection, and release metadata validation.
