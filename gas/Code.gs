function doGet(e) {
  const params = (e && e.parameter) || {};
  const api = params.api;
  if (api) {
    try {
      if (api === 'watch') {
        return jsonResponse_(queryWatchEntries_(params));
      }
      if (api === 'diary') {
        return jsonResponse_(queryDiaryEntries_(params));
      }
      if (api === 'search') {
        return jsonResponse_(searchAllEntries_(params));
      }
      if (api === 'testWiki') {
        const memoStr = String(params.memo || '');
        let personDict = null;
        if (memoStr && String(params.useDbDict || '1') !== '0') {
          try {
            const sheet = getSheetByNameOrThrow_(WATCH_SS_ID, SHEET_NAME);
            personDict = buildWatchPersonDict_(sheet);
          } catch (_) {
            personDict = null;
          }
        }
        const hints = {
          staff: String(params.staff || ''),
          cast: String(params.cast || ''),
          memo: memoStr,
          relatedUrl: String(params.relatedUrl || ''),
          watchDate: String(params.watchDate || ''),
          extraHint: String(params.extraHint || ''),
          personDict,
        };
        const candidates = searchWikipediaCandidates_(String(params.title || ''), String(params.category || ''), hints);
        const info = candidates.length > 0 ? candidates[0] : null;
        return jsonResponse_({ ok: true, found: Boolean(info), count: candidates.length, info, candidates });
      }
      if (api === 'presets') {
        const presets = getLocationPresets();
        return jsonResponse_({ ok: true, count: presets.length, presets });
      }
      if (api === 'meals') {
        const entries = getMealEntries();
        return jsonResponse_({ ok: true, count: entries.length, entries });
      }
      if (api === 'thumb') {
        const fileId = String(params.id || '').trim();
        const full = String(params.full || '') === '1';
        return jsonResponse_(getImageDataUrl_(fileId, full));
      }
    } catch (err) {
      console.error('[doGet error]', {
        api,
        id: params.id || '',
        row: params.row || params.rowIndex || '',
        message: String(err),
        stack: err && err.stack ? err.stack : String(err),
      });
      return jsonResponse_({ ok: false, error: String(err) });
    }
  }
  const dashUrl = 'https://osa6ku.github.io/lifelog-dashboard/';
  const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ライフログ・ダッシュボード</title><meta http-equiv="refresh" content="2;url=${dashUrl}"></head><body style="font-family:sans-serif;padding:24px;text-align:center;"><h2>📚 ライフログ・ダッシュボード</h2><p>ダッシュボードは GitHub Pages に移行しました。</p><p><a href="${dashUrl}" style="display:inline-block;padding:12px 20px;background:#1a73e8;color:#fff;border-radius:8px;text-decoration:none;font-weight:700;">ダッシュボードを開く</a></p></body></html>`;
  return HtmlService.createHtmlOutput(html)
    .setTitle('ライフログ・ダッシュボード')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  let action = '';
  let targetId = '';
  let targetRow = '';
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    action = body.action || '';
    const p = body.payload || {};
    targetId = p.id !== undefined ? p.id : '';
    targetRow = p.row !== undefined ? p.row : (p.rowIndex !== undefined ? p.rowIndex : '');
    if (action === 'addWatch') return jsonResponse_(addWatchEntry(p));
    if (action === 'updateWatch') return jsonResponse_(updateWatchCard(p));
    if (action === 'updateWatchFull') return jsonResponse_(updateWatchFull(p));
    if (action === 'deleteWatch') return jsonResponse_(deleteWatchEntry(p));
    if (action === 'searchWikiCandidates') return jsonResponse_(searchWatchWikiCandidates(p));
    if (action === 'applyWikiCandidate') return jsonResponse_(applyWatchWikiCandidate(p));
    if (action === 'addDiary') return jsonResponse_(addDiaryEntry(p));
    if (action === 'updateDiary') return jsonResponse_(updateDiaryEntry(p));
    if (action === 'syncDiaryDoc') return jsonResponse_(syncDiaryDocAction(p));
    if (action === 'deleteDiary') return jsonResponse_(deleteDiaryEntry(p));
    if (action === 'analyzeMeal') return jsonResponse_(analyzeMealEntry(p));
    if (action === 'addMeal') return jsonResponse_(addMealEntry(p));
    if (action === 'updateMeal') return jsonResponse_(updateMealEntry(p));
    if (action === 'deleteMeal') return jsonResponse_(deleteMealEntry(p));
    if (action === 'importMeals') return jsonResponse_(importMealsBatch(p));
    if (action === 'migrateMealPhotosToDiary') return jsonResponse_(migrateMealPhotosToDiary());
    if (action === 'batchSortDiaryPhotos') return jsonResponse_(batchSortDiaryPhotos(p));
    if (action === 'batchUpdateDiaryLocations') return jsonResponse_(batchUpdateDiaryLocations(p));
    if (action === 'batchUpdateWatchMemos') return jsonResponse_(batchUpdateWatchMemos(p));
    return jsonResponse_({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    console.error('[doPost error]', {
      action,
      id: targetId,
      row: targetRow,
      message: String(err),
      stack: err && err.stack ? err.stack : String(err),
    });
    return jsonResponse_({ ok: false, error: String(err) });
  }
}

function getSheetByNameOrThrow_(ssId, sheetName) {
  const ss = SpreadsheetApp.openById(ssId);
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw new Error(`Sheet not found: ${sheetName}`);
  }
  return sheet;
}

function isTransientSheetError_(err) {
  const msg = String((err && err.message) || err || '');
  return /サービス\s*エラー\s*[:：]\s*スプレッドシート|Service\s+error\s*:\s*Spreadsheets|Exception:\s*Service\s+error|Timed\s+out|Timeout|一時的なエラー|Please\s+try\s+again/i.test(msg);
}

/**
 * 一時的なスプレッドシートサービスエラーを吸収するリトライラッパー（1〜2秒待機・最大2回再試行）。
 * 冪等な読み取り・更新処理のみに適用し、二重記録の恐れがある追加系（addDiary / addMeal / addWatch）には使用しない。
 */
function withSheetRetry_(fn, options) {
  const opts = options || {};
  const maxRetries = opts.maxRetries !== undefined ? Number(opts.maxRetries) : 2;
  const delaysMs = Array.isArray(opts.delaysMs) && opts.delaysMs.length > 0 ? opts.delaysMs : [1200, 2000];
  const label = opts.label || 'sheet_op';
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt >= maxRetries || !isTransientSheetError_(err)) {
        throw err;
      }
      const delayMs = delaysMs[Math.min(attempt, delaysMs.length - 1)] || 1500;
      console.warn('[withSheetRetry_] transient error, retrying', {
        label,
        attempt: attempt + 1,
        maxRetries,
        delayMs,
        error: String(err),
      });
      if (typeof Utilities !== 'undefined' && typeof Utilities.sleep === 'function') {
        Utilities.sleep(delayMs);
      }
    }
  }
  throw lastErr;
}

/**
 * Range.setValues() へ渡す配列から CellImage 等の非プリミティブオブジェクト（Date除く）を除去する。
 */
function sanitizeRowForSetValues_(rowArr) {
  return (rowArr || []).map(v => {
    if (v === null || v === undefined) return '';
    if (typeof v === 'object' && !(v instanceof Date)) return '';
    return v;
  });
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}


function searchAllEntries_(params) {
  const q = String(params.q || '').trim();
  const scope = String(params.scope || 'all').trim();
  const limit = Number(params.limit || 100);
  if (!q) {
    return { ok: true, q: '', diaryCount: 0, watchCount: 0, diaryEntries: [], watchEntries: [] };
  }
  const dRes = (scope === 'all' || scope === 'diary')
    ? queryDiaryEntries_({ q, limit })
    : { filteredCount: 0, entries: [] };
  const wRes = (scope === 'all' || scope === 'watch')
    ? queryWatchEntries_({ q, limit })
    : { filteredCount: 0, entries: [] };
  return {
    ok: true,
    q,
    diaryCount: dRes.filteredCount,
    watchCount: wRes.filteredCount,
    diaryEntries: dRes.entries,
    watchEntries: wRes.entries,
  };
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

function formatTimeVal_(val, timeZone) {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date) {
    const tz = timeZone || 'Asia/Tokyo';
    return Utilities.formatDate(val, tz, 'HH:mm');
  }
  const s = String(val).trim();
  if (!s) return '';
  const m = s.match(/^(\d{1,2}):(\d{2})/);
  if (m) {
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  }
  return s;
}

function getSpreadsheetTimeZoneSafe_(sheet) {
  try {
    const parent = sheet && typeof sheet.getParent === 'function' ? sheet.getParent() : null;
    if (parent && typeof parent.getSpreadsheetTimeZone === 'function') {
      const tz = parent.getSpreadsheetTimeZone();
      if (tz) return tz;
    }
  } catch (e) { /* fallback */ }
  return 'Asia/Tokyo';
}

function setPlainTextFormatSafe_(sheet, row, col) {
  try {
    const range = sheet.getRange(row, col);
    if (range && typeof range.setNumberFormat === 'function') {
      range.setNumberFormat('@');
    }
  } catch (e) { /* ignore in minimal mocks */ }
}

/**
 * 日記作成時の時刻解決（3-52）:
 * - undefined / null（未指定）の場合のみ JST 現在時刻（HH:mm）を自動補完する。
 * - 空文字 "" が明示送信された場合はユーザーの意図的な消去として空欄を保持する。
 */
function resolveDiaryTimeForCreate_(rawTime) {
  if (rawTime === undefined || rawTime === null) {
    return Utilities.formatDate(new Date(), 'Asia/Tokyo', 'HH:mm');
  }
  const s = String(rawTime).trim();
  if (!s) return '';
  return formatTimeVal_(s);
}

/**
 * 年別件数サマリー配列を生成（3-53）: [{ year: 2026, count: 325 }, ...] 新しい年順
 */
function buildYearCounts_(entries, dateField) {
  const counts = {};
  (entries || []).forEach(item => {
    const m = String((item && item[dateField]) || '').match(/^(\d{4})/);
    if (!m) return;
    const y = Number(m[1]);
    counts[y] = (counts[y] || 0) + 1;
  });
  return Object.keys(counts)
    .map(y => ({ year: Number(y), count: counts[y] }))
    .sort((a, b) => b.year - a.year);
}

// ============================================================================
// 食事カロリー＆栄養バランス（PFC）分析 API
// ============================================================================

