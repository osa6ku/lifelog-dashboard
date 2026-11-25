import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
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

test('GAS nightly Doc sync tracks dirty years without duplicates and builds sorted year entries', () => {
  const { ctx } = loadGasContext();
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.getDirtyDocYears_())), []);

  ctx.markDocYearDirty_('2026');
  ctx.markDocYearDirty_('2026');
  ctx.markDocYearDirty_('2025');
  ctx.markDocYearDirty_('1999'); // not in YEAR_DOC_IDS -> ignored
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.getDirtyDocYears_())), ['2025', '2026']);

  const compat = ctx.syncDiaryDocAction({ date: '2024-05-01' });
  assert.equal(compat.ok, true);
  assert.equal(compat.docSyncMode, 'nightly_batch');
  assert.deepEqual(JSON.parse(JSON.stringify(ctx.getDirtyDocYears_())), ['2024', '2025', '2026']);

  const rows = [
    ['ID', '日付', '曜日', '時刻', 'タイトル', '本文', '場所', '枚数', '写真名', '写真URL'],
    [2, '2026-11-20', '金', '09:00', 'B', 'line1\n\nline2', '自宅\n会社', 1, 'b.jpg', 'https://example.com/b'],
    [1, '2026-11-18', '水', '08:00', 'A', 'hello', '東京駅', 0, '', ''],
    [3, '2025-12-31', '水', '23:00', 'Old', 'old', '', 0, '', ''],
  ];
  const entries = JSON.parse(JSON.stringify(ctx.buildYearDocEntries_(rows, '2026')));
  assert.equal(entries.length, 2);
  assert.equal(entries[0].date, '2026-11-18');
  assert.equal(entries[1].date, '2026-11-20');
  assert.equal(entries[1].location, '自宅 → 会社');
});

test('GAS files exclusively use getSheetByName and never index-based getSheets()[0] or getActiveSheet()', () => {
  const gasDir = path.join(process.cwd(), 'gas');
  const files = fs.readdirSync(gasDir).filter(f => f.endsWith('.gs'));
  assert.ok(files.length >= 6);
  for (const file of files) {
    const src = fs.readFileSync(path.join(gasDir, file), 'utf8');
    assert.equal(/\.getSheets\s*\(\s*\)\s*\[/.test(src), false, `${file} must not use getSheets()[i]`);
    assert.equal(/\.getActiveSheet\s*\(/.test(src), false, `${file} must not use getActiveSheet()`);
  }
});

test('GAS updateDiaryEntry avoids writing CellImage in column K on text-only edits and succeeds', () => {
  const cellImageStub = { valueType: 'IMAGE', getContentUrl: () => 'https://drive.google.com/uc?export=view&id=abc' };
  const headers = [
    'ID', '日付', '曜日', '時刻', 'タイトル', '本文', '場所',
    '写真枚数', '写真ファイル名', '写真URL', 'サムネイル(IMAGE)', '年別Doc URL', 'データソース',
    '食事区分', '推定カロリー(kcal)', '栄養バランス(PFC・所見)', '位置情報JSON',
  ];
  const grid = [
    headers.slice(),
    [
      2576, '2026-11-25', '水', '07:36', '出社', '元の本文', '会社',
      1, '2026-11-25_breakfast.jpg', 'https://drive.google.com/file/d/1yUxs3_test/view',
      cellImageStub, 'https://docs.google.com/document/d/doc1/edit', 'webapp_entry',
      '', '', '', '',
    ],
  ];
  const writtenRanges = [];
  const mockSheet = {
    getLastRow: () => grid.length,
    getLastColumn: () => headers.length,
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        getValue: () => grid[row - 1][col - 1],
        getValues: () => {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            out.push(grid[row - 1 + r].slice(col - 1, col - 1 + numCols));
          }
          return out;
        },
        setValue(val) {
          if (val && typeof val === 'object' && !(val instanceof Date)) {
            throw new Error('Exception: サービス エラー: スプレッドシート');
          }
          grid[row - 1][col - 1] = val;
        },
        setValues(vals) {
          writtenRanges.push({ row, col, numRows, numCols });
          for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) {
              const v = vals[r][c];
              if (v && typeof v === 'object' && !(v instanceof Date)) {
                throw new Error('Exception: サービス エラー: スプレッドシート');
              }
              grid[row - 1 + r][col - 1 + c] = v;
            }
          }
        },
      };
    },
  };
  const { ctx } = loadGasContext({
    extraGlobals: {
      SpreadsheetApp: {
        openById: () => ({
          getSheetByName: (name) => (name === '日記DB' ? mockSheet : null),
        }),
      },
      Utilities: {
        formatDate: () => '2026-11-25 10:30',
        sleep: () => {},
      },
    },
  });

  const res = ctx.updateDiaryEntry({ id: 2576, row: 2, body: '元の本文\n追記テキスト' });
  assert.equal(res.ok, true);
  assert.equal(grid[1][5], '元の本文\n追記テキスト');
  // K列(11列目)は書き込まれず保持されること
  assert.equal(grid[1][10], cellImageStub);
  assert.equal(writtenRanges.some(w => w.col <= 11 && (w.col + w.numCols - 1) >= 11), false);
});

