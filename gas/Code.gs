function doGet(e) {
  const params = (e && e.parameter) || {};
  const api = params.api;
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
    const info = fetchWikipediaInfo_(String(params.title || ''), String(params.category || ''));
    return jsonResponse_({ ok: true, found: Boolean(info), info });
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

// ============================================================================
// 食事カロリー＆栄養バランス（PFC）分析 API
// ============================================================================

