---
name: create-score-source
description: 'Create or update a static JSON music-score source for this app from completed score JSON files. Covers the catalog, hosting configuration, and compatibility checks. Use for source-site creation or publication, not music transcription or human-facing website pages.'
---

# Create Score Source

Produce a standalone source consisting of a JSON catalog and existing score JSON
files. Include only the hosting configuration needed for the chosen destination;
do not add a browsing UI or documentation page.

Start with completed score JSON files. Transcription belongs to the separate
[transcribe-music skill](../transcribe-music/SKILL.md) when the user requests it.
Publishing a source must preserve the scores' musical content and attribution.

## Establish the source

Identify the library name, score files, output directory, and any chosen hosting
destination. Reuse an existing source project when updating one. When deployment
is not part of the request, prepare the static files locally and identify what
remains to publish them.

The app's [catalog types and reader](../../../src/library.ts) define the source
protocol. The [Score type](../../../src/music.ts) defines each score file; do not
duplicate the music schema or introduce a new score format.

## Build the catalog

A minimal `index.json` looks like this:

```json
{
  "version": 1,
  "name": "Example Music Library",
  "scores": [
    {
      "id": "prelude",
      "title": "Prelude",
      "composer": "Composer",
      "url": "./scores/prelude.json"
    }
  ]
}
```

- Use numeric `version: 1`, a string `name`, and a `scores` array. Each entry
  requires a nonempty string `id`, string `title` and `composer`, and a nonempty
  string `url`.
- Copy titles and composers from the corresponding score files. The catalog's
  name identifies the library; each score's `source` describes its edition,
  provenance, and license. Preserve that distinction.
- Keep IDs unique within the catalog and stable across updates. An initial ID
  may come from a filename, but retain it when the filename, title, or URL changes.
  Preserve existing entries when adding scores.
- Relative score URLs resolve against the full catalog URL supplied to the app.
  With `https://example.org/music/index.json`, the example above resolves to
  `https://example.org/music/scores/prelude.json`. Absolute HTTP(S) score URLs also
  work. Choose relative URLs for files hosted with the catalog.
- Keep the catalog separate from the score files when collecting inputs, so it
  is never included as a score. Reuse an existing catalog generator when available;
  a small catalog can be written directly without adding a build system.

## Serve the files

Use the user's chosen hosting setup. Static file hosting is sufficient. Serve
JSON responses with `Content-Type: application/json`; avoid routes that return
an HTML fallback for a missing JSON file. Prefer HTTPS for published sources.

Both the catalog and every referenced score must permit cross-origin reads from
the app. For a public source, `Access-Control-Allow-Origin: *` is sufficient;
an explicit allowed app origin also works. This applies to score files hosted
on a different domain as well. The app fetches without credentials, so the files
must be readable without cookies or an authenticated session.

When publishing updates, make new score files available before a catalog that
references them. Preserve the catalog URL so existing registrations continue
to work.

## Verify and deliver

- Check the catalog with the app's `readCatalog` when the app checkout is
  available. Resolve every entry URL and verify its response is the intended
  score JSON, with matching title and composer.
- Use the existing score checks, including `validateScore` in
  [timing.ts](../../../src/timing.ts) and `performedNotes` in
  [ornaments.ts](../../../src/ornaments.ts), to check compatibility. Report invalid
  inputs rather than changing musical content to make them pass.
- For a hosted source, check response status, JSON bodies, and CORS headers on
  both the catalog and scores. A successful command-line fetch alone does not
  establish browser access. Distinguish local checks from deployed checks.
- Deliver the source files and, when published, the full catalog URL to paste
  into **Add site**. Explain updates briefly in the response: add the score file,
  update the catalog while retaining IDs, publish, and refresh the source in the
  app. Do not generate a separate documentation page.
