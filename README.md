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

Deploy with [Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-vue-site/) using `pnpm build` as the build command and `dist` as the output directory. Set `PNPM_VERSION=11.21.0` for production and preview builds. The Node.js version is read from `.node-version`.

## Project references

- [Notation discussion](design/music_notation_chat.md)
- [Project conventions](CLAUDE.md)
- [BWV 846 score data](public/scores/bwv846-prelude.json)
- [Original LilyPond source](sources/bwv846/wtk1-prelude1.ly)
- [Music transcription skill](.agents/skills/transcribe-music/SKILL.md)
- [Score source creation skill](.agents/skills/create-score-source/SKILL.md)
