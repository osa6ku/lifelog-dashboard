function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎬 ライフログ管理')
    .addItem('選択行をWikipediaから自動補完', 'enrichSelectedRows')
    .addItem('「自動補完」チェック済みの行を実行', 'enrichCheckedRows')
    .addSeparator()
    .addItem('プラットフォーム表記揺れを正規化（全行）', 'normalizeAllPlatforms')
    .addItem('🧹 鑑賞記録DBのHTMLタグ残骸を一括クレンジング（バックアップ付）', 'cleanseWatchHtmlTags')
    .addItem('🔗 鑑賞記録DBのメモ内URLを関連URL欄へ一括移管（バックアップ付）', 'migrateWatchMemoUrls')
    .addSeparator()
    .addItem('🌙 年別Doc深夜バッチ同期を設定（毎日3時）', 'installNightlyDocSyncTrigger')
    .addItem('📄 変更のあった年別Docを今すぐ同期', 'syncDirtyDiaryDocsNightly')
    .addToUi();
}

const HTML_TAG_REMNANT_RE_ = /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*?)?\/?>/;

function hasHtmlTagRemnants_(raw) {
  return HTML_TAG_REMNANT_RE_.test(String(raw || ''));
}

function sanitizeHtmlText_(raw) {
  if (raw === null || raw === undefined) return '';
  let s = String(raw);
  if (!s) return '';
  s = s.replace(/\r\n?/g, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/p>\s*<p(?:\s[^<>]*?)?>/gi, '\n\n');
  s = s.replace(/<\/div>\s*<div(?:\s[^<>]*?)?>/gi, '\n');
  s = s.replace(/<\/(?:p|div|li|h[1-6]|tr|blockquote)>/gi, '\n');
  // 意図的なMarkdownリンク [text](url) や <https://...> は壊さずHTMLタグのみ除去
  s = s.replace(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*?)?\/?>/g, '');
  s = s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&');
  s = s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

