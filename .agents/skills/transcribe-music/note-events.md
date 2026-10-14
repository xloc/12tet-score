# Score conventions in music-sheet

Read `src/music.ts` for the current `Note` and `Score` definitions; those types
are the authority. This reference explains their musical meaning and consumer
assumptions, rather than defining a separate schema.

Follow the existing score asset for required metadata and source fields. Notes
use absolute pitch, onset, held duration, and voice; optional annotations carry
musical interpretation and performance instructions.

| Field              | Meaning                                                                               |
| ------------------ | ------------------------------------------------------------------------------------- |
| `ppq`              | Integer ticks per quarter note.                                                       |
| `tempos[].bpm`     | Playback tempo in quarter notes per minute, separate from score time.                 |
| `meters[].meter`   | Numerator/denominator pairs with their starting tick in `at`.                         |
| `groups`           | Stable identifiers and source-grounded names for hands or musical voices.             |
| `notes[].pitch`    | Absolute MIDI pitch in 12-TET; middle C is 60. Preserve octave, not just pitch class. |
| `notes[].at`       | Zero-based onset in ticks, relative to the requested excerpt or piece.                |
| `notes[].len`      | Held duration in ticks.                                                               |
| `notes[].groups`   | Identifiers from `groups`.                                                            |
| `notes[].ornament` | Pitch steps and timing relative to this particular main note.                         |
| `instructions`     | Short, plain-language directions for the whole piece, shown below its title.          |
| `annotations`      | Time-linked source instructions or explicitly labeled analysis.                       |
| `source`           | Name, link or local source, edition/reference, and known license.                     |

Choose `ppq` to represent every rhythmic denominator in the source. At 480 ticks
per quarter, a sixteenth lasts 120 ticks and a triplet eighth lasts 160 ticks;
480 does not represent every possible tuplet exactly. Keep exact times rather
than rounding to a fixed display grid. A renderer may require a finer grid even
when the file's tick resolution already represents the rhythm.

For a simple constant-meter piece, ticks per complete measure are
`ppq × numerator × 4 / denominator`. A pickup is shorter, and meter changes need
separate timed metadata. Preserve the requested total musical extent explicitly
when trailing rests mean it cannot be inferred from the final note's end. Use
existing project support or agree on the needed extension instead of silently
losing those features.

Chords are simultaneous note events with equal `at`; their voices and durations
may differ. A tie can span measure boundaries in one event. Enharmonic spelling,
scale degree, chord function, articulation, fermata, and similar meaning belong
in the project's optional metadata or annotation layer where needed.

Keep display-only choices such as pixel widths, zoom, pitch-axis folding, and
visible measure range out of the musical event data. Numeric storage does not
require numeric labels in the interface.

## JSON writing format

Write each short record on one line in `notes`, `tempos`, `meters`, `groups`,
`annotations`, `chords`, `pitchGuides`, `pedals`, and `sections`. Keep multiple
records on separate lines so musical events are easy to scan. A short array
containing only one record may stay inline with its field name.

Use ordinary JSON spacing without padding values into aligned columns. Preserve
existing property order when editing; for new notes, use `pitch`, `at`, `len`,
`groups`, then optional fields. Keep metadata such as `source` conventionally
indented. Scalar arrays such as pitches, groups, and rhythm weights stay compact
when they fit.

For example, these score fields use compact records:

```json
{
  "tempos": [{ "at": 0, "bpm": 80 }],
  "meters": [{ "at": 0, "meter": "4/4" }],
  "groups": [{ "id": "rh", "kind": "hand", "hand": "right", "name": "Right hand" }],
  "notes": [
    { "pitch": 60, "at": 0, "len": 480, "groups": ["rh"] },
    { "pitch": 62, "at": 480, "len": 240, "groups": ["rh"] }
  ],
  "annotations": [{ "at": 0, "len": 720, "text": "Connect notes" }]
}
```

