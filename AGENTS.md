# Repository Guidelines

## Scope & Structure

This repository ships the `@nanhara/hara-video` npm package and Hara plugin. The CLI entry point is `bin/hara-video.mjs`; production helpers are in `scripts/`; the staged agent workflow, recipes, templates, and references are in `skills/video/`; tests are in `test/`. Keep `package.json` and `plugin.json` versions aligned.

Preserve the product boundary: deterministic HTML composition is the video, generated images/clips are ingredients, and HyperFrames owns rendering. Do not silently skip the script-approval, preview-approval, lint, or inspection gates documented by the video skill.

## Development & Tests

- Use Node 22 or newer.
- `npm test` runs the complete dependency-free `node:test` suite.
- `node bin/hara-video.mjs doctor` checks runtime dependencies for an integration smoke.
- `npm pack --dry-run` verifies the npm payload.

Use ESM, two-space indentation, semicolons, safe argument arrays, and bounded subprocess execution. Add tests for CLI parsing, SRT conversion, command-template quoting, path traversal, timeouts, and failed image/TTS/render backends. Never interpolate user text into a shell command.

## Generated Output & Release Boundary

Rendered MP4s, compositions created for a user, audio, captions, downloaded engines/models, preview state, and generated assets belong in the requested output workspace, not this repository. Commit media only when it is a small, intentional test fixture with clear licensing. Do not edit packed tarballs or caches.

The GitHub workflow tests Node 22 and 24. A `vX.Y.Z` tag matching both manifests publishes to npm after tests and package inspection; manual dispatch is also a publication action. Do not tag or dispatch until release authorization is clear and the package gates pass. Verify npm and a clean install/doctor smoke before announcing it.

## Security & Hara Feedback

Treat image/TTS backend templates and project media as untrusted. Never commit API keys, voice credentials, private media, biometric voice data, tokens, or authorization headers; redact commands before logging or reporting them.

The canonical intake and status channel is Feishu `hara 反馈群` (`oc_17590648f393135cde6a6b9cd6f1c710`). Pull the newest messages and relevant attachments before issue work. Report discovered bugs with version, reproduction/evidence, and expected versus actual behavior, always redacted. After a verified release, reply to each original fixed report with the fixed version and focused checks, then post the group-level version, concise changes, upgrade command, and verification request; mention any named tester.
