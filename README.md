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

## MIDI connections

Open Settings to connect a keyboard. **System MIDI** uses Web MIDI for USB devices
and Bluetooth devices already configured in your operating system. **Bluetooth
MIDI** connects directly to one BLE MIDI keyboard through the browser's device
picker; it can be used alongside System MIDI.

Bluetooth MIDI requires HTTPS or localhost and a device advertising the standard
BLE MIDI service. Chrome and Edge on Windows/macOS and Chrome on Android support
Web Bluetooth. Safari, Firefox, and standard iPhone/iPad browsers do not support
it natively; Chrome on Linux requires an experimental flag. Bluetooth must be
enabled, and your operating system may request Bluetooth access or pairing.
See the [Web Bluetooth implementation status](https://github.com/whatwg/bluetooth/blob/main/implementation-status.md).

The last successfully connected Bluetooth keyboard is remembered locally. After
a refresh, the app reconnects without opening the device picker when the browser
provides `getDevices()` and retains device permission. If advertisement scanning
is available, it waits up to 10 seconds for the keyboard to appear before connecting.
Chrome currently gates these features behind
`chrome://flags/#enable-experimental-web-platform-features` and
`chrome://flags/#enable-web-bluetooth-new-permissions-backend`. Browsers without
these capabilities still require selecting the keyboard again. Disconnecting in
Settings stops automatic reconnection; refreshing or an unexpected disconnection
keeps the remembered choice. Clearing site data or revoking device permission
requires selecting the keyboard again. See the
[Chrome reconnection sample](https://googlechrome.github.io/samples/web-bluetooth/watch-advertisements-and-connect.html).

Both connections display a note or chord name followed by the held-key count,
such as `C4 · 1 note` or `Cmaj7 · 4 notes`. Chord detection matches the held
pitch classes against Tonal's chord dictionary, preserving the lowest pitch as
the bass. Unmatched combinations show the note list. The name or list truncates
with an ellipsis when space runs out,
while the held-key count stays visible. The tooltip and Settings retain the full
pitch list. Disconnecting either connection clears its
held notes without interrupting the other connection. Bluetooth timestamps are
decoded as packet framing; key changes are displayed on receipt, without playback
scheduling or MIDI output.

## Project references

- [Notation discussion](music_notation_chat.md)
- [Project conventions](CLAUDE.md)
- [BWV 846 score data](src/scores/bwv846-prelude.json)
- [Original LilyPond source](sources/bwv846/wtk1-prelude1.ly)
- [Music transcription skill](.agents/skills/transcribe-music/SKILL.md)
