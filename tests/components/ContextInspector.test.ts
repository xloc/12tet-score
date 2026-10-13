import { expect, test } from 'vite-plus/test';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia } from 'pinia';
import type { Score } from '../../src/music';
import { type MusicSelection } from '../../src/selection';
import { usePlaybackStore } from '../../src/stores/playback';
import { useMidiStore } from '../../src/stores/midi';
import { useScoreStore } from '../../src/stores/score';
import { createScore } from '../helpers/score';
import ContextInspector from '../../src/components/ContextInspector.vue';

function textContent(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->|<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function renderInfo(score: Score, selection: MusicSelection, bpm = 60) {
  const pinia = createPinia();
  const sheet = useScoreStore(pinia);
  sheet.load(score);
  sheet.selection = selection;
  usePlaybackStore(pinia).bpm = bpm;
  const panel = await renderToString(createSSRApp(ContextInspector).use(pinia));
  const fields = [
    ...panel
      .replace(/<dialog\b[\s\S]*?<\/dialog>/g, '')
      .matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>\s*<dd\b[^>]*>([\s\S]*?)<\/dd>/g),
  ].map((match) => `${textContent(match[1]!)}: ${textContent(match[2]!)}`);
  return { panel: panel.replace(/<dialog\b[\s\S]*?<\/dialog>/g, ''), fields };
}

test('no selection shows whole-piece context using the score default tempo', async () => {
  const score = createScore({ notes: [{ pitch: 60, at: 0, len: 1920, groups: [] }] });
  const { panel, fields } = await renderInfo(score, { kind: 'notes', indices: [] }, 80);
  expect(fields).toEqual(['WHOLE PIECE: 1 measures', 'TEMPO: 60 BPM', 'METER: 4/4']);
  expect(panel).not.toContain('80 BPM');
  expect(panel).not.toContain('KEY');
  expect(panel).toContain('title="Settings"');
});

test('one note shows its pitch and selection count without position or duration', async () => {
  const score = createScore({ notes: [{ pitch: 60, at: 0, len: 480, groups: [] }] });
  const { panel, fields } = await renderInfo(score, { kind: 'notes', indices: [0] });
  expect(fields).toEqual(['NOTE: C4', 'SELECTED: 1 note']);
  expect(panel).not.toMatch(/MEASURES|TEMPO|METER|Span|beats/);
});

test('multiple notes show one recognized chord and the selected note count', async () => {
  const score = createScore({
    notes: [60, 64, 67].map((pitch) => ({ pitch, at: 0, len: 480, groups: [] })),
  });
  const { panel, fields } = await renderInfo(score, { kind: 'notes', indices: [0, 1, 2] });
  expect(fields).toEqual(['CHORD: CM', 'SELECTED: 3 notes']);
  expect(panel).not.toContain('Em#5/C');
  expect(panel).not.toContain('Possible chord');
});

test('a time range counts original note events held across a measure boundary once', async () => {
  const score = createScore({
    notes: [
      { pitch: 60, at: 1440, len: 960, groups: [] },
      { pitch: 64, at: 1920, len: 240, groups: [] },
      { pitch: 67, at: 1920, len: 480, groups: [] },
    ],
  });
  const { panel, fields } = await renderInfo(score, { kind: 'range', from: 1920, to: 2400 });
  expect(fields).toEqual(['CHORD: CM', 'SELECTED: 3 notes']);
  expect(panel).not.toMatch(/MEASURES|Span|beats/);
});

test('unrecognized pitch sets show only the selection count', async () => {
  const score = createScore({
    notes: [60, 67, 69].map((pitch) => ({ pitch, at: 0, len: 480, groups: [] })),
  });
  const { fields } = await renderInfo(score, { kind: 'range', from: 0, to: 480 });
  expect(fields).toEqual(['SELECTED: 3 notes']);
});

test('an empty time range remains in selection mode', async () => {
  const score = createScore({
    notes: [
      { pitch: 60, at: 0, len: 480, groups: [] },
      { pitch: 64, at: 1920, len: 480, groups: [] },
    ],
  });
  const { panel, fields } = await renderInfo(score, { kind: 'range', from: 480, to: 960 });
  expect(fields).toEqual(['SELECTED: 0 notes']);
  expect(panel).not.toContain('WHOLE PIECE');
});

test('switching contexts keeps the panel dimensions stable', async () => {
  const score = createScore({
    notes: [60, 64, 67].map((pitch) => ({ pitch, at: 0, len: 480, groups: [] })),
  });
  const selections: MusicSelection[] = [
    { kind: 'notes', indices: [] },
    { kind: 'notes', indices: [0] },
    { kind: 'notes', indices: [0, 1, 2] },
    { kind: 'range', from: 480, to: 960 },
  ];
  const panels = await Promise.all(selections.map((selection) => renderInfo(score, selection)));
  const roots = panels.map(({ panel }) => panel.match(/<section\b[^>]*>/)![0]);
  for (const root of roots) expect(root).toBe(roots[0]);
});

test('MIDI stays available without a score and does not change the score selection', async () => {
  const pinia = createPinia();
  const sheet = useScoreStore(pinia);
  const midi = useMidiStore(pinia);
  const empty = await renderToString(createSSRApp(ContextInspector).use(pinia));
  expect(empty).toContain('title="Settings"');
  expect(empty).not.toContain('WHOLE PIECE');
  const note = { pitch: 60, at: 0, len: 480, groups: [] };
  sheet.load(createScore({ notes: [note] }));
  sheet.selection = { kind: 'notes', indices: [0] };
  midi.ready = true;
  midi.inputs = {
    keyboard: {
      name: 'Keyboard',
      state: 'connected',
      transport: 'midi',
      pressed: { 0: new Set([72, 76]) },
    },
  };
  const html = await renderToString(createSSRApp(ContextInspector).use(pinia));
  expect(html).toContain('2 notes');
  expect(html).toContain('title="C5 · E5"');
  expect(html).toContain('NOTE');
  expect(html).toContain('C4');
  expect(sheet.selection).toEqual({ kind: 'notes', indices: [0] });
  expect(sheet.selectedNotes).toEqual([note]);
});
