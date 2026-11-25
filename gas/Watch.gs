function getWatchEntries() {
  return withSheetRetry_(() => {
    const sheet = getSheetByNameOrThrow_(WATCH_SS_ID, SHEET_NAME);
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
  }, { label: 'getWatchEntries' });
}

function queryWatchEntries_(params) {
  const all = getWatchEntries();
  const totalCount = all.length;
  const q = String(params.q || '').trim().toLowerCase();
  const ym = String(params.ym || '').trim();
  const status = String(params.status || '').trim();
  const category = String(params.category || '').trim();
  const platform = String(params.platform || '').trim();
  const sort = String(params.sort || 'desc').trim();
  const limit = Number(params.limit || 0);
  const offset = Math.max(0, Number(params.offset || 0));
  const includeInProgress = String(params.includeInProgress || '') === '1';
  const includeMeta = String(params.includeMeta || '') === '1';

  let castTags, staffTags, platforms;
  if (includeMeta) {
    const castMap = {};
    const staffMap = {};
    const platSet = {};
    all.forEach(item => {
      if (item.cast) {
        const seen = {};
        item.cast.split(/[,、]/).forEach(s => {
          const t = s.trim();
          if (t && !seen[t]) { seen[t] = true; castMap[t] = (castMap[t] || 0) + 1; }
        });
      }
      if (item.staff) {
        const seen = {};
        item.staff.split(/[,、]/).forEach(s => {
          const t = s.trim();
          if (t && !seen[t]) { seen[t] = true; staffMap[t] = (staffMap[t] || 0) + 1; }
        });
      }
      if (item.platform) {
        item.platform.split(',').forEach(s => {
          const t = s.trim();
          if (t) platSet[t] = true;
        });
      }
    });
    castTags = Object.keys(castMap)
      .map(name => ({ name, count: castMap[name] }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    staffTags = Object.keys(staffMap)
      .map(name => ({ name, count: staffMap[name] }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    platforms = Object.keys(platSet).sort();
  }

  let filtered = all.filter(item => {
    if (status && status !== 'ALL' && item.status !== status) return false;
    if (category && category !== 'ALL' && item.category !== category) return false;
    if (platform && platform !== 'ALL' && !String(item.platform || '').includes(platform)) return false;
    if (ym && !String(item.watchDate || '').startsWith(ym)) return false;
    if (q) {
      const hay = `${item.title} ${item.cast} ${item.staff} ${item.platform} ${item.memo} ${item.summary}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (sort === 'asc') {
    filtered.sort((a, b) => {
      const da = a.watchDate || '9999-99-99';
      const db = b.watchDate || '9999-99-99';
      return da.localeCompare(db) || (Number(a.id || 0) - Number(b.id || 0));
    });
  } else if (sort === 'rating_desc') {
    filtered.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || String(b.watchDate || '').localeCompare(String(a.watchDate || '')));
  } else {
    filtered.sort((a, b) => String(b.watchDate || '').localeCompare(String(a.watchDate || '')) || (Number(b.id || 0) - Number(a.id || 0)));
  }

  const filteredCount = filtered.length;
  let entries = limit > 0 ? filtered.slice(offset, offset + limit) : filtered;
  const hasMore = limit > 0 && (offset + limit < filteredCount);

  if (includeInProgress && offset === 0 && limit > 0) {
    const rowSet = {};
    entries.forEach(e => { rowSet[e.row] = true; });
    all.forEach(item => {
      if (item.status === '進行中' && !rowSet[item.row]) {
        entries.push(item);
        rowSet[item.row] = true;
      }
    });
  }

  const yearCounts = buildYearCounts_(all, 'watchDate');
  const out = { ok: true, count: entries.length, totalCount, filteredCount, hasMore, yearCounts, entries };
  if (includeMeta) {
    out.castTags = castTags;
    out.staffTags = staffTags;
    out.platforms = platforms;
  }
  return out;
}


function consumeBalancedUrlGas_(str, startIdx, isMarkdown, isAngle) {
  let i = startIdx;
  let depth = 0;
  const len = str.length;
  while (i < len) {
    const ch = str[i];
    if (isAngle) {
      if (ch === '>' || /\s/.test(ch)) break;
      i++;
      continue;
    }
    if (/\s/.test(ch)) break;
    if (!isMarkdown && /[<>"'「」『』【】（）、。]/.test(ch)) break;
    if (ch === '(') {
      depth++;
      i++;
      continue;
    }
    if (ch === ')') {
      if (depth > 0) {
        depth--;
        i++;
        continue;
      }
      break;
    }
    i++;
  }
  let url = str.slice(startIdx, i);
  let trail = '';
  if (!isMarkdown && !isAngle) {
    while (url.length > 0 && /[.,;:!?、。・）)」』】]$/.test(url)) {
      const last = url[url.length - 1];
      if (last === ')') {
        const opens = (url.match(/\(/g) || []).length;
        const closes = (url.match(/\)/g) || []).length;
        if (closes <= opens) break;
      }
      trail = last + trail;
      url = url.slice(0, -1);
    }
  }
  let closed = true;
  let nextIdx = i;
  if (isMarkdown) {
    if (isAngle) {
      if (str[i] === '>' && str[i + 1] === ')') {
        closed = true;
        nextIdx = i + 2;
      } else if (str[i] === ')') {
        closed = true;
        nextIdx = i + 1;
      } else {
        closed = false;
        nextIdx = i;
      }
    } else {
      closed = str[i] === ')';
      nextIdx = closed ? i + 1 : i;
    }
  } else if (isAngle) {
    closed = str[i] === '>';
    nextIdx = closed ? i + 1 : i;
  }
  return { url, nextIdx, trail, closed };
}

function parseRelatedUrls_(rawUrl) {
  const out = [];
  const seen = new Set();
  String(rawUrl || '')
    .split(/[\r\n,]+/)
    .map(s => s.trim().replace(/\\_/g, '_'))
    .filter(s => /^https?:\/\//i.test(s))
    .forEach(u => {
      if (!seen.has(u)) {
        seen.add(u);
        out.push(u);
      }
    });
  return out;
}

/**
 * 鑑賞記録のメモ本文から URL（Markdownリンク・<URL>・\[text\](URL)・裸URL）を抽出して
 * relatedUrl へ重複排除マージし、メモ本文からは日本語を壊さずに URL を除去する（3-54）。
 */
function extractUrlsFromWatchMemo_(rawMemo, existingRelatedUrl) {
  const existingUrls = parseRelatedUrls_(existingRelatedUrl);
  const mergedSet = new Set(existingUrls);
  const mergedUrls = existingUrls.slice();
  const extractedUrls = [];

  const addUrl = (u) => {
    const clean = String(u || '').replace(/\\_/g, '_').trim();
    if (!/^https?:\/\//i.test(clean)) return;
    extractedUrls.push(clean);
    if (!mergedSet.has(clean)) {
      mergedSet.add(clean);
      mergedUrls.push(clean);
    }
  };

  const src = String(rawMemo === null || rawMemo === undefined ? '' : rawMemo).replace(/\r\n?/g, '\n');
  const lines = src.split('\n');
  const outLines = [];
  let memoChanged = false;

  // Markdownリンク（\[...\]含む）、山括弧<URL>、裸URLの開始位置を検出
  const tokenRe = /\\?\[([^\]]*?)\\?\]\(\s*(<)?(https?:\/\/)|<(https?:\/\/)|https?:\/\//g;

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    tokenRe.lastIndex = 0;
    let rebuilt = '';
    let nonLinkText = '';
    let lastIdx = 0;
    let foundOnLine = false;
    let m;

    while ((m = tokenRe.exec(line)) !== null) {
      if (m.index < lastIdx) continue;
      const before = line.slice(lastIdx, m.index);
      rebuilt += before;
      nonLinkText += before;

      if (m[1] !== undefined) {
        // Markdownリンク: [label](URL) or [label](<URL>) or \[label\](URL)
        const label = m[1].replace(/\\([[\]_])/g, '$1').trim();
        const isAngle = Boolean(m[2]);
        const urlStart = m.index + m[0].length - m[3].length;
        const res = consumeBalancedUrlGas_(line, urlStart, true, isAngle);
        if (res.closed && res.url) {
          addUrl(res.url);
          foundOnLine = true;
          // 表示テキストがURLそのものでなければ文中保持用に残す
          const isLabelUrl = /^https?:\/\//i.test(label);
          if (label && !isLabelUrl) {
            rebuilt += label;
          }
          lastIdx = res.nextIdx;
          tokenRe.lastIndex = lastIdx;
        } else {
          rebuilt += m[0];
          nonLinkText += m[0];
          lastIdx = tokenRe.lastIndex;
        }
      } else if (m[4] !== undefined) {
        // 山括弧 <https://...>
        const urlStart = m.index + 1;
        const res = consumeBalancedUrlGas_(line, urlStart, false, true);
        if (res.closed && res.url) {
          addUrl(res.url);
          foundOnLine = true;
          lastIdx = res.nextIdx;
          tokenRe.lastIndex = lastIdx;
        } else {
          rebuilt += m[0];
          nonLinkText += m[0];
          lastIdx = tokenRe.lastIndex;
        }
      } else {
        // 裸URL
        const res = consumeBalancedUrlGas_(line, m.index, false, false);
        if (res.url) {
          addUrl(res.url);
          foundOnLine = true;
          rebuilt += res.trail;
          nonLinkText += res.trail;
          lastIdx = res.nextIdx;
          tokenRe.lastIndex = lastIdx;
        } else {
          rebuilt += m[0];
          nonLinkText += m[0];
          lastIdx = tokenRe.lastIndex;
        }
      }
    }

    if (!foundOnLine) {
      outLines.push(line);
      continue;
    }

    memoChanged = true;
    const tail = line.slice(lastIdx);
    rebuilt += tail;
    nonLinkText += tail;

    // 独立行のリンク（リンク/URL以外の実質テキストが無い行）は行ごと削除
    const residual = nonLinkText.replace(/^[\s　・\-*•:：]+|[\s　:：]+$/g, '');
    if (!residual) {
      continue;
    }
    const cleanedLine = rebuilt.replace(/[ \t]{2,}/g, ' ').replace(/[ \t]+$/g, '');
    outLines.push(cleanedLine);
  }

  const cleanedMemo = memoChanged
    ? outLines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
    : src;
  const mergedRelatedUrl = mergedUrls.join('\n');
  const relatedChanged = mergedRelatedUrl !== String(existingRelatedUrl || '').trim();

  return {
    memo: cleanedMemo,
    relatedUrl: mergedRelatedUrl,
    extractedUrls,
    changed: memoChanged || relatedChanged,
  };
}

function addWatchEntry(payload) {
  const ss = SpreadsheetApp.openById(WATCH_SS_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();
  const nextId = lastRow >= 2 ? Number(sheet.getRange(lastRow, COL.ID).getValue() || lastRow - 1) + 1 : 1;

  const title = sanitizeHtmlText_(payload.title || '');
  const sanitizedMemo = sanitizeHtmlText_(payload.memo || '');
  const urlMigrated = extractUrlsFromWatchMemo_(sanitizedMemo, payload.relatedUrl || '');
  const memo = urlMigrated.memo;
  const relatedUrl = urlMigrated.relatedUrl;
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
    payload.releaseYear || '',
    sanitizeHtmlText_(payload.cast || ''),
    sanitizeHtmlText_(payload.staff || ''),
    sanitizeHtmlText_(payload.summary || ''),
    memo,
    relatedUrl,
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
  const res = withSheetRetry_(() => {
    const sheet = getSheetByNameOrThrow_(WATCH_SS_ID, SHEET_NAME);
    const row = resolveRowByIdOrIndex_(sheet, COL.ID, payload.row, payload.id);
    if (row < 2) return { notFound: true };

    if (payload.status !== undefined) {
      sheet.getRange(row, COL.STATUS).setValue(payload.status);
      if (payload.status === '完了' && !sheet.getRange(row, COL.WATCH_DATE).getValue()) {
        sheet.getRange(row, COL.WATCH_DATE).setValue(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd'));
      }
    }
    if (payload.rating !== undefined) {
      sheet.getRange(row, COL.RATING).setValue(payload.rating);
    }
    if (payload.memo !== undefined) {
      const existingRelated = String(sheet.getRange(row, COL.RELATED_URL).getValue() || '');
      const urlMigrated = extractUrlsFromWatchMemo_(sanitizeHtmlText_(payload.memo), existingRelated);
      sheet.getRange(row, COL.MEMO).setValue(urlMigrated.memo);
      if (urlMigrated.extractedUrls.length > 0) {
        sheet.getRange(row, COL.RELATED_URL).setValue(urlMigrated.relatedUrl);
      }
    }
    if (payload.cast !== undefined) {
      sheet.getRange(row, COL.CAST).setValue(sanitizeHtmlText_(payload.cast));
    }
    if (payload.staff !== undefined) {
      sheet.getRange(row, COL.STAFF).setValue(sanitizeHtmlText_(payload.staff));
    }
    return { notFound: false, sheet, row };
  }, { label: 'updateWatchCard' });
  if (res.notFound) return { ok: false, error: 'Watch entry not found' };

  if (payload.runWiki) {
    enrichRow_(res.sheet, res.row);
  }
  const r = withSheetRetry_(() => res.sheet.getRange(res.row, 1, 1, 15).getValues()[0], { label: 'updateWatchCard_read' });
  return Object.assign({ ok: true }, formatWatchRow_(res.row, r));
}

function updateWatchFull(payload) {
  const res = withSheetRetry_(() => {
    const sheet = getSheetByNameOrThrow_(WATCH_SS_ID, SHEET_NAME);
    const row = resolveRowByIdOrIndex_(sheet, COL.ID, payload.row, payload.id);
    if (row < 2) return { notFound: true };

    const cur = sheet.getRange(row, 1, 1, 15).getValues()[0];
    const title = payload.title !== undefined ? sanitizeHtmlText_(payload.title) : String(cur[COL.TITLE - 1] || '');
    const baseRelatedUrl = payload.relatedUrl !== undefined ? String(payload.relatedUrl || '') : String(cur[COL.RELATED_URL - 1] || '');
    let memo = String(cur[COL.MEMO - 1] || '');
    let relatedUrl = baseRelatedUrl;
    let shouldWriteRelatedUrl = payload.relatedUrl !== undefined;
    if (payload.memo !== undefined) {
      const urlMigrated = extractUrlsFromWatchMemo_(sanitizeHtmlText_(payload.memo), baseRelatedUrl);
      memo = urlMigrated.memo;
      if (urlMigrated.extractedUrls.length > 0 || payload.relatedUrl !== undefined) {
        relatedUrl = urlMigrated.relatedUrl;
        shouldWriteRelatedUrl = true;
      }
    }
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
    if (payload.cast !== undefined) sheet.getRange(row, COL.CAST).setValue(sanitizeHtmlText_(payload.cast));
    if (payload.staff !== undefined) sheet.getRange(row, COL.STAFF).setValue(sanitizeHtmlText_(payload.staff));
    if (payload.summary !== undefined) sheet.getRange(row, COL.SUMMARY).setValue(sanitizeHtmlText_(payload.summary));
    if (payload.memo !== undefined) sheet.getRange(row, COL.MEMO).setValue(memo);
    if (shouldWriteRelatedUrl) sheet.getRange(row, COL.RELATED_URL).setValue(relatedUrl);
    return { notFound: false, sheet, row };
  }, { label: 'updateWatchFull' });
  if (res.notFound) return { ok: false, error: 'Watch entry not found' };

  if (payload.runWiki) {
    enrichRow_(res.sheet, res.row);
  }
  const r = withSheetRetry_(() => res.sheet.getRange(res.row, 1, 1, 15).getValues()[0], { label: 'updateWatchFull_read' });
  return { ok: true, entry: formatWatchRow_(res.row, r) };
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

