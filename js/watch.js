function syncWatchStatusChipsUi() {
  document.querySelectorAll('#status-chips .chip').forEach(c => {
    c.classList.toggle('active', c.dataset && c.dataset.val === statusFilter);
  });
  const sel = document.getElementById('watch-status-select');
  if (sel) sel.value = statusFilter;
}

async function loadWatchData(opts = {}) {
  const q = document.getElementById('watch-search').value.trim();
  const sort = document.getElementById('watch-sort').value || 'desc';
  const ym = watchPeriodFilter;
  const offset = Number(opts.offset || 0);
  const append = Boolean(opts.append);

  if (!append) {
    if (q) {
      if (!watchSearchActive) {
        watchStatusBeforeSearch = statusFilter;
        watchSearchActive = true;
        watchLastSearchQuery = q;
        if (!opts.fromStatusChip && statusFilter !== 'ALL') {
          statusFilter = 'ALL';
          syncWatchStatusChipsUi();
        }
      } else if (!opts.fromStatusChip && q !== watchLastSearchQuery) {
        watchLastSearchQuery = q;
        if (statusFilter !== 'ALL') {
          statusFilter = 'ALL';
          syncWatchStatusChipsUi();
        }
      }
    } else if (watchSearchActive) {
      statusFilter = watchStatusBeforeSearch || '進行中';
      watchSearchActive = false;
      watchStatusBeforeSearch = null;
      watchLastSearchQuery = '';
      syncWatchStatusChipsUi();
    }
  }

  const isDefault = !q && !ym && sort === 'desc' && statusFilter === '進行中' && catFilter === 'ALL' && platFilter === 'ALL';

  const params = {
    api: 'watch',
    sort,
    limit: '100',
    offset: String(offset),
  };
  if (q) params.q = q;
  if (ym) params.ym = ym;
  if (isDefault && offset === 0) {
    params.includeInProgress = '1';
  } else {
    if (statusFilter && statusFilter !== 'ALL') params.status = statusFilter;
    if (catFilter && catFilter !== 'ALL') params.category = catFilter;
    if (platFilter && platFilter !== 'ALL') params.platform = platFilter;
  }
  if (serverWatchCastTags.length === 0) params.includeMeta = '1';

  updatePeriodUi('watch', ym, q, sort);
  if (!append) {
    document.getElementById('watch-list').innerHTML = '<div class="loading">鑑賞記録を読み込んでいます...</div>';
  }
  const data = await apiGet(params);
  if (Array.isArray(data.castTags) && data.castTags.length > 0) serverWatchCastTags = data.castTags;
  if (Array.isArray(data.staffTags) && data.staffTags.length > 0) serverWatchStaffTags = data.staffTags;
  if (Array.isArray(data.yearCounts)) {
    watchYearCounts = data.yearCounts;
    renderYearPicker('watch', watchYearCounts, watchPeriodFilter);
  }
  watchTotalCount = Number(data.totalCount || (data.entries || []).length);
  watchFilteredCount = Number(data.filteredCount !== undefined ? data.filteredCount : (data.entries || []).length);
  watchHasMore = Boolean(data.hasMore);

  if (append) {
    const existingRows = new Set(watchData.map(x => Number(x.row)));
    (data.entries || []).forEach(e => {
      if (!existingRows.has(Number(e.row))) watchData.push(e);
    });
  } else {
    watchDisplayLimit = 50;
    watchData = data.entries || [];
  }
  updatePeriodUi('watch', ym, q, sort);
  renderWatch();
}

function runWatchServerQuery() {
  return loadWatchData({ offset: 0, append: false });
}

function onWatchSearchInput() {
  const q = document.getElementById('watch-search').value.trim();
  if (!q && watchSearchActive) {
    runWatchServerQuery();
  }
}

function stepWatchYear(delta) {
  const next = stepAvailableYear(watchPeriodFilter, delta, watchYearCounts);
  if (!next) return;
  watchPeriodFilter = next;
  runWatchServerQuery();
}

function onWatchYearSelect() {
  const sel = document.getElementById('watch-year-select');
  watchPeriodFilter = sel ? (sel.value || '') : '';
  const ymEl = document.getElementById('watch-ym');
  if (ymEl) ymEl.value = '';
  runWatchServerQuery();
}

function onWatchStatusSelect() {
  const sel = document.getElementById('watch-status-select');
  if (!sel) return;
  setStatusFilter(sel.value || '進行中', null);
}

function stepWatchMonth(delta) {
  watchPeriodFilter = shiftMonthStr(watchPeriodFilter, delta);
  runWatchServerQuery();
}

function onWatchYmChange() {
  watchPeriodFilter = document.getElementById('watch-ym').value || '';
  runWatchServerQuery();
}

function resetWatchQuery() {
  document.getElementById('watch-search').value = '';
  document.getElementById('watch-sort').value = 'desc';
  watchPeriodFilter = '';
  runWatchServerQuery();
}

async function showMoreWatch() {
  if (watchDisplayLimit < watchData.length) {
    watchDisplayLimit += 50;
    renderWatch();
    return;
  }
  if (watchHasMore) {
    await loadWatchData({ offset: watchData.length, append: true });
    watchDisplayLimit += 50;
    renderWatch();
  }
}


function setStatusFilter(val, el) {
  statusFilter = val;
  if (el) {
    document.querySelectorAll('#status-chips .chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');
  } else {
    syncWatchStatusChipsUi();
  }
  return loadWatchData({ offset: 0, append: false, fromStatusChip: true });
}

function setCatFilter(val, el) {
  catFilter = val; platFilter = 'ALL';
  document.querySelectorAll('#cat-chips .chip').forEach(c => c.classList.remove('active-green'));
  el.classList.add('active-green');
  runWatchServerQuery();
}

function setPlatFilter(val, el) {
  platFilter = val; catFilter = 'ALL';
  document.querySelectorAll('#cat-chips .chip').forEach(c => c.classList.remove('active-green'));
  el.classList.add('active-green');
  runWatchServerQuery();
}

