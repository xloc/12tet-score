# Score conventions in music-sheet

Read `src/music.ts` for the current `Note` and `Score` definitions; those types
are the authority. This reference explains their musical meaning and consumer
assumptions, rather than defining a separate schema.

Follow the existing score asset for required metadata and source fields. Notes
use absolute pitch, onset, held duration, and voice; optional annotations carry
musical interpretation and performance instructions.

| Field            | Meaning                                                                               |
| ---------------- | ------------------------------------------------------------------------------------- |
| `ppq`            | Integer ticks per quarter note.                                                       |
| `tempos[].bpm`   | Playback tempo in quarter notes per minute, separate from score time.                 |
| `meters[].meter` | Numerator/denominator pairs with their starting tick in `at`.                         |
| `groups`         | Stable identifiers and source-grounded names for hands or musical voices.             |
| `notes[].pitch`  | Absolute MIDI pitch in 12-TET; middle C is 60. Preserve octave, not just pitch class. |
| `notes[].at`     | Zero-based onset in ticks, relative to the requested excerpt or piece.                |
| `notes[].len`    | Held duration in ticks.                                                               |
| `notes[].groups` | Identifiers from `groups`.                                                            |
| `notes[].grace`  | `true` for a timed grace event, omitted for ordinary notes.                           |
| `annotations`    | Time-linked source instructions or explicitly labeled analysis.                       |
| `source`         | Name, link or local source, edition/reference, and known license.                     |

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

## Grace notes

Transcribe explicit grace notes as ordinary events in `Score.notes`, adding
`grace: true` to each grace event. Resolve pitch, octave, accidentals, order,
simultaneous grace chords, and source groups from the notation. Do not replace
them with `Grace notes: ...` in a principal note's `text` or in annotations.
The piano roll displays grace events as note bars without pitch, finger, or text
labels; they remain playable and selectable like other notes. Its note-bar
`title` includes `Grace note` so hovering identifies the event without adding
visible text.

Every grace event needs a positive `len` and a nonnegative `at`. These are a
chosen performance realization, rather than additional notated beats. Prefer
explicit timing in the source. When no playback timing is specified, use this
project's demo convention:

- For `grace` or `acciaccatura` before a principal note, use one quarter of each
  grace note's written duration. Fit the ordered group immediately before the
  principal onset, shortening preceding notes in the same source voice where
  necessary. Keep unrelated voices and the principal onset unchanged.
- For `appoggiatura`, use half the principal note's duration for the grace group,
  divided in proportion to the written grace durations. Start the grace group
  at the principal's original onset, delay and shorten that principal, and keep
  its original end unchanged.

If these choices would erase a preceding note or produce negative time, fit the
group into the beginning of the principal instead, preserving a positive
duration for every event. Adjust timing within the affected voice; do not shift
the remaining score or add beats to a measure. Preserve the total score extent,
repeat sequence, and other voices. Choose a finer PPQ if needed to keep the
chosen values exact.

Record the grace timing policy and any exceptions in `source.reference` so the
asset identifies its playback interpretation. Verify the grace sequence and
the neighboring ordinary note boundaries against the source. Trills, turns,
and mordents remain separate source instructions unless their realization is
explicitly requested.

The layout and playback use exact tick positions, including finer subdivisions
and tempo or meter changes. Keep display widths out of the score data.
