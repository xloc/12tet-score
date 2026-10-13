import { expect, test } from 'vite-plus/test';
import { createSSRApp } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createPinia } from 'pinia';
import { useScoreStore } from '../../src/stores/score';
import ScoreDialog from '../../src/components/ScoreDialog.vue';
import { createScore } from '../helpers/score';

test('the dialog opens on public resources with the upload panel hidden', async () => {
  const pinia = createPinia();
  const sheet = useScoreStore(pinia);
  sheet.catalog = [
    { file: 'first.json', title: 'First piece', composer: 'First composer' },
    { file: 'second.json', title: 'Second piece', composer: 'Second composer' },
  ];
  const html = await renderToString(createSSRApp(ScoreDialog).use(pinia));
  expect(html).toContain('Public resource');
  expect(html).toContain('Upload');
  expect(html).toContain('First piece');
  expect(html).toContain('First composer');
  expect(html).toContain('Second piece');
  expect(html).toContain('Second composer');
  expect(html.match(/<li\b/g)).toHaveLength(2);
  expect(html).toContain('accept=".json,application/json"');
  expect(html).toContain('Drag a JSON file here');
  expect(html).toMatch(/<label\b[^>]*for="score-file"[^>]*style="display:none;"/);
  expect(html).not.toContain('score-url');
  expect(html).not.toContain('type="text"');
  expect(html).not.toContain('Load URL');
});

test('the dialog distinguishes an empty catalog from a pending load and disables its controls while loading', async () => {
  const pinia = createPinia();
  const sheet = useScoreStore(pinia);
  const empty = await renderToString(createSSRApp(ScoreDialog).use(pinia));
  expect(empty).toContain('No scores available.');
  sheet.loading = true;
  const pending = await renderToString(createSSRApp(ScoreDialog).use(pinia));
  expect(pending).toContain('Loading score…');
  expect(pending).not.toContain('No scores available.');
  expect(pending).toMatch(/<fieldset\b[^>]*disabled/);
});

test('one dialog contains current-score metadata and both loading methods', async () => {
  const pinia = createPinia();
  const sheet = useScoreStore(pinia);
  const score = createScore({
    title: 'Current piece',
    composer: 'Current composer',
    collection: 'Current collection',
    source: {
      name: 'Test edition',
      url: 'https://example.com/score',
      scoreUrl: '',
      license: 'Test license',
      reference: '',
    },
  });
  sheet.load(score);
  sheet.catalog = [{ file: 'another.json', title: 'Another piece', composer: 'Another composer' }];
  const html = await renderToString(createSSRApp(ScoreDialog).use(pinia));
  expect(html.match(/<dialog\b/g)).toHaveLength(1);
  expect(html).toContain('Current score');
  expect(html).toContain('Change score');
  expect(html).toContain(score.title);
  expect(html).toContain(score.composer);
  expect(html).toContain(score.collection);
  expect(html).toContain(score.source.url);
  expect(html).toContain(score.source.license);
  expect(html).toContain('Another piece');
  expect(html).toContain('Public resource');
  expect(html).toContain('Upload');
  expect(html).toContain('accept=".json,application/json"');
});
