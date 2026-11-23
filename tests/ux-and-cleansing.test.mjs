import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadFrontendContext, loadGasContext } from './helpers/load-scripts.mjs';

test('3-48 swipe guard blocks edge and horizontal swipes while allowing vertical scroll and excluded targets', () => {
  const { ctx } = loadFrontendContext();

  // Edge touchstart (left & right within 28px) -> blocked
  assert.equal(ctx.shouldPreventSwipeGesture({ type: 'touchstart', clientX: 12, innerWidth: 390, isExcluded: false, isEdge: false }), true);
  assert.equal(ctx.shouldPreventSwipeGesture({ type: 'touchstart', clientX: 380, innerWidth: 390, isExcluded: false, isEdge: false }), true);
  // Center touchstart -> allowed
  assert.equal(ctx.shouldPreventSwipeGesture({ type: 'touchstart', clientX: 180, innerWidth: 390, isExcluded: false, isEdge: false }), false);
  // Excluded target (input / .allow-x-scroll) -> never blocked even at edge
  assert.equal(ctx.shouldPreventSwipeGesture({ type: 'touchstart', clientX: 10, innerWidth: 390, isExcluded: true, isEdge: false }), false);
  // Vertical scroll touchmove -> allowed
  assert.equal(ctx.shouldPreventSwipeGesture({ type: 'touchmove', startX: 180, startY: 200, clientX: 184, clientY: 280, innerWidth: 390, isExcluded: false, isEdge: false }), false);
  // Horizontal swipe outside .allow-x-scroll -> blocked
  assert.equal(ctx.shouldPreventSwipeGesture({ type: 'touchmove', startX: 180, startY: 200, clientX: 240, clientY: 205, innerWidth: 390, isExcluded: false, isEdge: false }), true);
  // Horizontal swipe inside .allow-x-scroll -> allowed
  assert.equal(ctx.shouldPreventSwipeGesture({ type: 'touchmove', startX: 180, startY: 200, clientX: 240, clientY: 205, innerWidth: 390, isExcluded: true, isEdge: false }), false);
});

test('3-49 sanitizeDisplayText and GAS sanitizeHtmlText_ strip HTML remnants while preserving Markdown links and line breaks', () => {
  const { ctx: fe } = loadFrontendContext();
  const { ctx: gas } = loadGasContext();

  const raw = '<p>第1話の感想<br />とても面白かった&nbsp;&amp;&nbsp;[公式](https://example.com/a)</p><p><span>第2話</span><br>続きが気になる</p>';
  const expected = '第1話の感想\nとても面白かった & [公式](https://example.com/a)\n\n第2話\n続きが気になる';

  assert.equal(fe.sanitizeDisplayText(raw), expected);
  assert.equal(gas.sanitizeHtmlText_(raw), expected);
  assert.equal(gas.hasHtmlTagRemnants_(raw), true);
  assert.equal(gas.hasHtmlTagRemnants_(expected), false);
});

test('3-49 GAS cleanseWatchHtmlTags creates backup sheet and cleanses HTML remnants without altering ID/status/date', () => {
  let backupCreatedName = '';
  let writtenRows = null;
  const mockRows = [
    [1, false, '<p>ドラマ『会社員』</p>', 'ドラマ', '2026-11-19', '進行中', '5', 'TBS', '2026', '<span>山田孝之</span>', '監督A', '<p>概要</p>', '<p>1話最高<br />2話も期待</p>', '', ''],
    [2, false, '映画『通常作品』', '映画', '2026-10-01', '完了', '4', '映画館', '2025', '俳優B', '監督B', '通常の概要', '通常のメモ', '', ''],
  ];

  const mockSheet = {
    getLastRow: () => mockRows.length + 1,
    getLastColumn: () => 15,
    copyTo: () => ({
      setName(name) { backupCreatedName = name; },
    }),
    getRange: () => ({
      getValues: () => mockRows.map(r => r.slice()),
      setValues: (vals) => { writtenRows = vals; },
    }),
  };

  const { ctx } = loadGasContext({
    extraGlobals: {
      SpreadsheetApp: {
        openById: () => ({
          getSheetByName: () => mockSheet,
        }),
      },
      Utilities: {
        formatDate: () => '20261123_0900',
      },
    },
  });

  const res = ctx.cleanseWatchHtmlTags();
  assert.equal(res.ok, true);
  assert.equal(backupCreatedName, '鑑賞記録DB_backup_20261123_0900');
  assert.equal(res.totalRows, 2);
  assert.equal(res.beforeTagCells, 4);
  assert.equal(res.afterTagCells, 0);
  assert.equal(res.updatedRows, 1);
  assert.equal(writtenRows[0][0], 1);
  assert.equal(writtenRows[0][2], 'ドラマ『会社員』');
  assert.equal(writtenRows[0][4], '2026-11-19');
  assert.equal(writtenRows[0][5], '進行中');
  assert.equal(writtenRows[0][9], '山田孝之');
  assert.equal(writtenRows[0][12], '1話最高\n2話も期待');
  assert.equal(writtenRows[1][2], '映画『通常作品』');
});

test('3-49 watch person chips support add, remove, duplicate blocking, and comma-separated serialization', () => {
  const { ctx, elements } = loadFrontendContext();
  vm.runInContext(`
    watchData = [{
      row: 10, id: '923', title: 'ドラマ『会社員』', category: 'ドラマ', status: '進行中',
      watchDate: '2026-11-19', cast: '山田孝之, 中谷美紀', staff: '監督A', memo: '<p>メモ</p>', summary: ''
    }];
  `, ctx);

  ctx.openEditWatchModal(10, '923');
  assert.deepEqual(Array.from(vm.runInContext('watchCastChips', ctx)), ['山田孝之', '中谷美紀']);
  assert.equal(elements.get('w-memo').value, 'メモ');

  // Add new cast member
  const addRes = ctx.addWatchPersonChips('cast', '北川景子');
  assert.deepEqual(Array.from(addRes.added), ['北川景子']);
  assert.equal(addRes.duplicates.length, 0);
  assert.deepEqual(Array.from(vm.runInContext('watchCastChips', ctx)), ['山田孝之', '中谷美紀', '北川景子']);

  // Duplicate add (with full-width space variation) is blocked with warning
  const dupRes = ctx.addWatchPersonChips('cast', '山田　孝之');
  assert.equal(dupRes.added.length, 0);
  assert.equal(dupRes.duplicates.length, 1);
  assert.ok(elements.get('w-cast-warn').textContent.includes('既に追加されています'));
  assert.equal(vm.runInContext('watchCastChips.length', ctx), 3);

  // Remove one cast member
  ctx.removeWatchPersonChip('cast', 1);
  assert.deepEqual(Array.from(vm.runInContext('watchCastChips', ctx)), ['山田孝之', '北川景子']);
  assert.equal(ctx.hasUnsavedWatchModalChanges(), true);
});
