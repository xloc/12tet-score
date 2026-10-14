import { expect, test } from 'vite-plus/test';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { scoreLines } from '../../src/layout';
import MusicBar from '../../src/components/MusicBar.vue';
import type { TimedNote as Note } from '../../src/music';

test('grace notes render selectable note bars without labels or connectors', async () => {
  const notes: Note[] = [
    { pitch: 71, at: 0, len: 60, groups: ['rh'], grace: true, finger: 2, text: 'Grace detail' },
    { pitch: 69, at: 60, len: 420, groups: ['rh'] },
  ];
  const [line] = scoreLines(notes, 480, {
    ppq: 480,
    meters: [{ at: 0, meter: '4/4' }],
    width: 512,
    rem: 16,
    foldThreshold: 0,
    variableBarWidth: false,
  });
  const html = await renderToString(
    createSSRApp(MusicBar, {
      line: line!,
      bar: line!.bars[0]!,
      ppq: 480,
      selected: new Set([0]),
      range: null,
      playhead: undefined,
      labels: { 0: { label: { left: 0, top: -18 }, connector: { left: 4, top: -2, height: 2 } } },
      groups: [],
      pitchGuides: [],
    }),
  );
  const grace = html.match(/<button\b[^>]*data-note-index="0"[^>]*>[\s\S]*?<\/button>/)![0];
  expect(grace).toContain('left:0%;width:12.5%');
  expect(grace).toContain('tabindex="0"');
  expect(grace).toContain('outline-teal-700');
  expect(grace).toContain('title="B4 · Grace note · 0.125 quarter notes');
  expect(grace.replace(/^<button\b[^>]*>/, '')).not.toMatch(
    /data-pitch-label|bg-current|B4|finger|Grace detail/,
  );
  expect(html.match(/data-pitch-label/g)).toHaveLength(1);
  expect(html).toContain('A4');
  expect(html).toContain('title="A4 · 0.875 quarter notes');
});

async function heldNote() {
  const note = { pitch: 60, at: 1440, len: 2880, groups: ['lh', '3'] };
  const lines = scoreLines([note, { pitch: 72, at: 3840, len: 480, groups: ['rh', '1'] }], 5760, {
    ppq: 480,
    meters: [{ at: 0, meter: '4/4' }],
    width: 1024,
    rem: 16,
    foldThreshold: 0,
    variableBarWidth: false,
  });
  const html = await renderToString(
    createSSRApp({
      render: () =>
        h(
          'div',
          lines.flatMap((line) =>
            line.bars.map((bar) =>
              h(MusicBar, {
                line,
                bar,
                ppq: 480,
                selected: new Set([0]),
                groups: [],
                pitchGuides: [],
                labels: {},
                range: { from: 1440, to: 4320 },
                playhead: undefined,
              }),
            ),
          ),
        ),
    }),
  );
  return { note, html };
}

test('held notes use one fragment rule across bar and line boundaries with one label per line', async () => {
  const { note, html } = await heldNote();
  const fragments = [
    ...html.matchAll(/<button\b[^>]*data-note-index="0"[^>]*>[\s\S]*?<\/button>/g),
  ].map((match) => match[0]);
  expect(fragments).toHaveLength(3);
  expect(fragments[0]).toContain('left:75%;width:25%');
  expect(fragments[1]).toContain('left:0%;width:100%');
  expect(fragments[2]).toContain('left:0%;width:25%');
  expect(fragments[0]).toContain('grid-row:1;');
  expect(fragments[2]).toContain('grid-row:13;');
  expect(fragments[0]).toContain('C4');
  expect(fragments[0]).toContain('→');
  expect(fragments[1]).not.toContain('data-pitch-label');
  expect(fragments[2]).toContain('C4');
  expect(fragments[2]).toContain('←');
  expect(fragments.every((fragment) => fragment.includes('outline-teal-700'))).toBe(true);
  expect(note.len).toBe(2880);
});

test('internal fragments keep continuous ends and do not add keyboard tab stops', async () => {
  const { html } = await heldNote();
  const fragments = html.match(/<button\b[^>]*data-note-index="0"[^>]*>/g)!;
  expect(fragments[0]).toContain('rounded-l-sm');
  expect(fragments[0]).not.toContain('rounded-r-sm');
  expect(fragments[1]).not.toContain('rounded-l-sm');
  expect(fragments[1]).toContain('rounded-r-sm');
  expect(fragments[0]).toContain('tabindex="0"');
  expect(fragments[1]).toContain('tabindex="-1"');
  expect(fragments[2]).toContain('tabindex="0"');
});

test('time-range borders mark selection and line ends without adding borders inside a line', async () => {
  const { html } = await heldNote();
  const highlights = html.match(/<span\b[^>]*data-time-range[^>]*>/g)!;
  expect(highlights).toHaveLength(3);
  expect(highlights[0]).toContain('border-l ');
  expect(highlights[0]).not.toContain('border-r');
  expect(highlights[1]).not.toContain('border-l');
  expect(highlights[1]).toContain('border-r');
  expect(highlights[2]).toContain('border-l border-r');
});
