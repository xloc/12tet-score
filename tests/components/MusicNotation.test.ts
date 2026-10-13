import { expect, test } from 'vite-plus/test';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import type { Note } from '../../src/music';
import MusicNotation from '../../src/components/MusicNotation.vue';
import { notationProps } from '../helpers/score';

test('wrapped notation shows both segments of a held note with the same selection identity', async () => {
  const notes: Note[] = [
    { pitch: 60, at: 1440, len: 960, groups: ['lh', '3'] },
    { pitch: 76, at: 1920, len: 480, groups: ['rh', '1'] },
  ];
  const html = await renderToString(
    createSSRApp(
      MusicNotation,
      notationProps({
        notes,
        totalTicks: 3840,
        ppq: 480,
        meters: [{ at: 0, meter: '4/4' }],
        foldThreshold: 0,
        variableBarWidth: false,
        playhead: 0,
        playing: false,
        selection: { kind: 'notes', indices: [0] },
      }),
    ),
  );
  expect(html.match(/data-score-line/g)).toHaveLength(2);
  const numberLabels = [...html.matchAll(/<span\b[^>]*data-time-label[^>]*>([\s\S]*?)<\/span>/g)];
  const numbers = numberLabels.map((match) => match[1]!.replace(/<!--[\s\S]*?-->/g, '').trim());
  expect(numbers).toEqual(['1', '2', '3', '4', '2', '2', '3', '4']);
  expect(numberLabels.every((match) => match[0].includes('bottom-full'))).toBe(true);
  const segments = [
    ...html.matchAll(/<button\b[^>]*data-note-index="0"[^>]*>[\s\S]*?<\/button>/g),
  ].map((match) => match[0]);
  expect(segments).toHaveLength(2);
  for (const segment of segments) {
    expect(segment).toContain('C4');
    expect(segment).toContain('outline-teal-700');
  }
  expect(segments[0]).toContain('grid-column:1 / -1');
  expect(segments[0]).toContain('grid-row:1;');
  expect(segments[0]).toContain('→');
  expect(segments[1]).toContain('grid-column:1 / -1');
  expect(segments[1]).toContain('grid-row:17;');
  expect(segments[1]).toContain('←');
});

test('a time range crossing a line break highlights each line within its own bounds', async () => {
  const html = await renderToString(
    createSSRApp(
      MusicNotation,
      notationProps({
        notes: [
          { pitch: 60, at: 0, len: 1920, groups: ['rh', '1'] },
          { pitch: 72, at: 1920, len: 1920, groups: ['rh', '1'] },
        ],
        totalTicks: 3840,
        ppq: 480,
        meters: [{ at: 0, meter: '4/4' }],
        foldThreshold: 0,
        variableBarWidth: false,
        playhead: 0,
        playing: false,
        selection: { kind: 'range', from: 1440, to: 2400 },
      }),
    ),
  );
  const highlights = html.match(/<span\b[^>]*data-time-range[^>]*>/g)!;
  expect(highlights).toHaveLength(2);
  for (const highlight of highlights) {
    expect(highlight).toContain('grid-column:1 / -1');
    expect(highlight).not.toContain('display:none');
  }
});

test('folded notation leaves blank pitch gaps and retains note timing, labels, and selection', async () => {
  for (const foldThreshold of [0, 12]) {
    const html = await renderToString(
      createSSRApp(
        MusicNotation,
        notationProps({
          notes: [
            { pitch: 48, at: 0, len: 1920, groups: ['lh', '3'] },
            { pitch: 72, at: 480, len: 480, groups: ['rh', '1'] },
          ],
          totalTicks: 1920,
          ppq: 480,
          meters: [{ at: 0, meter: '4/4' }],
          foldThreshold,
          variableBarWidth: false,
          playhead: 0,
          playing: false,
          selection: { kind: 'notes', indices: [0] },
        }),
      ),
    );
    const notes = [
      ...html.matchAll(/<button\b[^>]*data-note-index="\d"[^>]*>[\s\S]*?<\/button>/g),
    ].map((match) => match[0]);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain('C3');
    expect(notes[0]).toContain('outline-teal-700');
    expect(notes[0]).toContain('grid-column:1 / -1');
    expect(notes[0]).toContain(`grid-row:${foldThreshold ? 3 : 25};`);
    expect(notes[1]).toContain('C5');
    expect(notes[1]).toContain('grid-column:1 / -1');
    expect(notes[1]).toContain('grid-row:1;');
    const guides = html.match(/<span\b[^>]*h-px self-center[^>]*>/g)!;
    expect(guides).toHaveLength(foldThreshold ? 2 : 3);
    if (foldThreshold) {
      expect(html.match(/data-time-label/g)).toHaveLength(4);
      const fold = html.match(/<span\b[^>]*data-pitch-fold[^>]*><\/span>/)![0];
      expect(fold).not.toContain('bg-');
      expect(fold).not.toContain('title=');
      expect(html).not.toContain('unused pitches');
      const backgrounds = html.match(
        /<span\b[^>]*class="pointer-events-none bg-slate-200"[^>]*>/g,
      )!;
      expect(backgrounds).toHaveLength(2);
      expect(backgrounds[0]).toContain('grid-row:1 / 2');
      expect(backgrounds[1]).toContain('grid-row:3 / 4');
      expect(html).toContain('grid-template-rows:repeat(3, 0.5rem)');
    } else {
      expect(html).not.toContain('data-pitch-fold');
    }
  }
});

