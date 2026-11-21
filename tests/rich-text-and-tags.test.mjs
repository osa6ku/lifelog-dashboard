import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadFrontendContext } from './helpers/load-scripts.mjs';

test('renderRichText escapes XSS and converts Markdown, angle-bracket, and parenthesized Wikipedia URLs', () => {
  const { ctx } = loadFrontendContext();

  const xss = ctx.renderRichText('<script>alert(1)</script>');
  assert.ok(!xss.includes('<script>'));
  assert.ok(xss.includes('&lt;script&gt;'));

  const md = ctx.renderRichText('[光文社](https://www.kobunsha.com/shelf/book/isbn/9784334100537)');
  assert.equal(
    md,
    '<a class="rich-link" href="https://www.kobunsha.com/shelf/book/isbn/9784334100537" target="_blank" rel="noopener noreferrer">光文社</a>'
  );

  const wiki = ctx.renderRichText('[ドラゴン桜](http://ja.wikipedia.org/wiki/ドラゴン桜_(テレビドラマ))');
  assert.equal(
    wiki,
    '<a class="rich-link" href="http://ja.wikipedia.org/wiki/ドラゴン桜_(テレビドラマ)" target="_blank" rel="noopener noreferrer">ドラゴン桜</a>'
  );

  const bare = ctx.renderRichText('公式: https://example.com/a_(b) です');
  assert.ok(bare.includes('href="https://example.com/a_(b)"'));
  assert.equal((bare.match(/<a /g) || []).length, 1);
});

test('renderRelatedUrlBadges supports newline and comma separated URLs', () => {
  const { ctx } = loadFrontendContext();
  const html = ctx.renderRelatedUrlBadges('https://movies.shochiku.co.jp/nightflower/\nhttps://ja.wikipedia.org/wiki/Test');
  assert.equal((html.match(/<a /g) || []).length, 2);
  assert.ok(html.includes('movies.shochiku.co.jp'));
  assert.ok(html.includes('ja.wikipedia.org'));
});

test('buildWatchTagCounts counts unique records per tag in descending order', () => {
  const { ctx } = loadFrontendContext();
  vm.runInContext(`
    serverWatchCastTags = [];
    watchData = [
      { id: 1, cast: '山田孝之, 中谷美紀, 山田孝之' },
      { id: 2, cast: '山田孝之、北川景子' },
      { id: 3, cast: '中谷美紀' },
    ];
  `, ctx);
  const counts = ctx.buildWatchTagCounts('cast');
  assert.equal(counts[0].name, '山田孝之');
  assert.equal(counts[0].count, 2);
  assert.equal(counts[1].name, '中谷美紀');
  assert.equal(counts[1].count, 2);
  assert.equal(counts[2].name, '北川景子');
  assert.equal(counts[2].count, 1);
});