test('GAS withSheetRetry_ retries transient spreadsheet errors up to 2 times with 1-2s sleep and skips non-transient errors', () => {
  const sleeps = [];
  const warns = [];
  const { ctx } = loadGasContext({
    extraGlobals: {
      Utilities: {
        sleep: (ms) => sleeps.push(ms),
      },
      console: {
        log: () => {},
        warn: (...args) => warns.push(args),
        error: () => {},
      },
    },
  });

  let attempts = 0;
  const okResult = ctx.withSheetRetry_(() => {
    attempts++;
    if (attempts < 3) throw new Error('Exception: サービス エラー: スプレッドシート');
    return 'recovered';
  }, { label: 'test_op' });
  assert.equal(okResult, 'recovered');
  assert.equal(attempts, 3);
  assert.equal(sleeps.length, 2);
  assert.ok(sleeps.every(ms => ms >= 1000 && ms <= 2000));
  assert.equal(warns.length, 2);

  let nonTransientAttempts = 0;
  assert.throws(() => {
    ctx.withSheetRetry_(() => {
      nonTransientAttempts++;
      throw new Error('Sheet not found: 日記DB');
    }, { label: 'non_transient' });
  }, /Sheet not found/);
  assert.equal(nonTransientAttempts, 1);
});

test('GAS doPost and doGet log stack trace, action/api, and target id/row via console.error on exception', () => {
  const errorLogs = [];
  const { ctx } = loadGasContext({
    extraGlobals: {
      SpreadsheetApp: {
        openById: () => {
          throw new Error('Exception: Service error: Spreadsheets');
        },
      },
      Utilities: {
        formatDate: () => '2026-11-25',
        sleep: () => {},
      },
      ContentService: {
        MimeType: { JSON: 'application/json' },
        createTextOutput: (text) => ({
          _text: text,
          setMimeType() { return this; },
        }),
      },
      console: {
        log: () => {},
        warn: () => {},
        error: (...args) => errorLogs.push(args),
      },
    },
  });

  const postOut = ctx.doPost({
    postData: {
      contents: JSON.stringify({ action: 'updateDiary', payload: { id: 2576, row: 2575, body: 'test' } }),
    },
  });
  const postJson = JSON.parse(postOut._text);
  assert.equal(postJson.ok, false);
  assert.equal(errorLogs.length, 1);
  assert.equal(errorLogs[0][0], '[doPost error]');
  assert.equal(errorLogs[0][1].action, 'updateDiary');
  assert.equal(errorLogs[0][1].id, 2576);
  assert.equal(errorLogs[0][1].row, 2575);
  assert.ok(String(errorLogs[0][1].stack).includes('Service error: Spreadsheets'));

  const getOut = ctx.doGet({ parameter: { api: 'diary', id: '2576' } });
  const getJson = JSON.parse(getOut._text);
  assert.equal(getJson.ok, false);
  assert.equal(errorLogs.length, 2);
  assert.equal(errorLogs[1][0], '[doGet error]');
  assert.equal(errorLogs[1][1].api, 'diary');
  assert.equal(errorLogs[1][1].id, '2576');
  assert.ok(String(errorLogs[1][1].stack).includes('Service error: Spreadsheets'));
});

