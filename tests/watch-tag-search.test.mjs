import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadGasContext, loadFrontendContext } from './helpers/load-scripts.mjs';

test('3-60 GAS queryWatchEntries_ exact token match avoids partial noise, matches master counts 100%, and supports multi-tag AND + filters/sort', () => {
  const headers = ['ID', '自動', 'タイトル', '区分', '鑑賞日', 'ステータス', '評価', 'PF', '公開年', '出演者', 'スタッフ', '概要', '感想・メモ', '関連URL', 'NotionURL'];
  const grid = [
    headers.slice(),
    [1, false, '作品A', '映画', '2024-01-10', '完了', '5', 'Netflix', '2024', '林, 神木隆之介', '東野圭吾', '', 'メモ', '', ''],
    [2, false, '作品B', '映画', '2024-02-10', '完了', '4', 'Netflix', '2024', '小林, 神木隆之介', '東野圭吾, 監督X', '', '林が登場するメモ', '', ''],
    [3, false, '作品C', 'ドラマ', '2024-03-10', '進行中', '3', 'TBS', '2024', '神木隆之介, 吉田羊', '宮部みゆき', '', 'メモ', '', ''],
    [4, false, '作品D', '本', '2024-04-10', '完了', '5', '', '2020', '', '東野圭吾', '', 'メモ', '', ''],
  ];
  const mockSheet = {
    getDataRange: () => ({ getValues: () => grid }),
  };
  const { ctx } = loadGasContext({
    extraGlobals: {
      SpreadsheetApp: {
        openById: () => ({ getSheetByName: (name) => (name === '鑑賞記録DB' ? mockSheet : null) }),
      },
    },
  });

  // 1. Exact token match: castTag='林' must match ONLY 作品A (NOT 小林 or memo mentioning 林)
  const metaRes = ctx.queryWatchEntries_({ includeMeta: '1' });
  const hayashiCount = metaRes.castTags.find(t => t.name === '林').count;
  const resHayashi = ctx.queryWatchEntries_({ castTag: '林' });
  assert.equal(hayashiCount, 1);
  assert.equal(resHayashi.filteredCount, hayashiCount);
  assert.deepEqual(Array.from(resHayashi.entries, e => e.title), ['作品A']);

  // 2. Staff master count == exact tag search count
  const higashinoCount = metaRes.staffTags.find(t => t.name === '東野圭吾').count;
  const resHigashino = ctx.queryWatchEntries_({ staffTag: '東野圭吾' });
  assert.equal(higashinoCount, 3);
  assert.equal(resHigashino.filteredCount, higashinoCount);

  // 3. Multi-tag AND across cast + staff (東野圭吾 × 神木隆之介)
  const resCross = ctx.queryWatchEntries_({ castTag: '神木隆之介', staffTag: '東野圭吾', sort: 'rating_desc' });
  assert.equal(resCross.filteredCount, 2);
  assert.deepEqual(Array.from(resCross.entries, e => e.title), ['作品A', '作品B']);

  // 4. Multi-tag AND within same type (林 + 神木隆之介) + category/platform filter
  const resSame = ctx.queryWatchEntries_({ castTag: '林,神木隆之介', category: '映画', platform: 'Netflix' });
  assert.equal(resSame.filteredCount, 1);
  assert.deepEqual(Array.from(resSame.entries, e => e.title), ['作品A']);
});