function onWatchCardTap(row, id, event) {
  if (event && event.target && event.target.closest('a, button, select, input, textarea')) return;
  openWatchDetailView(Number(row), id);
}

function renderWatchDetailView(item) {
  const detailEl = document.getElementById('watch-detail-view');
  if (!detailEl || !item) return;
  const bClass = item.status === '進行中' ? 'b-inprog' : item.status === '完了' ? 'b-done' : 'b-todo';
  const stars = item.rating ? '★'.repeat(Number(item.rating)) : '';
  const cleanTitle = sanitizeDisplayText(item.title || '');
  const castList = parsePersonTags(item.cast);
  const staffList = parsePersonTags(item.staff);
  const castHtml = castList.length > 0
    ? `<div class="detail-section"><div class="detail-section-label">👥 出演者（${castList.length}名）</div><div class="detail-person-chips">${castList.map(c => `<span class="person-chip">${esc(c)}</span>`).join('')}</div></div>`
    : '';
  const staffHtml = staffList.length > 0
    ? `<div class="detail-section"><div class="detail-section-label">🎬 監督・スタッフ</div><div class="detail-person-chips">${staffList.map(s => `<span class="person-chip staff">${esc(s)}</span>`).join('')}</div></div>`
    : '';
  const summaryHtml = item.summary
    ? `<div class="detail-section"><div class="detail-section-label">📖 作品概要</div><div class="detail-sub-body">${renderRichText(item.summary)}</div></div>`
    : '';
  const memoHtml = `<div class="detail-section"><div class="detail-section-label">📝 感想・メモ</div><div class="detail-body">${item.memo ? renderRichText(item.memo) : '<span style="color:#9ca3af;">（メモなし）</span>'}</div></div>`;
  const notionHtml = (item.notionUrl && /^https?:\/\//i.test(String(item.notionUrl).trim()))
    ? `<div class="related-url-row"><a class="related-url-badge" target="_blank" rel="noopener noreferrer" href="${esc(String(item.notionUrl).trim())}" onclick="event.stopPropagation()">🔗 Notion元ページを開く</a></div>`
    : '';
  const rowNum = Number(item.row || 0);
  detailEl.innerHTML = `
    <div class="detail-topbar">
      <button type="button" class="btn-sm" onclick="closeWatchDetailView()">← 一覧に戻る</button>
      <div style="display:flex;gap:6px;align-items:center;">
        <button type="button" class="btn-sm" onclick="openWikiPreviewModal(${rowNum}, '${esc(item.id)}')">🌐 Wikipedia補完</button>
        <button type="button" class="btn-sm primary" onclick="openEditWatchModal(${rowNum}, '${esc(item.id)}')">✏️ 編集</button>
      </div>
    </div>
    <article class="card detail-card" onclick="onDetailContentTap('watch', ${rowNum}, '${esc(item.id)}', event)">
      <div class="card-head">
        <h2 class="detail-title">${esc(cleanTitle)}</h2>
        <span class="badge ${bClass}">${esc(item.status || '未設定')}</span>
      </div>
      <div class="meta-row" style="margin-top:6px;">
        <span class="tag-pill">${esc(item.category || 'その他')}</span>
        ${item.watchDate ? `<span>📅 ${esc(item.watchDate)}</span>` : ''}
        ${item.releaseYear ? `<span>(${esc(item.releaseYear)})</span>` : ''}
        ${stars ? `<span style="color:#f59e0b;font-weight:700;">${stars}</span>` : ''}
        ${item.platform ? `<span class="tag-pill">📺 ${esc(item.platform)}</span>` : ''}
      </div>
      ${renderRelatedUrlBadges(item.relatedUrl)}
      ${notionHtml}
      ${castHtml}
      ${staffHtml}
      ${summaryHtml}
      ${memoHtml}
      <div class="detail-hint">本文をタップすると編集画面が開きます</div>
    </article>`;
}

function openWatchDetailView(row, id, opts = {}) {
  const item = watchData.find(x => (row && Number(x.row) === Number(row)) || String(x.id) === String(id));
  if (!item) return;
  const scrollY = opts.scrollY !== undefined
    ? Number(opts.scrollY)
    : (typeof window !== 'undefined' && typeof window.scrollY === 'number' ? window.scrollY : 0);
  activeDetailView = { type: 'watch', row: Number(item.row || 0), id: String(item.id || ''), scrollY };
  renderWatchDetailView(item);
  const listWrap = document.getElementById('watch-list-wrap');
  const detailEl = document.getElementById('watch-detail-view');
  if (listWrap) listWrap.style.display = 'none';
  if (detailEl) detailEl.style.display = 'block';
  if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    window.scrollTo(0, 0);
  }
}

function closeWatchDetailView(restoreScroll = true) {
  const savedY = activeDetailView && activeDetailView.type === 'watch' ? Number(activeDetailView.scrollY || 0) : 0;
  if (activeDetailView && activeDetailView.type === 'watch') activeDetailView = null;
  const listWrap = document.getElementById('watch-list-wrap');
  const detailEl = document.getElementById('watch-detail-view');
  if (detailEl) detailEl.style.display = 'none';
  if (listWrap) listWrap.style.display = 'block';
  if (restoreScroll && typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
    window.scrollTo(0, savedY);
  }
}

function normalizePersonKey(name) {
  return String(name || '').replace(/[\s　]+/g, '').toLowerCase();
}

function parsePersonTags(raw) {
  const clean = sanitizeDisplayText(raw || '');
  const out = [];
  const seen = new Set();
  clean.split(/[,、\n]+/).forEach(part => {
    const t = part.trim();
    if (!t) return;
    const key = normalizePersonKey(t);
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(t);
  });
  return out;
}

function getWatchPersonChipList(field) {
  return field === 'staff' ? watchStaffChips : watchCastChips;
}

function setWatchPersonChipList(field, list) {
  if (field === 'staff') watchStaffChips = list;
  else watchCastChips = list;
}

