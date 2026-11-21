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

function cleanWorkTitle_(rawTitle) {
  const s = String(rawTitle || '')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '')
    .replace(/\\_/g, '_')
    .trim();
  const stripped = s
    .replace(/^(?:\[.*?\]|【.*?】|TVアニメ|テレビドラマ|ドラマ|映画|アニメ|小説|漫画|本|舞台|ドキュメンタリー|バラエティ)[『「\s]*(.*?)[』」\s]*$/, '$1')
    .replace(/^[『「](.*?)[』」]$/, '$1')
    .trim();
  return stripped || s;
}

function enrichRow_(sheet, row) {
  const cur = sheet.getRange(row, 1, 1, 15).getValues()[0];
  const rawTitle = String(cur[COL.TITLE - 1] || '').trim();
  if (!rawTitle) return;

  const category = String(cur[COL.CATEGORY - 1] || '').trim();
  const cleanTitle = cleanWorkTitle_(rawTitle);

  const curSummary = String(cur[COL.SUMMARY - 1] || '').trim();
  const wiki = fetchWikipediaInfo_(cleanTitle || rawTitle, category);
  if (!wiki) {
    // 作品記事が見つからない場合は一般用語等で埋めず、空欄のまま見送る
    return;
  }

  if (wiki.year && !cur[COL.RELEASE_YEAR - 1]) {
    sheet.getRange(row, COL.RELEASE_YEAR).setValue(wiki.year);
  }
  if (wiki.platforms.length > 0) {
    const curPlat = String(cur[COL.PLATFORM - 1] || '');
    const memo = String(cur[COL.MEMO - 1] || '');
    const merged = [curPlat, ...wiki.platforms].filter(Boolean).join(', ');
    sheet.getRange(row, COL.PLATFORM).setValue(normalizePlatforms_(merged, `${rawTitle} ${memo}`));
  }
  if (wiki.cast.length > 0) {
    const curCast = String(cur[COL.CAST - 1] || '')
      .split(/[,、]/)
      .map(s => s.trim())
      .filter(Boolean);
    const mergedCast = [...curCast];
    wiki.cast.forEach(c => { if (c && !mergedCast.includes(c)) mergedCast.push(c); });
    sheet.getRange(row, COL.CAST).setValue(mergedCast.slice(0, MAX_CAST).join(', '));
  }
  if (wiki.staff.length > 0) {
    const curStaff = String(cur[COL.STAFF - 1] || '')
      .split(/[,、]/)
      .map(s => s.trim())
      .filter(Boolean);
    const mergedStaff = [...curStaff];
    wiki.staff.forEach(s => { if (s && !mergedStaff.includes(s)) mergedStaff.push(s); });
    sheet.getRange(row, COL.STAFF).setValue(mergedStaff.join(', '));
  }
  if (wiki.summary && (!curSummary || curSummary.startsWith('⚠️ Wikipedia記事が見つかりませんでした'))) {
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

function fetchWikiPageRaw_(apiBase, headers, title) {
  const url = `${apiBase}?action=query&redirects=1&prop=revisions%7Cextracts%7Ccategories%7Cpageprops&rvprop=content&exintro=1&explaintext=1&cllimit=50&titles=${encodeURIComponent(title)}&format=json`;
  const res = UrlFetchApp.fetch(url, { headers, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  const json = JSON.parse(res.getContentText());
  const query = json.query || {};
  const pages = query.pages || {};
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) return null;
  const categories = (page.categories || []).map(c => String(c.title || ''));
  const isDisambig = Boolean((page.pageprops && page.pageprops.disambiguation !== undefined) || categories.some(c => c.includes('曖昧さ回避')));
  const redirected = Array.isArray(query.redirects) && query.redirects.length > 0;
  return {
    title: String(page.title || ''),
    extract: String(page.extract || '').trim(),
    wikitext: String((page.revisions && page.revisions[0] && page.revisions[0]['*']) || ''),
    categories,
    isDisambig,
    redirected,
  };
}

function isTitleRelevant_(page, cleanTitle) {
  const norm = (s) => String(s || '')
    .replace(/\s*\([^)]*\)\s*$/g, '')
    .replace(/[\s　・:：\-‐–—/!！?？「」『』'".,、。]/g, '')
    .toLowerCase();
  const nPage = norm(page.title);
  const nClean = norm(cleanTitle);
  if (!nPage || !nClean) return false;
  if (nPage === nClean || nPage.includes(nClean) || (nPage.length >= 2 && nClean.includes(nPage))) return true;
  // 原題・別表記がリード文冒頭に含まれる場合（例: EX_MACHINA -> エクス・マキナ）
  const introNorm = String(page.extract || '').slice(0, 220).replace(/[\s　・:：\-‐–—/!！?？「」『』'".,、。]/g, '').toLowerCase();
  if (nClean.length >= 2 && introNorm.includes(nClean)) return true;
  return false;
}

function isValidWorkArticle_(page, cleanTitle, category) {
  if (!page || page.isDisambig) return false;
  if (!isTitleRelevant_(page, cleanTitle)) return false;
  const catsStr = (page.categories || []).join(' ');
  const intro = String(page.extract || '').slice(0, 350);
  const wt = String(page.wikitext || '');

  // 人物記事は作品ではないため除外
  if (/(存命人物|年の生|年の没|の俳優|の女優|の声優|の小説家|の映画監督|の歌手|のミュージシャン)/.test(catsStr)) {
    return false;
  }

  const hasDrama = /(テレビドラマ|ドラマ|連続ドラマ|配信ドラマ|放送|テレビ番組)/.test(catsStr + ' ' + intro) || /\{\{\s*(?:基礎情報\s*テレビ番組|Infobox\s*television)/i.test(wt);
  const hasMovie = /(映画|劇場版|公開|配給|監督)/.test(catsStr + ' ' + intro) || /\{\{\s*(?:Infobox\s*Film|Infobox\s*映画|基礎情報\s*映画)/i.test(wt);
  const hasAnime = /(アニメ|アニメーション)/.test(catsStr + ' ' + intro) || /\{\{\s*Infobox\s*animanga/i.test(wt);
  const hasBook = /(小説|書籍|著書|漫画|エッセイ|ノンフィクション|文学|刊行|連載)/.test(catsStr + ' ' + intro) || /\{\{\s*(?:基礎情報\s*書籍|Infobox\s*book|Infobox\s*animanga)/i.test(wt);

  if (category === 'ドラマ') return hasDrama;
  if (category === '映画') return hasMovie;
  if (category === 'アニメ') return hasAnime;
  if (category === '本') return hasBook;
  // その他・未指定でも作品を示す語が含まれない一般用語記事は除外
  return hasDrama || hasMovie || hasAnime || hasBook || /(ドキュメンタリー|バラエティ|舞台|音楽番組|ライブ|コンサート|出演|脚本|監督|著者)/.test(catsStr + ' ' + intro);
}

function fetchWikipediaInfo_(title, category) {
  const apiBase = 'https://ja.wikipedia.org/w/api.php';
  const headers = { 'User-Agent': WIKI_USER_AGENT };
  const cleanTitle = cleanWorkTitle_(title);
  const cat = String(category || '').trim();

  // 1. 区分に応じた曖昧さ回避サフィックス付き記事を最優先で探索
  const suffixMap = {
    'ドラマ': [' (テレビドラマ)', ' (ドラマ)'],
    '映画': [' (映画)'],
    'アニメ': [' (アニメ)'],
    '本': [' (小説)', ' (書籍)', ' (漫画)'],
  };
  const hintMap = {
    'ドラマ': 'テレビドラマ',
    '映画': '映画',
    'アニメ': 'アニメ',
    '本': '小説',
  };

  const candidates = [];
  const pushUnique = (t) => {
    const s = String(t || '').trim();
    if (s && !candidates.includes(s)) candidates.push(s);
  };

  (suffixMap[cat] || []).forEach(suf => pushUnique(cleanTitle + suf));
  pushUnique(cleanTitle);

  // 2. 検索候補（区分ヒント付き → 通常検索）を後ろへ追加
  const searchQueries = [];
  if (hintMap[cat]) searchQueries.push(`${cleanTitle} ${hintMap[cat]}`);
  searchQueries.push(cleanTitle);

  for (const sq of searchQueries) {
    const searchUrl = `${apiBase}?action=query&list=search&srsearch=${encodeURIComponent(sq)}&srlimit=5&format=json`;
    const sRes = UrlFetchApp.fetch(searchUrl, { headers, muteHttpExceptions: true });
    if (sRes.getResponseCode() !== 200) continue;
    const sJson = JSON.parse(sRes.getContentText());
    const results = (sJson.query && sJson.query.search) || [];
    results.forEach(r => pushUnique(r.title));
  }

  const seenResolved = new Set();
  let page = null;
  for (const cand of candidates.slice(0, 8)) {
    const p = fetchWikiPageRaw_(apiBase, headers, cand);
    if (!p) continue;
    if (seenResolved.has(p.title)) continue;
    seenResolved.add(p.title);
    // 作品記事の健全性チェック（タイトル関連性＋一般用語へのリダイレクト除外）
    if (!isValidWorkArticle_(p, cleanTitle, cat)) continue;
    page = p;
    break;
  }
  if (!page) return null;

  const pageTitle = page.title;
  const wikitext = page.wikitext;
  const summary = (page.extract || '').split('\n')[0].slice(0, 400);

  // 公開年・放送年抽出
  const yearMatch = wikitext.match(/\|\s*(?:公開|放送期間|放送年|製作年|発表|発行日|出版年)\s*=\s*.*?((?:19|20)\d{2})年/);
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

    const isStaffLine = /\|\s*(?:監督|脚本|原作|演出|プロデューサー|音楽|著者|作者)\s*=/.test(line);
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

