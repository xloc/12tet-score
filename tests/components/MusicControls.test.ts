import { expect, test, vi } from 'vite-plus/test';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia } from 'pinia';
import App from '../../src/App.vue';
import type { MusicSelection } from '../../src/selection';
import { usePlaybackStore } from '../../src/stores/playback';
import { useScoreStore } from '../../src/stores/score';
import { createScoreStore, createScore } from '../helpers/score';
import MusicControls from '../../src/components/MusicControls.vue';

function textContent(html: string) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

test('settings show the shared pitch-fold threshold', async () => {
  const pinia = createPinia();
  const sheet = createScoreStore(pinia, createScore());
  expect(sheet.foldThreshold).toBe(12);
  for (let threshold = 0; threshold <= 15; threshold++) {
    sheet.foldThreshold = threshold;
    const html = await renderToString(createSSRApp(MusicControls).use(pinia));
    const input = html.match(/<input\b[^>]*id="fold-threshold"[^>]*>/)![0];
    const output = html.match(/<output\b[^>]*for="fold-threshold"[^>]*>([^<]*)<\/output>/)![1];
    expect(input).toContain(`value="${threshold}"`);
    expect(output!.trim()).toBe(threshold === 0 ? 'Off' : `${threshold} unused pitches`);
  }
});

