import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadGasContext } from './helpers/load-scripts.mjs';

test('GAS Config uses staging ScriptProperties when configured and falls back to prod defaults', () => {
  const { ctx: prodCtx } = loadGasContext();
  assert.equal(vm.runInContext('WATCH_SS_ID', prodCtx), '1dvf7aVJA_B8SgkIB1qGzJztZ6hRPiA7SLb0xssY142E');
  assert.equal(vm.runInContext('DIARY_SS_ID', prodCtx), '1_UnbcNhxtEkV7vLagxreIeyELbY3NBLU5bS8pp4YQ1A');

  const { ctx: stagingCtx } = loadGasContext({
    scriptProperties: {
      STAGING_WATCH_SS_ID: 'STAGING_WATCH_ID_123',
      STAGING_DIARY_SS_ID: 'STAGING_DIARY_ID_456',
    },
  });
  assert.equal(vm.runInContext('WATCH_SS_ID', stagingCtx), 'STAGING_WATCH_ID_123');
  assert.equal(vm.runInContext('DIARY_SS_ID', stagingCtx), 'STAGING_DIARY_ID_456');
});

test('GAS Wiki helpers normalize titles and reject non-work general-term articles', () => {
  const { ctx } = loadGasContext();
  assert.equal(ctx.cleanWorkTitle_('ドラマ『会社員』'), '会社員');
  assert.equal(ctx.cleanWorkTitle_('映画『容疑者Xの献身』'), '容疑者Xの献身');

  const validDrama = {
    title: '会社員 (ドラマ)',
    extract: '『会社員』は2026年に放送されたテレビドラマ。主演は吉田羊。',
    wikitext: '{{Infobox テレビドラマ\n| タイトル = 会社員\n}}',
    categories: ['Category:2026年のテレビドラマ'],
  };
  assert.equal(ctx.isTitleRelevant_(validDrama, '会社員'), true);
  assert.equal(ctx.isValidWorkArticle_(validDrama, '会社員', 'ドラマ'), true);

  const generalTerm = {
    title: 'サラリーマン',
    extract: 'サラリーマンとは給与所得者のことである。',
    wikitext: 'サラリーマンは職業形態の一つ。',
    categories: ['Category:労働'],
  };
  assert.equal(ctx.isValidWorkArticle_(generalTerm, '会社員', 'ドラマ'), false);
});

test('GAS Diary location parser preserves backward compatibility for plain text locations', () => {
  const { ctx } = loadGasContext();
  const legacy = ctx.parseDiaryLocations_('東京駅\n新宿駅', '');
  assert.equal(legacy.length, 2);
  assert.deepEqual(
    JSON.parse(JSON.stringify(legacy)),
    [
      { name: '東京駅', lat: null, lng: null },
      { name: '新宿駅', lat: null, lng: null },
    ]
  );

  const rich = ctx.parseDiaryLocations_(
    '東京駅',
    JSON.stringify([{ name: '東京駅', lat: 35.6812, lng: 139.7671 }])
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(rich)),
    [{ name: '東京駅', lat: 35.6812, lng: 139.7671 }]
  );
});