test('3-52 GAS resolveDiaryTimeForCreate_ auto-fills JST time when omitted and preserves explicit empty string', () => {
  const { ctx } = loadGasContext({
    extraGlobals: {
      Utilities: {
        formatDate: () => '11:25',
      },
    },
  });
  assert.equal(ctx.resolveDiaryTimeForCreate_(undefined), '11:25');
  assert.equal(ctx.resolveDiaryTimeForCreate_(null), '11:25');
  assert.equal(ctx.resolveDiaryTimeForCreate_(''), '');
  assert.equal(ctx.resolveDiaryTimeForCreate_('   '), '');
  assert.equal(ctx.resolveDiaryTimeForCreate_('7:36'), '07:36');
  assert.equal(ctx.resolveDiaryTimeForCreate_('09:45:12'), '09:45');

  const rowObj = ctx.formatDiaryRow_(2, [10, '2026-11-25', '水', '7:36', '朝', '本文', '', 0, '', '', '', '', 'webapp_entry'], {
    mealTypeCol: 0, caloriesCol: 0, nutritionCol: 0, locJsonCol: 0, totalCols: 13,
  });
  assert.equal(rowObj.time, '07:36');
});

test('3-53 GAS buildYearCounts_ aggregates counts per year in descending order', () => {
  const { ctx } = loadGasContext();
  const sample = [
    { date: '2026-11-25' },
    { date: '2026-01-03' },
    { date: '2024-05-10' },
    { date: '2012-10-25' },
    { date: '' },
    { date: 'invalid' },
  ];
  const counts = JSON.parse(JSON.stringify(ctx.buildYearCounts_(sample, 'date')));
  assert.deepEqual(counts, [
    { year: 2026, count: 2 },
    { year: 2024, count: 1 },
    { year: 2012, count: 1 },
  ]);
});

