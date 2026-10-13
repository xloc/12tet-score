import { expect, test } from 'vite-plus/test';
import { createSSRApp, h, shallowRef } from 'vue';
import { renderToString } from 'vue/server-renderer';
import type { Annotation, Score } from '../../src/music';
import { scoreAnnotations, type DisplayAnnotation } from '../../src/annotations';
import { scoreDuration } from '../../src/music';
import { scoreLines } from '../../src/layout';
import AnnotationLane from '../../src/components/AnnotationLane.vue';
import MusicNotation from '../../src/components/MusicNotation.vue';
import type { MusicSelection } from '../../src/selection';
import { createScore } from '../helpers/score';

function render(
  score: Score,
  variableBarWidth = false,
  selection: MusicSelection = { kind: 'notes', indices: [] },
) {
  return renderToString(
    createSSRApp(MusicNotation, {
      score,
      totalTicks: scoreDuration(score),
      foldThreshold: 12,
      variableBarWidth,
      playhead: 0,
      playing: false,
      selection,
    }),
  );
}

test('note markings and annotation lanes render below the roll without a legend', async () => {
  const score = createScore({
    groups: [
      { id: 'rh', kind: 'hand', hand: 'right', name: 'Right hand' },
      { id: 'melody', kind: 'voice', name: 'Melody' },
      { id: 'bass', kind: 'voice', name: 'Bass' },
    ],
    notes: [
      {
        pitch: 60,
        at: 0,
        len: 3360,
        groups: ['rh', 'melody'],
        finger: 1,
        text: 'Keep your hand relaxed.',
      },
      { pitch: 64, at: 0, len: 3360, groups: ['bass'] },
    ],
    meters: [
      { at: 0, meter: '4/4' },
      { at: 1920, meter: '6/8' },
    ],
    tempos: [
      { at: 0, bpm: 80 },
      { at: 1920, bpm: 100 },
    ],
    sections: [{ at: 0, title: 'Opening' }],
    annotations: [{ at: 0, len: 3360, text: 'Play smoothly' }],
    chords: [{ at: 0, len: 3360, root: 'C', type: 'maj7' }],
    pedals: [{ at: 0, len: 3360, type: 'sustain' }],
  });
  const html = await render(score, false, { kind: 'notes', indices: [0] });
  expect(html).not.toContain('data-group-legend');
  expect(html).toContain('finger 1');
  expect(html).toContain('Keep your hand relaxed.');
  expect(html).toContain('background-color:#f97316');
  expect(html).toContain('background-color:#2563eb');
  expect(html).toContain('repeating-linear-gradient');
  expect(html).toContain('outline-teal-700');
  for (const kind of ['text', 'chord', 'pedal', 'timing'])
    expect(html).toContain(`data-annotation-kind="${kind}"`);
  expect(html).toContain('Cmaj7');
  expect(html).toContain('Sustain pedal');
  expect(html).toContain('6/8');
  expect(html).toContain('100 BPM');
  expect(html).toContain('data-annotation-continued');
  const firstLine = html.split('data-score-line')[1]!;
  const order = [
    'data-section',
    'data-bar-numbering',
    'data-piano-roll',
    'data-annotation-tracks',
    'data-annotation-kind="chord"',
    'data-annotation-kind="pedal"',
    'data-annotation-kind="text"',
  ].map((marker) => firstLine.indexOf(marker));
  expect(order.every((index) => index !== -1)).toBe(true);
  expect(order).toEqual([...order].sort((a, b) => a - b));
  for (const line of html.split('data-score-line').slice(1)) {
    expect(line.indexOf('data-bar-numbering')).toBeLessThan(line.indexOf('data-piano-roll'));
    const annotations = line.indexOf('data-annotation-kind');
    if (annotations !== -1) expect(annotations).toBeGreaterThan(line.indexOf('data-piano-roll'));
  }
});

