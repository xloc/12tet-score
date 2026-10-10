# Context inspector

The inspector explains the current score or selection in a compact panel.

## Current behavior

- With no selection, show whole-piece context: total measures, default tempo in
  BPM, and meter. Constant values apply to the whole piece and stay unchanged
  while scrolling. Playback tempo remains separately adjustable in Settings.
- With one selected note, show its pitch under NOTE.
- With multiple selected notes, show one recognized chord under CHORD when
  applicable. Otherwise show only the selected note count.
- Show the selected note count under SELECTED. A time range containing no notes
  still represents a selection and shows zero notes.
- Count original note events once, including held notes crossing measures or
  lines. Do not list all selected pitches or infer hands, voices, or phrasing.
- Omit selection position and span. Omit key signature when structured data is
  unavailable.
- Put context labels above values. Emphasize the pitch or chord; keep the count
  secondary. Keep each label close to its value. Use two rows and keep panel
  dimensions stable between modes.
- Include MIDI as one field, replacing the separate MIDI panel. Show connection
  status when idle, up to three pressed pitches, or the note count for larger
  groups. MIDI input does not change the score selection or its chord analysis.
- Clicking anywhere on the inspector opens one native Settings dialog. A small
  settings icon and hover/focus feedback identify the panel as an entry point.
  Keep the inspector's two-row layout and height unchanged.
- Group settings vertically into Score display, MIDI, and Playback. Move the
  settings entry out of the playback panel. Show display controls and MIDI even
  before a score is loaded, and keep them usable during playback.
- Use consistent labels, current values, and control colors. Render variable
  bar width as a native checkbox styled as a switch. Keep range sliders for
  pitch folding and playback speed.
- Use a grouped form hierarchy in Settings: a light gray dialog background,
  white rounded groups, and small secondary section titles above the groups.
  Align option names to the left and values and controls to the right. Use
  inset separators within groups. Keep option-specific help directly below its
  control in smaller secondary text. Place MIDI connection explanations below
  the white group as a section footer, aligned with the option labels. Use
  regular 12px system text and the dialog's secondary text color so guidance
  stays distinct from actionable rows. This adapts Apple's
  [label hierarchy](https://developer.apple.com/design/human-interface-guidelines/labels)
  and [section footers](https://developer.apple.com/documentation/uikit/adding-headers-and-footers-to-table-sections)
  to the web dialog.
- Include device names, connection states, and the complete pressed-pitch list
  in Settings. Connect and disconnect controls live here. Opening the dialog
  does not request MIDI permission.
- Label the playback tempo override as Playback speed. Disable only that
  control during playback; the inspector continues to show the score tempo.
- Keep Play selection in the playback panel. It plays the selected notes in
  their original timing within the selection. Normal Play retains its playhead
  behavior regardless of selection.

## Future score context

- Once structured tempo, meter, or key-signature changes are supported, use
  local viewport context for the changing values. Constant values can continue
  to represent the whole piece.
- When the visible range crosses changes, show a compact change indication and
  make the detailed positions and values available through expanded content.
- Key signature and tonal key are distinct. Relative harmonic interpretation
  requires the corresponding musical context in the score.
- Add selected notes' degrees relative to their chord once that context is
  supplied by the score. Show relevant source annotations when available.
- Existing natural-language annotations preserve source information but do not
  define structured tempo, meter, key, or chord-degree data. Missing information
  does not receive an empty placeholder in the inspector.
