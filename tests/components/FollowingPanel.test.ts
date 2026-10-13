import { expect, test } from 'vite-plus/test';
import { createPinia } from 'pinia';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createScoreStore, distantScore, practiceScore } from '../helpers/score';
import { FollowingSearch } from '../../src/following-search';
import { ScoreFollower } from '../../src/following';
import { useFollowingStore } from '../../src/stores/following';
import { usePlaybackStore } from '../../src/stores/playback';
import { useMidiStore } from '../../src/stores/midi';
import FollowingPanel from '../../src/components/FollowingPanel.vue';

function prepare(music = distantScore, pitches = [48, 50]) {
  const pinia = createPinia();
  createScoreStore(pinia, music);
  const following = useFollowingStore(pinia);
  useMidiStore(pinia).inputs.keyboard = {
    name: 'Keyboard',
    state: 'connected',
    transport: 'midi',
    pressed: {},
  };
  const matcher = new ScoreFollower(music);
  const iterator = new FollowingSearch(matcher.reference).search(pitches);
  let step = iterator.next();
  while (!step.done) step = iterator.next();
  following.recentPitches = pitches;
  following.result = {
    decision: 'ambiguous',
    reason: 'Several locations fit.',
    candidates: step.value,
  };
  return { pinia, following };
}

test('the compact panel has no heading, scrolling area, or embedded matching details', async () => {
  const pinia = createPinia();
  createScoreStore(pinia, practiceScore([[60]]));
  const html = await renderToString(createSSRApp(FollowingPanel).use(pinia));
  const panel = html.match(/<section\b[\s\S]*?<\/section>/)![0];
  expect(panel).toContain('>At</span>');
  expect(panel).toContain('bar 1');
  expect(panel).toContain('No MIDI');
  expect(panel).toContain('Following settings');
  expect(panel).toContain('Connect a MIDI keyboard');
  expect(panel).not.toContain('Follow MIDI');
  expect(panel).not.toContain('Matching details');
  expect(panel).not.toContain('overflow-auto');
  expect(panel).not.toMatch(/<h[1-6]\b|<details\b|data-matching-alignment/);
  expect(html).toContain('<dialog');
});

test('distant suggestions show the matched bar, agreement score, and supporting count without section titles', async () => {
  const { pinia, following } = prepare();
  expect(following.allowDistant).toBe(false);
  const html = await renderToString(createSSRApp(FollowingPanel).use(pinia));
  const panel = html.match(/<section\b[\s\S]*?<\/section>/)![0];
  expect(panel).toContain('data-jump-bar="5"');
  expect(panel).toMatch(/>\s*Bar 5\s*<\/span>/);
  expect(panel).toContain('title="Bar 5 · beat 2:');
  expect(panel).toContain('100%');
  expect(panel).toContain('2 matched');
  expect(panel).toContain('>Following</span>');
  expect(panel).not.toContain('Matching details');
  expect(panel).not.toContain('Similar opening');
});

test('the main panel shows at most three distinct destination items', async () => {
  const { pinia } = prepare(practiceScore(...Array.from({ length: 8 }, () => [[48], [50]])));
  const html = await renderToString(createSSRApp(FollowingPanel).use(pinia));
  const options = [...html.matchAll(/data-jump-bar="([^"]+)"/g)].map((match) => match[1]);
  expect(options).toHaveLength(3);
  expect(new Set(options).size).toBe(3);
  expect(options).not.toContain('1');
});

test('a selected option becomes Return in the same slot and becomes a jump option again after returning', async () => {
  const { pinia, following } = prepare(
    practiceScore(...Array.from({ length: 6 }, () => [[48], [50]])),
  );
  const playback = usePlaybackStore(pinia);
  const choices = [...following.options];
  following.jump(choices[1]!);
  const html = await renderToString(createSSRApp(FollowingPanel).use(pinia));
  const panel = html.match(/<section\b[\s\S]*?<\/section>/)![0];
  const options = panel.match(
    /<button\b[^>]*data-(?:jump|return)-option[^>]*>[\s\S]*?<\/button>/g,
  )!;
  expect(options).toHaveLength(3);
  expect(options[0]).toContain(`data-jump-bar="${choices[0]!.bar}"`);
  expect(options[1]).toMatch(/>\s*Bar 1\s*<\/span>/);
  expect(options[1]).toMatch(/>\s*Return\s*<\/span>/);
  expect(options[1]).not.toContain('matched');
  expect(options[2]).toContain(`data-jump-bar="${choices[2]!.bar}"`);
  const header = panel.slice(0, panel.indexOf('class="-mx-3'));
  expect(header).not.toContain('Return to');
  expect(panel).not.toMatch(/<p\b/);
  following.goBack();
  expect(playback.currentTick).toBe(0);
  const returned = await renderToString(createSSRApp(FollowingPanel).use(pinia));
  expect(returned).not.toContain('data-return-option');
  expect(returned).toContain(`data-jump-bar="${choices[1]!.bar}"`);
});
