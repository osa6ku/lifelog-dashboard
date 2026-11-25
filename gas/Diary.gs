function queryDiaryEntries_(params) {
  const all = getDiaryEntries(0);
  const totalCount = all.length;
  const q = String(params.q || '').trim().toLowerCase();
  const ym = String(params.ym || '').trim();
  const sort = String(params.sort || 'desc').trim();
  const months = Number(params.months || 0);
  const limit = Number(params.limit || 0);
  const offset = Math.max(0, Number(params.offset || 0));
  const includeMeta = String(params.includeMeta || '') === '1';

  let locationHistory;
  if (includeMeta) {
    const locMap = {};
    const sortedForHist = [...all].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    sortedForHist.forEach(d => {
      const locs = Array.isArray(d.locations) && d.locations.length > 0
        ? d.locations
        : String(d.location || '').split('\n').map(s => s.trim()).filter(Boolean).map(name => ({ name, lat: null, lng: null }));
      locs.forEach(l => {
        const name = String((l && l.name) || '').trim();
        if (!name) return;
        const lat = (l.lat !== null && l.lat !== undefined && !isNaN(Number(l.lat))) ? Number(l.lat) : null;
        const lng = (l.lng !== null && l.lng !== undefined && !isNaN(Number(l.lng))) ? Number(l.lng) : null;
        if (!locMap[name]) {
          locMap[name] = { name, lat, lng, date: d.date || '' };
        } else if (lat !== null && lng !== null && locMap[name].lat === null) {
          locMap[name].lat = lat;
          locMap[name].lng = lng;
        }
      });
    });
    locationHistory = Object.values(locMap).slice(0, 200);
  }

  let cutoffDate = '';
  if (!q && !ym && sort !== 'asc' && months > 0) {
    const now = new Date();
    now.setMonth(now.getMonth() - months);
    cutoffDate = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd');
  }

  let filtered = all.filter(d => {
    if (ym && !String(d.date || '').startsWith(ym)) return false;
    if (cutoffDate && String(d.date || '') < cutoffDate) return false;
    if (q) {
      const hay = `${d.title || ''} ${d.body || ''} ${d.location || ''} ${d.mealType || ''} ${d.nutritionAdvice || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (sort === 'asc') {
    filtered.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || (Number(a.row || 0) - Number(b.row || 0)));
  } else {
    filtered.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (Number(b.row || 0) - Number(a.row || 0)));
  }

  const filteredCount = filtered.length;
  const entries = limit > 0 ? filtered.slice(offset, offset + limit) : filtered;
  const hasMore = limit > 0 && (offset + limit < filteredCount);
  const locationPresets = getLocationPresets();
  const yearCounts = buildYearCounts_(all, 'date');

  const out = { ok: true, count: entries.length, totalCount, filteredCount, hasMore, locationPresets, yearCounts, entries };
  if (includeMeta) {
    out.locationHistory = locationHistory;
  }
  return out;
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

function formatDiaryRow_(row, r, cols, ssTimeZone) {
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
    time: formatTimeVal_(r[3], ssTimeZone),
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

function getLocationPresets() {
  return withSheetRetry_(() => {
    const ss = SpreadsheetApp.openById(DIARY_SS_ID);
    const sheet = ss.getSheetByName(LOCATION_PRESET_SHEET_NAME);
    if (!sheet) return [];
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    const values = sheet.getRange(2, 1, lastRow - 1, Math.min(4, Math.max(4, sheet.getLastColumn()))).getValues();
    const out = [];
    for (let i = 0; i < values.length; i++) {
      const r = values[i];
      const name = String(r[0] || '').trim();
      if (!name) continue;
      const icon = String(r[1] || '📍').trim() || '📍';
      const lat = isFiniteCoord_(r[2]) ? Number(r[2]) : null;
      const lng = isFiniteCoord_(r[3]) ? Number(r[3]) : null;
      out.push({ name, icon, lat, lng });
    }
    return out;
  }, { label: 'getLocationPresets' });
}

function getDiaryEntries(limit) {
  return withSheetRetry_(() => {
    const sheet = getSheetByNameOrThrow_(DIARY_SS_ID, DIARY_SHEET_NAME);
    const ssTimeZone = getSpreadsheetTimeZoneSafe_(sheet);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];

    const cols = getDiaryNutritionCols_(sheet, false);
    const startRow = limit && limit > 0 ? Math.max(2, lastRow - limit + 1) : 2;
    const values = sheet.getRange(startRow, 1, lastRow - startRow + 1, cols.totalCols).getValues();
    const out = [];
    for (let i = values.length - 1; i >= 0; i--) {
      out.push(formatDiaryRow_(startRow + i, values[i], cols, ssTimeZone));
    }
    return out;
  }, { label: 'getDiaryEntries' });
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
  const clientReqId = String(payload.clientRequestId || '').trim();
  if (clientReqId) {
    try {
      const cached = CacheService.getScriptCache().get('diary_req_' + clientReqId);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.ok) return Object.assign({}, parsed, { deduplicated: true });
      }
    } catch (_) {}
  }

  const dateStr = payload.date || Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const year = dateStr.slice(0, 4);
  const weekday = getWeekdayJa_(dateStr);
  const title = sanitizeHtmlText_(payload.title || '');
  const body = sanitizeHtmlText_(payload.body || '');
  const normLocs = normalizeLocationsPayload_(payload.location, payload.locations);
  const location = normLocs.map(l => l.name).join('\n');

  const ss = SpreadsheetApp.openById(DIARY_SS_ID);
  const sheet = ss.getSheetByName(DIARY_SHEET_NAME);
  const ssTimeZone = typeof ss.getSpreadsheetTimeZone === 'function' ? ss.getSpreadsheetTimeZone() : getSpreadsheetTimeZoneSafe_(sheet);
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
          entry: formatDiaryRow_(dupRow, dupFull, dupCols, ssTimeZone),
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
  const timeStr = resolveDiaryTimeForCreate_(payload.time);

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
  // D列（時刻）は Date シリアル値への自動変換による TZ ズレを防ぐためプレーンテキスト書式（@）で保存（3-56）
  setPlainTextFormatSafe_(sheet, insertedRow, 4);
  sheet.getRange(insertedRow, 1, 1, cols.totalCols).setValues([rowArr]);

  // 年別Doc同期はリアルタイム実行を廃止し、深夜バッチ同期対象として年をマーク
  if (docId) markDocYearDirty_(year);
  const result = {
    ok: true,
    id: nextId,
    row: insertedRow,
    date: dateStr,
    docSynced: false,
    docSyncMode: 'nightly_batch',
    needsDocSync: false,
    docSyncPayload: null,
    failedPhotos,
    entry: formatDiaryRow_(insertedRow, rowArr, cols, ssTimeZone),
  };
  if (clientReqId) {
    try {
      CacheService.getScriptCache().put('diary_req_' + clientReqId, JSON.stringify(result), 600);
    } catch (_) {}
  }
  return result;
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
  // 新規写真のDriveアップロードはリトライ対象外（1回だけ実行して重複アップロードを防止）
  const initialDateHint = payload.date ? String(payload.date).slice(0, 10) : Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  const removeSet = new Set((payload.removeUrls || []).map(String));
  const hasNewPhotos = Array.isArray(payload.photos) && payload.photos.length > 0;
  let uploadedPhotos = null;

  const outcome = withSheetRetry_(() => {
    const sheet = getSheetByNameOrThrow_(DIARY_SS_ID, DIARY_SHEET_NAME);
    const ssTimeZone = getSpreadsheetTimeZoneSafe_(sheet);
    const row = resolveRowByIdOrIndex_(sheet, 1, payload.row, payload.id);
    if (row < 2) return { notFound: true };

    // ヘッダー行(1行目)と対象行(row行目)の2行のみを取得して O(1) 更新
    const cols = getDiaryNutritionCols_(sheet, true);
    const rowArr = sheet.getRange(row, 1, 1, cols.totalCols).getValues()[0];
    const oldDate = formatDateVal_(rowArr[1]);
    const oldTitle = String(rowArr[4] || '');
    const oldBody = String(rowArr[5] || '').trim();
    const oldLocation = String(rowArr[6] || '').trim();

    const dateStr = payload.date ? String(payload.date).slice(0, 10) : (oldDate || initialDateHint);
    const weekday = getWeekdayJa_(dateStr);
    const title = payload.title !== undefined ? sanitizeHtmlText_(payload.title) : oldTitle;
    const body = payload.body !== undefined ? sanitizeHtmlText_(payload.body) : String(rowArr[5] || '');
    const normLocs = payload.locations !== undefined ? normalizeLocationsPayload_(payload.location, payload.locations) : null;
    const location = normLocs
      ? normLocs.map(l => l.name).join('\n')
      : (payload.location !== undefined ? String(payload.location).trim() : String(rowArr[6] || ''));

    rowArr[1] = dateStr;
    rowArr[2] = weekday;
    // D列（時刻）は既存Date型も含めシート自身のTZ基準のプレーンテキスト HH:MM へ正規化して保存（3-56）
    if (payload.time !== undefined) {
      rowArr[3] = payload.time === null ? '' : formatTimeVal_(payload.time, ssTimeZone);
    } else {
      rowArr[3] = formatTimeVal_(rowArr[3], ssTimeZone);
    }
    rowArr[4] = title;
    rowArr[5] = body;
    rowArr[6] = location;

    // 既存写真の削除＋新規写真の追加（Driveアップロードは初回のみ実行）
    if (!uploadedPhotos) {
      uploadedPhotos = hasNewPhotos
        ? saveDiaryPhotos_(dateStr, payload.photos || [])
        : { jpgNames: [], driveUrls: [], firstFileId: '', failedPhotos: [] };
    }
    const photosChanged = removeSet.size > 0 || uploadedPhotos.jpgNames.length > 0;
    if (photosChanged) {
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
      const allNames = [...uploadedPhotos.jpgNames, ...keptNames];
      const allUrls = [...uploadedPhotos.driveUrls, ...keptUrls];
      const firstIdMatch = (allUrls[0] || '').match(/\/d\/([^/]+)/);
      rowArr[7] = allNames.length;
      rowArr[8] = allNames.join('\n');
      rowArr[9] = allUrls.join('\n');
      rowArr[10] = firstIdMatch ? `=IMAGE("https://drive.google.com/uc?export=view&id=${firstIdMatch[1]}")` : '';
    }

    applyDiaryExtraToArray_(rowArr, cols, payload, normLocs);
    rowArr[12] = `edited ${Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm')}`;

    // 根本対策: K列(11列目)の =IMAGE() セルは getValues() で CellImage オブジェクトとして返り、
    // そのまま setValues() へ書き戻すと「Exception: サービス エラー: スプレッドシート」が発生する。
    // 写真変更がない場合は K列を書き戻さず A〜J列 と L列以降を分割更新し、さらに全要素から非Dateオブジェクトを除去する。
    // また D列（時刻）は Date シリアル値への自動変換を防ぐためプレーンテキスト書式（@）を設定してから書き込む（3-56）。
    setPlainTextFormatSafe_(sheet, row, 4);
    if (photosChanged) {
      sheet.getRange(row, 1, 1, cols.totalCols).setValues([sanitizeRowForSetValues_(rowArr)]);
    } else {
      sheet.getRange(row, 1, 1, 10).setValues([sanitizeRowForSetValues_(rowArr.slice(0, 10))]);
      if (cols.totalCols >= 12) {
        sheet.getRange(row, 12, 1, cols.totalCols - 11).setValues([sanitizeRowForSetValues_(rowArr.slice(11))]);
      }
    }

    return { notFound: false, row, rowArr, cols, ssTimeZone, dateStr, oldDate, title, oldTitle, body, oldBody, location, oldLocation };
  }, { label: 'updateDiaryEntry' });

  if (outcome.notFound) return { ok: false, error: 'Diary entry not found' };

  const { row, rowArr, cols, ssTimeZone, dateStr, oldDate, title, oldTitle, body, oldBody, location, oldLocation } = outcome;
  // 年別Doc同期は深夜バッチへ委譲（対象年をマークするのみ）
  const newYear = String(dateStr || '').slice(0, 4);
  const oldYear = String(oldDate || '').slice(0, 4);
  const docContentChanged = (dateStr !== oldDate) || (title !== oldTitle) || (body !== oldBody) || (location !== oldLocation);
  if (docContentChanged) {
    if (YEAR_DOC_IDS[newYear]) markDocYearDirty_(newYear);
    if (oldYear && oldYear !== newYear && YEAR_DOC_IDS[oldYear]) markDocYearDirty_(oldYear);
  }
  return {
    ok: true,
    docSynced: false,
    docSyncMode: 'nightly_batch',
    docSyncSkipped: !docContentChanged,
    needsDocSync: false,
    docSyncPayload: null,
    entry: formatDiaryRow_(row, rowArr, cols, ssTimeZone),
  };
}

function syncDiaryDocAction(payload) {
  // v1.30.0以降、年別Doc同期は深夜バッチ（syncDirtyDiaryDocsNightly）へ一本化
  const year = String((payload && payload.date) || '').slice(0, 4);
  if (year && YEAR_DOC_IDS[year]) markDocYearDirty_(year);
  return { ok: true, docSynced: false, docSyncMode: 'nightly_batch' };
}

function deleteDiaryEntry(payload) {
  const ss = SpreadsheetApp.openById(DIARY_SS_ID);
  const sheet = ss.getSheetByName(DIARY_SHEET_NAME);
  const row = resolveRowByIdOrIndex_(sheet, 1, payload.row, payload.id);
  if (row < 2) return { ok: false, error: 'Diary entry not found' };
  const oldDate = formatDateVal_(sheet.getRange(row, 2).getValue());
  const oldYear = String(oldDate || '').slice(0, 4);
  sheet.deleteRow(row);
  if (oldYear && YEAR_DOC_IDS[oldYear]) markDocYearDirty_(oldYear);
  return { ok: true, deletedRow: row };
}

const DIRTY_DOC_YEARS_PROP = 'DIRTY_DOC_YEARS';

function getDirtyDocYears_() {
  try {
    if (typeof PropertiesService === 'undefined') return [];
    const raw = PropertiesService.getScriptProperties().getProperty(DIRTY_DOC_YEARS_PROP);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.map(String).filter(Boolean) : [];
  } catch (e) {
    return [];
  }
}

function setDirtyDocYears_(years) {
  try {
    if (typeof PropertiesService === 'undefined') return;
    const unique = Array.from(new Set((years || []).map(String).filter(Boolean))).sort();
    PropertiesService.getScriptProperties().setProperty(DIRTY_DOC_YEARS_PROP, JSON.stringify(unique));
  } catch (e) { /* ignore */ }
}

function markDocYearDirty_(year) {
  const y = String(year || '').trim();
  if (!y || !YEAR_DOC_IDS[y]) return;
  const cur = getDirtyDocYears_();
  if (cur.indexOf(y) === -1) {
    cur.push(y);
    setDirtyDocYears_(cur);
  }
}

function buildYearDocEntries_(rows, year) {
  const targetYear = String(year || '').trim();
  const entries = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const dateStr = formatDateVal_(r[1]);
    if (!dateStr || dateStr.slice(0, 4) !== targetYear) continue;
    const jpgNames = String(r[8] || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const driveUrls = String(r[9] || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    entries.push({
      id: Number(r[0]) || i,
      date: dateStr,
      weekday: String(r[2] || '').trim(),
      title: String(r[4] || '').trim(),
      body: String(r[5] || ''),
      location: String(r[6] || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).join(' → '),
      jpgNames,
      driveUrls,
    });
  }
  entries.sort((a, b) => a.date.localeCompare(b.date) || (a.id - b.id));
  return entries;
}

function rebuildYearDiaryDoc_(year) {
  const docId = YEAR_DOC_IDS[String(year)];
  if (!docId) return { ok: false, year, count: 0, error: 'YEAR_DOC_ID not configured' };

  const ss = SpreadsheetApp.openById(DIARY_SS_ID);
  const sheet = ss.getSheetByName(DIARY_SHEET_NAME);
  const rows = sheet.getDataRange().getValues();
  const entries = buildYearDocEntries_(rows, year);

  const doc = DocumentApp.openById(docId);
  const docBody = doc.getBody();
  docBody.clear();
  docBody.appendParagraph(`日記アーカイブ ${year}年（全${entries.length}件）`)
    .setHeading(DocumentApp.ParagraphHeading.HEADING1);

  entries.forEach(ent => {
    const wd = ent.weekday ? ` (${ent.weekday})` : '';
    docBody.appendParagraph(`${ent.date}${wd} — ${ent.title || '(無題)'}`)
      .setHeading(DocumentApp.ParagraphHeading.HEADING2);
    if (ent.location) {
      docBody.appendParagraph(`📍 場所: ${ent.location}`);
    }
    String(ent.body || '').split(/\r?\n/).forEach(line => {
      if (line.trim().length > 0) docBody.appendParagraph(line);
    });
    ent.driveUrls.forEach((u, idx) => {
      const label = ent.jpgNames[idx] || 'photo.jpg';
      docBody.appendParagraph(`📷 写真: ${label}`).setLinkUrl(u);
    });
    docBody.appendHorizontalRule();
  });

  doc.saveAndClose();
  return { ok: true, year: String(year), count: entries.length };
}

/**
 * 深夜バッチ同期（GAS時間主導トリガーで毎日深夜1回実行）
 * 変更のあった年（DIRTY_DOC_YEARS）のみ、スプレッドシート正本から年別Docをクリーン再生成する。
 */
function syncDirtyDiaryDocsNightly() {
  const dirtyYears = getDirtyDocYears_();
  if (dirtyYears.length === 0) {
    Logger.log('syncDirtyDiaryDocsNightly: no dirty years to sync.');
    return { ok: true, synced: [], remaining: [] };
  }
  const synced = [];
  const remaining = [];
  dirtyYears.forEach(y => {
    try {
      const res = rebuildYearDiaryDoc_(y);
      if (res.ok) synced.push(res);
      else remaining.push(y);
    } catch (err) {
      Logger.log(`syncDirtyDiaryDocsNightly error (${y}): ${err}`);
      remaining.push(y);
    }
  });
  setDirtyDocYears_(remaining);
  try {
    PropertiesService.getScriptProperties().setProperty(
      'LAST_DOC_BATCH_SYNC',
      JSON.stringify({ at: Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss'), synced, remaining })
    );
  } catch (e) { /* ignore */ }
  return { ok: remaining.length === 0, synced, remaining };
}

/**
 * 毎日深夜3時〜4時に syncDirtyDiaryDocsNightly を実行する時間主導トリガーを登録（重複防止付き）
 */
function installNightlyDocSyncTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => {
    if (t.getHandlerFunction() === 'syncDirtyDiaryDocsNightly') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('syncDirtyDiaryDocsNightly')
    .timeBased()
    .everyDays(1)
    .atHour(3)
    .create();
  return { ok: true, schedule: 'daily 03:00-04:00' };
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

