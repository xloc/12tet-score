import { expect, test } from 'vite-plus/test';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia } from 'pinia';
import { barCount, score, ticksPerBar } from '../music';
import { selectedIndices, type MusicSelection } from '../selection';
import { usePlaybackStore } from '../stores/playback';
import { useScoreStore } from '../stores/score';
import MusicControls from './MusicControls.vue';

async function renderInfo(selection: MusicSelection, bpm = score.bpm) {
  const pinia = createPinia();
  useScoreStore(pinia).selection = selection;
  usePlaybackStore(pinia).bpm = bpm;
  const html = await renderToString(createSSRApp(MusicControls).use(pinia));
  const panel = html.match(/<section\b[^>]*>[\s\S]*?<\/section>/g)![1]!;
  const fields = [...panel.matchAll(/<dt\b[^>]*>([^<]*)<\/dt>\s*<dd\b[^>]*>([^<]*)<\/dd>/g)].map(
    (match) => ({ label: match[1]!.trim(), value: match[2]!.trim() }),
  );
  const buttons = [...panel.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)];
  const hear = buttons.find(
    (match) => match[2]!.replace(/<!--[\s\S]*?-->/g, '').trim() === 'Hear',
  )!;
  return { panel, fields, hearDisabled: /(?:^|\s)disabled(?:\s|=|$)/.test(hear[1]!) };
}

test('empty selection shows the current tempo, meter, and piece length', async () => {
  const { panel, fields, hearDisabled } = await renderInfo({ kind: 'notes', indices: [] }, 80);
  expect(panel).toContain('Whole piece');
  expect(fields).toEqual([
    { label: 'Tempo', value: '80 BPM' },
    { label: 'Meter', value: score.meter.join('/') },
    { label: 'Length', value: `${barCount} measures` },
  ]);
  expect(hearDisabled).toBe(true);
});

test('one note shows pitch, position, held duration, and the playback tempo', async () => {
  const { panel, fields, hearDisabled } = await renderInfo({ kind: 'notes', indices: [0] }, 90);
  expect(panel).toContain('C4');
  expect(fields).toEqual([
    { label: 'Measure · beat', value: '1 · 1' },
    { label: 'Duration', value: '2 beats' },
    { label: 'Tempo', value: '90 BPM' },
  ]);
  expect(hearDisabled).toBe(false);
});

test('multiple notes show elapsed span and a suggested chord', async () => {
  const { panel, fields } = await renderInfo({ kind: 'notes', indices: [0, 1, 2] });
  expect(panel).toContain('3 notes');
  expect(fields).toEqual([
    { label: 'Measure · beat', value: '1 · 1' },
    { label: 'Time span', value: '2 beats' },
    { label: 'Possible chord', value: 'C' },
  ]);
});

test('a time range shows its own span and the notes sounding within it', async () => {
  const selection: MusicSelection = { kind: 'range', from: 0, to: ticksPerBar };
  const { panel, fields } = await renderInfo(selection);
  expect(panel).toContain(`${selectedIndices(score.notes, selection).length} notes`);
  expect(fields).toEqual([
    { label: 'Measure · beat', value: '1 · 1' },
    { label: 'Time span', value: '4 beats' },
    { label: 'Possible chord', value: 'C' },
  ]);
});

test('switching contexts preserves the same panel elements and layout classes', async () => {
  const selections: MusicSelection[] = [
    { kind: 'notes', indices: [] },
    { kind: 'notes', indices: [0] },
    { kind: 'notes', indices: [0, 1, 2] },
    { kind: 'range', from: 0, to: ticksPerBar },
  ];
  const panels = await Promise.all(
    selections.map(async (selection) => (await renderInfo(selection)).panel),
  );
  const shapes = panels.map((panel) =>
    panel
      .match(/<[a-z][^>]*>/g)!
      .map((tag) => tag.replace(/ title="[^"]*"/g, '').replace(/ disabled/g, '')),
  );
  for (const shape of shapes) expect(shape).toEqual(shapes[0]);
});

test('settings show the shared pitch-fold threshold', async () => {
  const pinia = createPinia();
  const sheet = useScoreStore(pinia);
  expect(sheet.foldThreshold).toBe(12);
  for (let threshold = 0; threshold <= 15; threshold++) {
    sheet.foldThreshold = threshold;
    const html = await renderToString(createSSRApp(MusicControls).use(pinia));
    const input = html.match(/<input\b[^>]*id="fold-threshold"[^>]*>/)![0];
    const output = html.match(/<output\b[^>]*for="fold-threshold"[^>]*>([^<]*)<\/output>/)![1];
    expect(input).toContain(`value="${threshold}"`);
    expect(output!.trim()).toBe(threshold === 0 ? '0 (off)' : `${threshold} unused pitches`);
  }
});

test('transport switches between Play, Pause, and Resume and always allows going to the start', async () => {
  for (const [status, tick, label] of [
    ['stopped', 0, 'Play'],
    ['stopped', 480, 'Play'],
    ['playing', 480, 'Pause'],
    ['paused', 480, 'Resume'],
  ] as const) {
    const pinia = createPinia();
    const playback = usePlaybackStore(pinia);
    playback.status = status;
    playback.currentTick = tick;
    const html = await renderToString(createSSRApp(MusicControls).use(pinia));
    const primary = html.match(new RegExp(`<button\\b[^>]*title="${label}"[^>]*>`))![0];
    expect(primary).not.toMatch(/\sdisabled(?:\s|=|>)/);
    const start = html.match(/<button\b[^>]*title="Go to start"[^>]*>/)![0];
    expect(start).not.toMatch(/\sdisabled(?:\s|=|>)/);
  }
});