test('the variable bar width setting defaults to off and updates notation from shared state', async () => {
  const pinia = createPinia();
  const sheet = createScoreStore(pinia, createScore());
  sheet.load(
    createScore({
      notes: [
        ...Array.from({ length: 16 }, (_, index) => ({
          pitch: 60,
          at: index * 120,
          len: 120,
          groups: ['rh', '1'],
        })),
        { pitch: 72, at: 1920, len: 1920, groups: ['lh', '2'] },
      ],
    }),
  );
  expect(sheet.variableBarWidth).toBe(false);
  for (const enabled of [false, true, false]) {
    sheet.variableBarWidth = enabled;
    const html = await renderToString(createSSRApp(App).use(pinia));
    const checkbox = html.match(/<input\b[^>]*id="variable-bar-width"[^>]*>/)![0];
    expect(checkbox.includes(' checked')).toBe(enabled);
    expect(html.match(/data-score-line/g)).toHaveLength(enabled ? 1 : 2);
    expect(html).toContain('Variable bar width');
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
    createScoreStore(pinia, createScore());
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

test('play selection belongs to transport and is disabled for empty selections or during playback', async () => {
  for (const [selection, status, disabled] of [
    [{ kind: 'notes', indices: [] }, 'stopped', true],
    [{ kind: 'notes', indices: [0] }, 'stopped', false],
    [{ kind: 'notes', indices: [0] }, 'playing', true],
    [{ kind: 'notes', indices: [0] }, 'paused', false],
    [{ kind: 'range', from: 480, to: 960 }, 'stopped', true],
  ] satisfies [MusicSelection, 'stopped' | 'playing' | 'paused', boolean][]) {
    const pinia = createPinia();
    createScoreStore(
      pinia,
      createScore({ notes: [{ pitch: 60, at: 0, len: 480, groups: [] }] }),
    ).selection = selection;
    usePlaybackStore(pinia).status = status;
    const html = await renderToString(createSSRApp(MusicControls).use(pinia));
    const panels = html.match(/<section\b[^>]*>[\s\S]*?<\/section>/g)!;
    const button = panels[0]!.match(/<button\b[^>]*title="Play selection"[^>]*>/)![0];
    expect(/\sdisabled(?:\s|=|>)/.test(button)).toBe(disabled);
    expect(panels).toHaveLength(4);
    expect(panels[3]).toContain('Following settings');
    expect(panels[1]).not.toContain('Play selection');
    expect(panels[0]).not.toContain('title="Settings"');
    expect(panels[1]).toContain('title="Settings"');
    expect(panels[1]).not.toContain('<dialog');
  }
});

test('normal play uses the playhead while play selection uses only the selected notes and span', async () => {
  for (const selection of [
    { kind: 'notes', indices: [0, 1, 2] },
    { kind: 'range', from: 120, to: 480 },
  ] satisfies MusicSelection[]) {
    const pinia = createPinia();
    const sheet = createScoreStore(
      pinia,
      createScore({
        notes: [60, 64, 67].map((pitch, index) => ({
          pitch,
          at: index * 120,
          len: 480,
          groups: [],
        })),
      }),
    );
    sheet.selection = selection;
    const playback = usePlaybackStore(pinia);
    playback.currentTick = 480;
    const play = vi.spyOn(playback, 'play').mockResolvedValue(undefined);
    const actions = new Map<string, () => unknown>();
    const app = createSSRApp(MusicControls).use(pinia);
    app.mixin({
      created() {
        const { title, onClick } = this.$attrs;
        if (typeof title === 'string' && typeof onClick === 'function') {
          actions.set(title, () => onClick());
        }
      },
    });
    await renderToString(app);
    await actions.get('Play')!();
    expect(play).toHaveBeenLastCalledWith(sheet.notes, 480, sheet.totalTicks);
    await actions.get('Play selection')!();
    expect(play).toHaveBeenLastCalledWith(sheet.selectedNotes, sheet.span!.from, sheet.span!.to);
    play.mockRestore();
  }
});

test('the app renders a loaded score with its own timing and metadata', async () => {
  const pinia = createPinia();
  const score = createScore({
    title: 'Loaded piece',
    composer: 'Another composer',
    collection: 'Test collection',
    source: {
      name: 'Test edition',
      url: 'https://example.com/score',
      scoreUrl: '',
      license: 'Test license',
      reference: '',
    },
    ppq: 240,
    tempos: [{ at: 0, bpm: 90 }],
    meters: [{ at: 0, meter: '3/4' }],
    notes: [{ pitch: 72, at: 720, len: 720, groups: ['rh', '1'] }],
  });
  const sheet = createScoreStore(pinia, score);
  const html = await renderToString(createSSRApp(App).use(pinia));
  const scorePanel = html
    .match(/<section\b[^>]*>[\s\S]*?<\/section>/g)!
    .find((panel) => panel.includes('title="Music score"'));
  expect(scorePanel).toContain('Loaded piece');
  expect(textContent(scorePanel!)).toContain('by Another composer');
  const summary = scorePanel!.replace(/<dialog\b[\s\S]*?<\/dialog>/g, '');
  expect(summary).toMatch(/<button\b[^>]*title="Music score"[^>]*>/);
  expect(summary).not.toContain(score.collection);
  expect(summary.match(/<button\b/g)).toHaveLength(1);
  expect(scorePanel).not.toContain('<dialog');
  const scoreDialog = html
    .match(/<dialog\b[^>]*>[\s\S]*?<\/dialog>/g)!
    .find((dialog) => dialog.includes('Current score'))!;
  expect(scoreDialog).toContain(score.collection);
  expect(scoreDialog).toContain(score.source.url);
  expect(scoreDialog).toContain(score.source.license);
  expect(scoreDialog).not.toContain('Higher means higher pitch');
  expect(html.match(/<dialog\b/g)).toHaveLength(3);
  expect(html).not.toContain('<footer');
  expect(html.match(/data-note-index/g)).toHaveLength(1);
  expect(textContent(html)).toContain('90 BPM');
  expect(html).toContain('3/4');
  expect(textContent(html)).toContain('2 measures');
  expect(html).toContain('max="1440"');
  expect(html).toContain('/ 6 quarter notes');
  sheet.selection = { kind: 'notes', indices: [0] };
  const selected = await renderToString(createSSRApp(MusicControls).use(pinia));
  expect(selected).toContain('C5');
  const inspector = selected.match(/<section\b[^>]*>[\s\S]*?<\/section>/g)![1]!;
  expect(textContent(inspector.replace(/<dialog\b[\s\S]*?<\/dialog>/g, ''))).toContain(
    'NOTE C5 SELECTED 1 note MIDI',
  );
});

test('the app keeps the load dialog available while the initial public score is loading or fails', async () => {
  const pinia = createPinia();
  const sheet = useScoreStore(pinia);
  let ready!: (response: Response) => void;
  vi.stubGlobal(
    'fetch',
    vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          ready = resolve;
        }),
    ),
  );
  try {
    const loading = sheet.open({ sourceId: 'builtin', scoreId: 'missing' });
    const pending = await renderToString(createSSRApp(App).use(pinia));
    expect(pending).toContain('Loading score…');
    expect(pending).toContain('title="Settings"');
    expect(pending).not.toContain('data-note-index');
    expect(pending.match(/<dialog\b/g)).toHaveLength(3);
    expect(pending).toContain('My scores');
    const scorePanel = pending
      .match(/<section\b[^>]*>[\s\S]*?<\/section>/g)!
      .find((panel) => panel.includes('No score loaded'));
    expect(scorePanel).toContain('Load score');
    ready(new Response('', { status: 404 }));
    expect(await loading).toBe(false);
    const failed = await renderToString(createSSRApp(App).use(pinia));
    expect(failed).toContain('Could not load JSON (404).');
    expect(failed).toContain('Load score');
    expect(failed).toContain('title="Settings"');
    expect(failed).not.toContain('data-note-index');
  } finally {
    vi.unstubAllGlobals();
  }
});
