import { expect, test } from 'vite-plus/test';
import { decodeBluetoothMidi } from '../src/bluetooth-midi';

function decode(bytes: number[]) {
  return decodeBluetoothMidi(new DataView(Uint8Array.from(bytes).buffer)).map((message) => [
    ...message,
  ]);
}

test('timestamps are removed from bundled channel messages, including timestamp wraparound', () => {
  expect(decode([0xbf, 0xff, 0x92, 60, 100, 0x80, 0x92, 64, 90, 0x81, 0x82, 60, 0])).toEqual([
    [0x92, 60, 100],
    [0x92, 64, 90],
    [0x82, 60, 0],
  ]);
});

test('running status supports messages with or without a new timestamp', () => {
  expect(decode([0x80, 0x80, 0x90, 60, 100, 64, 90, 0xa1, 67, 80, 0xa2, 60, 0])).toEqual([
    [0x90, 60, 100],
    [0x90, 64, 90],
    [0x90, 67, 80],
    [0x90, 60, 0],
  ]);
});

test('one-byte channel data does not consume the following note message', () => {
  expect(decode([0x80, 0x81, 0xc0, 12, 13, 0x82, 0xd0, 50, 0x83, 0x90, 60, 100])).toEqual([
    [0xc0, 12],
    [0xc0, 13],
    [0xd0, 50],
    [0x90, 60, 100],
  ]);
});

test('system common and real-time messages preserve running status within the packet', () => {
  expect(
    decode([
      0x80, 0x81, 0x90, 60, 100, 0x82, 0xf8, 0x83, 64, 90, 0x84, 0xf2, 1, 2, 0x85, 67, 80, 0x86,
      0xf1, 7, 0x87, 0xb3, 123, 0,
    ]),
  ).toEqual([
    [0x90, 60, 100],
    [0x90, 64, 90],
    [0x90, 67, 80],
    [0xb3, 123, 0],
  ]);
});

test('SysEx and its real-time interruptions are ignored until the end marker', () => {
  expect(
    decode([0x80, 0x81, 0xf0, 1, 2, 0x82, 0xf8, 3, 4, 0x83, 0xf7, 0x84, 0x90, 60, 100]),
  ).toEqual([[0x90, 60, 100]]);
  expect(decode([0x80, 1, 2, 0x82, 0xf8, 3, 0x83, 0xf7, 0x84, 0x90, 64, 100])).toEqual([
    [0x90, 64, 100],
  ]);
  expect(decode([0x80, 0x81, 0xf0, 1, 2])).toEqual([]);
});

test('running status never carries across packet boundaries', () => {
  expect(decode([0x80, 0x81, 0x90, 60, 100])).toEqual([[0x90, 60, 100]]);
  expect(decode([0x80, 0x82, 64, 100])).toEqual([]);
});

test('empty, invalid, and truncated packets do not produce incomplete notes', () => {
  for (const bytes of [[], [0x80], [0, 0x80, 0x90, 60, 100], [0x80, 0x80, 0x90, 60]]) {
    expect(decode(bytes)).toEqual([]);
  }
  expect(decode([0x80, 0x81, 0x90, 60, 100, 0x82])).toEqual([[0x90, 60, 100]]);
  expect(decode([0x80, 0x81, 0x90, 60, 0x82])).toEqual([]);
});

test('decoding respects the notification DataView byte offset and length', () => {
  const bytes = new Uint8Array([0, 0, 0x80, 0x81, 0x90, 60, 100, 0, 0]);
  expect(decodeBluetoothMidi(new DataView(bytes.buffer, 2, 5))).toEqual([
    new Uint8Array([0x90, 60, 100]),
  ]);
});
