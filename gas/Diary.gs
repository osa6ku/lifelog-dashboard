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

  const out = { ok: true, count: entries.length, totalCount, filteredCount, hasMore, locationPresets, entries };
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

function getLocationPresets() {
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
  const result = {
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