function renderWatchPersonChips(field) {
  const list = getWatchPersonChipList(field);
  const wrap = document.getElementById(field === 'staff' ? 'w-staff-chips' : 'w-cast-chips');
  const countEl = document.getElementById(field === 'staff' ? 'w-staff-count' : 'w-cast-count');
  if (countEl) countEl.textContent = list.length > 0 ? `（${list.length}名）` : '';
  if (!wrap) return;
  if (list.length === 0) {
    wrap.innerHTML = '';
    return;
  }
  const cls = field === 'staff' ? 'person-chip staff' : 'person-chip';
  wrap.innerHTML = list.map((name, idx) => `
    <span class="${cls}" id="person-chip-${field}-${idx}">
      <span>${esc(name)}</span>
      <button type="button" onclick="removeWatchPersonChip('${field}', ${idx})" title="${esc(name)}を削除">×</button>
    </span>`).join('');
}

function addWatchPersonChips(field, rawInput) {
  const clean = sanitizeDisplayText(rawInput || '');
  const parts = clean.split(/[,、\n]+/).map(s => s.trim()).filter(Boolean);
  const warnEl = document.getElementById(field === 'staff' ? 'w-staff-warn' : 'w-cast-warn');
  if (parts.length === 0) return { added: [], duplicates: [] };

  const list = getWatchPersonChipList(field);
  const added = [];
  const duplicates = [];

  parts.forEach(name => {
    const key = normalizePersonKey(name);
    const dupIdx = list.findIndex(existing => normalizePersonKey(existing) === key);
    if (dupIdx >= 0) {
      duplicates.push({ name, dupIdx });
    } else {
      list.push(name);
      added.push(name);
    }
  });

  setWatchPersonChipList(field, list);
  renderWatchPersonChips(field);

  if (duplicates.length > 0) {
    const dupNames = duplicates.map(d => `「${d.name}」`).join('、');
    const msg = `${dupNames}は既に追加されています`;
    if (warnEl) warnEl.textContent = `⚠️ ${msg}`;
    showToast(msg, 'info', null, 2500);
    duplicates.forEach(d => {
      const chipEl = document.getElementById(`person-chip-${field}-${d.dupIdx}`);
      if (chipEl) {
        chipEl.classList.add('dup-flash');
        setTimeout(() => chipEl.classList.remove('dup-flash'), 1200);
      }
    });
  } else if (warnEl) {
    warnEl.textContent = '';
  }

  return { added, duplicates };
}

function addWatchPersonFromInput(field) {
  const input = document.getElementById(field === 'staff' ? 'w-staff-input' : 'w-cast-input');
  const box = document.getElementById(field === 'staff' ? 'w-staff-suggest' : 'w-cast-suggest');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  const res = addWatchPersonChips(field, val);
  if (res.added.length > 0 || res.duplicates.length > 0) {
    input.value = '';
  }
  if (box) { box.classList.remove('open'); box.innerHTML = ''; }
}

function removeWatchPersonChip(field, idx) {
  const list = getWatchPersonChipList(field);
  if (idx < 0 || idx >= list.length) return;
  list.splice(idx, 1);
  setWatchPersonChipList(field, list);
  renderWatchPersonChips(field);
  const warnEl = document.getElementById(field === 'staff' ? 'w-staff-warn' : 'w-cast-warn');
  if (warnEl) warnEl.textContent = '';
}

function showWatchChipSuggestions(field) {
  const input = document.getElementById(field === 'staff' ? 'w-staff-input' : 'w-cast-input');
  const box = document.getElementById(field === 'staff' ? 'w-staff-suggest' : 'w-cast-suggest');
  if (!input || !box) return;
  const query = input.value.trim();
  if (!query) {
    box.classList.remove('open');
    box.innerHTML = '';
    return;
  }
  const qNorm = normalizePersonKey(query);
  const existingKeys = new Set(getWatchPersonChipList(field).map(normalizePersonKey));
  const allTags = buildWatchTagCounts(field);
  const matches = allTags.filter(t => {
    const tNorm = normalizePersonKey(t.name);
    if (existingKeys.has(tNorm)) return false;
    return tNorm.includes(qNorm) || t.name.toLowerCase().includes(query.toLowerCase());
  }).slice(0, 20);
  if (matches.length === 0) {
    box.classList.remove('open');
    box.innerHTML = '';
    return;
  }
  box.innerHTML = matches.map(t => `<button type="button" class="tag-suggest-item" data-tag-name="${esc(t.name)}" onmousedown="event.preventDefault()" onclick="pickWatchChipSuggestion('${field}', this.dataset.tagName)">${esc(t.name)}（${t.count}）</button>`).join('');
  box.classList.add('open');
}

function pickWatchChipSuggestion(field, tagName) {
  addWatchPersonChips(field, tagName);
  const input = document.getElementById(field === 'staff' ? 'w-staff-input' : 'w-cast-input');
  const box = document.getElementById(field === 'staff' ? 'w-staff-suggest' : 'w-cast-suggest');
  if (input) { input.value = ''; input.focus(); }
  if (box) { box.classList.remove('open'); box.innerHTML = ''; }
}

function captureWatchModalState() {
  return JSON.stringify({
    title: document.getElementById('w-title')?.value || '',
    category: document.getElementById('w-cat')?.value || '',
    platform: document.getElementById('w-plat')?.value || '',
    status: document.getElementById('w-status')?.value || '',
    rating: document.getElementById('w-rating')?.value || '',
    watchDate: document.getElementById('w-date')?.value || '',
    memo: document.getElementById('w-memo')?.value || '',
    releaseYear: document.getElementById('w-year')?.value || '',
    cast: watchCastChips.join(', '),
    staff: watchStaffChips.join(', '),
    castDraft: document.getElementById('w-cast-input')?.value || '',
    staffDraft: document.getElementById('w-staff-input')?.value || '',
    summary: document.getElementById('w-summary')?.value || '',
    relatedUrl: document.getElementById('w-url')?.value || '',
  });
}