test('3-56 GAS diary time avoids +9h shift/drift on Etc/GMT spreadsheet via plain-text @ format and spreadsheet TZ', () => {
  const headers = [
    'ID', '日付', '曜日', '時刻', 'タイトル', '本文', '場所',
    '写真枚数', '写真ファイル名', '写真URL', 'サムネイル(IMAGE)', '年別Doc URL', 'データソース',
    '食事区分', '推定カロリー(kcal)', '栄養バランス(PFC・所見)', '位置情報JSON',
  ];
  // Legacy Date cell representing 16:11 in Etc/GMT spreadsheet
  const legacyUtcTime = new Date(Date.UTC(1899, 11, 30, 16, 11, 0));
  const grid = [
    headers.slice(),
    [2575, '2026-11-24', '火', legacyUtcTime, '出社', '元の本文', '', 0, '', '', '', '', 'webapp_entry', '', '', '', ''],
  ];
  const formats = new Map(); // "r:c" -> numberFormat

  const mockParent = {
    getSpreadsheetTimeZone: () => 'Etc/GMT',
    getSheetByName: (name) => (name === '日記DB' ? mockSheet : null),
  };
  const mockSheet = {
    getParent: () => mockParent,
    getLastRow: () => grid.length,
    getLastColumn: () => headers.length,
    getRange(row, col, numRows = 1, numCols = 1) {
      return {
        setNumberFormat(fmt) {
          for (let r = 0; r < numRows; r++) {
            for (let c = 0; c < numCols; c++) formats.set(`${row + r}:${col + c}`, fmt);
          }
        },
        getValue: () => (grid[row - 1] ? grid[row - 1][col - 1] : ''),
        getDisplayValue: () => {
          const v = grid[row - 1] ? grid[row - 1][col - 1] : '';
          if (v instanceof Date) {
            return `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`;
          }
          return String(v === null || v === undefined ? '' : v);
        },
        getDisplayValues: () => {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const rowData = grid[row - 1 + r] || new Array(headers.length).fill('');
            out.push(rowData.slice(col - 1, col - 1 + numCols).map(v => {
              if (v instanceof Date) {
                return `${String(v.getUTCHours()).padStart(2, '0')}:${String(v.getUTCMinutes()).padStart(2, '0')}`;
              }
              return String(v === null || v === undefined ? '' : v);
            }));
          }
          return out;
        },
        getValues: () => {
          const out = [];
          for (let r = 0; r < numRows; r++) {
            const rowData = grid[row - 1 + r] || new Array(headers.length).fill('');
            out.push(rowData.slice(col - 1, col - 1 + numCols));
          }
          return out;
        },
        setValue(val) {
          while (grid.length < row) grid.push(new Array(headers.length).fill(''));
          grid[row - 1][col - 1] = val;
        },
        setValues(vals) {
          for (let r = 0; r < numRows; r++) {
            const targetRow = row + r;
            while (grid.length < targetRow) grid.push(new Array(headers.length).fill(''));
            for (let c = 0; c < numCols; c++) {
              const targetCol = col + c;
              let v = vals[r][c];
              // Simulate Google Sheets auto-converting HH:mm into UTC Date when cell is NOT plain-text '@'
              if (targetCol === 4 && typeof v === 'string' && /^\d{1,2}:\d{2}$/.test(v) && formats.get(`${targetRow}:4`) !== '@') {
                const [hh, mm] = v.split(':').map(Number);
                v = new Date(Date.UTC(1899, 11, 30, hh, mm, 0));
              }
              grid[targetRow - 1][targetCol - 1] = v;
            }
          }
        },
      };
    },
  };

  const formatDateTz = (date, tz, pattern) => {
    const offsetMin = tz === 'Asia/Tokyo' ? 9 * 60 : 0;
    const d = new Date(date.getTime() + offsetMin * 60000);
    const yyyy = d.getUTCFullYear();
    const MM = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    const HH = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    if (pattern === 'HH:mm') return `${HH}:${mm}`;
    if (pattern === 'yyyy-MM-dd') return `${yyyy}-${MM}-${dd}`;
    return `${yyyy}-${MM}-${dd} ${HH}:${mm}`;
  };

  const { ctx } = loadGasContext({
    extraGlobals: {
      SpreadsheetApp: { openById: () => mockParent },
      Utilities: { formatDate: formatDateTz, sleep: () => {} },
    },
  });

  // 1. Legacy Date cell in Etc/GMT sheet reads as '16:11' (NOT +9h '01:11')
  const initialEntries = ctx.getDiaryEntries(0);
  assert.equal(initialEntries[0].time, '16:11');

  // 2. Consecutive 3x updateDiaryEntry roundtrips never drift from '16:11'
  for (let i = 1; i <= 3; i++) {
    const readTime = ctx.getDiaryEntries(0).find(e => e.id === 2575).time;
    assert.equal(readTime, '16:11');
    const upd = ctx.updateDiaryEntry({ row: 2, id: 2575, time: readTime, body: `更新${i}` });
    assert.equal(upd.ok, true);
    assert.equal(upd.entry.time, '16:11');
    assert.equal(formats.get('2:4'), '@');
    assert.equal(typeof grid[1][3], 'string');
    assert.equal(grid[1][3], '16:11');
  }

  // 3. New diary (3-52 auto-fill and explicit time) saves as plain-text '@' without drift
  const created = ctx.addDiaryEntry({ date: '2026-11-25', time: '07:36', title: '朝', body: '新規' });
  assert.equal(created.ok, true);
  assert.equal(created.entry.time, '07:36');
  assert.equal(formats.get(`${created.row}:4`), '@');
  assert.equal(grid[created.row - 1][3], '07:36');

  // 4. Explicit empty string "" is preserved as ""
  const emptyTime = ctx.addDiaryEntry({ date: '2026-11-25', time: '', title: '空時刻', body: '本文2' });
  assert.equal(emptyTime.ok, true);
  assert.equal(emptyTime.entry.time, '');
  assert.equal(grid[emptyTime.row - 1][3], '');
});
