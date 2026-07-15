# Private publication profile

Profiles keep account routing outside the public skill. They are private configuration—not a place to
store raw secrets.

## Locations and precedence

- Project: `.hara/video-publish/profiles/<name>.json`
- Personal: `~/.hara/video-publish/profiles/<name>.json`

The project profile wins on an exact name collision. Add the project directory to `.gitignore` unless
the file contains only deliberate, non-sensitive team routing metadata. Prefer owner-only permissions
on personal profiles.

## Schema 1

```json
{
  "schema": 1,
  "name": "studio",
  "ledger": ".hara/video-publish/ledger.jsonl",
  "defaults": {
    "visibility": "private",
    "timeoutMinutes": 45
  },
  "platforms": {
    "youtube": {
      "accountLabel": "Studio channel",
      "expectedIdentity": {
        "channelId": "public-channel-id"
      },
      "adapter": {
        "command": ["video-publish-youtube"]
      },
      "credentialHints": {
        "environment": ["YOUTUBE_UPLOAD_TOKEN"],
        "loginCommand": ["video-publish-youtube", "login"]
      },
      "allowedVisibility": ["private", "unlisted", "public"],
      "timeoutMinutes": 60
    }
  }
}
```

## Validation rules

- `schema` must be `1`; `name` must match the requested profile and filename.
- Platform keys and adapter command elements are lowercase, explicit strings. `command` is an argv
  prefix, not a shell snippet; reject metacharacter-driven command templates.
- `expectedIdentity` contains a public, stable account/channel/user identifier returned by adapter
  preflight. A display name alone is not strong identity.
- `credentialHints.environment` lists variable names only. Never put values in this file.
- A credential file may be referenced by a private adapter-specific field when unavoidable, but never
  load its contents into the agent conversation or ledger.
- `defaults.visibility` should be `private` for a newly created profile.
- `timeoutMinutes` is an integer from 1 through 120. Platform values override the default.
- `ledger` must stay inside the project or personal Hara state selected for the profile; reject `..`
  traversal and symlink targets.
- Do not share a mutable credential location between two profiles unless the platform itself proves
  the selected account identity on every preflight.

## Brand/account isolation

Use separate profiles and credential stores for separate brands, clients, or legal entities. Never
encode a rule such as “use whichever account is currently logged in.” A profile is usable for live
publication only when every configured destination can return an identity that matches
`expectedIdentity`.
