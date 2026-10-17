# Interactive Music Sheet

A Vue 3 and TypeScript prototype for exploring beginner-friendly music notation.

The project includes the following core features:

- Piano roll notation based on 12-TET
- Note selection and audio playback
- Musical annotations
- System and Bluetooth MIDI connections
- Automatic playhead jumps from MIDI matching
- Persistent imported scores and multiple remote score catalogs

## Development

Use a Node.js version supported by `package.json` and pnpm 11.21.0.

```sh
pnpm install
pnpm dev
```

```sh
pnpm check
pnpm test
pnpm build
```

## Deployment

Deploy through Cloudflare's **Create application** flow using [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/). Set the build command to `pnpm build`, the deploy command to `npx wrangler deploy`, and `PNPM_VERSION=11.21.0` for production and preview builds. The repository specifies the Node.js version and deployment output directory.

## Project references

- [Notation discussion](design/music_notation_chat.md)
- [Project conventions](CLAUDE.md)
- [BWV 846 score data](public/scores/bwv846-prelude.json)
- [Original LilyPond source](sources/bwv846/wtk1-prelude1.ly)
- [Music transcription skill](.agents/skills/transcribe-music/SKILL.md)
- [Score source creation skill](.agents/skills/create-score-source/SKILL.md)
