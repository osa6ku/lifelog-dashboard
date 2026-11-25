import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadGasContext, loadFrontendContext } from './helpers/load-scripts.mjs';

test('3-54 GAS extractUrlsFromWatchMemo_ handles standalone/inline Markdown, angle, escaped, Wikipedia parens, and bare URLs with dedupe', () => {
  const { ctx } = loadGasContext();

  // 1. Standalone Markdown link -> URL migrated, line deleted
  const r1 = ctx.extractUrlsFromWatchMemo_(
    '面白かった。\n\n[公式サイト](https://example.com/official)\n\nまた観たい。',
    ''
  );
  assert.equal(r1.memo, '面白かった。\n\nまた観たい。');
  assert.equal(r1.relatedUrl, 'https://example.com/official');

  // 2. Inline Markdown link -> display text preserved, URL migrated
  const r2 = ctx.extractUrlsFromWatchMemo_(
    '[アマプラ](https://www.amazon.co.jp/dp/B001)にて鑑賞。',
    ''
  );
  assert.equal(r2.memo, 'アマプラにて鑑賞。');
  assert.equal(r2.relatedUrl, 'https://www.amazon.co.jp/dp/B001');

  // 3. Angle bracket <URL>, escaped \[text\](URL), and Wikipedia balanced parens
  const r3 = ctx.extractUrlsFromWatchMemo_(
    '\\[詳細\\](https://ja.wikipedia.org/wiki/会社員_(ドラマ)) を確認。\n<https://example.com/review>',
    ''
  );
  assert.equal(r3.memo, '詳細 を確認。');
  assert.equal(
    r3.relatedUrl,
    'https://ja.wikipedia.org/wiki/会社員_(ドラマ)\nhttps://example.com/review'
  );

  // 4. Bare URL with trailing Japanese punctuation + dedupe against existing relatedUrl (comma/newline separated)
  const r4 = ctx.extractUrlsFromWatchMemo_(
    '参考は https://example.com/a、あと https://example.com/b。',
    'https://example.com/a, https://example.com/existing'
  );
  assert.equal(r4.memo, '参考は 、あと 。');
  assert.equal(
    r4.relatedUrl,
    'https://example.com/a\nhttps://example.com/existing\nhttps://example.com/b'
  );
});

test('3-54 GAS updateWatchCard partial update without memo preserves existing memo and relatedUrl, and migrateWatchMemoUrls backs up and migrates', () => {
  const headers = ['ID', '自動', 'タイトル', '区分', '鑑賞日', 'ステータス', '評価', 'PF', '公開年', '出演者', 'スタッフ', '概要', '感想・メモ', '関連URL', 'NotionURL'];
  const grid = [
    headers.slice(),
    [1, false, '会社員', 'ドラマ', '2026-11-20', '進行中', '', 'TBS', '2026', '', '', '', '[公式](https://example.com/1)\n面白かった', 'https://example.com/0', ''],
  ];
  let backupName = '';
  const mockSheet = {
    getLastRow: () => grid.length,
    getLastColumn: () => headers.length,
    copyTo: () => ({ setName: (n) => { backupName = n; } }),
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        getValue: () => grid[row - 1][col - 1],
        getValues: () => {
          const out = [];
          for (let r = 0; r < numRows; r++) out.push(grid[row - 1 + r].slice(col - 1, col - 1 + numCols));
          return out;
        },
        setValue(val) { grid[row - 1][col - 1] = val; },
        setValues(vals) {
          for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) grid[row - 1 + r][col - 1 + c] = vals[r][c];
          }
        },
      };
    },
  };
  const { ctx } = loadGasContext({
    extraGlobals: {
      SpreadsheetApp: {
        openById: () => ({ getSheetByName: (name) => (name === '鑑賞記録DB' ? mockSheet : null) }),
      },
      Utilities: { formatDate: () => '20261125_1155', sleep: () => {} },
    },
  });

  // 5. Partial update (status only, no memo) must preserve memo & relatedUrl
  const partial = ctx.updateWatchCard({ row: 2, id: 1, status: '完了' });
  assert.equal(partial.ok, true);
  assert.equal(grid[1][12], '[公式](https://example.com/1)\n面白かった');
  assert.equal(grid[1][13], 'https://example.com/0');

  // Batch migration creates backup, migrates URL, clears memo URL, keeps invariants
  const summary = ctx.migrateWatchMemoUrls();
  assert.equal(summary.ok, true);
  assert.ok(backupName.startsWith('鑑賞記録DB_url_backup_'));
  assert.equal(summary.beforeUrlMemoRows, 1);
  assert.equal(summary.afterUrlMemoRows, 0);
  assert.equal(summary.migratedUrlCount, 1);
  assert.equal(summary.invariantsOk, true);
  assert.equal(grid[1][12], '面白かった');
  assert.equal(grid[1][13], 'https://example.com/0\nhttps://example.com/1');
});