test('text and chord pills round true boundaries and keep continuation edges square', async () => {
  const html = await render(
    createScore({
      notes: [{ pitch: 60, at: 0, len: 5760, groups: [] }],
      meters: [{ at: 0, meter: '4/4' }],
      tempos: [{ at: 0, bpm: 80 }],
      annotations: [
        { at: 480, len: 4320, text: 'Play smoothly' },
        { at: 240, text: 'Listen to the melody' },
      ],
      chords: [{ at: 480, len: 4320, root: 'C', type: 'maj7' }],
    }),
  );
  const lines = html.split('data-score-line').slice(1);
  expect(lines).toHaveLength(3);
  for (const kind of ['text', 'chord']) {
    const segments = html.match(
      new RegExp(`<div\\b[^>]*data-annotation-kind="${kind}"[^>]*>[\\s\\S]*?<\\/div>`, 'g'),
    )!;
    const interval = segments.filter((segment) => segment.includes('data-annotation-interval'));
    expect(interval).toHaveLength(3);
    for (const [index, segment] of interval.entries()) {
      expect(segment.includes('data-annotation-continued')).toBe(index > 0);
      expect(segment.includes('data-annotation-continues')).toBe(index < 2);
      expect(segment.includes('rounded-l-xl')).toBe(index === 0);
      expect(segment.includes('rounded-r-xl')).toBe(index === 2);
      expect(segment).toContain('bg-slate-100');
      expect(segment).toContain(kind === 'text' ? 'Play smoothly' : 'Cmaj7');
      expect(segment).not.toContain('data-annotation-start-marker');
      expect(segment).not.toContain('h-px');
      expect(segment.replace(/<[^>]*>/g, '')).not.toMatch(/[•←→]/);
    }
    if (kind === 'text') {
      const point = segments.find((segment) => segment.includes('Listen to the melody'))!;
      expect(point).not.toContain('data-annotation-start-marker');
      expect(point).not.toContain('data-annotation-interval');
      expect(point).not.toContain('data-annotation-continued');
      expect(point).not.toContain('data-annotation-continues');
      expect(point).not.toContain('rounded-l-xl');
      expect(point).not.toContain('rounded-r-xl');
      expect(point).not.toContain('bg-slate-100');
    }
  }
  expect(html).not.toContain('data-annotation-span');
  expect(html).not.toContain('data-annotation-point');
  expect(html).not.toContain('Continued');
});

test('a shared hover highlights every wrapped segment in neutral colors and clears on release', async () => {
  const hovered = shallowRef<Annotation | null>(null);
  const lines = scoreLines([{ pitch: 60, at: 0, len: 5760, groups: [] }], 5760, {
    ppq: 480,
    meters: [{ at: 0, meter: '4/4' }],
    width: 512,
    rem: 16,
    foldThreshold: 12,
    variableBarWidth: false,
  });
  for (const kind of ['text', 'chord'] as const) {
    const item: DisplayAnnotation = { at: 480, len: 4320, text: 'Play smoothly', kind };
    const items = [item, { ...item }];
    const renderLanes = () =>
      renderToString(
        createSSRApp({
          render: () =>
            h(
              'div',
              lines.map((line) =>
                h(AnnotationLane, { items, line, rem: 16, hovered: hovered.value }),
              ),
            ),
        }),
      );
    expect(await renderLanes()).not.toContain('data-annotation-highlighted');
    for (const active of items) {
      hovered.value = active;
      const html = await renderLanes();
      expect(html.match(/data-annotation-highlighted/g)).toHaveLength(3);
      expect(html.match(/bg-slate-200/g)).toHaveLength(3);
      expect(html).not.toMatch(/teal|green|emerald/);
    }
    hovered.value = null;
    expect(await renderLanes()).not.toContain('data-annotation-highlighted');
  }
});

test('constant meter and tempo stay in the general info panel', async () => {
  const html = await render(
    createScore({
      notes: [{ pitch: 60, at: 0, len: 1920, groups: [] }],
      meters: [{ at: 0, meter: '4/4' }],
      tempos: [{ at: 0, bpm: 80 }],
    }),
  );
  expect(html).not.toContain('data-annotation-kind="timing"');
});

