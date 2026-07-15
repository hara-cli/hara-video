---
name: video-publish
description: Publish a finished video to one or more configured social/video platforms with account-identity checks, safe metadata review, bounded uploads, duplicate prevention, and a publication ledger. Use when the user asks to upload, publish, schedule, cross-post, submit, or distribute an existing video.
license: Apache-2.0
---

# video-publish — safe distribution for finished videos

Publish an existing, approved video. This skill does not edit or render the video; use the `video`
skill for production. Platform credentials and brand/account routing belong to private profiles, never
to this public skill.

It works with Hara, Claude Code, Codex, and other Agent Skills clients. Live publication requires
network access plus a platform adapter configured by the user; without one, remain in plan-only mode.

## Non-negotiable safety boundary

- Treat publication as an external side effect. Never infer an account, visibility, schedule, or
  destination that the user did not provide or approve.
- Resolve an explicit profile for every destination and verify the remote account identity before
  upload. Do not let the current directory, a default cookie filename, or the first logged-in browser
  session choose an account implicitly.
- Never read credential values into the conversation, copy them into a request file, print them in a
  command, or include them in a ledger. Profiles may name environment variables or local credential
  locations; adapters consume the credentials outside model context.
- A public or multi-platform publish needs a final plan showing profile, verified account label,
  platform, visibility, schedule, title, media hash prefix, and disclosure state. A user request that
  already specifies every one of those choices is approval; otherwise pause for confirmation.
- Every subprocess and upload has a finite timeout. Never start an unbounded retry loop or keep polling
  forever.
- An ambiguous upload result is not a retry signal. Query remote status by idempotency key or media
  hash first; otherwise stop and report that manual reconciliation is required.

## 1. Complete the request without making the user repeat themselves

Extract what is already present in the request, then ask once for only the missing items:

1. finished video path;
2. profile and platforms;
3. title/description/tags/thumbnail (or permission to draft them);
4. visibility (`private`, `unlisted`, `public`, or platform equivalent) and optional schedule;
5. required AI/synthetic-media, sponsorship, age, or regulated-content disclosures.

Natural-language examples that should work:

- “Upload `out/final.mp4` to my studio YouTube profile as unlisted; draft the description.”
- “把这个成片用课程账号发到 B 站和 YouTube，周五 20:00 定时，先给我看发布计划。”
- “Publish the approved short everywhere in profile `launch`, but do not retry an uncertain result.”

If the user says only “publish this”, do not guess the profile or visibility. Show the available
private profile names without displaying their contents or credential locations.

## 2. Resolve a private profile

Look for `<name>.json` in this order:

1. project: `.hara/video-publish/profiles/`;
2. personal: `~/.hara/video-publish/profiles/`.

The project profile wins on an exact name collision. Read `references/profile-schema.md` before
creating or changing a profile. Start from `assets/profile.example.json`, keep real profiles out of
source control, and store labels/expected public account identifiers—not tokens—in them.

If no profile exists, stay in plan-only mode and help the user create one. Do not improvise a live
uploader command from a nearby config directory.

## 3. Validate the media and metadata

Before any network action:

- require a regular, non-symlink video file and reject device/FIFO paths;
- inspect container, codecs, duration, dimensions, frame rate, and audio with `ffprobe` when available;
- compute SHA-256 once and use its prefix in the plan and idempotency key;
- ensure the thumbnail is a regular image and meets the adapter/platform limits;
- enforce platform title/description/tag limits declared by the adapter;
- preserve the user's language; do not silently translate or change script;
- add required disclosure text before confirmation, not after upload.

Create a metadata-only request document in a private temporary directory. It may contain local media
paths, public copy, schedule, profile name, and idempotency key. It must not contain cookies, tokens,
authorization headers, passwords, or credential file contents.

## 4. Preflight every destination

Read `references/adapter-contract.md`, then run each configured adapter's `preflight` operation with a
finite timeout. Require machine-readable output that confirms:

- adapter and platform availability;
- authenticated account identity matching the profile's expected public identity;
- supported visibility/scheduling settings;
- media and metadata acceptance;
- whether the same idempotency key or media hash already exists remotely.

Stop the entire batch before publishing if an identity check fails, a credential is expired, the
destination is ambiguous, or a duplicate exists without an explicit replace/resume policy. A platform
that cannot prove identity is plan-only until the user explicitly accepts that limitation.

## 5. Show the publication plan

Present one compact row per destination:

`platform | profile | verified account | visibility | schedule | title | media sha256 | disclosure | timeout`

Also state whether any destination uses browser automation, lacks a dry run, or cannot provide strong
idempotency. Do not show credential paths unless the user is actively repairing that profile.

## 6. Publish with bounded, duplicate-safe execution

- Execute one destination at a time unless the user explicitly requests parallel uploads and every
  adapter has independent credentials and idempotency.
- Use argument arrays or a request file; never concatenate title, description, tags, or paths into a
  shell command string.
- Apply the profile timeout (default 45 minutes, maximum 120 minutes). A timeout cancels the local
  process, then triggers `status`; it does not immediately trigger another upload.
- Retry at most twice, only for a documented transient failure that occurred before the adapter
  created a remote upload/submission. Respect `Retry-After` within the remaining timeout budget.
- Once a remote ID is returned, use `status`/`resume`; never create a second submission.
- If one platform fails, keep successful results, stop before any not-yet-started public destinations,
  and show the user the partial state.

## 7. Verify and record

For every success, query status and capture the platform, verified account label/public identifier,
remote ID, canonical URL when available, final visibility/schedule, media SHA-256, timestamp, adapter
version, and idempotency key. Append that record to the profile's JSONL ledger.

Never record credentials, raw cookies, access/refresh tokens, authorization headers, or full adapter
debug output. Redact secret-shaped values from errors before showing or saving them.

Finish with three lists: published and verified, failed with a focused recovery action, and not
started. Include exact verification URLs/IDs for successful destinations.

## Recovery rules

- **Expired login:** stop that profile, ask the user to re-authenticate through the adapter, then
  re-run `preflight`; do not overwrite a different profile's credential state.
- **Rate limit:** honor the server's bounded delay; never spin.
- **Timeout/connection loss after upload began:** run `status` by idempotency key/hash. If unsupported,
  mark the result `unknown` and require manual reconciliation.
- **Metadata rejected:** change only the rejected field, show the revised plan, and preserve the same
  idempotency key when the platform guarantees no remote object was created.
- **Partial cross-post:** never roll back or delete a successful public post without separate explicit
  authorization.
