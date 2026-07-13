# Changelog

## 0.4.2 - 2026-07-13

### Fixed

- Forward `--words` from `hara-video srt` to the bundled SRT converter.
- Run the converter with the current Node executable instead of relying on a potentially different `node` found on `PATH`.
- Make `hara-video doctor` enforce the documented Node 22 minimum against the runtime that is actually executing the CLI.

### Changed

- Declare the Node 22 minimum in npm package metadata.
- Synchronize npm and plugin versions and refresh the plugin description to match the current image, voice, preview, caption, and render workflow.
- Gate npm publishing on Node 22 and Node 24 tests, package inspection, and release metadata validation.
