import { expect, test } from 'vite-plus/test';
import { createPinia } from 'pinia';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createScoreStore, createScore, practiceScore } from '../helpers/score';
import { ScoreFollower } from '../../src/following';
import { useFollowingStore } from '../../src/stores/following';
import FollowingDialog from '../../src/components/FollowingDialog.vue';

test('following controls live in the dialog with distant automatic jumps disabled by default', async () => {
  const pinia = createPinia();
  createScoreStore(pinia, createScore());
  const following = useFollowingStore(pinia);
  const render = () => renderToString(createSSRApp(FollowingDialog).use(pinia));
  const html = await render();
  const enabled = html.match(/<input\b[^>]*id="following-enabled"[^>]*>/)![0];
  const distant = html.match(/<input\b[^>]*id="following-allowDistant"[^>]*>/)![0];
  expect(enabled).toContain(' checked');
  expect(distant).not.toContain(' checked');
  expect(html).toContain('Matching details');
  expect(html).toContain('matched ÷ (matched + extra + omitted)');
  following.allowDistant = true;
  following.enabled = false;
  const changed = await render();
  expect(changed.match(/<input\b[^>]*id="following-enabled"[^>]*>/)![0]).not.toContain(' checked');
  expect(changed.match(/<input\b[^>]*id="following-allowDistant"[^>]*>/)![0]).toContain(' checked');
});

test('the detailed visualization is rendered only when the dialog is opened', async () => {
  const pinia = createPinia();
  const score = practiceScore([[60], [62]]);
  createScoreStore(pinia, score);
  const following = useFollowingStore(pinia);
  const matcher = new ScoreFollower(score);
  following.recentPitches = [60, 62];
  for (const pitch of following.recentPitches) following.result = matcher.receive(pitch);
  const closed = await renderToString(createSSRApp(FollowingDialog).use(pinia));
  expect(closed).not.toContain('data-matching-alignment');
  const opened = createSSRApp(FollowingDialog).use(pinia);
  opened.mixin({
    created() {
      const show = this.$.exposed?.showModal;
      if (typeof show === 'function') show();
    },
  });
  const html = await renderToString(opened);
  expect(html).toContain('data-matching-alignment');
  expect(html).toContain('Note agreement');
});

test('opening the dialog before any MIDI input reserves all candidate rows', async () => {
  const pinia = createPinia();
  createScoreStore(pinia, createScore());
  const app = createSSRApp(FollowingDialog).use(pinia);
  app.mixin({
    created() {
      const show = this.$.exposed?.showModal;
      if (typeof show === 'function') show();
    },
  });
  const html = await renderToString(app);
  expect(html).toContain('data-candidate-table');
  expect([...html.matchAll(/data-candidate-slot=/g)]).toHaveLength(8);
  expect(html).not.toContain('data-candidate-score');
});
