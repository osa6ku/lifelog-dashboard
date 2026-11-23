function syncWatchStatusChipsUi() {
  document.querySelectorAll('#status-chips .chip').forEach(c => {
    c.classList.toggle('active', c.dataset && c.dataset.val === statusFilter);
  });
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
  watchPeriodFilter = shiftYearStr(watchPeriodFilter, delta);
  runWatchServerQuery();
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
  openEditWatchModal(Number(row), id);
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
    const nextStatus = item.status === '進行中' ? '完了' : '進行中';
    const nextLabel = item.status === '進行中' ? '✅ 完了にする' : '▶ 進行中に戻す';
    const stars = item.rating ? '★'.repeat(Number(item.rating)) : '';
    const cleanTitle = sanitizeDisplayText(item.title);
    const castList = parsePersonTags(item.cast);
    const castSummary = castList.length > 0
      ? `👥 ${castList.length}名: ${castList.slice(0, 6).join(', ')}${castList.length > 6 ? ' …' : ''}`
      : '';
    const memoSnippet = item.memo
      ? `<div class="card-cast list-snippet">📝 ${renderRichText(item.memo)}</div>`
      : '';
    return `
      <div class="card list-card" id="wcard-${item.row}" onclick="onWatchCardTap(${item.row}, '${esc(item.id)}', event)">
        <div class="card-head"><div class="card-title">${esc(cleanTitle)}</div><span class="badge ${bClass}">${esc(item.status || '未設定')}</span></div>
        <div class="meta-row">
          <span class="tag-pill">${esc(item.category)}</span>
          ${item.watchDate ? `<span>📅 ${esc(item.watchDate)}</span>` : ''}
          ${item.releaseYear ? `<span>(${esc(item.releaseYear)})</span>` : ''}
          ${stars ? `<span style="color:#f59e0b;font-weight:700;">${stars}</span>` : ''}
          ${item.platform ? `<span class="tag-pill">📺 ${esc(item.platform)}</span>` : ''}
        </div>
        ${renderRelatedUrlBadges(item.relatedUrl)}
        ${castSummary ? `<div class="card-cast">${esc(castSummary)}</div>` : ''}
        ${memoSnippet}
        <div class="card-actions" onclick="event.stopPropagation()">
          <button class="btn-sm primary" onclick="openEditWatchModal(${item.row}, '${esc(item.id)}')">✏️ 編集</button>
          <button class="btn-sm success" onclick="quickUpdate(${item.row}, {status:'${nextStatus}'})">${nextLabel}</button>
          <select class="btn-sm" onchange="if(this.value) quickUpdate(${item.row}, {rating:this.value})">
            <option value="">評価変更</option><option value="5">★5</option><option value="4">★4</option><option value="3">★3</option><option value="2">★2</option><option value="1">★1</option>
          </select>
          <button class="btn-sm" onclick="quickUpdate(${item.row}, {runWiki:true})">🌐 Wikipedia補完</button>
        </div>
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
  showToast('鑑賞記録を保存中...', 'info', null, 0);

  const sendWatch = async () => {
    try {
      const res = await apiPost(isEdit ? 'updateWatchFull' : 'addWatch', payload);
      if (!res || !res.ok || !res.entry) throw new Error((res && res.error) || '保存に失敗しました');
      const idx = watchData.findIndex(x => String(x.id) === String(tempKey) || (res.entry.row && x.row === res.entry.row));
      if (idx >= 0) watchData[idx] = res.entry;
      else watchData.unshift(res.entry);
      renderWatch();
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

