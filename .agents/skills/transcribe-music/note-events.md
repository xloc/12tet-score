# Score conventions in music-sheet

Read `src/music.ts` for the current `Note` and `Score` definitions; those types
are the authority. This reference explains their musical meaning and consumer
assumptions, rather than defining a separate schema.

Follow the existing score asset for required metadata and source fields. Notes
use absolute pitch, onset, held duration, and voice; optional annotations carry
musical interpretation and performance instructions.

| Field           | Meaning                                                                               |
| --------------- | ------------------------------------------------------------------------------------- |
| `ppq`           | Integer ticks per quarter note.                                                       |
| `bpm`           | Playback tempo in quarter notes per minute, separate from score time.                 |
| `meter`         | A numerator/denominator pair for a constant-meter piece.                              |
| `voices`        | Stable identifiers and source-grounded names for musical lines or parts.              |
| `notes[].pitch` | Absolute MIDI pitch in 12-TET; middle C is 60. Preserve octave, not just pitch class. |
| `notes[].at`    | Zero-based onset in ticks, relative to the requested excerpt or piece.                |
| `notes[].len`   | Held duration in ticks.                                                               |
| `notes[].voice` | An identifier from `voices`.                                                          |
| `annotations`   | Time-linked source instructions or explicitly labeled analysis.                       |
| `source`        | Name, link or local source, edition/reference, and known license.                     |

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

The current `notePlacement` helper in `src/music.ts` uses a fixed sixteenth-note
grid (`ppq / 4`), and the view/playback currently assumes one constant meter and
tempo. A source with finer subdivisions, tuplets, or changing meter/tempo needs
consumer support when integration is requested. Preserve the accurate source
data and identify the needed change; do not round rhythms or discard changes
just to fit the current demo.
