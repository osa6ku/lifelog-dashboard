/**
 * ライフログ_鑑賞記録DB — Wikipedia API 自動補完 & プラットフォーム正規化 GAS
 *
 * 【機能】
 * 1. カスタムメニュー「🎬 ライフログ管理」から選択行または未取得行のWikipedia情報を自動補完
 * 2. スマホ対応：B列「自動補完」チェックボックスを ON にすると自動実行し、完了後に OFF へ戻す
 * 3. User-Agent ヘッダーを設定して Wikipedia API の 403 エラーを回避
 * 4. プラットフォーム表記揺れを PLATFORM_TARGETS 辞書で正規化（「映画館」判定ルール含む）
 * 5. 主要キャストは最大 20 名までに制限して格納
 */

const SHEET_NAME = '鑑賞記録DB';
const WATCH_SS_ID = '1dvf7aVJA_B8SgkIB1qGzJztZ6hRPiA7SLb0xssY142E';
const DIARY_SS_ID = '1_UnbcNhxtEkV7vLagxreIeyELbY3NBLU5bS8pp4YQ1A';
const DIARY_SHEET_NAME = '日記DB';
const MEAL_SHEET_NAME = '食事記録DB';
const MEAL_HEADERS = ['ID', '日付', '食事区分', '料理名', '写真URL', '写真ID', 'カロリー(kcal)', 'タンパク質(g)', '脂質(g)', '炭水化物(g)', '糖質(g)', '食物繊維(g)', '塩分(g)', '所見・メモ', 'データソース'];
const JOURNAL_IMAGES_FOLDER_ID = '1kPfAX4TvDpMwokoinA2ga-nCwoePkLyo';
const JOURNAL_DOCS_FOLDER_ID = '1GqzKeXduc0UF-3Mb8nihfs3SVMSbOPSI';
const YEAR_DOC_IDS = {
  '2023': '1kq2hbOtbA_oMDdZ9V1Zfduw8gXG3YhQr5K_HS-NfCr8',
  '2024': '1zw5PJeGd0Ez5Z53Q9L337hwqB_zRzEHPn-ti6tsj8l8',
  '2025': '1ad_I1JPnJyvkiIdL_2tAjDA0bearBM5mld9I0bzXyg8',
  '2026': '114VekVP1Atik_cds8n_0N6rXmqRjO9l8GvETh570zKI',
};
const WIKI_USER_AGENT = 'LifelogNotionBot/1.0 (personal use)';
const MAX_CAST = 20;

// 列番号（1-indexed）
const COL = {
  ID: 1,
  AUTO_FETCH: 2,     // チェックボックス（スマホ対応トリガー）
  TITLE: 3,          // タイトル
  CATEGORY: 4,       // 区分（ドラマ / 映画 / アニメ / 本 / その他）
  WATCH_DATE: 5,     // 鑑賞日・完了日
  STATUS: 6,         // ステータス
  RATING: 7,         // 評価（スコア）
  PLATFORM: 8,       // プラットフォーム（正規化済み）
  RELEASE_YEAR: 9,   // 公開年・放送年
  CAST: 10,          // 出演者（主要キャスト最大20名）
  STAFF: 11,         // 監督・脚本・原作等
  SUMMARY: 12,       // 作品概要（Wikipedia）
  MEMO: 13,          // 感想・メモ
  RELATED_URL: 14,   // 関連URL
  NOTION_URL: 15,    // Notion元URL
};

// プラットフォーム表記揺れ正規化辞書
const PLATFORM_TARGETS = {
  'NHK': ['日本放送協会', 'NHK総合', 'NHK Eテレ', 'NHK G', 'NHK BSプレミアム', 'NHK BS'],
  '日本テレビ': ['日テレ', 'NTV', '日本テレビ放送網'],
  'TBS': ['TBSテレビ', '東京放送'],
  'フジテレビ': ['フジテレビジョン', 'フジ', 'CX'],
  'テレビ朝日': ['テレ朝', 'EX'],
  'テレビ東京': ['テレ東', 'TX'],
  '関西テレビ': ['カンテレ', 'KTV'],
  '読売テレビ': ['ytv', 'YTV'],
  'WOWOW': ['ワウワウ'],
  'Netflix': ['ネットフリックス', 'ネトフリ'],
  'Amazon Prime Video': ['Amazon Prime', 'アマプラ', 'Amazonプライムビデオ', 'Amazonプライム', 'Prime Video'],
  'U-NEXT': ['ユーネクスト', 'UNEXT'],
  'Hulu': ['フールー'],
  'Disney+': ['Disney', 'ディズニープラス', 'Disney Plus'],
  'Apple TV+': ['Apple TV', 'AppleTV+'],
  'ABEMA': ['AbemaTV', 'アベマ'],
  'TVer': ['ティーバー'],
  '映画館': ['劇場公開', '劇場鑑賞', 'シネマ', 'TOHOシネマズ', '109シネマズ', 'イオンシネマ', 'ユナイテッド・シネマ', 'MOVIX'],
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎬 ライフログ管理')
    .addItem('選択行をWikipediaから自動補完', 'enrichSelectedRows')
    .addItem('「自動補完」チェック済みの行を実行', 'enrichCheckedRows')
    .addSeparator()
    .addItem('プラットフォーム表記揺れを正規化（全行）', 'normalizeAllPlatforms')
    .addToUi();
}

/**
 * スマホ対応チェックボックストリガー（シンプルトリガー onEdit で動作、UrlFetchApp を使う場合は
 * インストーラブルトリガーとして登録するかメニューから実行してください）
 */
function onEditTrigger(e) {
  if (!e || !e.range) return;
  const sheet = e.range.getSheet();
  if (sheet.getName() !== SHEET_NAME) return;
  if (e.range.getColumn() === COL.AUTO_FETCH && e.range.getRow() > 1 && e.value === 'TRUE') {
    const row = e.range.getRow();
    enrichRow_(sheet, row);
    sheet.getRange(row, COL.AUTO_FETCH).setValue(false);
  }
}

function enrichSelectedRows() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return;
  const range = sheet.getActiveRange();
  if (!range) return;
  const startRow = Math.max(2, range.getRow());
  const endRow = startRow + range.getNumRows() - 1;
  for (let r = startRow; r <= endRow; r++) {
    enrichRow_(sheet, r);
  }
}

function enrichCheckedRows() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const checks = sheet.getRange(2, COL.AUTO_FETCH, lastRow - 1, 1).getValues();
  for (let i = 0; i < checks.length; i++) {
    if (checks[i][0] === true) {
      const row = i + 2;
      enrichRow_(sheet, row);
      sheet.getRange(row, COL.AUTO_FETCH).setValue(false);
    }
  }
}

function normalizeAllPlatforms() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  if (!sheet) return;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const vals = sheet.getRange(2, COL.PLATFORM, lastRow - 1, 1).getValues();
  const memos = sheet.getRange(2, COL.MEMO, lastRow - 1, 1).getValues();
  const titles = sheet.getRange(2, COL.TITLE, lastRow - 1, 1).getValues();
  const updated = vals.map((row, idx) => {
    const combinedText = `${titles[idx][0]} ${memos[idx][0]}`;
    return [normalizePlatforms_(String(row[0] || ''), combinedText)];
  });
  sheet.getRange(2, COL.PLATFORM, updated.length, 1).setValues(updated);
}

function enrichRow_(sheet, row) {
  const rawTitle = String(sheet.getRange(row, COL.TITLE).getValue() || '').trim();
  if (!rawTitle) return;

  const cleanTitle = rawTitle
    .replace(/^(?:\[.*?\]|【.*?】|ドラマ|映画|アニメ|小説|漫画)[『「\s]*(.*?)[』」\s]*$/, '$1')
    .trim();

  const wiki = fetchWikipediaInfo_(cleanTitle || rawTitle);
  if (!wiki) {
    sheet.getRange(row, COL.SUMMARY).setValue('⚠️ Wikipedia記事が見つかりませんでした');
    return;
  }

  if (wiki.year && !sheet.getRange(row, COL.RELEASE_YEAR).getValue()) {
    sheet.getRange(row, COL.RELEASE_YEAR).setValue(wiki.year);
  }
  if (wiki.platforms.length > 0) {
    const curPlat = String(sheet.getRange(row, COL.PLATFORM).getValue() || '');
    const memo = String(sheet.getRange(row, COL.MEMO).getValue() || '');
    const merged = [curPlat, ...wiki.platforms].filter(Boolean).join(', ');
    sheet.getRange(row, COL.PLATFORM).setValue(normalizePlatforms_(merged, `${rawTitle} ${memo}`));
  }
  if (wiki.cast.length > 0) {
    sheet.getRange(row, COL.CAST).setValue(wiki.cast.slice(0, MAX_CAST).join(', '));
  }
  if (wiki.staff.length > 0) {
    sheet.getRange(row, COL.STAFF).setValue(wiki.staff.join(', '));
  }
  if (wiki.summary) {
    sheet.getRange(row, COL.SUMMARY).setValue(wiki.summary);
  }
}

function normalizePlatforms_(rawStr, contextText) {
  const tokens = rawStr.split(/[,、\/]+/).map(s => s.trim()).filter(Boolean);
  const result = [];
  const addUnique = (val) => {
    if (val && !result.includes(val)) result.push(val);
  };

  for (const tok of tokens) {
    let matched = false;
    for (const [canonical, aliases] of Object.entries(PLATFORM_TARGETS)) {
      if (tok === canonical || aliases.some(a => tok.toLowerCase() === a.toLowerCase())) {
        addUnique(canonical);
        matched = true;
        break;
      }
    }
    if (!matched) addUnique(tok);
  }

  // 「映画館」判定ルール（テキスト中に映画館・シネマ等が含まれる場合）
  if (contextText && /(映画館|シネマズ|シネマ|劇場で|IMAX|Dolby)/i.test(contextText)) {
    addUnique('映画館');
  }
  return result.join(', ');
}