test('only actual meter and tempo changes appear inline, with BPM kept on one line', async () => {
  const html = await render(
    createScore({
      notes: [{ pitch: 60, at: 0, len: 8160, groups: [] }],
      meters: [
        { at: 0, meter: '4/4' },
        { at: 1920, meter: '4/4' },
        { at: 3840, meter: '3/4' },
        { at: 6720, meter: '6/8' },
      ],
      tempos: [
        { at: 0, bpm: 80 },
        { at: 960, bpm: 80 },
        { at: 1920, bpm: 100 },
        { at: 3840, bpm: 100 },
        { at: 6720, bpm: 72 },
      ],
    }),
  );
  const markers = html.match(
    /<(?:div|span)\b[^>]*data-annotation-kind="timing"[^>]*>[\s\S]*?<\/(?:div|span)>/g,
  )!;
  expect(markers).toHaveLength(3);
  expect(
    markers.map((marker) => Number(marker.match(/data-annotation-start="(\d+)"/)![1])),
  ).toEqual([1920, 3840, 6720]);
  expect(
    markers.map((marker) =>
      marker
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/^·\s*/, ''),
    ),
  ).toEqual(['100 BPM', '3/4', '6/8 · 72 BPM']);
  expect(markers.every((marker) => marker.includes('whitespace-nowrap'))).toBe(true);
});

test('section boundaries force new lines even when variable bars would fit together', async () => {
  const score = createScore({
    notes: [{ pitch: 60, at: 0, len: 5760, groups: [] }],
    sections: [
      { at: 0, title: 'First' },
      { at: 1920, title: 'Second' },
      { at: 3840, title: 'Third' },
    ],
  });
  const html = await render(score, true);
  expect(html.match(/data-section/g)).toHaveLength(3);
  expect(html).toContain('data-line-from="1920"');
  expect(html).toContain('data-line-from="3840"');
});

test('timing stays in the common region when only an explanation starts at its position', async () => {
  const html = await render(
    createScore({
      notes: [{ pitch: 60, at: 0, len: 5760, groups: [] }],
      meters: [
        { at: 0, meter: '4/4' },
        { at: 1920, meter: '3/4' },
      ],
      tempos: [
        { at: 0, bpm: 80 },
        { at: 1920, bpm: 100 },
      ],
      annotations: [{ at: 1920, len: 2880, text: 'Count three quarter-note beats per bar.' }],
    }),
  );
  const captions = html.match(/<div\b[^>]*data-annotation-kind="text"[^>]*>[\s\S]*?<\/div>/g)!;
  expect(captions).toHaveLength(2);
  expect(captions[0]).toContain('Count three quarter-note beats per bar.');
  expect(captions.every((caption) => !caption.includes('100 BPM'))).toBe(true);
  expect(captions[1]).toContain('data-annotation-continued');
  expect(html.match(/data-annotation-kind="timing"/g)).toHaveLength(1);
  const line = html.split('data-score-line')[2]!;
  expect(line.indexOf('3/4 · 100 BPM')).toBeLessThan(
    line.indexOf('Count three quarter-note beats per bar.'),
  );
});

