import { expect, test } from 'vite-plus/test';
import { createSSRApp, h, shallowRef } from 'vue';
import { renderToString } from 'vue/server-renderer';
import type { DisplayAnnotation } from '../../src/annotations';
import { scoreLines } from '../../src/layout';
import SustainLane from '../../src/components/SustainLane.vue';
import AnnotationLane from '../../src/components/AnnotationLane.vue';

function lines(width = 512) {
  return scoreLines([{ pitch: 60, at: 0, len: 5760, groups: [] }], 5760, {
    ppq: 480,
    meters: [{ at: 0, meter: '4/4' }],
    width,
    rem: 16,
    foldThreshold: 12,
    variableBarWidth: false,
  });
}

test('sustain ranges share one row and follow measured bar widths without reserving caption space', async () => {
  const line = lines(1024)[0]!;
  const items: DisplayAnnotation[] = [
    { at: 0, len: 120, text: '', kind: 'pedal', pedal: 'sustain' },
    { at: 1440, len: 1440, text: 'Change the pedal gently', kind: 'pedal', pedal: 'sustain' },
  ];
  const html = await renderToString(
    createSSRApp(SustainLane, {
      items,
      line,
      geometry: {
        from: 0,
        to: 3840,
        left: 40,
        right: 552,
        top: 0,
        bottom: 50,
        bars: [
          { from: 0, to: 1920, left: 40, right: 449.6 },
          { from: 1920, to: 3840, left: 449.6, right: 552 },
        ],
      },
    }),
  );
  const ranges = html.match(/<div\b[^>]*data-annotation-kind="pedal"[^>]*>/g)!;
  expect(ranges).toHaveLength(2);
  expect(ranges.every((range) => range.includes('grid-row:1;'))).toBe(true);
  const commented = ranges[1]!;
  expect(Number(commented.match(/left:([^p]+)px/)![1])).toBeCloseTo(307.2);
  expect(Number(commented.match(/width:([^p]+)px/)![1])).toBeCloseTo(153.6);
  expect(html).toContain('Change the pedal gently');
  expect(html.replace(/<[^>]*>/g, '')).not.toContain('Change the pedal gently');
  expect(html.replace(/<[^>]*>/g, '')).not.toContain('Sustain pedal');
  expect(html).not.toContain('data-sustain-press');
  expect(html).not.toContain('data-sustain-release');
});

test('wrapped sustain uses continuation arrows without endpoint dots', async () => {
  const item: DisplayAnnotation = {
    at: 480,
    len: 4320,
    text: '',
    kind: 'pedal',
    pedal: 'sustain',
  };
  const html = await renderToString(
    createSSRApp({
      render: () =>
        h(
          'div',
          lines().map((line) => h(SustainLane, { items: [item], line })),
        ),
    }),
  );
  expect(html.match(/data-sustain-range/g)).toHaveLength(3);
  expect(html).not.toContain('data-sustain-press');
  expect(html).not.toContain('data-sustain-release');
  expect(html.match(/data-annotation-continued/g)).toHaveLength(2);
  expect(html.match(/data-annotation-continues/g)).toHaveLength(2);
  expect(html.replace(/<[^>]*>/g, '').replace(/\s/g, '')).toBe('→←→←');
});

test('hover highlights the sustain range and its separate comment across every line', async () => {
  const item: DisplayAnnotation = {
    at: 480,
    len: 4320,
    text: 'Change gently',
    kind: 'pedal',
    pedal: 'sustain',
  };
  const hovered = shallowRef<DisplayAnnotation | null>(item);
  const render = () =>
    renderToString(
      createSSRApp({
        render: () =>
          h(
            'div',
            lines().map((line) =>
              h('div', [
                h(SustainLane, { items: [item], line, hovered: hovered.value }),
                h(AnnotationLane, { items: [item], line, rem: 16, hovered: hovered.value }),
              ]),
            ),
          ),
      }),
    );
  const html = await render();
  expect(html.match(/data-annotation-highlighted/g)).toHaveLength(6);
  expect(html.match(/bg-slate-600/g)).toHaveLength(3);
  expect(html).not.toContain('bg-slate-100');
  expect(html).not.toMatch(/teal|green|emerald/);
  hovered.value = null;
  expect(await render()).not.toContain('data-annotation-highlighted');
});