test('3-60 Frontend tag picker (multi-tag AND, status auto-ALL & restore) and detail view person chip reverse-lookup without edit mis-transition', async () => {
  const apiGetCalls = [];
  const { ctx } = loadFrontendContext();
  ctx.apiGet = async (params) => {
    apiGetCalls.push({ ...params });
    return {
      ok: true,
      totalCount: 10,
      filteredCount: 1,
      hasMore: false,
      yearCounts: [{ year: '2024', count: 10 }],
      entries: [
        {
          row: 2, id: '1', title: '作品A', category: '映画', watchDate: '2024-01-10',
          status: '完了', rating: '5', platform: 'Netflix', releaseYear: '2024',
          cast: '林, 神木隆之介', staff: '東野圭吾', summary: '', memo: '感想',
          relatedUrl: '', notionUrl: '',
        },
      ],
    };
  };

  vm.runInContext(`
    statusFilter = '進行中';
    serverWatchCastTags = [{ name: '神木隆之介', count: 5 }, { name: '林', count: 1 }];
    serverWatchStaffTags = [{ name: '東野圭吾', count: 83 }, { name: '宮部みゆき', count: 12 }];
    watchData = [{
      row: 2, id: '1', title: '作品A', category: '映画', watchDate: '2024-01-10',
      status: '完了', rating: '5', platform: 'Netflix', releaseYear: '2024',
      cast: '林, 神木隆之介', staff: '東野圭吾', summary: '', memo: '感想',
      relatedUrl: '', notionUrl: ''
    }];
  `, ctx);

  // 1. Open tag picker -> uses already-delivered master without extra fetch
  ctx.openWatchTagPickerModal();
  assert.equal(apiGetCalls.length, 0);
  assert.equal(ctx.document.getElementById('modal-watch-tags').classList.contains('open'), true);
  assert.ok(ctx.document.getElementById('watch-tag-picker-list').innerHTML.includes('神木隆之介'));

  // Switch to staff tab and incremental filter
  ctx.setWatchTagPickerTab('staff');
  ctx.document.getElementById('watch-tag-filter-input').value = '東野';
  ctx.renderWatchTagPickerList();
  const pickerHtml = ctx.document.getElementById('watch-tag-picker-list').innerHTML;
  assert.ok(pickerHtml.includes('東野圭吾'));
  assert.ok(pickerHtml.includes('(83)'));
  assert.equal(pickerHtml.includes('宮部みゆき'), false);

  // Select staff tag 東野圭吾 + cast tag 神木隆之介 -> AND query + status auto-switched from 進行中 to ALL
  await ctx.toggleWatchTagFilter('staff', '東野圭吾');
  await ctx.toggleWatchTagFilter('cast', '神木隆之介');
  assert.equal(vm.runInContext('statusFilter', ctx), 'ALL');
  const lastCall = apiGetCalls[apiGetCalls.length - 1];
  assert.equal(lastCall.staffTag, '東野圭吾');
  assert.equal(lastCall.castTag, '神木隆之介');
  assert.equal(ctx.document.getElementById('watch-active-tags-bar').style.display, 'flex');

  // Clear all tags -> restores original statusFilter ('進行中')
  await ctx.clearWatchTagFilters();
  assert.equal(vm.runInContext('statusFilter', ctx), '進行中');
  assert.equal(ctx.document.getElementById('watch-active-tags-bar').style.display, 'none');

  // 2. Stage 2 detail view: person chip is clickable button, tap triggers reverse-lookup and does NOT open edit modal
  ctx.openWatchDetailView(2, '1');
  const detailHtml = ctx.document.getElementById('watch-detail-view').innerHTML;
  assert.ok(detailHtml.includes('onWatchPersonChipTap(this)'));
  assert.ok(detailHtml.includes('data-tag-name="東野圭吾"'));

  await ctx.onWatchPersonChipTap({ dataset: { tagType: 'staff', tagName: '東野圭吾' } });
  assert.equal(ctx.document.getElementById('modal-watch').classList.contains('open'), false);
  assert.equal(ctx.document.getElementById('watch-detail-view').style.display, 'none');
  assert.equal(ctx.document.getElementById('watch-list-wrap').style.display, 'block');
  assert.equal(vm.runInContext('statusFilter', ctx), 'ALL');
  assert.equal(apiGetCalls[apiGetCalls.length - 1].staffTag, '東野圭吾');
});
