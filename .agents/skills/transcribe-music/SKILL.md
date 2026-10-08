---
name: transcribe-music
description: 'Transcribe written or symbolic music (MusicXML, MIDI, LilyPond, or sheet-music PDFs/images) into note-event data for pitch–time notation. Use when asked to transcribe a score or add a piece as a music dataset. Does not cover audio-to-score transcription or creating package-manager import commands.'
---

# Transcribe Music

Produce a faithful transcription of the requested work or excerpt, with source
provenance and checked coverage. Treat this as a one-time authoring operation:
the result is a score asset, not a per-piece import command or a permanent
converter in the application. Use temporary conversion code when useful.

## Establish the source and destination

- Identify the work, movement, edition, and requested range. Transcribe the full
  named movement unless the user asks for an excerpt. A view initially showing
  a few measures must not determine transcription coverage.
- Use this project's `Note` and `Score` types in `src/music.ts` as the format
  authority. Read an existing `src/scores/` asset and the view/playback consumers
  before converting a new piece. Read the
  [score conventions](note-events.md) for timing and presentation constraints;
  do not maintain a duplicate schema in this skill.
- Save the completed score as `src/scores/<work>-<movement>.json`. Follow the
  existing `sources/` layout for provenance when retaining the source. Wire the
  asset into the demo only when the request includes application integration.
- Prefer a symbolic score for the intended edition over a performance-derived
  file when the goal is written notation. Keep the source link, edition or
  reference identifier, and known license. Label an unknown edition as unknown.
  Preserve the original source locally when that fits the project's conventions.

## Recover musical events

Use the source's musical structure, rather than extracting isolated pitch names.
Resolve absolute sounding pitch and octave, onset, held duration, and source
voice or part. Keep simultaneous events aligned and separate voices independent.

- **MusicXML:** respect changing divisions, chords, forward/backup movements,
  voice identifiers, instrument transposition, and sounding ties. Consult the
  [official timing and polyphony tutorial](https://www.w3.org/2021/06/musicxml40/tutorial/midi-compatible-part/)
  when interpreting these elements.
- **LilyPond:** resolve the declared pitch language, absolute or relative octave
  entry, inherited durations, dots, tuplets, transposition, simultaneous voices,
  and repeats. Use a parser or compiler when syntax exceeds what a small
  source-specific conversion can faithfully handle. The
  [notation reference](https://lilypond.org/doc/stable/Documentation/notation/index)
  is the authority for pitch and rhythm semantics.
- **MIDI:** pair note-on/off events using track, channel, and pitch; preserve the
  timing resolution and tempo information. Recorded note releases and pedal can
  differ from written durations. Track/channel grouping is not evidence of
  notated contrapuntal voices; do not invent that analysis.
- **PDF or image:** inspect the notation visually, including clefs, key and local
  accidentals, octave signs, ties, rests, and voice separation. OCR text alone is
  insufficient. Resolve illegible passages against another suitable source or
  ask about those passages rather than guessing notes.

For an event-based timeline, merge connected ties of the same pitch in the same
voice into one held event; preserve repeated attacks as separate events. Rests
advance time without sounding. Preserve pickups, trailing silence, and the
requested repeat/ending sequence. Do not substitute slurs for ties.

Keep score time distinct from performance timing. Store exact rhythmic values;
do not bake a chosen BPM, rubato, or pedal sustain into note lengths. Preserve
source performance instructions as annotations where supported, and distinguish
any added harmonic analysis from source information.

If the target format or renderer cannot express a source feature faithfully,
identify that limitation rather than rounding, discarding it, or redesigning the
app silently. Make schema or interface changes only within the user's request.

## Verify and deliver

- Check timing against measure boundaries, allowing pickups, meter changes, and
  intentional rests. Choose tick resolution that represents the source rhythms
  exactly if the destination uses integer ticks.
- Independently compare the opening, closing, and a representative passage with
  ties, accidentals, or overlapping voices against the source. Confirm that the
  final requested measure is present; derive counts from the resulting data.
- Run the relevant existing data and type checks. When application integration
  is requested, confirm it loads the completed asset and displays the requested
  range. Do not change unrelated application behavior.
- Deliver the score asset and provenance. Report coverage, note/voice counts,
  and any unresolved source or playback limitations. Identify a chosen demo
  tempo as a playback choice unless it comes from the source.

Keep one-off conversion work out of package scripts, application exports, and
this skill's reusable resources. Add a reusable executable helper only when a
repeated operation actually needs one or the user requests it.