test('annotation tracks pack timing with chords above sustain and explanatory captions', async () => {
  const score = createScore({
    notes: [{ pitch: 60, at: 0, len: 3840, groups: [] }],
    tempos: [
      { at: 0, bpm: 80 },
      { at: 480, bpm: 100 },
    ],
    chords: [{ at: 0, len: 3840, root: 'C', type: 'maj7' }],
    annotations: [
      { at: 0, len: 3840, text: 'First explanation' },
      { at: 480, len: 960, text: 'This explanation overlaps the first one.' },
    ],
    pedals: [{ at: 0, len: 3840, type: 'sustain' }],
  });
  const lines = scoreLines(score.notes, 3840, {
    ppq: score.ppq,
    meters: score.meters,
    sections: score.sections,
    width: 1246,
    rem: 16,
    foldThreshold: 12,
    variableBarWidth: false,
  });
  const html = await renderToString(
    createSSRApp(AnnotationLane, {
      items: scoreAnnotations(score).filter(
        (item) => item.kind === 'chord' || item.kind === 'timing',
      ),
      line: lines[0]!,
      rem: 16,
    }),
  );
  const tempo = html.match(/<div\b[^>]*data-annotation-kind="timing"[^>]*>/)![0];
  expect(tempo).toContain('data-annotation-row="1"');
  expect(html.match(/data-annotation-lane/g)).toHaveLength(1);
  expect(html).toContain('text-xs leading-4');
  expect(html).not.toContain('line-clamp');
  expect(html).not.toContain('This explanation overlaps the first one.');
  const scoreHtml = await render(score);
  expect(scoreHtml.match(/data-annotation-tracks/g)).toHaveLength(
    scoreHtml.match(/data-score-line/g)!.length,
  );
  expect(scoreHtml).toContain('This explanation overlaps the first one.');
  for (const line of scoreHtml.split('data-score-line').slice(1)) {
    const tracks = line.indexOf('data-annotation-tracks');
    const text = line.indexOf('data-annotation-kind="text"');
    expect(tracks).toBeGreaterThan(line.indexOf('data-piano-roll'));
    expect(text).toBeGreaterThan(tracks);
    const sustain = line.indexOf('data-sustain-lane');
    if (sustain !== -1) expect(sustain).toBeLessThan(text);
  }
  expect(scoreHtml).toContain('gap-y-6');
  expect(scoreHtml).toContain('data-sustain-lane');
});

test('chord timing is appended at its start and pedal comments remain below the compact region', async () => {
  const html = await render(
    createScore({
      notes: [{ pitch: 60, at: 0, len: 5760, groups: [] }],
      meters: [{ at: 0, meter: '4/4' }],
      tempos: [
        { at: 0, bpm: 80 },
        { at: 480, bpm: 100 },
      ],
      chords: [{ at: 480, len: 4320, root: 'F', type: 'maj7' }],
      annotations: [{ at: 480, text: 'Bring out the melody' }],

      pedals: [{ at: 240, len: 4800, type: 'sustain', text: 'Change the pedal gently' }],
    }),
  );
  const lines = html.split('data-score-line').slice(1);
  const chords = html.match(/<div\b[^>]*data-annotation-kind="chord"[^>]*>[\s\S]*?<\/div>/g)!;
  expect(chords).toHaveLength(3);
  const caption = chords[0]!.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');
  expect(caption).toContain('Fmaj7 · 100 BPM');
  expect(chords.slice(1).every((chord) => !chord.includes('100 BPM'))).toBe(true);
  for (const line of lines) {
    const trace = line.indexOf('data-sustain-range');
    const comment = line.indexOf('Change the pedal gently', trace);
    expect(trace).toBeGreaterThan(line.indexOf('data-annotation-tracks'));
    expect(comment).toBeGreaterThan(trace);
    expect(line).not.toContain('data-sustain-press');
    expect(line).not.toContain('data-sustain-release');
  }
});

test('pitch guides stay within existing ranges and folds, and exact MIDI guides remain exact', async () => {
  const score = createScore({
    notes: [
      { pitch: 48, at: 0, len: 1920, groups: [] },
      { pitch: 72, at: 0, len: 1920, groups: [] },
    ],
    meters: [{ at: 0, meter: '4/4' }],
    tempos: [{ at: 0, bpm: 80 }],
    pitchGuides: [
      { at: 0, len: 1920, pitchClasses: [0], text: 'C' },
      { at: 0, len: 1920, pitches: [72, 96] },
    ],
  });
  const html = await render(score);
  expect(html).toContain('grid-template-rows:repeat(3, 0.5rem)');
  expect(html.match(/data-pitch-guide/g)).toHaveLength(3);
  expect(html.match(/data-guide-pitch="48"/g)).toHaveLength(1);
  expect(html.match(/data-guide-pitch="72"/g)).toHaveLength(2);
  expect(html).not.toContain('data-guide-pitch="60"');
  expect(html).not.toContain('data-guide-pitch="96"');
  const chordsOnly = await render({
    ...score,
    pitchGuides: [],
    chords: [{ at: 0, len: 1920, root: 'C', type: 'maj7', bass: 'E' }],
  });
  expect(chordsOnly).toContain('Cmaj7/E');
  expect(chordsOnly).not.toContain('data-pitch-guide');
});
