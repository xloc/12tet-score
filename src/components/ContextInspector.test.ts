import { expect, test } from 'vite-plus/test';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia } from 'pinia';
import type { Score } from '../music';
import { selectedIndices, type MusicSelection } from '../selection';
import { usePlaybackStore } from '../stores/playback';
import { useMidiStore } from '../stores/midi';
import { useScoreStore } from '../stores/score';
import { score, ticksPerBar, totalTicks, barCount } from '../test/score';
import ContextInspector from './ContextInspector.vue';

function textContent(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->|<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function renderInfo(selection: MusicSelection, bpm = score.bpm, next: Score = score) {
  const pinia = createPinia();
  const sheet = useScoreStore(pinia);
  sheet.load(next);
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
  const { panel, fields } = await renderInfo({ kind: 'notes', indices: [] }, 80);
  expect(fields).toEqual([
    `WHOLE PIECE: ${barCount} measures`,
    `TEMPO: ${score.bpm} BPM`,
    `METER: ${score.meter.join('/')}`,
  ]);
  expect(panel).not.toContain('80 BPM');
  expect(panel).not.toContain('KEY');
  expect(panel).toContain('title="Settings"');
});

test('one note shows its pitch and selection count without position or duration', async () => {
  const { panel, fields } = await renderInfo({ kind: 'notes', indices: [0] });
  expect(fields).toEqual(['NOTE: C4', 'SELECTED: 1 note']);
  expect(panel).not.toMatch(/MEASURES|TEMPO|METER|Span|beats/);
});

test('multiple notes show one recognized chord and the selected note count', async () => {
  const { panel, fields } = await renderInfo({ kind: 'notes', indices: [0, 1, 2] });
  expect(fields).toEqual(['CHORD: CM', 'SELECTED: 3 notes']);
  expect(panel).not.toContain('Em#5/C');
  expect(panel).not.toContain('Possible chord');
});

test('a time range counts the original note events sounding within it', async () => {
  const selection: MusicSelection = { kind: 'range', from: 0, to: ticksPerBar };
  const { panel, fields } = await renderInfo(selection);
  expect(fields).toEqual([
    'CHORD: CM',
    `SELECTED: ${selectedIndices(score.notes, selection).length} notes`,
  ]);
  expect(panel).not.toMatch(/MEASURES|Span|beats/);
});

test('unrecognized pitch sets show only the selection count', async () => {
  const { fields } = await renderInfo({ kind: 'range', from: 0, to: totalTicks });
  expect(fields).toEqual([`SELECTED: ${score.notes.length} notes`]);
});

test('an empty time range remains in selection mode', async () => {
  const { panel, fields } = await renderInfo({ kind: 'range', from: 480, to: 960 }, score.bpm, {
    ...score,
    notes: [
      { pitch: 60, at: 0, len: 480, voice: 1 },
      { pitch: 64, at: 1920, len: 480, voice: 1 },
    ],
  });
  expect(fields).toEqual(['SELECTED: 0 notes']);
  expect(panel).not.toContain('WHOLE PIECE');
});

test('switching contexts keeps the panel dimensions stable', async () => {
  const selections: MusicSelection[] = [
    { kind: 'notes', indices: [] },
    { kind: 'notes', indices: [0] },
    { kind: 'notes', indices: [0, 1, 2] },
    { kind: 'range', from: 0, to: totalTicks },
  ];
  const panels = await Promise.all(selections.map((selection) => renderInfo(selection)));
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
  sheet.load(score);
  sheet.selection = { kind: 'notes', indices: [0] };
  midi.ready = true;
  midi.inputs = {
    keyboard: { name: 'Keyboard', state: 'connected', pressed: { 0: new Set([72, 76]) } },
  };
  const html = await renderToString(createSSRApp(ContextInspector).use(pinia));
  expect(html).toContain('C5 · E5');
  expect(html).toContain('NOTE');
  expect(html).toContain('C4');
  expect(sheet.selection).toEqual({ kind: 'notes', indices: [0] });
  expect(sheet.selectedNotes).toEqual([score.notes[0]]);
});
