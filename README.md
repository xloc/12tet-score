# Interactive Music Sheet

A Vue 3 and TypeScript prototype for exploring beginner-friendly music notation.
It currently demonstrates the complete C-major Prelude, BWV 846, from Book I of
The Well-Tempered Clavier.

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

## Project references

- [Notation discussion](music_notation_chat.md)
- [Project conventions](CLAUDE.md)
- [BWV 846 score data](src/scores/bwv846-prelude.json)
- [Original LilyPond source](sources/bwv846/wtk1-prelude1.ly)
- [Music transcription skill](.agents/skills/transcribe-music/SKILL.md)
