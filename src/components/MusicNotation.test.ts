import { expect, test } from 'vite-plus/test';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import type { Note } from '../music';
import MusicNotation from './MusicNotation.vue';

test('wrapped notation shows both segments of a held note with the same selection identity', async () => {
  const notes: Note[] = [
    { pitch: 60, at: 1440, len: 960, voice: 3 },
    { pitch: 76, at: 1920, len: 480, voice: 1 },
  ];
  const html = await renderToString(
    createSSRApp(MusicNotation, {
      notes,
      totalTicks: 3840,
      ppq: 480,
      ticksPerBar: 1920,
      foldThreshold: 0,
      playhead: 0,
      playing: false,
      selection: { kind: 'notes', indices: [0] },
    }),
  );
  expect(html.match(/data-score-line/g)).toHaveLength(2);
  const numbers = [...html.matchAll(/<span\b[^>]*data-time-label[^>]*>([\s\S]*?)<\/span>/g)].map(
    (match) => match[1]!.replace(/<!--[\s\S]*?-->/g, '').trim(),
  );
  expect(numbers).toEqual(['1', '2', '3', '4', '2', '2', '3', '4']);
  const segments = [
    ...html.matchAll(/<button\b[^>]*data-note-index="0"[^>]*>[\s\S]*?<\/button>/g),
  ].map((match) => match[0]);
  expect(segments).toHaveLength(2);
  for (const segment of segments) {
    expect(segment).toContain('C4');
    expect(segment).toContain('bg-teal-700');
  }
  expect(segments[0]).toContain('grid-column:13 / span 4');
  expect(segments[0]).toContain('grid-row:1;');
  expect(segments[0]).toContain('→');
  expect(segments[1]).toContain('grid-column:1 / span 4');
  expect(segments[1]).toContain('grid-row:17;');
  expect(segments[1]).toContain('←');
});

test('a time range crossing a line break highlights each line within its own bounds', async () => {
  const html = await renderToString(
    createSSRApp(MusicNotation, {
      notes: [
        { pitch: 60, at: 0, len: 1920, voice: 1 },
        { pitch: 72, at: 1920, len: 1920, voice: 1 },
      ],
      totalTicks: 3840,
      ppq: 480,
      ticksPerBar: 1920,
      foldThreshold: 0,
      playhead: 0,
      playing: false,
      selection: { kind: 'range', from: 1440, to: 2400 },
    }),
  );
  const highlights = html.match(/<span\b[^>]*border-x[^>]*>/g)!;
  expect(highlights).toHaveLength(2);
  expect(highlights[0]).toContain('grid-column:13 / 17');
  expect(highlights[1]).toContain('grid-column:1 / 5');
});

test('folded notation leaves blank pitch gaps and retains note timing, labels, and selection', async () => {
  for (const foldThreshold of [0, 12]) {
    const html = await renderToString(
      createSSRApp(MusicNotation, {
        notes: [
          { pitch: 48, at: 0, len: 1920, voice: 3 },
          { pitch: 72, at: 480, len: 480, voice: 1 },
        ],
        totalTicks: 1920,
        ppq: 480,
        ticksPerBar: 1920,
        foldThreshold,
        playhead: 0,
        playing: false,
        selection: { kind: 'notes', indices: [0] },
      }),
    );
    const notes = [
      ...html.matchAll(/<button\b[^>]*data-note-index="\d"[^>]*>[\s\S]*?<\/button>/g),
    ].map((match) => match[0]);
    expect(notes).toHaveLength(2);
    expect(notes[0]).toContain('C3');
    expect(notes[0]).toContain('bg-teal-700');
    expect(notes[0]).toContain('grid-column:1 / span 16');
    expect(notes[0]).toContain(`grid-row:${foldThreshold ? 3 : 25};`);
    expect(notes[1]).toContain('C5');
    expect(notes[1]).toContain('grid-column:5 / span 4');
    expect(notes[1]).toContain('grid-row:1;');
    const guides = html.match(/<span\b[^>]*h-px self-center[^>]*>/g)!;
    expect(guides).toHaveLength(foldThreshold ? 2 : 3);
    if (foldThreshold) {
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

test('one playhead follows wrapped lines and reaches the shorter final line end', async () => {
  for (const [playhead, lineIndex, percent] of [
    [0, 0, 0],
    [960, 0, 50],
    [1920, 1, 0],
    [2160, 1, 50],
    [2400, 1, 100],
  ] as const) {
    const html = await renderToString(
      createSSRApp(MusicNotation, {
        notes: [
          { pitch: 60, at: 0, len: 1920, voice: 1 },
          { pitch: 72, at: 1920, len: 480, voice: 1 },
        ],
        totalTicks: 2400,
        ppq: 480,
        ticksPerBar: 1920,
        foldThreshold: 0,
        playhead,
        playing: false,
        selection: { kind: 'notes', indices: [] },
      }),
    );
    const lines = html.match(/<div\b[^>]*data-score-line[^>]*>[\s\S]*?<\/div>/g)!;
    expect(html.match(/data-playhead/g)).toHaveLength(1);
    expect(lines[lineIndex]).toContain('data-playhead');
    const marker = lines[lineIndex]!.match(/<span\b[^>]*data-playhead[^>]*>/)![0];
    expect(marker).toContain(`left:min(${percent}%, calc(100% - 1px))`);
  }
});