test('3-54 & 3-55 three-stage transition (list -> detail -> edit), URL badge rendering, mis-tap/selection guard, and scroll restore', () => {
  let scrollPos = 420;
  let selectionText = '';
  const { ctx, elements } = loadFrontendContext({
    extraGlobals: {
      IntersectionObserver: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
      getSelection: () => selectionText,
      scrollTo: (_x, y) => { scrollPos = y; },
    },
  });
  Object.defineProperty(ctx, 'scrollY', { get: () => scrollPos, configurable: true });
  ctx.document.getElementById('diary-list').querySelectorAll = () => [];
  ctx.document.getElementById('diary-detail-view').querySelectorAll = () => [];
  ctx.document.querySelectorAll = (sel) => {
    if (sel === '.modal-backdrop.open') {
      return ['modal-watch', 'modal-diary']
        .map(id => ctx.document.getElementById(id))
        .filter(m => m.classList.contains('open'));
    }
    return [];
  };

  vm.runInContext(`
    statusFilter = 'ALL';
    watchData = [{
      row: 5, id: '50', title: '会社員', category: 'ドラマ', watchDate: '2026-11-20',
      status: '進行中', rating: '5', platform: 'TBS', releaseYear: '2026',
      cast: '吉田羊, 中谷美紀', staff: '監督A', summary: '概要テキスト',
      memo: '詳細な感想メモ全文', relatedUrl: 'https://example.com/work', notionUrl: ''
    }];
    diaryData = [{
      row: 12, id: '2576', date: '2026-11-25', weekday: '水', time: '07:36',
      title: '出社', body: '全文本文テキスト', location: '会社',
      locations: [{ name: '会社', lat: 35.68, lng: 139.76 }],
      imageCount: 0, imageUrls: [], imageIds: []
    }];
  `, ctx);

  // 3-54: Watch compact list card includes related URL badge with stopPropagation
  ctx.renderWatch();
  const watchListHtml = elements.get('watch-list').innerHTML;
  assert.ok(watchListHtml.includes('related-url-badge'));
  assert.ok(watchListHtml.includes('https://example.com/work'));

  // 3-55 Stage 1 -> Stage 2 (Watch): card tap opens detail view, NOT edit modal, saves scrollY
  ctx.onWatchCardTap(5, '50', { target: { closest: () => null } });
  assert.equal(ctx.document.getElementById('watch-list-wrap').style.display, 'none');
  assert.equal(ctx.document.getElementById('watch-detail-view').style.display, 'block');
  assert.equal(ctx.document.getElementById('modal-watch').classList.contains('open'), false);
  assert.equal(scrollPos, 0);
  const watchDetailHtml = ctx.document.getElementById('watch-detail-view').innerHTML;
  assert.ok(watchDetailHtml.includes('詳細な感想メモ全文'));
  assert.ok(watchDetailHtml.includes('吉田羊'));
  assert.ok(watchDetailHtml.includes('← 一覧に戻る'));

  // Mis-tap on link/button/img or active text selection must NOT open Stage 3 edit modal
  ctx.onDetailContentTap('watch', 5, '50', { target: { closest: (sel) => (sel.includes('a') ? {} : null) } });
  assert.equal(ctx.document.getElementById('modal-watch').classList.contains('open'), false);

  selectionText = '選択中テキスト';
  ctx.onDetailContentTap('watch', 5, '50', { target: { closest: () => null } });
  assert.equal(ctx.document.getElementById('modal-watch').classList.contains('open'), false);

  // Stage 2 -> Stage 3: normal content tap opens edit modal
  selectionText = '';
  ctx.onDetailContentTap('watch', 5, '50', { target: { closest: () => null } });
  assert.equal(ctx.document.getElementById('modal-watch').classList.contains('open'), true);

  // Cancel modal returns to Stage 2 (detail view remains open)
  ctx.closeModals();
  assert.equal(ctx.document.getElementById('modal-watch').classList.contains('open'), false);
  assert.equal(ctx.document.getElementById('watch-detail-view').style.display, 'block');

  // Back to Stage 1 restores previous scrollY (420)
  ctx.closeWatchDetailView();
  assert.equal(ctx.document.getElementById('watch-detail-view').style.display, 'none');
  assert.equal(ctx.document.getElementById('watch-list-wrap').style.display, 'block');
  assert.equal(scrollPos, 420);

  // Diary Stage 1 -> Stage 2 -> Stage 3 -> Back
  scrollPos = 310;
  ctx.onDiaryCardTap(12, '2576', { target: { closest: () => null } });
  assert.equal(ctx.document.getElementById('diary-detail-view').style.display, 'block');
  assert.equal(ctx.document.getElementById('modal-diary').classList.contains('open'), false);
  assert.ok(ctx.document.getElementById('diary-detail-view').innerHTML.includes('全文本文テキスト'));
  ctx.onDetailContentTap('diary', 12, '2576', { target: { closest: () => null } });
  assert.equal(ctx.document.getElementById('modal-diary').classList.contains('open'), true);
  ctx.closeModals();
  ctx.closeDiaryDetailView();
  assert.equal(scrollPos, 310);
});