function hasUnsavedWatchModalChanges() {
  if (watchEditSnapshot === null) return false;
  return captureWatchModalState() !== watchEditSnapshot;
}

function renderWatch() {
  const q = document.getElementById('watch-search').value.trim().toLowerCase();
  const sortMode = document.getElementById('watch-sort').value;
  let list = watchData.filter(item => {
    if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
    if (catFilter !== 'ALL' && item.category !== catFilter) return false;
    if (platFilter !== 'ALL' && !item.platform.includes(platFilter)) return false;
    if (watchPeriodFilter && !String(item.watchDate || '').startsWith(watchPeriodFilter)) return false;
    if (q) {
      const hay = `${item.title} ${item.cast} ${item.staff} ${item.platform} ${item.memo} ${item.summary}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  if (sortMode === 'asc') {
    list.sort((a, b) => (a.watchDate || '9999-99-99').localeCompare(b.watchDate || '9999-99-99') || Number(a.id || 0) - Number(b.id || 0));
  } else if (sortMode === 'rating_desc') {
    list.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0) || String(b.watchDate || '').localeCompare(String(a.watchDate || '')));
  } else {
    list.sort((a, b) => String(b.watchDate || '').localeCompare(String(a.watchDate || '')) || Number(b.id || 0) - Number(a.id || 0));
  }
  const sliced = list.slice(0, watchDisplayLimit);
  const totalLabel = watchTotalCount > 0 ? watchTotalCount : watchData.length;
  document.getElementById('watch-count').textContent = `表示中: ${sliced.length}件 / 該当${Math.max(list.length, watchFilteredCount && (q || watchPeriodFilter || statusFilter !== '進行中') ? watchFilteredCount : list.length)}件（DB全${totalLabel}件）`;
  const moreWrap = document.getElementById('watch-more-wrap');
  if (moreWrap) moreWrap.style.display = (list.length > watchDisplayLimit || watchHasMore) ? 'block' : 'none';
  const container = document.getElementById('watch-list');
  if (sliced.length === 0) { container.innerHTML = '<div class="loading">該当する記録がありません</div>'; return; }
  container.innerHTML = sliced.map(item => {
    const bClass = item.status === '進行中' ? 'b-inprog' : item.status === '完了' ? 'b-done' : 'b-todo';
    const stars = item.rating ? '★'.repeat(Number(item.rating)) : '';
    const cleanTitle = sanitizeDisplayText(item.title);
    const memoSnippet = item.memo
      ? `<div class="card-cast compact-memo list-snippet">${renderRichText(item.memo)}</div>`
      : '';
    return `
      <div class="card watch-card list-card compact-card" id="wcard-${item.row}" onclick="onWatchCardTap(${item.row}, '${esc(item.id)}', event)">
        <div class="card-head">
          <div class="card-title compact-title">${esc(cleanTitle)}</div>
          <span class="badge ${bClass}">${esc(item.status || '未設定')}</span>
        </div>
        <div class="meta-row compact-meta">
          <span class="tag-pill">${esc(item.category)}</span>
          ${item.watchDate ? `<span>${esc(item.watchDate)}</span>` : ''}
          ${stars ? `<span style="color:#f59e0b;font-weight:700;">${stars}</span>` : ''}
          ${item.platform ? `<span class="tag-pill">${esc(item.platform)}</span>` : ''}
        </div>
        ${renderRelatedUrlBadges(item.relatedUrl)}
        ${memoSnippet}
      </div>`;
  }).join('');
}


function renderRelatedUrlBadges(rawUrl) {
  const urls = String(rawUrl || '')
    .split(/[\n,]+/)
    .map(s => s.trim())
    .filter(s => /^https?:\/\//i.test(s));
  if (urls.length === 0) return '';
  return `<div class="related-url-row">${urls.map(u => {
    let label = u;
    try {
      const parsed = new URL(u);
      label = parsed.hostname.replace(/^www\./, '');
    } catch (_) {}
    return `<a class="related-url-badge" href="${esc(u)}" target="_blank" rel="noopener noreferrer" title="${esc(u)}" onclick="event.stopPropagation()">🔗 ${esc(label)}</a>`;
  }).join('')}</div>`;
}


function buildWatchTagCounts(field) {
  const master = field === 'cast' ? serverWatchCastTags : serverWatchStaffTags;
  if (Array.isArray(master) && master.length > 0) {
    return master;
  }
  const counts = new Map();
  watchData.forEach(item => {
    const raw = String((item && item[field]) || '');
    if (!raw) return;
    const uniqueInRecord = new Set(
      raw.split(/[,、]/).map(s => s.trim()).filter(Boolean)
    );
    uniqueInRecord.forEach(name => {
      counts.set(name, (counts.get(name) || 0) + 1);
    });
  });
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'));
}

function getCurrentTagSegment(el) {
  const val = String(el.value || '');
  const pos = typeof el.selectionStart === 'number' ? el.selectionStart : val.length;
  let segStart = 0;
  for (let i = pos - 1; i >= 0; i--) {
    if (val[i] === ',' || val[i] === '、') { segStart = i + 1; break; }
  }
  let segEnd = val.length;
  for (let i = pos; i < val.length; i++) {
    if (val[i] === ',' || val[i] === '、') { segEnd = i; break; }
  }
  const query = val.slice(segStart, segEnd).trim();
  const existingSet = new Set(
    (val.slice(0, segStart) + ',' + val.slice(segEnd))
      .split(/[,、]/)
      .map(s => s.trim())
      .filter(Boolean)
  );
  return { val, segStart, segEnd, query, existingSet };
}

function showWatchTagSuggestions(field, inputId, boxId) {
  const el = document.getElementById(inputId);
  const box = document.getElementById(boxId);
  if (!el || !box) return;
  const { query, existingSet } = getCurrentTagSegment(el);
  if (!query) {
    box.classList.remove('open');
    box.innerHTML = '';
    return;
  }
  const qNorm = query.replace(/[\s　]+/g, '').toLowerCase();
  const allTags = buildWatchTagCounts(field);
  const matches = allTags.filter(t => {
    if (existingSet.has(t.name)) return false;
    const tNorm = t.name.replace(/[\s　]+/g, '').toLowerCase();
    return tNorm.includes(qNorm) || t.name.toLowerCase().includes(query.toLowerCase());
  }).slice(0, 20);

  if (matches.length === 0) {
    box.classList.remove('open');
    box.innerHTML = '';
    return;
  }
  box.innerHTML = matches.map(t => {
    return `<button type="button" class="tag-suggest-item" data-tag-name="${esc(t.name)}" onmousedown="event.preventDefault(); pickWatchTagSuggestion('${inputId}', '${boxId}', this.dataset.tagName)">${esc(t.name)}（${t.count}）</button>`;
  }).join('');
  box.classList.add('open');
}

function hideWatchTagSuggestions(boxId) {
  setTimeout(() => {
    const box = document.getElementById(boxId);
    if (box) { box.classList.remove('open'); }
  }, 150);
}

function pickWatchTagSuggestion(inputId, boxId, tagName) {
  const el = document.getElementById(inputId);
  const box = document.getElementById(boxId);
  if (!el) return;
  const { val, segStart, segEnd } = getCurrentTagSegment(el);
  const beforeRaw = val.slice(0, segStart).replace(/[,、\s]+$/, '');
  const afterRaw = val.slice(segEnd).replace(/^[,、\s]+/, '');
  const parts = [];
  if (beforeRaw) parts.push(beforeRaw);
  parts.push(tagName);
  if (afterRaw) parts.push(afterRaw);
  const nextVal = parts.join(', ') + (afterRaw ? '' : ', ');
  el.value = nextVal;
  el.focus();
  const pos = afterRaw ? (beforeRaw ? beforeRaw.length + 2 + tagName.length : tagName.length) : nextVal.length;
  el.setSelectionRange(pos, pos);
  if (box) { box.classList.remove('open'); box.innerHTML = ''; }
}

async function saveInlineWatch(row, opts = {}) {
  const waitForCommit = Boolean(opts && opts.waitForCommit);
  const ta = document.getElementById(`inline-ta-watch-${Number(row)}`);
  if (!ta) return false;
  const newMemo = ta.value;
  const castEl = document.getElementById(`inline-cast-watch-${Number(row)}`);
  const staffEl = document.getElementById(`inline-staff-watch-${Number(row)}`);
  const cleanTags = (s) => String(s || '').split(/[,、]/).map(x => x.trim()).filter(Boolean).join(', ');
  const newCast = castEl ? cleanTags(castEl.value) : null;
  const newStaff = staffEl ? cleanTags(staffEl.value) : null;

  const idx = watchData.findIndex(x => Number(x.row) === Number(row));
  if (idx < 0) return false;
  const prevItem = { ...watchData[idx] };
  const payload = { row: prevItem.row, id: prevItem.id, memo: newMemo };
  const nextLocal = { ...prevItem, memo: newMemo };
  if (newCast !== null && newCast !== String(prevItem.cast || '').trim()) {
    payload.cast = newCast;
    nextLocal.cast = newCast;
  }
  if (newStaff !== null && newStaff !== String(prevItem.staff || '').trim()) {
    payload.staff = newStaff;
    nextLocal.staff = newStaff;
  }

  if (!waitForCommit) {
    watchData[idx] = nextLocal;
    activeInlineEdit = null;
    renderWatch();
    showToast('保存しました');
  } else {
    showToast('変更を保存しています...');
  }
  try {
    const updated = await apiPost('updateWatch', payload);
    if (!updated || updated.ok === false || !updated.title) {
      if (!waitForCommit) {
        watchData[idx] = prevItem;
        renderWatch();
      }
      showToast('保存に失敗しました: ' + ((updated && updated.error) || '通信エラー'), true);
      return false;
    }
    watchData[idx] = {
      ...prevItem,
      ...updated,
      status: updated.status || prevItem.status,
      title: updated.title || prevItem.title,
      memo: updated.memo !== undefined ? updated.memo : newMemo,
      cast: updated.cast !== undefined ? updated.cast : nextLocal.cast,
      staff: updated.staff !== undefined ? updated.staff : nextLocal.staff,
      relatedUrl: updated.relatedUrl !== undefined ? updated.relatedUrl : prevItem.relatedUrl,
      notionUrl: updated.notionUrl !== undefined ? updated.notionUrl : prevItem.notionUrl,
    };
    if (waitForCommit) {
      activeInlineEdit = null;
      showToast('保存しました');
    }
    renderWatch();
    return true;
  } catch (err) {
    if (!waitForCommit) {
      watchData[idx] = prevItem;
      renderWatch();
    }
    showToast('保存に失敗しました: ' + err.message, true);
    return false;
  }
}


async function quickUpdate(row, changes) {
  const card = document.getElementById(`wcard-${row}`);
  if (card) card.style.opacity = '0.5';
  const idx = watchData.findIndex(x => x.row === row);
  const existing = idx >= 0 ? watchData[idx] : null;
  try {
    const updated = await apiPost('updateWatch', {
      row,
      id: existing ? existing.id : undefined,
      ...changes
    });
    if (!updated || updated.ok === false || !updated.title) {
      showToast('更新に失敗しました: ' + ((updated && updated.error) || '通信エラー'), true);
      if (card) card.style.opacity = '1';
      return;
    }
    if (idx >= 0) {
      watchData[idx] = {
        ...existing,
        ...updated,
        status: updated.status || existing.status,
        title: updated.title || existing.title,
        memo: updated.memo !== undefined ? updated.memo : existing.memo,
        watchDate: updated.watchDate !== undefined ? updated.watchDate : existing.watchDate,
        rating: updated.rating !== undefined ? updated.rating : existing.rating,
        relatedUrl: updated.relatedUrl !== undefined ? updated.relatedUrl : existing.relatedUrl,
        notionUrl: updated.notionUrl !== undefined ? updated.notionUrl : existing.notionUrl,
      };
    }
    renderWatch();
    if (changes.runWiki) {
      showToast('Wikipedia情報を補完しました');
    }
  } catch (err) {
    showToast('更新に失敗しました: ' + err.message, true);
    if (card) card.style.opacity = '1';
  }
}


function openWatchModal() {
  editingWatch = null;
  watchCastChips = [];
  watchStaffChips = [];
  document.getElementById('watch-modal-title').textContent = '🎬 鑑賞記録を追加';
  document.getElementById('btn-save-watch').textContent = '保存する';
  document.getElementById('btn-delete-watch').style.display = 'none';
  const wikiPrevBtn = document.getElementById('btn-watch-wiki-preview');
  if (wikiPrevBtn) wikiPrevBtn.style.display = 'none';
  document.getElementById('w-wiki-label').textContent = '登録時にWikipediaからキャスト・概要を自動補完する';
  document.getElementById('w-wiki').checked = true;
  document.getElementById('w-title').value = '';
  document.getElementById('w-cat').value = 'ドラマ';
  document.getElementById('w-plat').value = '';
  document.getElementById('w-status').value = '進行中';
  document.getElementById('w-rating').value = '';
  document.getElementById('w-date').value = getLocalTodayIso();
  document.getElementById('w-memo').value = '';
  document.getElementById('w-year').value = '';
  document.getElementById('w-cast-input').value = '';
  document.getElementById('w-staff-input').value = '';
  document.getElementById('w-cast-warn').textContent = '';
  document.getElementById('w-staff-warn').textContent = '';
  document.getElementById('w-summary').value = '';
  document.getElementById('w-url').value = '';
  const notionWrap = document.getElementById('w-notion-wrap');
  if (notionWrap) notionWrap.style.display = 'none';
  renderWatchPersonChips('cast');
  renderWatchPersonChips('staff');
  watchEditSnapshot = captureWatchModalState();
  document.getElementById('modal-watch').classList.add('open');
}

function openEditWatchModal(row, id) {
  const item = watchData.find(x => (row && Number(x.row) === Number(row)) || String(x.id) === String(id));
  if (!item) return;
  editingWatch = item;
  watchCastChips = parsePersonTags(item.cast);
  watchStaffChips = parsePersonTags(item.staff);
  document.getElementById('watch-modal-title').textContent = '✏️ 鑑賞記録を編集';
  document.getElementById('btn-save-watch').textContent = '変更を保存する';
  document.getElementById('btn-delete-watch').style.display = 'block';
  const wikiPrevBtn = document.getElementById('btn-watch-wiki-preview');
  if (wikiPrevBtn) wikiPrevBtn.style.display = 'block';
  document.getElementById('w-wiki-label').textContent = '保存時にWikipediaからキャスト・概要を再補完する';
  document.getElementById('w-wiki').checked = false;
  document.getElementById('w-title').value = sanitizeDisplayText(item.title || '');
  document.getElementById('w-cat').value = item.category || 'その他';
  document.getElementById('w-plat').value = item.platform || '';
  document.getElementById('w-status').value = item.status || '進行中';
  document.getElementById('w-rating').value = item.rating || '';
  document.getElementById('w-date').value = item.watchDate || '';
  document.getElementById('w-memo').value = sanitizeDisplayText(item.memo || '');
  document.getElementById('w-year').value = item.releaseYear || '';
  document.getElementById('w-cast-input').value = '';
  document.getElementById('w-staff-input').value = '';
  document.getElementById('w-cast-warn').textContent = '';
  document.getElementById('w-staff-warn').textContent = '';
  document.getElementById('w-summary').value = sanitizeDisplayText(item.summary || '');
  document.getElementById('w-url').value = item.relatedUrl || '';
  const notionWrap = document.getElementById('w-notion-wrap');
  const notionLink = document.getElementById('w-notion-link');
  if (notionWrap && notionLink) {
    if (item.notionUrl && /^https?:\/\//i.test(String(item.notionUrl).trim())) {
      notionLink.href = String(item.notionUrl).trim();
      notionWrap.style.display = 'block';
    } else {
      notionWrap.style.display = 'none';
    }
  }
  renderWatchPersonChips('cast');
  renderWatchPersonChips('staff');
  watchEditSnapshot = captureWatchModalState();
  document.getElementById('modal-watch').classList.add('open');
}


async function submitWatch() {
  const title = sanitizeDisplayText(document.getElementById('w-title').value).trim();
  if (!title) { alert('タイトルを入力してください'); return; }

  // 入力欄に残っている未確定の出演者・スタッフをチップへ反映
  addWatchPersonFromInput('cast');
  addWatchPersonFromInput('staff');

  const isEdit = Boolean(editingWatch);
  const targetWatch = editingWatch;
  const payload = {
    title,
    category: document.getElementById('w-cat').value,
    platform: document.getElementById('w-plat').value,
    status: document.getElementById('w-status').value,
    rating: document.getElementById('w-rating').value,
    watchDate: document.getElementById('w-date').value,
    memo: sanitizeDisplayText(document.getElementById('w-memo').value),
    releaseYear: document.getElementById('w-year').value,
    cast: watchCastChips.join(', '),
    staff: watchStaffChips.join(', '),
    summary: sanitizeDisplayText(document.getElementById('w-summary').value),
    relatedUrl: document.getElementById('w-url').value,
  };
  if (isEdit) {
    payload.row = targetWatch.row;
    payload.id = targetWatch.id;
    payload.runWiki = document.getElementById('w-wiki').checked;
  } else {
    payload.autoWiki = document.getElementById('w-wiki').checked;
  }

  // 楽観的更新：即座にモーダルを閉じて画面へ仮反映
  const snapshot = watchData.map(x => ({ ...x }));
  const tempKey = isEdit ? targetWatch.id : `temp-${Date.now()}`;
  const optimisticItem = {
    row: isEdit ? targetWatch.row : 0,
    id: tempKey,
    title: payload.title,
    category: payload.category,
    watchDate: payload.watchDate,
    status: payload.status,
    rating: payload.rating,
    platform: payload.platform,
    releaseYear: payload.releaseYear,
    cast: payload.cast,
    staff: payload.staff,
    summary: payload.summary,
    memo: payload.memo,
    relatedUrl: payload.relatedUrl,
    notionUrl: isEdit ? (targetWatch.notionUrl || '') : '',
  };
  if (isEdit) {
    const idx = watchData.findIndex(x => x.row === targetWatch.row || String(x.id) === String(targetWatch.id));
    if (idx >= 0) watchData[idx] = optimisticItem;
  } else {
    watchData.unshift(optimisticItem);
  }
  editingWatch = null;
  watchEditSnapshot = null;
  closeModals(true);
  renderWatch();
  if (activeDetailView && activeDetailView.type === 'watch' && isEdit) {
    renderWatchDetailView(optimisticItem);
  }
  showToast('鑑賞記録を保存中...', 'info', null, 0);

  const sendWatch = async () => {
    try {
      const res = await apiPost(isEdit ? 'updateWatchFull' : 'addWatch', payload);
      if (!res || !res.ok || !res.entry) throw new Error((res && res.error) || '保存に失敗しました');
      const idx = watchData.findIndex(x => String(x.id) === String(tempKey) || (res.entry.row && x.row === res.entry.row));
      if (idx >= 0) watchData[idx] = res.entry;
      else watchData.unshift(res.entry);
      renderWatch();
      if (activeDetailView && activeDetailView.type === 'watch' &&
          (Number(activeDetailView.row) === Number(res.entry.row) || String(activeDetailView.id) === String(res.entry.id))) {
        renderWatchDetailView(res.entry);
      }
      showToast('鑑賞記録を保存しました', 'success', null, 2200);
    } catch (err) {
      watchData = snapshot;
      renderWatch();
      showToast(`鑑賞記録の保存失敗（元に戻しました）: ${err.message || err}`, 'error', () => {
        watchData = isEdit
          ? snapshot.map(x => (x.row === targetWatch.row || String(x.id) === String(targetWatch.id)) ? optimisticItem : x)
          : [optimisticItem, ...snapshot];
        renderWatch();
        sendWatch();
      }, 0);
    }
  };
  sendWatch();
}

async function deleteCurrentWatch() {
  if (!editingWatch) return;
  if (!confirm(`「${editingWatch.title}」を削除しますか？（元に戻せません）`)) return;
  const target = editingWatch;
  const snapshot = watchData.map(x => ({ ...x }));
  watchData = watchData.filter(x => !(target.row && x.row === target.row) && String(x.id) !== String(target.id));
  editingWatch = null;
  watchEditSnapshot = null;
  closeModals(true);
  if (activeDetailView && activeDetailView.type === 'watch') closeWatchDetailView(false);
  renderWatch();
  showToast('鑑賞記録を削除中...', 'info', null, 0);

  try {
    const res = await apiPost('deleteWatch', { row: target.row, id: target.id });
    if (!res || !res.ok) throw new Error((res && res.error) || '削除に失敗しました');
    showToast('鑑賞記録を削除しました', 'success', null, 2200);
  } catch (err) {
    watchData = snapshot;
    renderWatch();
    showToast(`削除失敗（元に戻しました）: ${err.message || err}`, 'error', null, 5000);
  }
}

// ============================================================
// 3-58: Wikipedia候補プレビュー＆選択適用モーダル
// ============================================================
let wikiPreviewState = {
  item: null,
  candidates: [],
  cleanedTitle: '',
  mode: 'fill_empty',
  loading: false,
  applying: false,
};

function setWikiApplyMode(mode) {
  wikiPreviewState.mode = (mode === 'overwrite_summary_year') ? 'overwrite_summary_year' : 'fill_empty';
  const fillBtn = document.getElementById('wiki-mode-fill');
  const overBtn = document.getElementById('wiki-mode-overwrite');
  if (fillBtn) fillBtn.classList.toggle('active', wikiPreviewState.mode === 'fill_empty');
  if (overBtn) overBtn.classList.toggle('active', wikiPreviewState.mode === 'overwrite_summary_year');
}

function closeWikiPreviewModal() {
  const modal = document.getElementById('modal-wiki-candidates');
  if (modal) modal.classList.remove('open');
  wikiPreviewState.loading = false;
  wikiPreviewState.applying = false;
}

function openWikiPreviewForEditingWatch() {
  if (!editingWatch) return;
  openWikiPreviewModal(editingWatch.row, editingWatch.id);
}

function renderWikiCandidateCards() {
  const bodyEl = document.getElementById('wiki-candidates-body');
  const statusEl = document.getElementById('wiki-candidates-status');
  if (!bodyEl) return;

  const item = wikiPreviewState.item;
  const cands = wikiPreviewState.candidates || [];

  if (statusEl) {
    const qInfo = wikiPreviewState.cleanedTitle ? `検索語: 「${wikiPreviewState.cleanedTitle}」` : '';
    const modeNote = '感想メモ・ステータス・鑑賞日・評価・既存関連URLは保護されます。';
    statusEl.textContent = qInfo ? `${qInfo} ／ ${modeNote}` : modeNote;
  }

  if (!cands.length) {
    bodyEl.innerHTML = `<div class="wiki-empty">一致する作品候補が見つかりませんでした。<br>タイトル表記を確認するか、関連URL欄へWikipediaのURLを直接貼り付けてから再試行してください。</div>`;
    return;
  }

  bodyEl.innerHTML = cands.map((c, idx) => {
    const badges = (c.matchedHints || []).map(h => `<span class="wiki-hint-badge">${esc(h)}</span>`).join('');
    const langTag = c.lang === 'en' ? '<span class="wiki-hint-badge">en.wiki</span>' : '';
    const yearText = c.year ? `<span class="wiki-meta-chip">📅 ${esc(c.year)}年</span>` : '';
    const platStr = Array.isArray(c.platforms) ? c.platforms.join(', ') : (c.platform || '');
    const platText = platStr ? `<span class="wiki-meta-chip">📺 ${esc(platStr)}</span>` : '';
    const warnHtml = c.yearWarning ? `<div class="wiki-year-warn">⚠️ ${esc(c.yearWarning)}</div>` : '';
    const snippetHtml = c.snippet ? `<div class="wiki-snippet">${esc(c.snippet)}</div>` : '';
    const linkHtml = c.url
      ? `<a class="btn-sm" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()">🔗 Wikipediaを開く</a>`
      : '';
    return `
      <div class="wiki-cand-card" data-wiki-idx="${idx}">
        <div class="wiki-cand-head">
          <div class="wiki-cand-title">${esc(c.title)}</div>
          <div class="wiki-cand-meta">${yearText}${platText}${langTag}</div>
        </div>
        ${badges ? `<div class="wiki-hint-row">${badges}</div>` : ''}
        ${warnHtml}
        ${snippetHtml}
        <div class="wiki-cand-actions">
          ${linkHtml}
          <button type="button" class="btn-sm primary" onclick="confirmApplyWikiCandidate(${idx})">この候補を反映</button>
        </div>
      </div>`;
  }).join('');
  if (item) {
    const titleEl = document.getElementById('wiki-modal-title');
    if (titleEl) titleEl.textContent = `🌐 Wikipedia補完: ${item.title}`;
  }
}

async function openWikiPreviewModal(row, id) {
  const item = watchData.find(x => (row && Number(x.row) === Number(row)) || String(x.id) === String(id));
  if (!item) {
    showToast('対象の鑑賞記録が見つかりません', 'error', null, 3000);
    return;
  }

  wikiPreviewState = {
    item,
    candidates: [],
    cleanedTitle: '',
    mode: 'fill_empty',
    loading: true,
    applying: false,
  };
  setWikiApplyMode('fill_empty');

  const titleEl = document.getElementById('wiki-modal-title');
  const statusEl = document.getElementById('wiki-candidates-status');
  const bodyEl = document.getElementById('wiki-candidates-body');
  const modal = document.getElementById('modal-wiki-candidates');

  if (titleEl) titleEl.textContent = `🌐 Wikipedia補完: ${item.title}`;
  if (statusEl) statusEl.textContent = 'Wikipediaから候補を検索中...（DBはまだ変更されません）';
  if (bodyEl) bodyEl.innerHTML = '<div class="wiki-empty">🔍 候補を取得しています...</div>';
  if (modal) modal.classList.add('open');

  try {
    const res = await searchWatchWikiCandidatesApi({
      row: item.row,
      id: item.id,
      title: item.title,
      category: item.category,
      staff: item.staff,
      cast: item.cast,
      memo: item.memo,
      relatedUrl: item.relatedUrl,
      watchDate: item.watchDate,
    });
    if (!res || !res.ok) throw new Error((res && res.error) || '候補検索に失敗しました');
    wikiPreviewState.candidates = Array.isArray(res.candidates) ? res.candidates : [];
    wikiPreviewState.cleanedTitle = res.queryTitle || res.cleanedTitle || '';
    wikiPreviewState.loading = false;
    renderWikiCandidateCards();
  } catch (err) {
    wikiPreviewState.loading = false;
    if (statusEl) statusEl.textContent = '候補の取得に失敗しました（DBは変更されていません）';
    if (bodyEl) bodyEl.innerHTML = `<div class="wiki-empty">エラー: ${esc(err.message || String(err))}</div>`;
  }
}

async function confirmApplyWikiCandidate(index) {
  if (wikiPreviewState.applying) return;
  const item = wikiPreviewState.item;
  const cand = (wikiPreviewState.candidates || [])[index];
  if (!item || !cand) return;

  wikiPreviewState.applying = true;
  showToast(`「${cand.title}」を反映中...`, 'info', null, 0);

  try {
    const res = await applyWatchWikiCandidateApi({
      row: item.row,
      id: item.id,
      mode: wikiPreviewState.mode,
      candidate: cand,
    });
    if (!res || !res.ok || !res.entry) throw new Error((res && res.error) || 'Wikipedia反映に失敗しました');

    const updated = res.entry;
    const idx = watchData.findIndex(x => (updated.row && Number(x.row) === Number(updated.row)) || String(x.id) === String(updated.id));
    if (idx >= 0) watchData[idx] = updated;
    else watchData.unshift(updated);

    if (editingWatch && ((updated.row && Number(editingWatch.row) === Number(updated.row)) || String(editingWatch.id) === String(updated.id))) {
      editingWatch = updated;
      const yearEl = document.getElementById('w-year');
      const platEl = document.getElementById('w-plat');
      const sumEl = document.getElementById('w-summary');
      const urlEl = document.getElementById('w-url');
      if (yearEl) yearEl.value = updated.releaseYear || '';
      if (platEl) platEl.value = updated.platform || '';
      if (sumEl) sumEl.value = sanitizeDisplayText(updated.summary || '');
      if (urlEl) urlEl.value = updated.relatedUrl || '';
      watchCastChips = parsePersonTags(updated.cast || '');
      watchStaffChips = parsePersonTags(updated.staff || '');
      renderWatchPersonChips('cast');
      renderWatchPersonChips('staff');
      watchEditSnapshot = captureWatchModalState();
    }

    closeWikiPreviewModal();
    renderWatch();
    if (activeDetailView && activeDetailView.type === 'watch' &&
        (Number(activeDetailView.row) === Number(updated.row) || String(activeDetailView.id) === String(updated.id))) {
      renderWatchDetailView(updated);
    }
    showToast(`Wikipedia情報を反映しました（${cand.title}）`, 'success', null, 2800);
  } catch (err) {
    wikiPreviewState.applying = false;
    showToast(`Wikipedia反映失敗: ${err.message || err}`, 'error', null, 5000);
  }
}