test('one playhead belongs to the correct wrapped line without waiting for measurement', async () => {
  for (const [playhead, lineIndex] of [
    [0, 0],
    [960, 0],
    [1920, 1],
    [2160, 1],
    [2400, 1],
  ] as const) {
    const html = await renderToString(
      createSSRApp(
        MusicNotation,
        notationProps({
          notes: [
            { pitch: 60, at: 0, len: 1920, groups: ['rh', '1'] },
            { pitch: 72, at: 1920, len: 480, groups: ['rh', '1'] },
          ],
          totalTicks: 2400,
          ppq: 480,
          meters: [{ at: 0, meter: '4/4' }],
          foldThreshold: 0,
          variableBarWidth: false,
          playhead,
          playing: false,
          selection: { kind: 'notes', indices: [] },
        }),
      ),
    );
    const lines = html.split(/<div\b[^>]*data-score-line/).slice(1);
    expect(html.match(/data-playhead/g)).toHaveLength(1);
    expect(lines[lineIndex]).toContain('data-playhead');
    const marker = lines[lineIndex]!.match(/<span\b[^>]*data-playhead[^>]*>/)![0];
    expect(marker).not.toContain('display:none');
  }
});

test('a score ending partway through a beat keeps its guide within the final line', async () => {
  const html = await renderToString(
    createSSRApp(
      MusicNotation,
      notationProps({
        notes: [{ pitch: 60, at: 0, len: 120, groups: ['rh', '1'] }],
        totalTicks: 120,
        ppq: 480,
        meters: [{ at: 0, meter: '4/4' }],
        foldThreshold: 0,
        variableBarWidth: false,
        playhead: 0,
        playing: false,
        selection: { kind: 'notes', indices: [] },
      }),
    ),
  );
  expect(html.match(/data-time-label/g)).toHaveLength(1);
  expect(html).toContain('min-width:32px;max-width:32px');
  expect(html).toContain('width:100%');
});

test('variable bars delegate sizing to flexbox and draw directly in each bar', async () => {
  const html = await renderToString(
    createSSRApp(
      MusicNotation,
      notationProps({
        notes: [
          ...Array.from({ length: 16 }, (_, index) => ({
            pitch: 60,
            at: index * 120,
            len: 120,
            groups: ['rh', '1'],
          })),
          { pitch: 72, at: 1920, len: 1920, groups: ['lh', '2'] },
        ],
        totalTicks: 3840,
        ppq: 480,
        meters: [{ at: 0, meter: '4/4' }],
        foldThreshold: 12,
        variableBarWidth: true,
        playhead: 2880,
        playing: false,
        selection: { kind: 'range', from: 1920, to: 3840 },
      }),
    ),
  );
  expect(html.match(/data-score-line/g)).toHaveLength(1);
  expect(html.match(/data-time-label/g)).toHaveLength(8);
  const bars = html.match(/<div\b[^>]*data-score-bar[^>]*>/g)!;
  expect(bars).toHaveLength(2);
  expect(bars[0]).toContain('flex-basis:512px;flex-grow:512;flex-shrink:1;min-width:384px');
  expect(bars[1]).toContain('flex-basis:128px;flex-grow:128;flex-shrink:1;min-width:96px');
  const marker = html.match(/<span\b[^>]*data-playhead[^>]*>/)![0];
  expect(marker).not.toContain('display:none');
  expect(marker).toContain('min(50%, calc(100% - 1px))');
  const chord = html.match(/<button\b[^>]*data-note-index="16"[^>]*>/)![0];
  const highlight = html.match(/<span\b[^>]*data-time-range[^>]*>/)![0];
  expect(chord).not.toContain('display:none');
  expect(chord).toContain('left:0%;width:100%');
  expect(highlight).not.toContain('display:none');
  expect(html).toContain('min-width:480px;max-width:640px');
  expect(html).toContain('C5');
});