function cleanseWatchHtmlTags() {
  const ss = SpreadsheetApp.openById(WATCH_SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return { ok: false, error: 'Sheet not found: ' + SHEET_NAME };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { ok: true, totalRows: 0, beforeTagCells: 0, afterTagCells: 0, updatedRows: 0 };

  // 実行前に同スプレッドシート内へ全件バックアップシートを複製保存
  const ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmm');
  const backupSheetName = `${SHEET_NAME}_backup_${ts}`;
  const backupSheet = sheet.copyTo(ss);
  backupSheet.setName(backupSheetName);

  const lastCol = Math.max(15, sheet.getLastColumn());
  const dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
  const rows = dataRange.getValues();
  const targetCols = [COL.TITLE - 1, COL.CAST - 1, COL.STAFF - 1, COL.SUMMARY - 1, COL.MEMO - 1];

  let beforeTagCells = 0;
  let afterTagCells = 0;
  let updatedRows = 0;
  const cleanedRows = rows.map(r => {
    const next = r.slice();
    let rowChanged = false;
    targetCols.forEach(cIdx => {
      const orig = String(next[cIdx] === null || next[cIdx] === undefined ? '' : next[cIdx]);
      if (hasHtmlTagRemnants_(orig)) beforeTagCells++;
      const cleaned = sanitizeHtmlText_(orig);
      if (cleaned !== orig && (hasHtmlTagRemnants_(orig) || /&(?:nbsp|amp|lt|gt|quot|#39|apos);/i.test(orig))) {
        next[cIdx] = cleaned;
        rowChanged = true;
      }
      if (hasHtmlTagRemnants_(next[cIdx])) afterTagCells++;
    });
    if (rowChanged) updatedRows++;
    return next;
  });

  if (updatedRows > 0) {
    dataRange.setValues(cleanedRows);
  }
  const summary = {
    ok: true,
    backupSheetName,
    totalRows: rows.length,
    beforeTagCells,
    afterTagCells,
    updatedRows,
  };
  Logger.log('cleanseWatchHtmlTags: ' + JSON.stringify(summary));
  return summary;
}

/**
 * 鑑賞記録DBの感想・メモ内に残存するURLを関連URL欄へ一括移管・メモから一掃するワンタイム関数（3-54）。
 * 実行前に同スプレッドシート内へ全件バックアップシートを複製保存する。
 */
function migrateWatchMemoUrls() {
  const ss = SpreadsheetApp.openById(WATCH_SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) return { ok: false, error: 'Sheet not found: ' + SHEET_NAME };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return { ok: true, totalRows: 0, beforeUrlMemoRows: 0, afterUrlMemoRows: 0, updatedRows: 0, migratedUrlCount: 0 };
  }

  const ts = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyyMMdd_HHmm');
  const backupSheetName = `${SHEET_NAME}_url_backup_${ts}`;
  const backupSheet = sheet.copyTo(ss);
  backupSheet.setName(backupSheetName);

  const lastCol = Math.max(15, sheet.getLastColumn());
  const dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
  const rows = dataRange.getValues();
  const urlRe = /https?:\/\//i;

  let beforeUrlMemoRows = 0;
  let afterUrlMemoRows = 0;
  let updatedRows = 0;
  let migratedUrlCount = 0;
  const origIds = rows.map(r => String(r[COL.ID - 1] || ''));
  const origStatuses = rows.map(r => String(r[COL.STATUS - 1] || ''));

  const nextRows = rows.map(r => {
    const next = r.slice();
    const origMemo = String(next[COL.MEMO - 1] === null || next[COL.MEMO - 1] === undefined ? '' : next[COL.MEMO - 1]);
    const origRelated = String(next[COL.RELATED_URL - 1] === null || next[COL.RELATED_URL - 1] === undefined ? '' : next[COL.RELATED_URL - 1]);
    if (urlRe.test(origMemo)) beforeUrlMemoRows++;

    const res = extractUrlsFromWatchMemo_(origMemo, origRelated);
    if (res.extractedUrls.length > 0) {
      next[COL.MEMO - 1] = res.memo;
      next[COL.RELATED_URL - 1] = res.relatedUrl;
      updatedRows++;
      migratedUrlCount += res.extractedUrls.length;
    }
    if (urlRe.test(String(next[COL.MEMO - 1] || ''))) afterUrlMemoRows++;
    return next;
  });

  if (updatedRows > 0) {
    dataRange.setValues(nextRows);
  }
  const invariantsOk = nextRows.length === rows.length &&
    nextRows.every((r, idx) => String(r[COL.ID - 1] || '') === origIds[idx] && String(r[COL.STATUS - 1] || '') === origStatuses[idx]);

  const summary = {
    ok: true,
    backupSheetName,
    totalRows: rows.length,
    beforeUrlMemoRows,
    afterUrlMemoRows,
    updatedRows,
    migratedUrlCount,
    invariantsOk,
  };
  Logger.log('migrateWatchMemoUrls: ' + JSON.stringify(summary));
  return summary;
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
  let s = String(rawTitle || '')
    .replace(/[\x00-\x1f\x7f-\x9f]/g, '')
    .replace(/\\_/g, '_')
    .trim();
  if (!s) return '';
  s = s
    .replace(/^(?:\[.*?\]|【.*?】|(?:TVアニメ|テレビドラマ|ドラマ|映画|アニメ|小説|漫画|本|舞台|ドキュメンタリー|バラエティ)[:：]?)[『「\s　]*(.*?)[』」\s　]*$/, '$1')
    .replace(/^[『「](.*?)[』」]$/, '$1')
    .trim();
  // シリーズ・シーズン括弧を除去（例: "ドラゴン桜（第2シリーズ）" → "ドラゴン桜"）
  s = s
    .replace(/[\s　]*[（(](?:第?\s*[0-9０-９]+\s*(?:シリーズ|期)|シーズン\s*[0-9０-９]+|Season\s*\d+)[）)]\s*$/i, '')
    .trim();
  // 話数メモ・進捗メモを除去（例: "41-last", "1-10", "第1話", "全12話", "Ep.3", "#5"）
  s = s
    .replace(/[\s　]+(?:第?\d+\s*[-〜~]\s*(?:last|最終話?|終|\d+話?)|第\d+話(?:まで)?|全\d+話|Ep\.?\s*\d+|#\d+)\s*$/i, '')
    .trim();
  // 上下巻・前後編を除去（例: "上巻", "下巻", "（上）"）
  s = s
    .replace(/[\s　]*[（(]?(?:上巻|中巻|下巻|前編|後編)[）)]?\s*$/, '')
    .replace(/[\s　]+[（(](?:上|中|下)[）)]\s*$/, '')
    .trim();
  // 日本語タイトル末尾の英題括弧を除去（例: "きっと、うまくいく(3 idiots)" → "きっと、うまくいく"）
  if (/[ぁ-んァ-ヶ一-龠々]/.test(s)) {
    s = s.replace(/[\s　]*[（(][A-Za-z0-9\s\-:'&.,!?]+[）)]\s*$/, '').trim();
  }
  // 英語タイトルのアンダースコア区切りをスペースへ正規化（例: "mission impossible _ ghost protocol"）
  if (isEnglishTitle_(s)) {
    s = s.replace(/\s*_\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }
  return s || String(rawTitle || '').trim();
}

function isEnglishTitle_(title) {
  const s = String(title || '').trim();
  if (!s) return false;
  if (/[ぁ-んァ-ヶ一-龠々]/.test(s)) return false;
  return /[A-Za-z]{2,}/.test(s);
}

function normalizeWikiTitleForCompare_(str) {
  return String(str || '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\s*[（(][^）)]*[）)]\s*$/g, '')
    .replace(/[\s　・:：\-‐–—_/!！?？「」『』〈〉《》'".,、。&＆]/g, '')
    .toLowerCase();
}

function parseWatchYear_(watchDate) {
  const m = String(watchDate || '').match(/^((?:19|20)\d{2})/);
  return m ? Number(m[1]) : 0;
}

function extractWikipediaUrlsFromRelated_(relatedUrl) {
  const out = [];
  const seen = new Set();
  const urls = typeof parseRelatedUrls_ === 'function'
    ? parseRelatedUrls_(relatedUrl)
    : String(relatedUrl || '').split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
  for (const u of urls) {
    const m = u.match(/^https?:\/\/(ja|en)\.wikipedia\.org\/wiki\/([^#?\s]+)/i);
    if (!m) continue;
    const lang = m[1].toLowerCase();
    let title = m[2];
    try { title = decodeURIComponent(title); } catch (_) {}
    title = title.replace(/_/g, ' ').trim();
    const key = `${lang}:${title}`;
    if (title && !seen.has(key)) {
      seen.add(key);
      out.push({ lang, title, url: u });
    }
  }
  return out;
}

function buildWikiArticleUrl_(lang, title) {
  const l = lang === 'en' ? 'en' : 'ja';
  const encoded = encodeURIComponent(String(title || '').replace(/ /g, '_'));
  return `https://${l}.wikipedia.org/wiki/${encoded}`;
}

function enrichRow_(sheet, row) {
  const cur = sheet.getRange(row, 1, 1, 15).getValues()[0];
  const rawTitle = String(cur[COL.TITLE - 1] || '').trim();
  if (!rawTitle) return;

  const category = String(cur[COL.CATEGORY - 1] || '').trim();
  const curSummary = String(cur[COL.SUMMARY - 1] || '').trim();
  const hints = {
    rawTitle,
    staff: String(cur[COL.STAFF - 1] || '').trim(),
    cast: String(cur[COL.CAST - 1] || '').trim(),
    memo: String(cur[COL.MEMO - 1] || '').trim(),
    relatedUrl: String(cur[COL.RELATED_URL - 1] || '').trim(),
    watchDate: typeof formatDateVal_ === 'function' ? formatDateVal_(cur[COL.WATCH_DATE - 1]) : String(cur[COL.WATCH_DATE - 1] || '').slice(0, 10),
    releaseYear: String(cur[COL.RELEASE_YEAR - 1] || '').trim(),
  };

  const wiki = fetchWikipediaInfo_(rawTitle, category, hints);
  if (!wiki) {
    // 作品記事が見つからない場合は一般用語等で埋めず、空欄のまま見送る
    return;
  }

  const watchYear = parseWatchYear_(hints.watchDate);
  if (wiki.year && !cur[COL.RELEASE_YEAR - 1] && (!watchYear || Number(wiki.year) <= watchYear)) {
    sheet.getRange(row, COL.RELEASE_YEAR).setValue(wiki.year);
  }
  if (wiki.platforms && wiki.platforms.length > 0) {
    const curPlat = String(cur[COL.PLATFORM - 1] || '');
    const memo = String(cur[COL.MEMO - 1] || '');
    const merged = [curPlat, ...wiki.platforms].filter(Boolean).join(', ');
    sheet.getRange(row, COL.PLATFORM).setValue(normalizePlatforms_(merged, `${rawTitle} ${memo}`));
  }
  if (wiki.cast && wiki.cast.length > 0) {
    const curCast = String(cur[COL.CAST - 1] || '')
      .split(/[,、]/)
      .map(s => s.trim())
      .filter(Boolean);
    const mergedCast = [...curCast];
    wiki.cast.forEach(c => { if (c && !mergedCast.includes(c)) mergedCast.push(c); });
    sheet.getRange(row, COL.CAST).setValue(mergedCast.slice(0, MAX_CAST).join(', '));
  }
  if (wiki.staff && wiki.staff.length > 0) {
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
  // Muse補足3: 採用Wikipedia記事URLを既存関連URLへ重複排除マージ保存
  if (wiki.url && /^https?:\/\//i.test(wiki.url)) {
    const existingUrls = typeof parseRelatedUrls_ === 'function'
      ? parseRelatedUrls_(cur[COL.RELATED_URL - 1] || '')
      : String(cur[COL.RELATED_URL - 1] || '').split(/[\r\n,]+/).map(s => s.trim()).filter(Boolean);
    if (!existingUrls.includes(wiki.url)) {
      existingUrls.push(wiki.url);
      sheet.getRange(row, COL.RELATED_URL).setValue(existingUrls.join('\n'));
    }
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

function fetchWikiPageRaw_(apiBase, headers, title, lang, includeLangLinks) {
  const props = includeLangLinks
    ? 'revisions%7Cextracts%7Ccategories%7Cpageprops%7Clanglinks'
    : 'revisions%7Cextracts%7Ccategories%7Cpageprops';
  const extra = includeLangLinks ? '&lllang=ja' : '';
  const url = `${apiBase}?action=query&redirects=1&prop=${props}${extra}&rvprop=content&exintro=1&explaintext=1&cllimit=50&titles=${encodeURIComponent(title)}&format=json`;
  const res = UrlFetchApp.fetch(url, { headers, muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  const json = JSON.parse(res.getContentText());
  const query = json.query || {};
  const pages = query.pages || {};
  const page = Object.values(pages)[0];
  if (!page || page.missing !== undefined) return null;
  const categories = (page.categories || []).map(c => String(c.title || ''));
  const isDisambig = Boolean(
    (page.pageprops && page.pageprops.disambiguation !== undefined) ||
    categories.some(c => /曖昧さ回避|disambiguation/i.test(c))
  );
  const redirects = Array.isArray(query.redirects) ? query.redirects : [];
  const redirected = redirects.length > 0;
  const redirectFrom = redirected ? String(redirects[0].from || '') : '';
  const jaLangLink = Array.isArray(page.langlinks) && page.langlinks[0] ? String(page.langlinks[0]['*'] || '') : '';
  const resolvedLang = lang === 'en' ? 'en' : 'ja';
  return {
    title: String(page.title || ''),
    lang: resolvedLang,
    url: buildWikiArticleUrl_(resolvedLang, String(page.title || '')),
    extract: String(page.extract || '').trim(),
    wikitext: String((page.revisions && page.revisions[0] && page.revisions[0]['*']) || ''),
    categories,
    isDisambig,
    redirected,
    redirectFrom,
    jaLangLink,
  };
}

function isTitleRelevant_(page, cleanTitle, options) {
  if (!page || !page.title) return false;
  const opts = options || {};
  if (opts.fromRelatedUrl || page.fromRelatedUrl) return true;

  const nPage = normalizeWikiTitleForCompare_(page.title);
  const nClean = normalizeWikiTitleForCompare_(cleanTitle);
  if (!nPage || !nClean) return false;

  // 1. 正規化タイトル完全一致
  if (nPage === nClean) return true;

  // 2. 包含一致（短すぎる無関係語や別作品の誤一致を防ぐため比率ガード付）
  if (nClean.length >= 2 && nPage.includes(nClean)) {
    const ratio = nClean.length / nPage.length;
    if (ratio >= 0.45 || nClean.length >= 5) return true;
  }
  if (nPage.length >= 3 && nClean.includes(nPage)) {
    const ratio = nPage.length / nClean.length;
    if (ratio >= 0.45) return true;
  }

  // 3. Wikipedia公式リダイレクト元が検索タイトルと一致（例: g@me → ゲームの名は誘拐, すばらしき世界 → 身分帳）
  if (page.redirected && page.redirectFrom) {
    const nFrom = normalizeWikiTitleForCompare_(page.redirectFrom);
    if (nFrom && (nFrom === nClean || (nClean.length >= 3 && nFrom.includes(nClean)) || (nFrom.length >= 3 && nClean.includes(nFrom)))) {
      return true;
    }
  }

  // 4. 英語版Wikipedia経由の言語間リンク一致（例: Cars 2 → カーズ2, Mission: Impossible – Ghost Protocol → ミッション:インポッシブル/...）
  if (page.enSourceTitle) {
    const nEn = normalizeWikiTitleForCompare_(page.enSourceTitle);
    if (nEn && (nEn === nClean || nEn.includes(nClean) || nClean.includes(nEn))) {
      return true;
    }
  }

  // 5. 英語タイトルで日本語記事リード文冒頭に原題表記がある場合のみ許容（例: EX_MACHINA → エクス・マキナ）
  if (isEnglishTitle_(cleanTitle) && nClean.length >= 4) {
    const introNorm = normalizeWikiTitleForCompare_(String(page.extract || '').slice(0, 220));
    if (introNorm.includes(nClean)) return true;
  }

  return false;
}

function isValidWorkArticle_(page, cleanTitle, category, options) {
  if (!page || page.isDisambig) return false;
  if (!isTitleRelevant_(page, cleanTitle, options)) return false;
  const catsStr = (page.categories || []).join(' ');
  const intro = String(page.extract || '').slice(0, 400);
  const wt = String(page.wikitext || '');

  // 人物記事・賞記事は作品ではないため除外
  if (/(存命人物|年の生|年の没|の俳優|の女優|の声優|の小説家|の映画監督|の歌手|のミュージシャン|living people|births|deaths)/i.test(catsStr)) {
    return false;
  }
  if (/(文学賞|映画賞|音楽賞|awards)/i.test(catsStr) && !/(小説|映画|テレビドラマ|アニメ|film|television|novel)/i.test(intro)) {
    return false;
  }

  const hasDrama = /(テレビドラマ|ドラマ|連続ドラマ|配信ドラマ|放送|テレビ番組|television series|tv series|miniseries)/i.test(catsStr + ' ' + intro) || /\{\{\s*(?:基礎情報\s*テレビ番組|Infobox\s*television)/i.test(wt);
  const hasMovie = /(映画|劇場版|公開|配給|監督|\bfilm\b|\bmovie\b)/i.test(catsStr + ' ' + intro) || /\{\{\s*(?:Infobox\s*Film|Infobox\s*映画|基礎情報\s*映画)/i.test(wt);
  const hasAnime = /(アニメ|アニメーション|\banime\b)/i.test(catsStr + ' ' + intro) || /\{\{\s*Infobox\s*animanga/i.test(wt);
  const hasBook = /(小説|書籍|著書|漫画|エッセイ|ノンフィクション|文学|刊行|連載|\bnovel\b|\bbook\b|\bmanga\b)/i.test(catsStr + ' ' + intro) || /\{\{\s*(?:基礎情報\s*書籍|Infobox\s*book|Infobox\s*animanga)/i.test(wt);

  if (category === 'ドラマ') return hasDrama;
  if (category === '映画') return hasMovie;
  if (category === 'アニメ') return hasAnime;
  if (category === '本') return hasBook;
  return hasDrama || hasMovie || hasAnime || hasBook || /(ドキュメンタリー|バラエティ|舞台|音楽番組|ライブ|コンサート|出演|脚本|監督|著者)/i.test(catsStr + ' ' + intro);
}

/**
 * 3-58 対策B＋Muse補足1: 公開年・放送年の高精度抽出＆鑑賞年超過検証
 * - 映像作品（ドラマ/映画/アニメ）では原作小説・漫画の発表年を除外し、放送・公開年のみを採用
 * - 複数シリーズ/シーズンがある場合はタイトル・メモ内の年/シリーズ指定、または鑑賞年以下の直近年を優先
 * - 採用年が鑑賞年を超える場合は不採用（year: ''）とし yearWarning を付与
 */
function extractReleaseYear_(page, category, hints) {
  const h = hints || {};
  const wt = String((page && page.wikitext) || '');
  const intro = String((page && page.extract) || '');
  const cat = String(category || '').trim();
  const watchYear = parseWatchYear_(h.watchDate || '');
  const isVideo = cat === 'ドラマ' || cat === '映画' || cat === 'アニメ';
  const isBook = cat === '本';

  const candidates = [];
  const addYear = (yr, priority, source) => {
    const n = Number(yr);
    if (!n || n < 1900 || n > 2100) return;
    const existing = candidates.find(c => c.year === n);
    if (!existing) {
      candidates.push({ year: n, priority, source });
    } else if (priority > existing.priority) {
      existing.priority = priority;
      existing.source = source;
    }
  };

  // 1. Wikitext Infobox フィールドから行単位で抽出（原作・小説年と映像公開年を厳密に分離）
  const videoFieldRe = /^\s*\|\s*(?:公開|公開年|公開日|劇場公開|放送期間|放送年|初回放送|配信期間|製作年|released|first_aired|release_date)\s*=\s*(.+)$/i;
  const bookFieldRe = /^\s*\|\s*(?:発行日|出版年|発表|刊行|初版|published|release_date)\s*=\s*(.+)$/i;
  const anyYearRe = /((?:19|20)\d{2})(?:年|\b)/g;

  for (const line of wt.split('\n')) {
    if (isVideo) {
      const vm = line.match(videoFieldRe);
      if (vm) {
        const val = vm[1];
        // 原作・小説・漫画の注釈を含む同一行内の年を除外
        const cleanedVal = val.replace(/(?:原作|小説|漫画|コミック)[^|,\n]*(?:19|20)\d{2}年?/g, '');
        let ym;
        anyYearRe.lastIndex = 0;
        while ((ym = anyYearRe.exec(cleanedVal)) !== null) {
          addYear(ym[1], 100, 'infobox_video');
        }
      }
    } else if (isBook) {
      const bm = line.match(bookFieldRe);
      if (bm) {
        let ym;
        anyYearRe.lastIndex = 0;
        while ((ym = anyYearRe.exec(bm[1])) !== null) {
          addYear(ym[1], 100, 'infobox_book');
        }
      }
    } else {
      const m = line.match(videoFieldRe) || line.match(bookFieldRe);
      if (m) {
        let ym;
        anyYearRe.lastIndex = 0;
        while ((ym = anyYearRe.exec(m[1])) !== null) {
          addYear(ym[1], 90, 'infobox');
        }
      }
    }
  }

  // 2. 複数シリーズ・シーズン見出し／本文（例: ドラゴン桜 第2シリーズ 2021年, 救命病棟24時 2026年）
  if (isVideo) {
    const seriesRe = /(?:第\s*[2-9２-９]\s*(?:シリーズ|期)|シーズン\s*[2-9２-９]|Season\s*[2-9]|((?:19|20)\d{2})年版)[^\n]{0,80}?((?:19|20)\d{2})年/gi;
    let sm;
    while ((sm = seriesRe.exec(wt + '\n' + intro)) !== null) {
      if (sm[1]) addYear(sm[1], 95, 'series_heading');
      if (sm[2]) addYear(sm[2], 95, 'series_heading');
    }
    // リード文中の放送・公開年（原作年・刊行年・別年をまたぐ誤マッチを除外）
    const introVideoRe = /((?:19|20)\d{2})年(?:(?!(?:19|20)\d{2}年|刊行|出版|連載|発売)[^。\n]){0,25}?(?:公開|放送|配信|上映|アニメ化|ドラマ化|映画化)/g;
    let im;
    while ((im = introVideoRe.exec(intro)) !== null) {
      // 同一文内の直前に「原作」「小説」「漫画」がないか確認（句点。をまたぐ前文は除外）
      const prefix = intro.slice(Math.max(0, im.index - 15), im.index).split('。').pop();
      if (!/(?:原作|小説|漫画|著書)/.test(prefix)) {
        addYear(im[1], 80, 'intro_video');
      }
    }
    // 英語リード文（例: "is a 2013 American animated ... film"）
    const enVideoRe = /\b((?:19|20)\d{2})\s+(?:American|British|Japanese|Canadian|French|South Korean|animated|comedy|action|drama|science fiction|thriller|adventure|fantasy|television|TV)[^.\n]{0,40}?\b(?:film|movie|series|miniseries|anime)\b/gi;
    let em;
    while ((em = enVideoRe.exec(intro)) !== null) {
      addYear(em[1], 85, 'en_intro_video');
    }
  } else if (isBook) {
    const introBookRe = /((?:19|20)\d{2})年[^。\n]{0,25}?(?:刊行|発表|出版|連載|発売|初出)/g;
    let im;
    while ((im = introBookRe.exec(intro)) !== null) {
      addYear(im[1], 80, 'intro_book');
    }
  }

  if (candidates.length === 0) {
    return { year: '', rawExtractedYear: '', yearWarning: '' };
  }

  // 3. レコードのタイトル・メモ・追加ヒントに明示的な年がある場合は優先マッチ
  const hintText = `${h.rawTitle || ''} ${h.memo || ''} ${h.extraHint || ''}`;
  const explicitYears = [];
  const expRe = /\b((?:19|20)\d{2})\b/g;
  let exm;
  while ((exm = expRe.exec(hintText)) !== null) {
    explicitYears.push(Number(exm[1]));
  }
  const explicitMatch = candidates.find(c => explicitYears.includes(c.year) && (!watchYear || c.year <= watchYear));
  if (explicitMatch) {
    return { year: explicitMatch.year, rawExtractedYear: explicitMatch.year, yearWarning: '' };
  }

  // 4. 鑑賞年との整合検証（Muse補足1）
  if (watchYear) {
    const validForWatch = candidates.filter(c => c.year <= watchYear);
    if (validForWatch.length === 0) {
      // すべての候補年が鑑賞年を超えている → 不採用＋警告
      const earliest = candidates.slice().sort((a, b) => a.year - b.year)[0];
      return {
        year: '',
        rawExtractedYear: earliest.year,
        yearWarning: `抽出年(${earliest.year})が鑑賞年(${watchYear})を超えているため不採用`,
      };
    }
    // 複数シリーズ（例: ドラゴン桜 2005 & 2021、鑑賞2021）では鑑賞年以下の直近年を優先
    // ただし単作（映画等）で高優先度infobox年が1つだけ有効ならそれを採用
    const highPri = validForWatch.filter(c => c.priority >= 80);
    const pool = highPri.length > 0 ? highPri : validForWatch;
    if (cat === 'ドラマ' && pool.length > 1) {
      pool.sort((a, b) => b.year - a.year);
    } else {
      pool.sort((a, b) => b.priority - a.priority || a.year - b.year);
    }
    return { year: pool[0].year, rawExtractedYear: pool[0].year, yearWarning: '' };
  }

  // 鑑賞年未設定時は最高優先度・最古年（単作の初公開年）を採用
  candidates.sort((a, b) => b.priority - a.priority || a.year - b.year);
  return { year: candidates[0].year, rawExtractedYear: candidates[0].year, yearWarning: '' };
}

function extractMemoHintKeywords_(memo) {
  const text = String(memo || '').replace(/https?:\/\/\S+/g, ' ').trim();
  if (!text) return [];
  const stopWords = new Set([
    '映画', 'ドラマ', 'アニメ', '小説', '漫画', '作品', '視聴', '鑑賞', '面白い', '面白かった',
    '最高', '感動', 'おすすめ', 'シリーズ', 'シーズン', '最終回', '原作', '主演', '監督',
    '脚本', '俳優', '女優', 'テレビ', 'ネットフリックス', 'アマプラ', '配信', '劇場', '最後',
    'ストーリー', 'キャラクター', '展開', '結末', '感想', 'メモ', 'とても', 'かなり', 'すごく',
  ]);
  const tokens = [];
  const seen = new Set();
  const re = /[一-龠々]{2,8}|[ァ-ヶー]{3,12}|[A-Za-z]{4,16}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const tok = m[0].trim();
    if (!tok || stopWords.has(tok) || seen.has(tok)) continue;
    seen.add(tok);
    tokens.push(tok);
    if (tokens.length >= 12) break;
  }
  return tokens;
}

const WIKI_NON_PERSON_STOPWORDS_ = new Set([
  'ファン', 'sns', 'ボイスレコーダー', 'ドラマ', '映画', 'アニメ', '小説', '漫画', 'マンガ', '本', '書籍', '文庫',
  '原作', '監督', '脚本', '演出', '主演', '出演', '出演者', '音楽', '制作', '製作', '配給', '配信', '放送', '劇場',
  '映画館', 'テレビ', 'ラジオ', 'ビデオ', 'ムービー', 'シリーズ', 'シーズン', 'チーム', 'スタッフ', 'キャスト',
  'その他', '不明', '公式', '動画', '写真', '感想', 'メモ', '作品', '主人公', '登場人物', '物語', 'ストーリー',
  'netflix', 'amazon', 'prime', 'hulu', 'disney', 'nhk', 'tbs', 'wowow', 'u-next', 'youtube', 'abema', 'tver',
  'フジテレビ', '日本テレビ', 'テレビ朝日', 'テレビ東京', 'アマプラ', 'ネットフリックス',
]);

/**
 * 3-59 辞書衛生ガード（Muse補足1）:
 * 一般語・非人名・短すぎる英字のみトークンを辞書から除外する
 */
function isValidPersonDictToken_(raw) {
  const s = String(raw || '').trim();
  if (!s || s.length < 2 || s.length > 20) return false;
  if (WIKI_NON_PERSON_STOPWORDS_.has(s.toLowerCase())) return false;
  // 数字・記号のみ、URL断片、4文字以下の英数字のみ（SNS/NHK/AI等）は除外
  if (/^[\d\s\-_./:：・、,()（）]+$/.test(s)) return false;
  if (/https?:\/\//i.test(s)) return false;
  if (/^[A-Za-z0-9._\-]{1,4}$/.test(s)) return false;
  // 一般的な機材・メディア・属性カタカナ語を除外
  if (/(?:レコーダー|カメラ|スマホ|アプリ|サイト|ブログ|チャンネル|テレビ|ラジオ|ビデオ|ムービー|サービス|システム)$/.test(s)) {
    return false;
  }
  return true;
}

/**
 * 3-59 要件2＋Muse補足1:
 * 感想・メモ本文からDB既登録の人名ヒントを最大2名抽出する。
 * - スタッフ（原作・監督・脚本）由来を優先し、出演者由来は補助
 * - 最長一致優先、部分一致の重複を防止
 */
function extractHintPeopleFromMemo_(memo, personDict, maxCount) {
  const text = String(memo || '').replace(/https?:\/\/\S+/g, ' ').trim();
  if (!text || !personDict) return [];
  const limit = maxCount || 2;
  const textNoSpace = text.replace(/[\s　]+/g, '');

  const prepare = (arr) => {
    const uniq = [];
    const seen = new Set();
    for (const item of (Array.isArray(arr) ? arr : [])) {
      const tok = String(item || '').trim();
      if (!isValidPersonDictToken_(tok)) continue;
      const key = tok.replace(/[\s　]+/g, '').toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      uniq.push(tok);
    }
    // 最長一致優先
    uniq.sort((a, b) => b.length - a.length);
    return uniq;
  };

  const staffList = prepare(personDict.staff);
  const castList = prepare(personDict.cast);
  const matched = [];
  const matchedNorms = [];

  const scan = (list) => {
    for (const name of list) {
      if (matched.length >= limit) break;
      const norm = name.replace(/[\s　]+/g, '');
      if (!norm) continue;
      // 既に採用したより長い名前の部分文字列ならスキップ
      if (matchedNorms.some(m => m.includes(norm))) continue;
      const isAscii = /^[A-Za-z\s.'\-]+$/.test(name);
      let hit = false;
      if (isAscii) {
        const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        hit = re.test(text);
      } else {
        hit = text.includes(name) || (norm.length >= 3 && textNoSpace.includes(norm));
      }
      if (hit) {
        matched.push(name);
        matchedNorms.push(norm);
      }
    }
  };

  // スタッフ優先 → 出演者補助
  scan(staffList);
  if (matched.length < limit) scan(castList);
  return matched;
}

/**
 * 3-59 要件1:
 * 曖昧さ回避ページから「タイトル (〇〇)」形式の作品記事リンクを上限付き（最大15件）で収集する
 */
function fetchDisambiguationLinks_(apiBase, headers, pageTitle, cleanTitle, limit) {
  const maxLinks = limit || 15;
  const url = `${apiBase}?action=query&redirects=1&prop=links&plnamespace=0&pllimit=100&titles=${encodeURIComponent(pageTitle)}&format=json`;
  try {
    const res = UrlFetchApp.fetch(url, { headers, muteHttpExceptions: true });
    if (res.getResponseCode() !== 200) return [];
    const json = JSON.parse(res.getContentText());
    const pages = (json.query && json.query.pages) || {};
    const page = Object.values(pages)[0];
    if (!page || page.missing !== undefined || !Array.isArray(page.links)) return [];

    const nClean = normalizeWikiTitleForCompare_(cleanTitle);
    const out = [];
    const seen = new Set();
    for (const lk of page.links) {
      const t = String((lk && lk.title) || '').trim();
      if (!t || seen.has(t) || /曖昧さ回避|disambiguation/i.test(t)) continue;
      const hasParen = /[（(][^）)]+[）)]$/.test(t);
      const startsWithTitle = t.startsWith(cleanTitle + ' (') || t.startsWith(cleanTitle + '（');
      const nLink = normalizeWikiTitleForCompare_(t);
      if (startsWithTitle || (hasParen && nLink && nClean && nLink === nClean)) {
        seen.add(t);
        out.push(t);
        if (out.length >= maxLinks) break;
      }
    }
    return out;
  } catch (_) {
    return [];
  }
}

function scoreWikiCandidate_(page, cleanTitle, category, hints, yearInfo) {
  const h = hints || {};
  let score = 0;
  const matchedHints = [];

  if (page.fromRelatedUrl) {
    score += 100;
    matchedHints.push('関連URL一致');
  }

  const nPage = normalizeWikiTitleForCompare_(page.title);
  const nClean = normalizeWikiTitleForCompare_(cleanTitle);
  if (nPage && nClean && nPage === nClean) {
    score += 40;
    matchedHints.push('タイトル完全一致');
  } else if (page.redirected && page.redirectFrom && normalizeWikiTitleForCompare_(page.redirectFrom) === nClean) {
    score += 35;
    matchedHints.push(`リダイレクト一致 (${page.redirectFrom})`);
  } else if (page.enSourceTitle) {
    score += 30;
    matchedHints.push(`英語原題一致 (${page.enSourceTitle})`);
  } else if (nPage && nClean && (nPage.includes(nClean) || nClean.includes(nPage))) {
    score += 20;
  }

  // 区分サフィックス一致ボーナス
  const catSuffixReMap = {
    'ドラマ': /\((?:テレビドラマ|ドラマ)\)/,
    '映画': /\(映画\)/,
    'アニメ': /\(アニメ\)/,
    '本': /\((?:小説|書籍|漫画)\)/,
  };
  if (catSuffixReMap[category] && catSuffixReMap[category].test(page.title)) {
    score += 25;
    matchedHints.push(`区分一致 (${category})`);
  }

  const haystack = `${page.title}\n${page.extract || ''}\n${page.wikitext || ''}\n${(page.categories || []).join(' ')}`;
  const hayNoSpace = haystack.replace(/[\s　]+/g, '').toLowerCase();

  // 追加ヒント（モーダル内ヒント追記・再検索：3-59 要件3）
  const extraHintTokens = String(h.extraHint || '').split(/[\s　,、]+/).map(s => s.trim()).filter(s => s.length >= 2);
  let extraHits = 0;
  for (const eh of extraHintTokens) {
    if (hayNoSpace.includes(eh.replace(/[\s　]+/g, '').toLowerCase())) {
      score += 30;
      extraHits++;
      if (extraHits <= 2) matchedHints.push(`ヒント一致: ${eh}`);
    }
  }

  // 監督・スタッフヒント
  const staffTokens = String(h.staff || '').split(/[,、\n]+/).map(s => s.trim()).filter(s => s.length >= 2);
  let staffHits = 0;
  for (const st of staffTokens) {
    if (hayNoSpace.includes(st.replace(/[\s　]+/g, '').toLowerCase())) {
      score += 25;
      staffHits++;
      if (staffHits <= 2) matchedHints.push(`スタッフ一致: ${st}`);
    }
  }

  // メモ本文から自動抽出した既登録人名ヒント（3-59 要件2）
  const extractedPeople = Array.isArray(h.extractedPeople) ? h.extractedPeople : [];
  let epHits = 0;
  for (const ep of extractedPeople) {
    if (staffTokens.includes(ep)) continue;
    if (hayNoSpace.includes(ep.replace(/[\s　]+/g, '').toLowerCase())) {
      score += 25;
      epHits++;
      if (epHits <= 2) matchedHints.push(`メモ人名一致: ${ep}`);
    }
  }

  // 出演者ヒント
  const castTokens = String(h.cast || '').split(/[,、\n]+/).map(s => s.trim()).filter(s => s.length >= 2);
  let castHits = 0;
  for (const ct of castTokens) {
    if (hayNoSpace.includes(ct.replace(/[\s　]+/g, '').toLowerCase())) {
      score += 15;
      castHits++;
      if (castHits <= 2) matchedHints.push(`出演者一致: ${ct}`);
    }
  }

  // 感想・メモ本文ヒント
  const memoKeywords = extractMemoHintKeywords_(h.memo || '');
  let memoHits = 0;
  for (const kw of memoKeywords) {
    if (haystack.includes(kw)) {
      score += 8;
      memoHits++;
      if (memoHits <= 2) matchedHints.push(`メモ一致: ${kw}`);
      if (memoHits >= 4) break;
    }
  }

  // 公開年・鑑賞年の整合性
  const watchYear = parseWatchYear_(h.watchDate || '');
  if (yearInfo && yearInfo.yearWarning) {
    score -= 25;
  } else if (yearInfo && yearInfo.year && watchYear && Number(yearInfo.year) <= watchYear) {
    score += 10;
  }

  return { score, matchedHints };
}

function parseWikiPageMetadata_(page, cleanTitle, category, hints) {
  const wikitext = String(page.wikitext || '');
  const summary = String(page.extract || '').split('\n')[0].slice(0, 400);
  const yearInfo = extractReleaseYear_(page, category, hints);

  // プラットフォーム・放送局抽出
  const platforms = [];
  for (const [canonical, aliases] of Object.entries(PLATFORM_TARGETS)) {
    const allNames = [canonical, ...aliases];
    const platRegex = new RegExp(`\\|\\s*(?:放送局|製作局|配給|配信|放送枠|network|distributor)\\s*=.*?(?:${allNames.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'i');
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
    if (/==\s*(?:キャスト|出演者?|登場人物|声の出演|Cast)\s*==/i.test(line)) {
      inCast = true;
      continue;
    } else if (/==\s*[^=]+\s*==/.test(line)) {
      inCast = false;
    }

    const isStaffLine = /\|\s*(?:監督|脚本|原作|演出|プロデューサー|音楽|著者|作者|director|writer|author|producer|music)\s*=/i.test(line);
    const isCastLine = inCast || /\|\s*(?:出演者?|キャスト|主演|声の出演|starring)\s*=/i.test(line);
    if (!isStaffLine && !isCastLine) continue;

    const links = [...line.matchAll(/\[\[([^\]]+)\]\]/g)];
    for (const m of links) {
      const name = m[1].split('|')[0].trim().replace(/\s*\(.*?\)/g, '');
      if (!name || name.includes(':') || name.includes('年') || skipWords.has(name)) continue;
      if (isStaffLine) {
        if (!staff.includes(name)) staff.push(name);
      } else {
        if (!cast.includes(name) && cast.length < MAX_CAST) cast.push(name);
      }
    }
  }

  const scored = scoreWikiCandidate_(page, cleanTitle, category, hints, yearInfo);

  return {
    pageTitle: page.title,
    title: page.title,
    lang: page.lang || 'ja',
    url: page.url || buildWikiArticleUrl_(page.lang || 'ja', page.title),
    year: yearInfo.year,
    rawExtractedYear: yearInfo.rawExtractedYear,
    yearWarning: yearInfo.yearWarning,
    platforms,
    cast,
    staff: staff.slice(0, 10),
    summary,
    extractSnippet: summary.slice(0, 160),
    score: scored.score,
    matchedHints: scored.matchedHints,
    fromRelatedUrl: Boolean(page.fromRelatedUrl),
    redirectedFrom: page.redirectFrom || '',
    enSourceTitle: page.enSourceTitle || '',
  };
}

/**
 * 3-58 / 3-59: Wikipedia 上位候補（最大5件）をスコアリング・ランク付けして返す
 * - Phase 1: 関連URL・extraHint・人名ヒント（既存スタッフ/出演者＋メモ内既登録人名）・区分サフィックスの直接取得
 * - 早期終了: Phase 1 で高スコア候補（>= 65 かつ年ズレ警告なし）が得られた場合は追加検索・曖昧さ回避展開を打ち切り
 * - Phase 2: 追加APIコール上限（MAX_EXTRA_API_CALLS=6）内で補助 intitle: 検索・英語Wikipedia・曖昧さ回避ページ展開を実施
 */
function searchWikipediaCandidates_(title, category, hints) {
  const jaApi = 'https://ja.wikipedia.org/w/api.php';
  const enApi = 'https://en.wikipedia.org/w/api.php';
  const headers = { 'User-Agent': WIKI_USER_AGENT };
  const h = hints || {};
  const rawTitle = h.rawTitle || title;
  const cleanTitle = cleanWorkTitle_(title);
  const cat = String(category || '').trim();
  if (!cleanTitle) return [];

  const MAX_EXTRA_API_CALLS = Number(h.maxExtraApiCalls) > 0 ? Number(h.maxExtraApiCalls) : 6;
  const HIGH_CONFIDENCE_SCORE = 65;

  const suffixMap = {
    'ドラマ': [' (テレビドラマ)', ' (ドラマ)'],
    '映画': [' (映画)'],
    'アニメ': [' (アニメ)'],
    '本': [' (小説)', ' (書籍)', ' (漫画)'],
  };

  // メモ本文からDB既登録人名ヒントを自動抽出（最大2名・スタッフ優先・辞書衛生ガード付）
  const extractedPeople = extractHintPeopleFromMemo_(h.memo || '', h.personDict || null, 2);
  const extraHintTokens = String(h.extraHint || '').split(/[\s　,、]+/).map(s => s.trim()).filter(s => s.length >= 2);
  const staffList = String(h.staff || '').split(/[,、\n]+/).map(s => s.trim()).filter(Boolean);
  const castList = String(h.cast || '').split(/[,、\n]+/).map(s => s.trim()).filter(Boolean);

  // 候補収集に使うヒント人名（最大2名: 既存スタッフ優先 → メモ抽出人名 → 既存出演者補助）
  const queryPeople = [];
  const addQueryPerson = (p) => {
    if (!p || queryPeople.includes(p) || queryPeople.length >= 2) return;
    queryPeople.push(p);
  };
  staffList.forEach(addQueryPerson);
  extractedPeople.forEach(addQueryPerson);
  if (queryPeople.length < 2) castList.forEach(addQueryPerson);

  const enrichedHints = Object.assign({}, h, { rawTitle, extractedPeople });

  const directQueue = [];
  const seenQuery = new Set();
  const pushTo = (queue, lang, t, extra) => {
    const s = String(t || '').trim();
    if (!s) return;
    const key = `${lang}:${s}`;
    if (seenQuery.has(key)) return;
    seenQuery.add(key);
    queue.push(Object.assign({ lang, title: s, fromRelatedUrl: false, enSourceTitle: '' }, extra || {}));
  };

  // 0. 関連URLに wikipedia.org/wiki/... がある場合は最優先候補として直接追加（対策B）
  const wikiUrls = extractWikipediaUrlsFromRelated_(h.relatedUrl || '');
  wikiUrls.forEach(wu => pushTo(directQueue, wu.lang, wu.title, { fromRelatedUrl: true }));

  // 1a. extraHint 付き直接候補（3-59 要件3）
  for (const eh of extraHintTokens.slice(0, 2)) {
    if (/^(?:19|20)\d{2}$/.test(eh)) continue;
    pushTo(directQueue, 'ja', `${cleanTitle} (${eh})`);
    if (cat === '本') pushTo(directQueue, 'ja', `${cleanTitle} (${eh}の小説)`);
  }

  // 1b. 人名ヒント付き直接候補（3-59 要件2: 既存スタッフ/メモ抽出人名/出演者、最大2名）
  for (const person of queryPeople) {
    pushTo(directQueue, 'ja', `${cleanTitle} (${person})`);
    if (cat === '本') pushTo(directQueue, 'ja', `${cleanTitle} (${person}の小説)`);
  }

  // 1c. 完全一致 → 区分サフィックス一致（対策A）
  pushTo(directQueue, 'ja', cleanTitle);
  (suffixMap[cat] || []).forEach(suf => pushTo(directQueue, 'ja', cleanTitle + suf));

  // 括弧副題付き（例: 万事快調〈オール・グリーンズ〉）のコアタイトルも候補化
  const coreBeforeBracket = cleanTitle.replace(/[〈《（(][^〉》）)]+[〉》）)]/g, '').trim();
  if (coreBeforeBracket && coreBeforeBracket !== cleanTitle && coreBeforeBracket.length >= 2) {
    pushTo(directQueue, 'ja', coreBeforeBracket);
    (suffixMap[cat] || []).forEach(suf => pushTo(directQueue, 'ja', coreBeforeBracket + suf));
  }

  // 英語タイトルの場合は直接取得も Phase 1 へ含める
  if (isEnglishTitle_(cleanTitle)) {
    pushTo(directQueue, 'en', cleanTitle);
  }

  const seenResolved = new Set();
  const scoredResults = [];
  let disambigPageTitle = '';

  const evaluateCandidate = (cand) => {
    const isEn = cand.lang === 'en';
    const apiBase = isEn ? enApi : jaApi;
    let p = fetchWikiPageRaw_(apiBase, headers, cand.title, cand.lang, isEn);
    if (!p) return null;

    if (!isEn && p.isDisambig && !disambigPageTitle) {
      disambigPageTitle = p.title;
    }

    // 英語版でヒットし日本語版 langlink がある場合は日本語版を優先取得
    if (isEn && p.jaLangLink) {
      const jaPage = fetchWikiPageRaw_(jaApi, headers, p.jaLangLink, 'ja', false);
      if (jaPage) {
        jaPage.enSourceTitle = p.title;
        jaPage.fromRelatedUrl = cand.fromRelatedUrl;
        p = jaPage;
      }
    } else {
      p.fromRelatedUrl = cand.fromRelatedUrl;
      if (cand.enSourceTitle) p.enSourceTitle = cand.enSourceTitle;
    }

    const resolvedKey = `${p.lang}:${p.title}`;
    if (seenResolved.has(resolvedKey)) return null;
    seenResolved.add(resolvedKey);

    if (!isValidWorkArticle_(p, cleanTitle, cat, { fromRelatedUrl: p.fromRelatedUrl })) return null;

    const meta = parseWikiPageMetadata_(p, cleanTitle, cat, enrichedHints);
    scoredResults.push(meta);
    return meta;
  };

  // Phase 1: 直接取得を評価し、高確信度ヒットがあれば早期終了（Muse補足2）
  let earlyExited = false;
  for (const cand of directQueue.slice(0, 10)) {
    const meta = evaluateCandidate(cand);
    if (meta && meta.score >= HIGH_CONFIDENCE_SCORE && !meta.yearWarning) {
      earlyExited = true;
      break;
    }
  }

  // Phase 2: 早期終了しなかった場合のみ追加検索・曖昧さ回避展開を上限内で実行
  if (!earlyExited) {
    let extraApiCalls = 0;
    const extraQueue = [];

    const runIntitleSearch = (apiBase, lang, queryStr, srlimit) => {
      if (extraApiCalls >= MAX_EXTRA_API_CALLS) return;
      extraApiCalls++;
      try {
        const searchUrl = `${apiBase}?action=query&list=search&srsearch=${encodeURIComponent(queryStr)}&srlimit=${srlimit}&format=json`;
        const sRes = UrlFetchApp.fetch(searchUrl, { headers, muteHttpExceptions: true });
        if (sRes.getResponseCode() === 200) {
          const sJson = JSON.parse(sRes.getContentText());
          ((sJson.query && sJson.query.search) || []).forEach(r => pushTo(extraQueue, lang, r.title));
        }
      } catch (_) {}
    };

    // 2a. extraHint 付き intitle: 補助検索
    if (extraHintTokens.length > 0 && extraApiCalls < MAX_EXTRA_API_CALLS) {
      runIntitleSearch(jaApi, 'ja', `intitle:"${cleanTitle}" ${extraHintTokens.slice(0, 2).join(' ')}`, 5);
    }

    // 2b. 人名ヒント付き intitle: 補助検索（最大1回）
    if (queryPeople.length > 0 && extraApiCalls < MAX_EXTRA_API_CALLS) {
      runIntitleSearch(jaApi, 'ja', `intitle:"${cleanTitle}" ${queryPeople[0]}`, 5);
    }

    // 2c. 通常の intitle: 検索
    if (extraApiCalls < MAX_EXTRA_API_CALLS) {
      runIntitleSearch(jaApi, 'ja', `intitle:"${cleanTitle}"`, 6);
    }

    // 2d. 英語タイトルの場合は英語版 intitle: 検索
    if (isEnglishTitle_(cleanTitle) && extraApiCalls < MAX_EXTRA_API_CALLS) {
      runIntitleSearch(enApi, 'en', `intitle:"${cleanTitle}"`, 4);
    }

    // 2e. 曖昧さ回避ページ展開（3-59 要件1: 最大15件リンク収集、追加コール上限内）
    if (extraApiCalls < MAX_EXTRA_API_CALLS) {
      const disambigTarget = disambigPageTitle || `${cleanTitle} (曖昧さ回避)`;
      extraApiCalls++;
      const disambigLinks = fetchDisambiguationLinks_(jaApi, headers, disambigTarget, cleanTitle, 15);
      disambigLinks.forEach(lt => pushTo(extraQueue, 'ja', lt));
    }

    // extraQueue を評価（追加フェッチも全体上限に収まるよう最大15件まで、高スコア到達で早期終了）
    for (const cand of extraQueue.slice(0, 15)) {
      const meta = evaluateCandidate(cand);
      if (meta && meta.score >= HIGH_CONFIDENCE_SCORE && !meta.yearWarning && scoredResults.length >= 2) {
        break;
      }
    }
  }

  scoredResults.sort((a, b) => b.score - a.score);
  return scoredResults.slice(0, 5);
}

function fetchWikipediaInfo_(title, category, hints) {
  const candidates = searchWikipediaCandidates_(title, category, hints);
  if (!candidates || candidates.length === 0) return null;
  const top = candidates[0];
  if (top.score < 20) return null;
  return top;
}

// ============================================================================
// Web アプリ (HTMLService) エンドポイント & API
// ============================================================================

