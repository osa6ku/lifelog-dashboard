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
  return withSheetRetry_(() => {
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
  }, { label: 'getMealEntries' });
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
  return withSheetRetry_(() => {
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

    sheet.getRange(row, 1, 1, totalCols).setValues([sanitizeRowForSetValues_(rowArr)]);
    const r = sheet.getRange(row, 1, 1, totalCols).getValues()[0];
    return { ok: true, entry: formatMealRow_(row, r, map) };
  }, { label: 'updateMealEntry' });
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