Start records in this compact form, then run `pnpm exec vp fmt` on the authored
score files. The formatter preserves short single-line records but does not
collapse records already written across several lines. Allow long records,
including ornamented notes or lengthy instructions, to wrap normally. Use the
existing formatter; do not add a separate formatting tool or ignore rules to
force long records onto one line.

## Reader instructions

Write the reader-facing text when authoring the score; do not rely on a renderer
to translate source terminology. Use the reader's requested language, currently
English by default. Prefer short, familiar words, without sacrificing meaning.
Keep original terms available in the retained source or `source.reference`.

Choose the field that communicates the action's actual scope:

- `Score.instructions`: whole-piece directions, such as the opening overall
  pace or character. The score title area centers these beneath `Score.title`.
  An instruction at tick zero is not automatically a whole-piece direction.
- `Score.annotations`: directions that begin at a particular time or cover a
  passage, including expression, volume changes, slurs, and later pace changes.
  Use `at` for the start and add `len` only when the source establishes the end.
  A volume marking sets the level from that point; it is not a single-note
  instruction just because it is printed beside a note. Include a short hand or
  voice prefix when the source limits the direction to that part.
- `Note.text`: instructions for that specific note or attack, such as an accent,
  short release, or a hold. For a chord-wide instruction, label it once on an
  appropriate note rather than repeating the caption on every chord member.
  A hold on a rest belongs in a timed annotation, not on a neighboring note.
- `Score.pedals`: pedal actions with the correct pedal `type`, start, and duration.
  Optional `text` explains the action in plain language. Do not encode pedal
  sustain by extending the notes or substituting a general text annotation.
- `Score.sections`: named structural sections and directions limited to an
  actual section. Do not create a section just to display a performance label.

Keep numeric playback pace in `tempos` even when its printed instruction is
translated. A word such as `Largo` does not specify one exact BPM. Put a chosen
demo tempo and its provenance in `source.reference`; do not present it as an
instruction from the composer.

These English wording choices have been agreed with the reader.
Determine scope from the source; the table is not a global replacement rule.

| Source instruction              | Plain wording                  | Usual scope                                                   |
| ------------------------------- | ------------------------------ | ------------------------------------------------------------- |
| Largo                           | Slowly                         | Whole piece at the opening; timed if introduced later         |
| Poco moto                       | Keep a gentle pace             | Whole piece at the opening; timed if introduced later         |
| Spiritoso                       | Lively                         | Whole piece at the opening; timed if introduced later         |
| Lent et douloureux              | Slow and sad                   | Whole piece at the opening; timed if introduced later         |
| espressivo                      | With feeling                   | Passage; whole piece only if explicitly applicable throughout |
| accent                          | Stress this note               | Note or chord attack                                          |
| slur / legato                   | Connect notes                  | Source span / passage                                         |
| phrasing slur                   | Play as one sentence           | Source phrase span                                            |
| crescendo / cresc.              | Get louder                     | Passage                                                       |
| decrescendo / diminuendo / dim. | Get softer                     | Passage                                                       |
| pp / p / mp                     | Very soft / Soft / Medium soft | Level change at a time                                        |
| mf / f / ff                     | Medium loud / Loud / Very loud | Level change at a time                                        |
| staccato                        | Short                          | Note                                                          |
| tenuto                          | Full length                    | Note                                                          |
| fermata                         | Hold longer / Pause longer     | Note/chord / timed pause on a rest                            |

