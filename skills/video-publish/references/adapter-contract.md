# Publication adapter contract

An adapter is a local executable that isolates platform APIs/browser automation and credentials from
the agent. It accepts metadata through a JSON request file and writes one JSON object to stdout. Human
diagnostics go to stderr after secret redaction.

## Operations

```text
<adapter> preflight --request <request.json>
<adapter> publish   --request <request.json>
<adapter> status    --request <request.json> [--remote-id <id>]
<adapter> resume    --request <request.json> --remote-id <id>
```

`resume` is optional. `preflight`, `publish`, and `status` are required for a live-publication profile.

## Request fields

```json
{
  "schema": 1,
  "operationId": "sha256-based-idempotency-key",
  "profile": "studio",
  "platform": "youtube",
  "media": {
    "path": "/absolute/path/final.mp4",
    "sha256": "hex",
    "thumbnailPath": "/absolute/path/cover.jpg"
  },
  "metadata": {
    "title": "Title",
    "description": "Description",
    "tags": ["tag"],
    "disclosures": ["synthetic-media"]
  },
  "publication": {
    "visibility": "unlisted",
    "publishAt": null
  }
}
```

The request contains no secrets. The adapter obtains credentials from its own environment, OS keychain,
or private profile-specific store.

## Response fields

Every operation returns:

```json
{
  "schema": 1,
  "ok": true,
  "state": "ready",
  "platform": "youtube",
  "account": {
    "label": "Studio channel",
    "identity": { "channelId": "public-channel-id" }
  },
  "operationId": "sha256-based-idempotency-key",
  "remoteId": null,
  "url": null,
  "retrySafe": false,
  "retryAfterSeconds": null,
  "limits": {},
  "warnings": []
}
```

Valid states include `ready`, `uploading`, `processing`, `scheduled`, `published`, `failed`, `unknown`,
and `duplicate`. After a publish request reaches the platform, return a `remoteId` as early as possible.

## Required behavior

- Support a stable idempotency key. If the platform has no native key, persist a local mapping from the
  operation ID/media hash to the first remote ID and reconcile it before another create call.
- `preflight` performs no publication. It validates authentication identity, limits, metadata, media,
  visibility/schedule support, and duplicates.
- `status` performs no mutation.
- Set `retrySafe: true` only when no remote object or upload session was created.
- Return a non-zero exit status for transport/process failure, but still emit a redacted JSON result
  when possible. Never print cookies, tokens, passwords, authorization headers, or signed URLs.
- Bound internal browser waits, API requests, upload time, status polling, and retries. Accept process
  cancellation and terminate child processes.
- Use direct argv execution. Treat media paths and all metadata as data, never executable shell text.
- Browser automation must verify the visible account identity and final post state; “button clicked” is
  not a successful publish result.

Existing uploaders such as `biliup`, API scripts, or browser automations should be wrapped behind this
contract. The wrapper—not the skill—owns platform-specific credentials and recovery details.
