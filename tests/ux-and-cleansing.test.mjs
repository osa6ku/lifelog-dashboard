import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { loadFrontendContext, loadGasContext } from './helpers/load-scripts.mjs';

test('3-48 / 3-50 swipe guard never prevents touchstart or vertical scroll, and only blocks strong edge horizontal touchmove', () => {
  const listeners = {};
  const { ctx } = loadFrontendContext({
    document: {
      getElementById() { return null; },
      querySelector() { return null; },
      querySelectorAll() { return []; },
      addEventListener(type, fn, opts) { listeners[type] = { fn, opts }; },
      visibilityState: 'visible',
    },
    extraGlobals: { innerWidth: 390 },
  });

  // 1) Pure logic checks
  // touchstart is NEVER prevented even at edges
  assert.equal(ctx.shouldPreventSwipeGesture({ type: 'touchstart', clientX: 5, innerWidth: 390, isExcluded: false, isEdge: true }), false);
  assert.equal(ctx.shouldPreventSwipeGesture({ type: 'touchstart', clientX: 385, innerWidth: 390, isExcluded: false, isEdge: true }), false);
  // Edge start detection
  assert.equal(ctx.isSwipeEdgeStart(12, 390, false), true);
  assert.equal(ctx.isSwipeEdgeStart(380, 390, false), true);
  assert.equal(ctx.isSwipeEdgeStart(180, 390, false), false);
  assert.equal(ctx.isSwipeEdgeStart(10, 390, true), false);
  // Vertical scroll or thumb-arc from edge -> NEVER blocked
  assert.equal(ctx.shouldPreventSwipeGesture({ type: 'touchmove', startX: 380, startY: 200, clientX: 365, clientY: 240, isExcluded: false, isEdge: true }), false);
  // Strong horizontal swipe from edge -> blocked
  assert.equal(ctx.shouldPreventSwipeGesture({ type: 'touchmove', startX: 10, startY: 200, clientX: 50, clientY: 208, isExcluded: false, isEdge: true }), true);
  // Non-edge horizontal swipe -> NOT blocked
  assert.equal(ctx.shouldPreventSwipeGesture({ type: 'touchmove', startX: 180, startY: 200, clientX: 240, clientY: 205, isExcluded: false, isEdge: false }), false);
  // Excluded target (.allow-x-scroll / .bottom-nav / input) -> NEVER blocked
  assert.equal(ctx.shouldPreventSwipeGesture({ type: 'touchmove', startX: 10, startY: 200, clientX: 50, clientY: 205, isExcluded: true, isEdge: true }), false);

  // 2) Installed listener checks: touchstart must be passive and must never call preventDefault
  ctx.installNavigationSwipeGuard();
  assert.equal(listeners.touchstart.opts.passive, true);
  let startPrevented = false;
  listeners.touchstart.fn({
    touches: [{ clientX: 382, clientY: 300 }],
    target: { closest: () => null },
    cancelable: true,
    preventDefault() { startPrevented = true; },
  });
  assert.equal(startPrevented, false, 'touchstart must never call preventDefault()');

  let verticalPrevented = false;
  listeners.touchmove.fn({
    touches: [{ clientX: 372, clientY: 360 }],
    cancelable: true,
    preventDefault() { verticalPrevented = true; },
  });
  assert.equal(verticalPrevented, false, 'vertical scroll from edge must not be prevented');

  // 3) CSS check: html, body must use overflow-x: clip (not overflow-x: hidden which breaks macOS scrolling)
  const css = fs.readFileSync(path.join(process.cwd(), 'css/style.css'), 'utf8');
  assert.ok(css.includes('overflow-x: clip;'), 'css/style.css must use overflow-x: clip on html, body');
  assert.ok(!/html,\s*body\s*\{[^}]*overflow-x:\s*hidden/.test(css), 'html, body must not set overflow-x: hidden');
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