A phrasing slur groups a musical sentence; it must not be reduced to the same
instruction as a slur connecting notes. Context can also change a term's meaning.
Mordents, inverted mordents, and turns use playable events rather than reader
captions; follow [ornaments](#ornaments). Discuss a new or uncertain mapping with
the reader before applying it.

## Grace notes

Store grace notes inside the particular main note's `ornament`. Preserve that
main note's original `at` and full `len`, including any tied duration. Do not
store separate quick events, note IDs, absolute ornament onsets, or matching
anchors in the score asset. Resolve ownership from the source, especially when
only one tone of a chord is decorated.

`ornament.pitches` is an ordered array of steps. Write a number for a single
pitch and an array only for simultaneous pitches: `[62, [60, 64], 62]` means
three steps. Resolve octave, accidentals, and source voice before writing it.
Each step is played once; it is not an instruction to infer more repetitions.

Choose `timing` relative to the main note's original score interval:

- `beforeStart`: the group ends at the main note's original onset.
- `atStart`: the group starts at that onset, taking time from the main note's
  beginning; the ordinary main note follows and retains its original end.
- `beforeEnd`: the ordinary main attack comes first; the group occupies its
  tail and ends at the original end. Include any return to the main pitch as
  an explicit step; no ordinary main attack is appended afterward.

Optional `ornament.len` is the total group duration in the same integer ticks
as ordinary notes. Convert source proportions or explicit rhythmic values to
this single unit when transcribing. Do not interpret a small written note's
appearance alone as its exact performed length. Record the source evidence or
chosen demo interpretation in `source.reference`.

Optional `rhythm` supplies one positive relative weight per step. For example,
`pitches: [62, [60, 64], 62], len: 120, rhythm: [2, 1, 1]` allocates 60, 30,
and 30 ticks. Without weights, steps are equal. Preserve unequal source rhythms
instead of silently averaging them. No per-pitch lengths or offsets are needed.

When `len` is omitted, the demo requests `step count × ppq / 16` ticks. At the
start or end of a main note, cap that default at half its original length.
Before the start, use available silence first, then at most half the preceding
ordinary tail in the same voice. Compress automatic groups proportionally if
needed. This short fallback is a playback policy, not a universal musical rule;
specify `len` when the intended realization differs.

Explicit lengths may exceed half a note, but must leave positive ordinary
durations and fit without overwriting other ornaments. Conflicts are errors,
not reasons to silently change the timing mode or explicit length. Every step
must get positive integer ticks; increase PPQ when necessary. Cumulative rounding
preserves the group's total length.

For borrowing, provide source-grounded voice groups when a hand is polyphonic
or its predecessor is a chord. A hand alone can identify a donor only when the
preceding note is unambiguous. Restore the donor's original duration in the
stored score; only generated playback events are shortened. Other voices are
unchanged. An opening `beforeStart` uses a playback lead-in before tick zero;
do not shift the score, add a measure, or change it to `atStart`.

Display and playback derive the same timed events. Grace bars remain unlabeled,
selectable, and identifiable by their hover text. Previewing a main note includes
its ornament; resuming playback does not restart an already begun group.
Verify derived sequences and neighboring boundaries against the source.

## Ornaments

Resolve these ornaments into nested pitch steps. For an `atStart` realization,
the ordinary main note automatically follows the steps:

| Source pattern           | Quick events                               | Ordinary event                          |
| ------------------------ | ------------------------------------------ | --------------------------------------- |
| Mordent                  | Main pitch, lower neighbor                 | Main pitch, held for the remaining time |
| Inverted mordent / prall | Main pitch, upper neighbor                 | Main pitch, held for the remaining time |
| Turn                     | Upper neighbor, main pitch, lower neighbor | Main pitch, held for the remaining time |

Resolve neighboring pitches, octaves, and alterations from the source context;
do not assume a neighbor is one MIDI semitone away. Preserve explicitly specified
realizations and delayed figures. Use `beforeEnd` for a group occupying the end
of its owner, including an explicit final main-pitch step when needed. Remove
ornament captions; the nested pitch sequence communicates the action. Trills or
placements not expressible by these conventions require a separately agreed
realization rather than a guessed sequence.

Preserve other voices, chord tones, repeats, and note-specific instructions on
the main note. MIDI following reads each nested ornament directly from its owner
and retains the main note's original onset. Its quick steps are optional,
including partial sequences and simultaneous pitches in either MIDI key order.
They add no independent jump evidence. Ordinary-note matches, omissions, and
unrelated wrong notes retain their normal effects. Ornament timing cannot move
the owning bar or split an ordinary chord into several matching positions.

The layout and playback use exact tick positions, including finer subdivisions
and tempo or meter changes. Keep display widths out of the score data.