function fetchWikipediaInfo_(title) {
  const apiBase = 'https://ja.wikipedia.org/w/api.php';
  const headers = { 'User-Agent': WIKI_USER_AGENT };

  const searchUrl = `${apiBase}?action=query&list=search&srsearch=${encodeURIComponent(title)}&format=json`;
  const sRes = UrlFetchApp.fetch(searchUrl, { headers, muteHttpExceptions: true });
  if (sRes.getResponseCode() !== 200) return null;

  const sJson = JSON.parse(sRes.getContentText());
  const results = (sJson.query && sJson.query.search) || [];
  if (results.length === 0) return null;

  const exact = results.find(r => r.title === title);
  const pageTitle = exact ? exact.title : results[0].title;
  const contentUrl = `${apiBase}?action=query&prop=revisions|extracts&rvprop=content&exintro=1&explaintext=1&titles=${encodeURIComponent(pageTitle)}&format=json`;
  const cRes = UrlFetchApp.fetch(contentUrl, { headers, muteHttpExceptions: true });
  if (cRes.getResponseCode() !== 200) return null;

  const pages = (JSON.parse(cRes.getContentText()).query || {}).pages || {};
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) return null;

  const wikitext = (page.revisions && page.revisions[0] && page.revisions[0]['*']) || '';
  const summary = (page.extract || '').split('\n')[0].slice(0, 400);

  // 公開年・放送年抽出
  const yearMatch = wikitext.match(/\|\s*(?:公開|放送期間|放送年|製作年|発表)\s*=\s*.*?((?:19|20)\d{2})年/);
  const year = yearMatch ? Number(yearMatch[1]) : '';

  // プラットフォーム・放送局抽出
  const platforms = [];
  for (const [canonical, aliases] of Object.entries(PLATFORM_TARGETS)) {
    const allNames = [canonical, ...aliases];
    const platRegex = new RegExp(`\\|\\s*(?:放送局|製作局|配給|配信|放送枠)\\s*=.*?(?:${allNames.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i');
    if (platRegex.test(wikitext)) {
      platforms.push(canonical);
    }
  }

  // キャスト・スタッフ抽出
  const cast = [];
  const staff = [];
  let inCast = false;
  const skipWords = new Set(['日本', 'テレビドラマ', '映画', 'アニメ', 'TBS', 'フジテレビ', 'NHK', '日本テレビ', 'テレビ朝日', 'テレビ東京']);

  for (const line of wikitext.split('\n')) {
    if (/==\s*(?:キャスト|出演者?|登場人物|声の出演)\s*==/.test(line)) {
      inCast = true;
      continue;
    } else if (/==\s*[^=]+\s*==/.test(line)) {
      inCast = false;
    }

    const isStaffLine = /\|\s*(?:監督|脚本|原作|演出|プロデューサー|音楽)\s*=/.test(line);
    const isCastLine = inCast || /\|\s*(?:出演者?|キャスト|主演|声の出演)\s*=/.test(line);
    if (!isStaffLine && !isCastLine) continue;

    const links = [...line.matchAll(/\[\[([^\]]+)\]\]/g)];
    for (const m of links) {
      let name = m[1].split('|')[0].trim().replace(/\s*\(.*?\)/g, '');
      if (!name || name.includes(':') || name.includes('年') || skipWords.has(name)) continue;
      if (isStaffLine) {
        if (!staff.includes(name)) staff.push(name);
      } else {
        if (!cast.includes(name) && cast.length < MAX_CAST) cast.push(name);
      }
    }
  }

  return { pageTitle, year, platforms, cast, staff: staff.slice(0, 10), summary };
}

// ============================================================================
// Web アプリ (HTMLService) エンドポイント & API
// ============================================================================

function doGet(e) {
  const api = e && e.parameter && e.parameter.api;
  if (api === 'watch') {
    const entries = getWatchEntries();
    return jsonResponse_({ ok: true, count: entries.length, entries });
  }
  if (api === 'diary') {
    const rawLimit = e.parameter && e.parameter.limit;
    const limit = rawLimit !== undefined ? Number(rawLimit) : 0;
    const entries = getDiaryEntries(limit);
    return jsonResponse_({ ok: true, count: entries.length, entries });
  }
  if (api === 'meals') {
    const entries = getMealEntries();
    return jsonResponse_({ ok: true, count: entries.length, entries });
  }
  if (api === 'thumb') {
    const fileId = String((e.parameter && e.parameter.id) || '').trim();
    const full = String((e.parameter && e.parameter.full) || '') === '1';
    return jsonResponse_(getImageDataUrl_(fileId, full));
  }
  const dashUrl = 'https://osa6ku.github.io/lifelog-dashboard/';
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ライフログ・ダッシュボード</title><meta http-equiv="refresh" content="2;url=${dashUrl}"></head><body style="font-family:sans-serif;padding:24px;text-align:center;"><h2>📚 ライフログ・ダッシュボード</h2><p>ダッシュボードは GitHub Pages に移行しました。</p><p><a href="${dashUrl}" style="display:inline-block;padding:12px 20px;background:#1a73e8;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">ダッシュボードを開く</a></p></body></html>`;
  return HtmlService.createHtmlOutput(html)
    .setTitle('ライフログ・ダッシュボード')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const action = body.action;
    if (action === 'addWatch') return jsonResponse_(addWatchEntry(body.payload || {}));
    if (action === 'updateWatch') return jsonResponse_(updateWatchCard(body.payload || {}));
    if (action === 'updateWatchFull') return jsonResponse_(updateWatchFull(body.payload || {}));
    if (action === 'deleteWatch') return jsonResponse_(deleteWatchEntry(body.payload || {}));
    if (action === 'addDiary') return jsonResponse_(addDiaryEntry(body.payload || {}));
    if (action === 'updateDiary') return jsonResponse_(updateDiaryEntry(body.payload || {}));
    if (action === 'syncDiaryDoc') return jsonResponse_(syncDiaryDocAction(body.payload || {}));
    if (action === 'deleteDiary') return jsonResponse_(deleteDiaryEntry(body.payload || {}));
    if (action === 'analyzeMeal') return jsonResponse_(analyzeMealEntry(body.payload || {}));
    if (action === 'addMeal') return jsonResponse_(addMealEntry(body.payload || {}));
    if (action === 'updateMeal') return jsonResponse_(updateMealEntry(body.payload || {}));
    if (action === 'deleteMeal') return jsonResponse_(deleteMealEntry(body.payload || {}));
    if (action === 'importMeals') return jsonResponse_(importMealsBatch(body.payload || {}));
    if (action === 'migrateMealPhotosToDiary') return jsonResponse_(migrateMealPhotosToDiary());
    if (action === 'batchSortDiaryPhotos') return jsonResponse_(batchSortDiaryPhotos(body.payload || {}));
    if (action === 'batchUpdateDiaryLocations') return jsonResponse_(batchUpdateDiaryLocations(body.payload || {}));
    if (action === 'batchUpdateWatchMemos') return jsonResponse_(batchUpdateWatchMemos(body.payload || {}));
    return jsonResponse_({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getWatchEntries() {
  const ss = SpreadsheetApp.openById(WATCH_SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const entries = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (!r[COL.TITLE - 1] && !r[COL.NOTION_URL - 1] && !r[COL.ID - 1]) continue;
    entries.push({
      row: i + 1,
      id: r[COL.ID - 1],
      title: String(r[COL.TITLE - 1] || '(無題)'),
      category: String(r[COL.CATEGORY - 1] || 'その他'),
      watchDate: formatDateVal_(r[COL.WATCH_DATE - 1]),
      status: String(r[COL.STATUS - 1] || ''),
      rating: String(r[COL.RATING - 1] || ''),
      platform: String(r[COL.PLATFORM - 1] || ''),
      releaseYear: String(r[COL.RELEASE_YEAR - 1] || ''),
      cast: String(r[COL.CAST - 1] || ''),
      staff: String(r[COL.STAFF - 1] || ''),
      summary: String(r[COL.SUMMARY - 1] || ''),
      memo: String(r[COL.MEMO - 1] || ''),
      relatedUrl: String(r[COL.RELATED_URL - 1] || ''),
      notionUrl: String(r[COL.NOTION_URL - 1] || ''),
    });
  }
  return entries.reverse();
}

function addWatchEntry(payload) {
  const ss = SpreadsheetApp.openById(WATCH_SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const nextId = lastRow >= 2 ? Number(sheet.getRange(lastRow, COL.ID).getValue() || lastRow - 1) + 1 : 1;

  const title = String(payload.title || '').trim();
  const memo = String(payload.memo || '').trim();
  const normPlat = normalizePlatforms_(String(payload.platform || ''), `${title} ${memo}`);
  const watchDate = payload.watchDate || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');

  const newRow = [
    nextId,
    false,
    title,
    payload.category || 'ドラマ',
    watchDate,
    payload.status || '進行中',
    payload.rating || '',
    normPlat,
    '',
    '',
    '',
    '',
    memo,
    payload.relatedUrl || '',
    '',
  ];
  sheet.appendRow(newRow);
  const insertedRow = sheet.getLastRow();

  if (payload.autoWiki) {
    enrichRow_(sheet, insertedRow);
  }
  const r = sheet.getRange(insertedRow, 1, 1, 15).getValues()[0];
  return { ok: true, row: insertedRow, entry: formatWatchRow_(insertedRow, r) };
}

function resolveRowByIdOrIndex_(sheet, idCol, row, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const r = Number(row || 0);
  if (r >= 2 && r <= lastRow) {
    if (id === undefined || id === null || id === '' || String(sheet.getRange(r, idCol).getValue()) === String(id)) {
      return r;
    }
  }
  if (id !== undefined && id !== null && id !== '') {
    const ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
    const idx = ids.findIndex(v => String(v[0]) === String(id));
    if (idx >= 0) return idx + 2;
  }
  return 0;
}

function formatWatchRow_(row, r) {
  return {
    row,
    id: r[COL.ID - 1],
    title: String(r[COL.TITLE - 1] || ''),
    category: String(r[COL.CATEGORY - 1] || ''),
    watchDate: formatDateVal_(r[COL.WATCH_DATE - 1]),
    status: String(r[COL.STATUS - 1] || ''),
    rating: String(r[COL.RATING - 1] || ''),
    platform: String(r[COL.PLATFORM - 1] || ''),
    releaseYear: String(r[COL.RELEASE_YEAR - 1] || ''),
    cast: String(r[COL.CAST - 1] || ''),
    staff: String(r[COL.STAFF - 1] || ''),
    summary: String(r[COL.SUMMARY - 1] || ''),
    memo: String(r[COL.MEMO - 1] || ''),
    relatedUrl: String(r[COL.RELATED_URL - 1] || ''),
    notionUrl: String(r[COL.NOTION_URL - 1] || ''),
  };
}

function updateWatchCard(payload) {
  const ss = SpreadsheetApp.openById(WATCH_SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const row = resolveRowByIdOrIndex_(sheet, COL.ID, payload.row, payload.id);
  if (row < 2) throw new Error('Watch entry not found');

  if (payload.status !== undefined) {
    sheet.getRange(row, COL.STATUS).setValue(payload.status);
    if (payload.status === '完了' && !sheet.getRange(row, COL.WATCH_DATE).getValue()) {
      sheet.getRange(row, COL.WATCH_DATE).setValue(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'));
    }
  }
  if (payload.rating !== undefined) {
    sheet.getRange(row, COL.RATING).setValue(payload.rating);
  }
  if (payload.runWiki) {
    enrichRow_(sheet, row);
  }
  const r = sheet.getRange(row, 1, 1, 15).getValues()[0];
  return formatWatchRow_(row, r);
}

function updateWatchFull(payload) {
  const ss = SpreadsheetApp.openById(WATCH_SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const row = resolveRowByIdOrIndex_(sheet, COL.ID, payload.row, payload.id);
  if (row < 2) return { ok: false, error: 'Watch entry not found' };

  const cur = sheet.getRange(row, 1, 1, 15).getValues()[0];
  const title = payload.title !== undefined ? String(payload.title).trim() : String(cur[COL.TITLE - 1] || '');
  const memo = payload.memo !== undefined ? String(payload.memo).trim() : String(cur[COL.MEMO - 1] || '');
  const rawPlat = payload.platform !== undefined ? String(payload.platform) : String(cur[COL.PLATFORM - 1] || '');
  const normPlat = normalizePlatforms_(rawPlat, `${title} ${memo}`);
  const status = payload.status !== undefined ? String(payload.status) : String(cur[COL.STATUS - 1] || '');
  let watchDate = payload.watchDate !== undefined ? String(payload.watchDate || '') : formatDateVal_(cur[COL.WATCH_DATE - 1]);
  if (status === '完了' && !watchDate) {
    watchDate = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  }

  sheet.getRange(row, COL.TITLE).setValue(title);
  if (payload.category !== undefined) sheet.getRange(row, COL.CATEGORY).setValue(payload.category);
  sheet.getRange(row, COL.WATCH_DATE).setValue(watchDate);
  sheet.getRange(row, COL.STATUS).setValue(status);
  if (payload.rating !== undefined) sheet.getRange(row, COL.RATING).setValue(payload.rating);
  sheet.getRange(row, COL.PLATFORM).setValue(normPlat);
  if (payload.releaseYear !== undefined) sheet.getRange(row, COL.RELEASE_YEAR).setValue(payload.releaseYear);
  if (payload.cast !== undefined) sheet.getRange(row, COL.CAST).setValue(payload.cast);
  if (payload.staff !== undefined) sheet.getRange(row, COL.STAFF).setValue(payload.staff);
  if (payload.summary !== undefined) sheet.getRange(row, COL.SUMMARY).setValue(payload.summary);
  sheet.getRange(row, COL.MEMO).setValue(memo);
  if (payload.relatedUrl !== undefined) sheet.getRange(row, COL.RELATED_URL).setValue(payload.relatedUrl);

  if (payload.runWiki) {
    enrichRow_(sheet, row);
  }
  const r = sheet.getRange(row, 1, 1, 15).getValues()[0];
  return { ok: true, entry: formatWatchRow_(row, r) };
}

function deleteWatchEntry(payload) {
  const ss = SpreadsheetApp.openById(WATCH_SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const row = resolveRowByIdOrIndex_(sheet, COL.ID, payload.row, payload.id);
  if (row < 2) return { ok: false, error: 'Watch entry not found' };
  sheet.deleteRow(row);
  return { ok: true, deletedRow: row };
}

function batchUpdateWatchMemos(payload) {
  const values = payload.values || [];
  if (values.length === 0) return { ok: false, error: 'Empty values' };
  const ss = SpreadsheetApp.openById(WATCH_SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const range = sheet.getRange(2, COL.MEMO, values.length, 1);
  range.setValues(values.map(v => [String(v === null || v === undefined ? '' : v)]));
  return { ok: true, updatedRows: values.length };
}

const DIARY_NUTRITION_HEADERS = ['食事区分', '推定カロリー(kcal)', '栄養バランス(PFC・所見)', '位置情報JSON'];

function getDiaryNutritionCols_(sheet, createIfMissing) {
  const lastCol = Math.max(13, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const map = {};
  let nextCol = lastCol + 1;
  DIARY_NUTRITION_HEADERS.forEach(name => {
    const idx = headers.indexOf(name);
    if (idx >= 0) {
      map[name] = idx + 1;
    } else if (createIfMissing) {
      sheet.getRange(1, nextCol).setValue(name);
      map[name] = nextCol;
      nextCol++;
    } else {
      map[name] = 0;
    }
  });
  return {
    mealTypeCol: map['食事区分'],
    caloriesCol: map['推定カロリー(kcal)'],
    nutritionCol: map['栄養バランス(PFC・所見)'],
    locJsonCol: map['位置情報JSON'],
    totalCols: Math.max(lastCol, nextCol - 1),
  };
}

function isFiniteCoord_(v) {
  return v !== '' && v !== null && v !== undefined && !isNaN(Number(v)) && isFinite(Number(v));
}

function normalizeLocationsPayload_(locText, locationsArr) {
  if (Array.isArray(locationsArr) && locationsArr.length > 0) {
    return locationsArr.map(x => {
      if (typeof x === 'string') return { name: x.trim(), lat: null, lng: null };
      const name = String((x && x.name) || '').trim();
      const lat = x && isFiniteCoord_(x.lat) ? Number(x.lat) : null;
      const lng = x && isFiniteCoord_(x.lng) ? Number(x.lng) : null;
      return { name, lat, lng };
    }).filter(x => x.name);
  }
  return String(locText || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(name => ({ name, lat: null, lng: null }));
}

function parseDiaryLocations_(locText, locJsonRaw) {
  const raw = String(locJsonRaw || '').trim();
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return normalizeLocationsPayload_(locText, parsed);
      }
    } catch (e) { /* fallback to locText */ }
  }
  return normalizeLocationsPayload_(locText, null);
}

function parseNutritionStr_(raw) {
  const s = String(raw || '').trim();
  if (!s) return { protein: '', fat: '', carbs: '', advice: '' };
  const pm = s.match(/P\s*[:：]?\s*(\d+(?:\.\d+)?)\s*g?/i);
  const fm = s.match(/F\s*[:：]?\s*(\d+(?:\.\d+)?)\s*g?/i);
  const cm = s.match(/C\s*[:：]?\s*(\d+(?:\.\d+)?)\s*g?/i);
  const parts = s.split('|');
  const advice = parts.length > 1 ? parts.slice(1).join('|').trim() : (pm || fm || cm ? '' : s);
  return {
    protein: pm ? Number(pm[1]) : '',
    fat: fm ? Number(fm[1]) : '',
    carbs: cm ? Number(cm[1]) : '',
    advice,
  };
}

function formatNutritionStr_(p, f, c, advice) {
  const pfc = [];
  if (p !== '' && p !== undefined && p !== null && !isNaN(Number(p))) pfc.push(`P:${Math.round(Number(p))}g`);
  if (f !== '' && f !== undefined && f !== null && !isNaN(Number(f))) pfc.push(`F:${Math.round(Number(f))}g`);
  if (c !== '' && c !== undefined && c !== null && !isNaN(Number(c))) pfc.push(`C:${Math.round(Number(c))}g`);
  const adv = String(advice || '').trim();
  if (pfc.length > 0 && adv) return `${pfc.join(' ')} | ${adv}`;
  if (pfc.length > 0) return pfc.join(' ');
  return adv;
}

function formatDiaryRow_(row, r, cols) {
  const imageUrls = String(r[9] || '').split('\n').filter(Boolean);
  const imageIds = imageUrls.map(u => {
    const m = u.match(/\/d\/([^/]+)/);
    return m ? m[1] : '';
  }).filter(Boolean);
  const mealType = cols.mealTypeCol ? String(r[cols.mealTypeCol - 1] || '') : '';
  const rawCal = cols.caloriesCol ? r[cols.caloriesCol - 1] : '';
  const calories = rawCal !== '' && rawCal !== null && rawCal !== undefined && !isNaN(Number(rawCal)) ? Number(rawCal) : '';
  const nutritionRaw = cols.nutritionCol ? String(r[cols.nutritionCol - 1] || '') : '';
  const parsedNut = parseNutritionStr_(nutritionRaw);
  const locText = String(r[6] || '');
  const locJsonRaw = cols.locJsonCol ? r[cols.locJsonCol - 1] : '';
  const locations = parseDiaryLocations_(locText, locJsonRaw);

  return {
    row,
    id: r[0],
    date: formatDateVal_(r[1]),
    weekday: String(r[2] || ''),
    title: String(r[4] || ''),
    body: String(r[5] || ''),
    location: locText,
    locations,
    imageCount: Number(r[7] || 0),
    imageUrls,
    imageIds,
    mealType,
    calories,
    protein: parsedNut.protein,
    fat: parsedNut.fat,
    carbs: parsedNut.carbs,
    nutritionAdvice: parsedNut.advice,
    nutritionRaw,
  };
}

function getDiaryEntries(limit) {
  const ss = SpreadsheetApp.openById(DIARY_SS_ID);
  const sheet = ss.getSheetByName(DIARY_SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const cols = getDiaryNutritionCols_(sheet, false);
  const startRow = limit && limit > 0 ? Math.max(2, lastRow - limit + 1) : 2;
  const values = sheet.getRange(startRow, 1, lastRow - startRow + 1, cols.totalCols).getValues();
  const out = [];
  for (let i = values.length - 1; i >= 0; i--) {
    out.push(formatDiaryRow_(startRow + i, values[i], cols));
  }
  return out;
}

function getImageDataUrl_(fileId, full) {
  if (!fileId) return { ok: false, error: 'Missing fileId' };
  try {
    const file = DriveApp.getFileById(fileId);
    let blob = full ? null : file.getThumbnail();
    if (!blob) blob = file.getBlob();
    const mime = blob.getContentType() || 'image/jpeg';
    const b64 = Utilities.base64Encode(blob.getBytes());
    return { ok: true, id: fileId, dataUrl: `data:${mime};base64,${b64}` };
  } catch (err) {
    return { ok: false, id: fileId, error: String(err) };
  }
}

function getWeekdayJa_(dateStr) {
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const dt = new Date(dateStr + 'T00:00:00+09:00');
  return weekdays[dt.getDay()] || '';
}

function saveDiaryPhotos_(dateStr, photos) {
  const jpgNames = [];
  const driveUrls = [];
  const failedPhotos = [];
  let firstFileId = '';
  if (!photos || photos.length === 0) return { jpgNames, driveUrls, firstFileId, failedPhotos };

  // ts（撮影日時/更新日時）が付与されている場合は新しい順（降順）にソート
  const sortedPhotos = [...photos].sort((a, b) => Number((b && b.ts) || 0) - Number((a && a.ts) || 0));

  const ym = dateStr.slice(0, 7);
  const ymFolder = getOrCreateSubfolder_(JOURNAL_IMAGES_FOLDER_ID, ym);
  sortedPhotos.forEach((p, idx) => {
    const rawName = String((p && p.name) || `photo_${idx + 1}.jpg`);
    try {
      if (!p || !p.base64) throw new Error('Empty base64');
      const safeName = rawName.replace(/\.[^.]+$/, '') + '.jpg';
      const fileName = `${dateStr}_${safeName}`;
      const bytes = Utilities.base64Decode(p.base64);
      const blob = Utilities.newBlob(bytes, 'image/jpeg', fileName);
      const file = ymFolder.createFile(blob);
      jpgNames.push(fileName);
      driveUrls.push(`https://drive.google.com/file/d/${file.getId()}/view`);
      if (!firstFileId) firstFileId = file.getId();
    } catch (err) {
      failedPhotos.push(rawName);
    }
  });
  return { jpgNames, driveUrls, firstFileId, failedPhotos };
}

function writeDiaryNutritionCols_(sheet, row, payload) {
  const hasNutrition = payload.mealType !== undefined || payload.calories !== undefined ||
    payload.protein !== undefined || payload.fat !== undefined || payload.carbs !== undefined ||
    payload.nutritionAdvice !== undefined;
  const hasLocs = payload.locations !== undefined;
  if (!hasNutrition && !hasLocs) return;
  const cols = getDiaryNutritionCols_(sheet, true);
  if (payload.mealType !== undefined && cols.mealTypeCol) {
    sheet.getRange(row, cols.mealTypeCol).setValue(String(payload.mealType || '').trim());
  }
  if (payload.calories !== undefined && cols.caloriesCol) {
    const calVal = payload.calories === '' || payload.calories === null ? '' : Number(payload.calories);
    sheet.getRange(row, cols.caloriesCol).setValue(isNaN(calVal) ? '' : calVal);
  }
  if ((payload.protein !== undefined || payload.fat !== undefined || payload.carbs !== undefined || payload.nutritionAdvice !== undefined) && cols.nutritionCol) {
    const nutStr = formatNutritionStr_(payload.protein, payload.fat, payload.carbs, payload.nutritionAdvice);
    sheet.getRange(row, cols.nutritionCol).setValue(nutStr);
  }
  if (hasLocs && cols.locJsonCol) {
    const norm = normalizeLocationsPayload_(payload.location, payload.locations);
    const hasCoords = norm.some(l => l.lat !== null && l.lng !== null);
    sheet.getRange(row, cols.locJsonCol).setValue(hasCoords ? JSON.stringify(norm) : '');
  }
}

function addDiaryEntry(payload) {
  const dateStr = payload.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const year = dateStr.slice(0, 4);
  const weekday = getWeekdayJa_(dateStr);
  const title = String(payload.title || '').trim();
  const body = String(payload.body || '').trim();
  const normLocs = normalizeLocationsPayload_(payload.location, payload.locations);
  const location = normLocs.map(l => l.name).join('\n');

  const ss = SpreadsheetApp.openById(DIARY_SS_ID);
  const sheet = ss.getSheetByName(DIARY_SHEET_NAME);
  const lastRow = sheet.getLastRow();

  // 重複登録防止（冪等性：直近30行に同一の日付・タイトル・本文があればスキップ）
  if (lastRow >= 2) {
    const checkStart = Math.max(2, lastRow - 29);
    const recent = sheet.getRange(checkStart, 1, lastRow - checkStart + 1, 6).getValues();
    for (let i = recent.length - 1; i >= 0; i--) {
      const r = recent[i];
      if (formatDateVal_(r[1]) === dateStr && String(r[4] || '').trim() === title && String(r[5] || '').trim() === body) {
        const dupRow = checkStart + i;
        const dupCols = getDiaryNutritionCols_(sheet, false);
        const dupFull = sheet.getRange(dupRow, 1, 1, dupCols.totalCols).getValues()[0];
        return {
          ok: true,
          deduplicated: true,
          id: r[0],
          row: dupRow,
          date: dateStr,
          needsDocSync: false,
          entry: formatDiaryRow_(dupRow, dupFull, dupCols),
        };
      }
    }
  }

  // 写真アップロード処理（失敗した写真はスキップし、本体保存は完了させる）
  const { jpgNames, driveUrls, firstFileId, failedPhotos } = saveDiaryPhotos_(dateStr, payload.photos || []);

  const nextId = lastRow >= 2 ? Number(sheet.getRange(lastRow, 1).getValue() || lastRow - 1) + 1 : 1;
  const imageFormula = firstFileId ? `=IMAGE("https://drive.google.com/uc?export=view&id=${firstFileId}")` : '';
  const docId = YEAR_DOC_IDS[year] || '';
  const docUrl = docId ? `https://docs.google.com/document/d/${docId}/edit` : '';
  const timeStr = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'HH:mm');

  const cols = getDiaryNutritionCols_(sheet, true);
  const rowArr = new Array(cols.totalCols).fill('');
  rowArr[0] = nextId;
  rowArr[1] = dateStr;
  rowArr[2] = weekday;
  rowArr[3] = timeStr;
  rowArr[4] = title;
  rowArr[5] = body;
  rowArr[6] = location;
  rowArr[7] = jpgNames.length;
  rowArr[8] = jpgNames.join('\n');
  rowArr[9] = driveUrls.join('\n');
  rowArr[10] = imageFormula;
  rowArr[11] = docUrl;
  rowArr[12] = 'webapp_entry';
  applyDiaryExtraToArray_(rowArr, cols, payload, normLocs);

  const insertedRow = lastRow + 1;
  sheet.getRange(insertedRow, 1, 1, cols.totalCols).setValues([rowArr]);

  // Doc同期はメイン保存から完全切り離し（フロントから非同期 syncDiaryDoc で実行）
  return {
    ok: true,
    id: nextId,
    row: insertedRow,
    date: dateStr,
    docSynced: false,
    needsDocSync: Boolean(docId),
    docSyncPayload: docId ? {
      mode: 'add',
      date: dateStr,
      weekday,
      title,
      location,
      body,
      jpgNames,
      driveUrls,
    } : null,
    failedPhotos,
    entry: formatDiaryRow_(insertedRow, rowArr, cols),
  };
}

function applyDiaryExtraToArray_(rowArr, cols, payload, normLocs) {
  if (payload.mealType !== undefined && cols.mealTypeCol) {
    rowArr[cols.mealTypeCol - 1] = String(payload.mealType || '').trim();
  }
  if (payload.calories !== undefined && cols.caloriesCol) {
    const calVal = payload.calories === '' || payload.calories === null ? '' : Number(payload.calories);
    rowArr[cols.caloriesCol - 1] = isNaN(calVal) ? '' : calVal;
  }
  if ((payload.protein !== undefined || payload.fat !== undefined || payload.carbs !== undefined || payload.nutritionAdvice !== undefined) && cols.nutritionCol) {
    rowArr[cols.nutritionCol - 1] = formatNutritionStr_(payload.protein, payload.fat, payload.carbs, payload.nutritionAdvice);
  }
  if (payload.locations !== undefined && cols.locJsonCol) {
    const locs = normLocs || normalizeLocationsPayload_(payload.location, payload.locations);
    const hasCoords = locs.some(l => l.lat !== null && l.lng !== null);
    rowArr[cols.locJsonCol - 1] = hasCoords ? JSON.stringify(locs) : '';
  }
}

function updateDiaryEntry(payload) {
  const ss = SpreadsheetApp.openById(DIARY_SS_ID);
  const sheet = ss.getSheetByName(DIARY_SHEET_NAME);
  const row = resolveRowByIdOrIndex_(sheet, 1, payload.row, payload.id);
  if (row < 2) return { ok: false, error: 'Diary entry not found' };

  // ヘッダー行(1行目)と対象行(row行目)の2行のみを取得して O(1) 更新
  const cols = getDiaryNutritionCols_(sheet, true);
  const rowArr = sheet.getRange(row, 1, 1, cols.totalCols).getValues()[0];
  const oldDate = formatDateVal_(rowArr[1]);
  const oldTitle = String(rowArr[4] || '');
  const oldBody = String(rowArr[5] || '').trim();

  const dateStr = payload.date ? String(payload.date).slice(0, 10) : oldDate;
  const weekday = getWeekdayJa_(dateStr);
  const title = payload.title !== undefined ? String(payload.title).trim() : oldTitle;
  const body = payload.body !== undefined ? String(payload.body).trim() : String(rowArr[5] || '');
  const normLocs = payload.locations !== undefined ? normalizeLocationsPayload_(payload.location, payload.locations) : null;
  const location = normLocs
    ? normLocs.map(l => l.name).join('\n')
    : (payload.location !== undefined ? String(payload.location).trim() : String(rowArr[6] || ''));

  rowArr[1] = dateStr;
  rowArr[2] = weekday;
  rowArr[4] = title;
  rowArr[5] = body;
  rowArr[6] = location;

  // 既存写真の削除＋新規写真の追加（メモリ上の rowArr へ反映）
  const removeSet = new Set((payload.removeUrls || []).map(String));
  const added = saveDiaryPhotos_(dateStr, payload.photos || []);
  if (removeSet.size > 0 || added.jpgNames.length > 0) {
    const prevNames = String(rowArr[8] || '').split('\n').filter(Boolean);
    const prevUrls = String(rowArr[9] || '').split('\n').filter(Boolean);
    const keptNames = [];
    const keptUrls = [];
    prevUrls.forEach((u, idx) => {
      if (!removeSet.has(u)) {
        keptUrls.push(u);
        keptNames.push(prevNames[idx] || `photo_${idx + 1}.jpg`);
      }
    });
    const allNames = [...added.jpgNames, ...keptNames];
    const allUrls = [...added.driveUrls, ...keptUrls];
    const firstIdMatch = (allUrls[0] || '').match(/\/d\/([^/]+)/);
    rowArr[7] = allNames.length;
    rowArr[8] = allNames.join('\n');
    rowArr[9] = allUrls.join('\n');
    rowArr[10] = firstIdMatch ? `=IMAGE("https://drive.google.com/uc?export=view&id=${firstIdMatch[1]}")` : '';
  }

  applyDiaryExtraToArray_(rowArr, cols, payload, normLocs);
  rowArr[12] = `edited ${Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm')}`;

  // シート1行一括書き込み（setValues 1回のみ）
  sheet.getRange(row, 1, 1, cols.totalCols).setValues([rowArr]);

  const needsDocSync = (dateStr !== oldDate) || (title !== oldTitle) || (body !== oldBody);
  return {
    ok: true,
    docSynced: false,
    docSyncSkipped: !needsDocSync,
    needsDocSync,
    docSyncPayload: needsDocSync ? {
      mode: 'update',
      oldDate,
      oldTitle,
      date: dateStr,
      weekday,
      title,
      location,
      body,
    } : null,
    entry: formatDiaryRow_(row, rowArr, cols),
  };
}

function syncDiaryDocAction(payload) {
  const mode = payload.mode || 'update';
  if (mode === 'add') {
    const year = String(payload.date || '').slice(0, 4);
    const docId = YEAR_DOC_IDS[year];
    if (!docId) return { ok: true, docSynced: false };
    try {
      const doc = DocumentApp.openById(docId);
      const docBody = doc.getBody();
      const hText = `${payload.date} (${payload.weekday || ''}) — ${payload.title || '(無題)'}`;
      docBody.appendParagraph(hText).setHeading(DocumentApp.ParagraphHeading.HEADING2);
      const locStr = String(payload.location || '').split('\n').map(s => s.trim()).filter(Boolean).join(' → ');
      if (locStr) docBody.appendParagraph(`📍 場所: ${locStr}`);
      const bodyText = String(payload.body || '').trim();
      if (bodyText) {
        bodyText.split(/\r?\n/).forEach(line => {
          if (line.trim()) docBody.appendParagraph(line);
        });
      }
      const jpgNames = payload.jpgNames || [];
      (payload.driveUrls || []).forEach((u, idx) => {
        docBody.appendParagraph(`📷 写真: ${jpgNames[idx] || 'photo.jpg'}`).setLinkUrl(u);
      });
      docBody.appendHorizontalRule();
      doc.saveAndClose();
      return { ok: true, docSynced: true };
    } catch (err) {
      return { ok: false, docSynced: false, error: String(err) };
    }
  }
  try {
    const ok = syncDiaryDocUpdate_(payload.oldDate, payload.oldTitle, payload.date, payload.weekday, payload.title, payload.location, payload.body);
    return { ok: true, docSynced: ok };
  } catch (err) {
    return { ok: false, docSynced: false, error: String(err) };
  }
}

function deleteDiaryEntry(payload) {
  const ss = SpreadsheetApp.openById(DIARY_SS_ID);
  const sheet = ss.getSheetByName(DIARY_SHEET_NAME);
  const row = resolveRowByIdOrIndex_(sheet, 1, payload.row, payload.id);
  if (row < 2) return { ok: false, error: 'Diary entry not found' };
  sheet.deleteRow(row);
  return { ok: true, deletedRow: row };
}

function syncDiaryDocUpdate_(oldDate, oldTitle, newDate, newWeekday, newTitle, newLocation, newBody) {
  const year = String(newDate || '').slice(0, 4);
  const docId = YEAR_DOC_IDS[year];
  if (!docId || String(oldDate || '').slice(0, 4) !== year) return false;

  const doc = DocumentApp.openById(docId);
  const docBody = doc.getBody();
  let numChildren = docBody.getNumChildren();
  const titlePrefix = `${oldDate}`;
  let headingIdx = -1;

  for (let i = 0; i < numChildren; i++) {
    const el = docBody.getChild(i);
    if (el.getType() !== DocumentApp.ElementType.PARAGRAPH) continue;
    const p = el.asParagraph();
    if (p.getHeading() !== DocumentApp.ParagraphHeading.HEADING2) continue;
    const txt = p.getText();
    if (txt.startsWith(titlePrefix) && (!oldTitle || txt.includes(oldTitle))) {
      headingIdx = i;
      break;
    }
  }
  if (headingIdx < 0) return false;

  const newHeading = `${newDate} (${newWeekday}) — ${newTitle || '(無題)'}`;
  docBody.getChild(headingIdx).asParagraph().setText(newHeading);

  // 見出しの次〜HorizontalRule（または次のHEADING2）までの古い場所・本文段落を収集（写真リンク段落は保持）
  const removeIndices = [];
  let hasTerminator = false;
  for (let i = headingIdx + 1; i < numChildren; i++) {
    const el = docBody.getChild(i);
    const t = el.getType();
    if (t === DocumentApp.ElementType.HORIZONTAL_RULE) {
      hasTerminator = true;
      break;
    }
    if (t === DocumentApp.ElementType.PARAGRAPH) {
      const p = el.asParagraph();
      if (p.getHeading() === DocumentApp.ParagraphHeading.HEADING2) {
        hasTerminator = true;
        break;
      }
      if (!p.getText().startsWith('📷')) {
        removeIndices.push(i);
      }
    }
  }

  // 末尾エントリで終端がない場合、先にHorizontalRuleを追加することで「最終段落は削除できません」を根本回避
  if (!hasTerminator) {
    docBody.appendHorizontalRule();
    numChildren = docBody.getNumChildren();
  }

  // 1. 先に古い段落をすべて削除（多重挿入・重複蓄積を防止）
  for (let i = removeIndices.length - 1; i >= 0; i--) {
    const idx = removeIndices[i];
    if (idx >= docBody.getNumChildren() - 1) continue;
    docBody.removeChild(docBody.getChild(idx));
  }

  // 2. その後で新しい場所・本文を非空行のみ安全に挿入（「Cannot insert an empty text element.」を完全回避）
  let insertAt = headingIdx + 1;
  const locStr = String(newLocation || '').split('\n').map(s => s.trim()).filter(Boolean).join(' → ');
  if (locStr) {
    docBody.insertParagraph(insertAt, `📍 場所: ${locStr}`);
    insertAt++;
  }
  const bodyLines = String(newBody || '').split(/\r?\n/).filter(line => line.trim().length > 0);
  bodyLines.forEach(line => {
    docBody.insertParagraph(insertAt, line);
    insertAt++;
  });

  doc.saveAndClose();
  return true;
}

function getOrCreateSubfolder_(parentId, name) {
  const parent = DriveApp.getFolderById(parentId);
  const it = parent.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return parent.createFolder(name);
}

function formatDateVal_(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  return String(val).slice(0, 10);
}

// ============================================================================
// 食事カロリー＆栄養バランス（PFC）分析 API
// ============================================================================

const MEAL_NUTRITION_DICT = [
  { kw: /ラーメン|らーめん|つけ麺|中華そば/, kcal: 680, p: 24, f: 22, c: 92, label: 'ラーメン類' },
  { kw: /カレー|カツカレー/, kcal: 780, p: 20, f: 26, c: 110, label: 'カレー' },
  { kw: /牛丼|豚丼|親子丼|カツ丼|天丼|海鮮丼|丼/, kcal: 720, p: 26, f: 22, c: 98, label: '丼もの' },
  { kw: /寿司|すし|回転寿司|握り/, kcal: 560, p: 28, f: 10, c: 82, label: '寿司' },
  { kw: /パスタ|スパゲッティ|カルボナーラ|ペペロンチーノ|ボロネーゼ/, kcal: 650, p: 22, f: 20, c: 88, label: 'パスタ' },
  { kw: /うどん|そば|蕎麦|フォー/, kcal: 420, p: 14, f: 6, c: 76, label: '麺類(うどん/そば/フォー)' },
  { kw: /定食|ランチセット|御膳/, kcal: 700, p: 28, f: 22, c: 90, label: '定食' },
  { kw: /ハンバーグ|ステーキ/, kcal: 640, p: 32, f: 34, c: 45, label: '肉料理(ハンバーグ/ステーキ)' },
  { kw: /唐揚げ|からあげ|とんかつ|トンカツ|フライ|天ぷら/, kcal: 620, p: 24, f: 34, c: 52, label: '揚げ物' },
  { kw: /焼肉|焼き肉|しゃぶしゃぶ|すき焼き/, kcal: 820, p: 38, f: 48, c: 48, label: '焼肉・鍋' },
  { kw: /焼き魚|焼魚|刺身|さしみ|サバ|鮭/, kcal: 360, p: 28, f: 14, c: 28, label: '魚料理' },
  { kw: /ピザ|ハンバーガー|バーガー|ポテト/, kcal: 720, p: 24, f: 32, c: 82, label: 'ファストフード/ピザ' },
  { kw: /チャーハン|炒飯|餃子|ギョウザ|中華/, kcal: 680, p: 22, f: 26, c: 85, label: '中華' },
  { kw: /弁当|お弁当/, kcal: 650, p: 22, f: 20, c: 92, label: '弁当' },
  { kw: /おにぎり|おむすび/, kcal: 190, p: 4, f: 1, c: 40, label: 'おにぎり' },
  { kw: /パン|トースト|サンドイッチ|クロワッサン|ベーグル/, kcal: 320, p: 10, f: 12, c: 44, label: 'パン類' },
  { kw: /ご飯|ごはん|白米|ライス/, kcal: 250, p: 4, f: 1, c: 55, label: 'ご飯' },
  { kw: /サラダ|野菜/, kcal: 110, p: 3, f: 6, c: 10, label: 'サラダ・野菜' },
  { kw: /味噌汁|みそ汁|スープ/, kcal: 65, p: 4, f: 2, c: 7, label: '汁物' },
  { kw: /卵|たまご|目玉焼き|オムレツ|ゆで卵/, kcal: 120, p: 8, f: 8, c: 1, label: '卵料理' },
  { kw: /納豆|豆腐|冷奴/, kcal: 110, p: 9, f: 5, c: 6, label: '大豆食品' },
  { kw: /ヨーグルト|チーズ|牛乳|ミルク/, kcal: 120, p: 6, f: 6, c: 9, label: '乳製品' },
  { kw: /ケーキ|スイーツ|アイス|チョコ|デザート|プリン/, kcal: 310, p: 4, f: 16, c: 38, label: 'スイーツ' },
  { kw: /ビール|生ビール|ハイボール|チューハイ|酒|ワイン|日本酒/, kcal: 160, p: 1, f: 0, c: 8, label: 'アルコール' },
  { kw: /コーヒー|珈琲|カフェラテ|ラテ|紅茶/, kcal: 45, p: 2, f: 2, c: 5, label: 'カフェ飲料' },
];

function estimateMealByDictionary_(text, mealTypeHint) {
  const src = String(text || '');
  let kcal = 0, p = 0, f = 0, c = 0;
  const hits = [];

  MEAL_NUTRITION_DICT.forEach(item => {
    if (item.kw.test(src)) {
      kcal += item.kcal;
      p += item.p;
      f += item.f;
      c += item.c;
      hits.push(item.label);
    }
  });

  if (hits.length === 0) {
    kcal = 550; p = 20; f = 18; c = 72;
    hits.push('標準的な1食として推定');
  }

  let mealType = String(mealTypeHint || '').trim();
  if (!mealType) {
    if (/朝食|朝ごはん|モーニング/.test(src)) mealType = '朝食';
    else if (/夕食|夜ごはん|晩ごはん|ディナー/.test(src)) mealType = '夕食';
    else if (/間食|おやつ|カフェ|スイーツ/.test(src)) mealType = '間食';
    else if (/昼食|ランチ|昼ごはん/.test(src)) mealType = '昼食';
    else mealType = '昼食';
  }

  const totalEnergy = p * 4 + f * 9 + c * 4 || 1;
  const pPct = Math.round((p * 4 / totalEnergy) * 100);
  const fPct = Math.round((f * 9 / totalEnergy) * 100);
  const cPct = Math.round((c * 4 / totalEnergy) * 100);

  const notes = [];
  if (pPct < 13) notes.push('タンパク質がやや少なめ（肉・魚・卵・大豆の追加推奨）');
  if (fPct > 32) notes.push('脂質がやや高め');
  if (!/サラダ|野菜|味噌汁|スープ/.test(src)) notes.push('野菜・食物繊維を添えるとよりバランス良好');
  if (notes.length === 0) notes.push('PFCバランスは概ね良好');

  return {
    source: 'dictionary',
    mealType,
    calories: Math.round(kcal),
    protein: Math.round(p),
    fat: Math.round(f),
    carbs: Math.round(c),
    advice: `${hits.slice(0, 3).join('・')}から推定（P${pPct}%/F${fPct}%/C${cPct}%）。${notes.join('。')}`,
  };
}

function estimateMealWithGemini_(apiKey, title, body, imageIds, mealTypeHint) {
  const parts = [{
    text: `以下の日記（タイトル・本文・添付写真）から食事内容を判定し、合計の推定摂取カロリー(kcal)、タンパク質(g)、脂質(g)、炭水化物(g)、食事区分（朝食/昼食/夕食/間食/1日まとめ のいずれか）、短い栄養バランス所見（日本語60文字以内）をJSONのみ（マークダウン記号なし）で返してください。\nタイトル: ${title}\n本文: ${body}\n食事区分ヒント: ${mealTypeHint || '自動判定'}\n出力形式: {"mealType":"昼食","calories":650,"protein":25,"fat":20,"carbs":85,"advice":"..."}`
  }];

  (imageIds || []).slice(0, 2).forEach(fid => {
    try {
      const file = DriveApp.getFileById(fid);
      const blob = file.getThumbnail() || file.getBlob();
      parts.push({
        inlineData: {
          mimeType: blob.getContentType() || 'image/jpeg',
          data: Utilities.base64Encode(blob.getBytes()),
        },
      });
    } catch (e) { /* skip image */ }
  });

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ contents: [{ parts }] }),
    muteHttpExceptions: true,
  });
  if (res.getResponseCode() !== 200) return null;

  const json = JSON.parse(res.getContentText());
  const txt = (json.candidates && json.candidates[0] && json.candidates[0].content && json.candidates[0].content.parts && json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text) || '';
  const m = txt.match(/\{[\s\S]*\}/);
  if (!m) return null;
  const parsed = JSON.parse(m[0]);
  return {
    source: 'gemini',
    mealType: String(parsed.mealType || mealTypeHint || '昼食'),
    calories: Math.round(Number(parsed.calories || 0)),
    protein: Math.round(Number(parsed.protein || 0)),
    fat: Math.round(Number(parsed.fat || 0)),
    carbs: Math.round(Number(parsed.carbs || 0)),
    advice: String(parsed.advice || ''),
  };
}

function analyzeMealEntry(payload) {
  const title = String(payload.title || '').trim();
  const body = String(payload.body || '').trim();
  const imageIds = payload.imageIds || [];
  const mealTypeHint = String(payload.mealType || '').trim();
  const apiKey = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');

  let result = null;
  if (apiKey) {
    try {
      result = estimateMealWithGemini_(apiKey, title, body, imageIds, mealTypeHint);
    } catch (e) {
      result = null;
    }
  }
  if (!result) {
    result = estimateMealByDictionary_(`${title}\n${body}`, mealTypeHint);
  }

  let updatedEntry = null;
  if (payload.save && (payload.row || payload.id !== undefined)) {
    const ss = SpreadsheetApp.openById(DIARY_SS_ID);
    const sheet = ss.getSheetByName(DIARY_SHEET_NAME);
    const row = resolveRowByIdOrIndex_(sheet, 1, payload.row, payload.id);
    if (row >= 2) {
      writeDiaryNutritionCols_(sheet, row, {
        mealType: result.mealType,
        calories: result.calories,
        protein: result.protein,
        fat: result.fat,
        carbs: result.carbs,
        nutritionAdvice: result.advice,
      });
      const cols = getDiaryNutritionCols_(sheet, false);
      const updated = sheet.getRange(row, 1, 1, cols.totalCols).getValues()[0];
      updatedEntry = formatDiaryRow_(row, updated, cols);
    }
  }

  return { ok: true, analysis: result, entry: updatedEntry };
}

function batchSortDiaryPhotos(payload) {
  const updates = payload.updates || [];
  if (updates.length === 0) return { ok: true, updated: 0 };
  const ss = SpreadsheetApp.openById(DIARY_SS_ID);
  const sheet = ss.getSheetByName(DIARY_SHEET_NAME);
  let count = 0;
  updates.forEach(u => {
    const row = Number(u.row);
    if (row < 2) return;
    sheet.getRange(row, 9, 1, 3).setValues([[u.names || '', u.urls || '', u.formula || '']]);
    count++;
  });
  return { ok: true, updated: count };
}

function batchUpdateDiaryLocations(payload) {
  const updates = payload.updates || [];
  if (updates.length === 0) return { ok: true, updated: 0 };
  const ss = SpreadsheetApp.openById(DIARY_SS_ID);
  const sheet = ss.getSheetByName(DIARY_SHEET_NAME);
  const cols = getDiaryNutritionCols_(sheet, true);
  let count = 0;
  updates.forEach(u => {
    const row = Number(u.row);
    if (row < 2) return;
    if (u.location !== undefined) {
      sheet.getRange(row, 7).setValue(String(u.location || ''));
    }
    if (u.locJson !== undefined && cols.locJsonCol) {
      sheet.getRange(row, cols.locJsonCol).setValue(String(u.locJson || ''));
    }
    count++;
  });
  return { ok: true, updated: count };
}

// ============================================================================
// 食事単位（朝/昼/夜/間食セット）DB CRUD & 一括インポート
// ============================================================================

const MEAL_ORDER = { '朝食': 1, '昼食': 2, '夕食': 3, '間食': 4 };

function insertMealColAfter_(sheet, anchorHeader, newHeader) {
  const lastCol = Math.max(1, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  if (headers.includes(newHeader)) return;
  const idx = headers.indexOf(anchorHeader);
  if (idx >= 0) {
    sheet.insertColumnAfter(idx + 1);
    sheet.getRange(1, idx + 2).setValue(newHeader).setFontWeight('bold');
  } else {
    sheet.getRange(1, lastCol + 1).setValue(newHeader).setFontWeight('bold');
  }
}

function ensureMealSheet_() {
  const ss = SpreadsheetApp.openById(DIARY_SS_ID);
  let sheet = ss.getSheetByName(MEAL_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(MEAL_SHEET_NAME);
    sheet.appendRow(MEAL_HEADERS);
    sheet.getRange(1, 1, 1, MEAL_HEADERS.length).setFontWeight('bold');
    return sheet;
  }
  insertMealColAfter_(sheet, '炭水化物(g)', '糖質(g)');
  insertMealColAfter_(sheet, '糖質(g)', '食物繊維(g)');
  insertMealColAfter_(sheet, '食物繊維(g)', '塩分(g)');
  return sheet;
}

function getMealColMap_(sheet) {
  const lastCol = Math.max(MEAL_HEADERS.length, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim());
  const map = {};
  headers.forEach((h, idx) => {
    if (h) map[h] = idx;
  });
  return { map, totalCols: lastCol };
}

function numOrEmpty_(val) {
  return val !== '' && val !== null && val !== undefined && !isNaN(Number(val)) ? Number(val) : '';
}

function formatMealRow_(row, r, colMap) {
  const get = (name, fallbackIdx) => {
    const idx = colMap && colMap[name] !== undefined ? colMap[name] : fallbackIdx;
    return idx >= 0 && idx < r.length ? r[idx] : '';
  };
  return {
    row,
    id: get('ID', 0),
    date: formatDateVal_(get('日付', 1)),
    mealType: String(get('食事区分', 2) || '昼食'),
    dishName: String(get('料理名', 3) || ''),
    calories: numOrEmpty_(get('カロリー(kcal)', 6)),
    protein: numOrEmpty_(get('タンパク質(g)', 7)),
    fat: numOrEmpty_(get('脂質(g)', 8)),
    carbs: numOrEmpty_(get('炭水化物(g)', 9)),
    sugar: numOrEmpty_(get('糖質(g)', 10)),
    fiber: numOrEmpty_(get('食物繊維(g)', 11)),
    salt: numOrEmpty_(get('塩分(g)', 12)),
    memo: String(get('所見・メモ', 13) || ''),
    source: String(get('データソース', 14) || 'webapp'),
  };
}

function getMealEntries() {
  const ss = SpreadsheetApp.openById(DIARY_SS_ID);
  const sheet = ss.getSheetByName(MEAL_SHEET_NAME);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const { map, totalCols } = getMealColMap_(sheet);
  const values = sheet.getRange(2, 1, lastRow - 1, totalCols).getValues();
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const r = values[i];
    if (!r[map['日付'] !== undefined ? map['日付'] : 1] && !r[map['料理名'] !== undefined ? map['料理名'] : 3]) continue;
    out.push(formatMealRow_(i + 2, r, map));
  }
  // 日付降順、同一日内は 朝食→昼食→夕食→間食
  out.sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date);
    return (MEAL_ORDER[a.mealType] || 9) - (MEAL_ORDER[b.mealType] || 9) || Number(a.id) - Number(b.id);
  });
  return out;
}

function resolveSaltPayload_(payload) {
  const raw = payload.salt !== undefined ? payload.salt : payload.sodium;
  return numOrEmpty_(raw);
}

function resolveSugarPayload_(payload) {
  const raw = payload.sugar !== undefined ? payload.sugar : (payload.availableCarbs !== undefined ? payload.availableCarbs : payload.carbsAvailable);
  return numOrEmpty_(raw);
}

function resolveFiberPayload_(payload) {
  const raw = payload.fiber !== undefined ? payload.fiber : payload.dietaryFiber;
  return numOrEmpty_(raw);
}

function buildMealRowByMap_(colMap, totalCols, fields) {
  const rowArr = new Array(totalCols).fill('');
  const set = (name, fallbackIdx, val) => {
    const idx = colMap[name] !== undefined ? colMap[name] : fallbackIdx;
    if (idx >= 0 && idx < totalCols) rowArr[idx] = val;
  };
  set('ID', 0, fields.id);
  set('日付', 1, fields.date);
  set('食事区分', 2, fields.mealType);
  set('料理名', 3, fields.dishName);
  set('写真URL', 4, fields.photoUrls);
  set('写真ID', 5, fields.photoIds);
  set('カロリー(kcal)', 6, fields.calories);
  set('タンパク質(g)', 7, fields.protein);
  set('脂質(g)', 8, fields.fat);
  set('炭水化物(g)', 9, fields.carbs);
  set('糖質(g)', 10, fields.sugar);
  set('食物繊維(g)', 11, fields.fiber);
  set('塩分(g)', 12, fields.salt);
  set('所見・メモ', 13, fields.memo);
  set('データソース', 14, fields.source);
  return rowArr;
}

function addMealEntry(payload) {
  const sheet = ensureMealSheet_();
  const { map, totalCols } = getMealColMap_(sheet);
  const dateStr = payload.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const mealType = String(payload.mealType || '昼食').trim();
  const dishName = String(payload.dishName || '').trim();
  if (!dishName) return { ok: false, error: '料理名を入力してください' };

  const lastRow = sheet.getLastRow();
  const idCol = (map['ID'] !== undefined ? map['ID'] : 0) + 1;
  const nextId = lastRow >= 2 ? Number(sheet.getRange(lastRow, idCol).getValue() || lastRow - 1) + 1 : 1;

  // 食事記録への写真登録は廃止（写真は日記側へ一本化）
  const rowArr = buildMealRowByMap_(map, totalCols, {
    id: nextId,
    date: dateStr,
    mealType,
    dishName,
    photoUrls: '',
    photoIds: '',
    calories: numOrEmpty_(payload.calories),
    protein: numOrEmpty_(payload.protein),
    fat: numOrEmpty_(payload.fat),
    carbs: numOrEmpty_(payload.carbs),
    sugar: resolveSugarPayload_(payload),
    fiber: resolveFiberPayload_(payload),
    salt: resolveSaltPayload_(payload),
    memo: String(payload.memo || '').trim(),
    source: String(payload.source || 'webapp'),
  });

  sheet.appendRow(rowArr);
  const insertedRow = sheet.getLastRow();
  const r = sheet.getRange(insertedRow, 1, 1, totalCols).getValues()[0];
  return { ok: true, entry: formatMealRow_(insertedRow, r, map) };
}

function updateMealEntry(payload) {
  const sheet = ensureMealSheet_();
  const { map, totalCols } = getMealColMap_(sheet);
  const idCol = (map['ID'] !== undefined ? map['ID'] : 0) + 1;
  const row = resolveRowByIdOrIndex_(sheet, idCol, payload.row, payload.id);
  if (row < 2) return { ok: false, error: 'Meal entry not found' };

  const cur = sheet.getRange(row, 1, 1, totalCols).getValues()[0];
  const prev = formatMealRow_(row, cur, map);
  const dateStr = payload.date ? String(payload.date).slice(0, 10) : prev.date;
  const mealType = payload.mealType !== undefined ? String(payload.mealType).trim() : prev.mealType;
  const dishName = payload.dishName !== undefined ? String(payload.dishName).trim() : prev.dishName;

  const rowArr = buildMealRowByMap_(map, totalCols, {
    id: prev.id,
    date: dateStr,
    mealType,
    dishName,
    photoUrls: '',
    photoIds: '',
    calories: payload.calories !== undefined ? numOrEmpty_(payload.calories) : prev.calories,
    protein: payload.protein !== undefined ? numOrEmpty_(payload.protein) : prev.protein,
    fat: payload.fat !== undefined ? numOrEmpty_(payload.fat) : prev.fat,
    carbs: payload.carbs !== undefined ? numOrEmpty_(payload.carbs) : prev.carbs,
    sugar: (payload.sugar !== undefined || payload.availableCarbs !== undefined || payload.carbsAvailable !== undefined) ? resolveSugarPayload_(payload) : prev.sugar,
    fiber: (payload.fiber !== undefined || payload.dietaryFiber !== undefined) ? resolveFiberPayload_(payload) : prev.fiber,
    salt: (payload.salt !== undefined || payload.sodium !== undefined) ? resolveSaltPayload_(payload) : prev.salt,
    memo: payload.memo !== undefined ? String(payload.memo).trim() : prev.memo,
    source: prev.source,
  });

  sheet.getRange(row, 1, 1, totalCols).setValues([rowArr]);
  const r = sheet.getRange(row, 1, 1, totalCols).getValues()[0];
  return { ok: true, entry: formatMealRow_(row, r, map) };
}

function deleteMealEntry(payload) {
  const sheet = ensureMealSheet_();
  const { map } = getMealColMap_(sheet);
  const idCol = (map['ID'] !== undefined ? map['ID'] : 0) + 1;
  const row = resolveRowByIdOrIndex_(sheet, idCol, payload.row, payload.id);
  if (row < 2) return { ok: false, error: 'Meal entry not found' };
  sheet.deleteRow(row);
  return { ok: true, deletedRow: row };
}

function importMealsBatch(payload) {
  const items = payload.meals || [];
  if (items.length === 0) return { ok: true, imported: 0, skipped: 0 };
  const sheet = ensureMealSheet_();
  const { map, totalCols } = getMealColMap_(sheet);
  const lastRow = sheet.getLastRow();
  const existingKeys = new Set();
  const dIdx = map['日付'] !== undefined ? map['日付'] : 1;
  const mIdx = map['食事区分'] !== undefined ? map['食事区分'] : 2;
  const nIdx = map['料理名'] !== undefined ? map['料理名'] : 3;
  const idCol = (map['ID'] !== undefined ? map['ID'] : 0) + 1;

  if (lastRow >= 2) {
    const vals = sheet.getRange(2, 1, lastRow - 1, totalCols).getValues();
    vals.forEach(r => existingKeys.add(`${formatDateVal_(r[dIdx])}|${String(r[mIdx] || '')}|${String(r[nIdx] || '')}`));
  }
  let nextId = lastRow >= 2 ? Number(sheet.getRange(lastRow, idCol).getValue() || lastRow - 1) + 1 : 1;
  const rowsToAppend = [];
  let skipped = 0;

  items.forEach(it => {
    const dateStr = String(it.date || '').slice(0, 10);
    const mealType = String(it.mealType || '昼食').trim();
    const dishName = String(it.dishName || '').trim();
    if (!dateStr || !dishName) { skipped++; return; }
    const key = `${dateStr}|${mealType}|${dishName}`;
    if (existingKeys.has(key)) { skipped++; return; }
    existingKeys.add(key);

    const urls = Array.isArray(it.photoUrls) ? it.photoUrls : (it.photoUrl ? [it.photoUrl] : []);
    const ids = Array.isArray(it.photoIds) ? it.photoIds : (it.photoId ? [it.photoId] : urls.map(u => {
      const m = String(u).match(/\/d\/([^/]+)/);
      return m ? m[1] : '';
    }).filter(Boolean));

    rowsToAppend.push(buildMealRowByMap_(map, totalCols, {
      id: nextId++,
      date: dateStr,
      mealType,
      dishName,
      photoUrls: '',
      photoIds: '',
      calories: numOrEmpty_(it.calories),
      protein: numOrEmpty_(it.protein),
      fat: numOrEmpty_(it.fat),
      carbs: numOrEmpty_(it.carbs),
      sugar: resolveSugarPayload_(it),
      fiber: resolveFiberPayload_(it),
      salt: resolveSaltPayload_(it),
      memo: String(it.memo || '').trim(),
      source: String(it.source || 'muse'),
    }));
  });

  if (rowsToAppend.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAppend.length, totalCols).setValues(rowsToAppend);
  }
  return { ok: true, imported: rowsToAppend.length, skipped };
}

function migrateMealPhotosToDiary() {
  const ss = SpreadsheetApp.openById(DIARY_SS_ID);
  const mealSheet = ss.getSheetByName(MEAL_SHEET_NAME);
  const diarySheet = ss.getSheetByName(DIARY_SHEET_NAME);
  if (!mealSheet || !diarySheet) return { ok: false, error: 'Missing sheet' };

  const { map: mMap, totalCols: mCols } = getMealColMap_(mealSheet);
  const mLast = mealSheet.getLastRow();
  if (mLast < 2) return { ok: true, migrated: 0 };

  const urlIdx = mMap['写真URL'] !== undefined ? mMap['写真URL'] : 4;
  const idIdx = mMap['写真ID'] !== undefined ? mMap['写真ID'] : 5;
  const dateIdx = mMap['日付'] !== undefined ? mMap['日付'] : 1;
  const mVals = mealSheet.getRange(2, 1, mLast - 1, mCols).getValues();

  const migrated = [];
  for (let i = 0; i < mVals.length; i++) {
    const r = mVals[i];
    const mealRow = i + 2;
    const urls = String(r[urlIdx] || '').split('\n').filter(Boolean);
    const ids = String(r[idIdx] || '').split('\n').filter(Boolean);
    if (urls.length === 0 && ids.length === 0) continue;

    const dateStr = formatDateVal_(r[dateIdx]);
    const fileUrls = urls.length > 0 ? urls : ids.map(id => `https://drive.google.com/file/d/${id}/view`);
    const fileNames = fileUrls.map(u => {
      const m = u.match(/\/d\/([^/]+)/);
      if (!m) return 'photo.jpg';
      try { return DriveApp.getFileById(m[1]).getName(); } catch (e) { return `${dateStr}_${m[1]}.jpg`; }
    });

    // 日記DBで該当日を検索
    const dLast = diarySheet.getLastRow();
    const dDates = dLast >= 2 ? diarySheet.getRange(2, 2, dLast - 1, 1).getValues() : [];
    let diaryRow = 0;
    for (let j = dDates.length - 1; j >= 0; j--) {
      if (formatDateVal_(dDates[j][0]) === dateStr) {
        diaryRow = j + 2;
        break;
      }
    }

    if (diaryRow >= 2) {
      const cur = diarySheet.getRange(diaryRow, 1, 1, 13).getValues()[0];
      const prevNames = String(cur[8] || '').split('\n').filter(Boolean);
      const prevUrls = String(cur[9] || '').split('\n').filter(Boolean);
      const addNames = [];
      const addUrls = [];
      fileUrls.forEach((u, idx) => {
        if (!prevUrls.includes(u)) {
          addUrls.push(u);
          addNames.push(fileNames[idx]);
        }
      });
      const allNames = [...addNames, ...prevNames];
      const allUrls = [...addUrls, ...prevUrls];
      const firstIdM = (allUrls[0] || '').match(/\/d\/([^/]+)/);
      const formula = firstIdM ? `=IMAGE("https://drive.google.com/uc?export=view&id=${firstIdM[1]}")` : '';
      diarySheet.getRange(diaryRow, 8, 1, 4).setValues([[allNames.length, allNames.join('\n'), allUrls.join('\n'), formula]]);
    } else {
      const weekday = getWeekdayJa_(dateStr);
      const nextId = dLast >= 2 ? Number(diarySheet.getRange(dLast, 1).getValue() || dLast - 1) + 1 : 1;
      const firstIdM = (fileUrls[0] || '').match(/\/d\/([^/]+)/);
      const formula = firstIdM ? `=IMAGE("https://drive.google.com/uc?export=view&id=${firstIdM[1]}")` : '';
      const year = dateStr.slice(0, 4);
      const docId = YEAR_DOC_IDS[year] || '';
      const docUrl = docId ? `https://docs.google.com/document/d/${docId}/edit` : '';
      diarySheet.appendRow([
        nextId,
        dateStr,
        weekday,
        Utilities.formatDate(new Date(), 'Asia/Tokyo', 'HH:mm'),
        `${dateStr}の日記`,
        '食事記録からの写真アーカイブ',
        '',
        fileNames.length,
        fileNames.join('\n'),
        fileUrls.join('\n'),
        formula,
        docUrl,
        'meal_photo_archive',
      ]);
      diaryRow = diarySheet.getLastRow();
      if (docId) {
        try {
          const doc = DocumentApp.openById(docId);
          const docBody = doc.getBody();
          docBody.appendParagraph(`${dateStr} (${weekday}) — ${dateStr}の日記`).setHeading(DocumentApp.ParagraphHeading.HEADING2);
          docBody.appendParagraph('食事記録からの写真アーカイブ');
          fileUrls.forEach((u, idx) => docBody.appendParagraph(`📷 写真: ${fileNames[idx]}`).setLinkUrl(u));
          docBody.appendHorizontalRule();
          doc.saveAndClose();
        } catch (e) { /* ignore */ }
      }
    }

    // 食事記録DB側の写真URL・写真IDをクリア（複製せず参照移動）
    mealSheet.getRange(mealRow, urlIdx + 1).setValue('');
    mealSheet.getRange(mealRow, idIdx + 1).setValue('');
    migrated.push({ mealRow, dateStr, diaryRow, count: fileUrls.length, fileUrls });
  }

  return { ok: true, migratedCount: migrated.length, migrated };
}
