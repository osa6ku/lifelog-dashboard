async function loadDiaryData(forceRenderNut, opts = {}) {
  showUnsentDiaryBar();
  const q = document.getElementById('diary-search').value.trim();
  const sort = document.getElementById('diary-sort').value || 'desc';
  const ym = diaryPeriodFilter;
  const offset = Number(opts.offset || 0);
  const append = Boolean(opts.append);

  const params = {
    api: 'diary',
    sort,
    offset: String(offset),
  };
  if (q) {
    params.q = q;
    params.limit = '80';
  } else if (ym) {
    params.ym = ym;
    params.limit = '0';
  } else if (sort === 'asc') {
    params.limit = '80';
  } else {
    // 初期表示：直近3か月分のみ取得して軽量化
    params.months = '3';
    params.limit = '0';
  }
  if (serverLocationHistory.length === 0) params.includeMeta = '1';

  updatePeriodUi('diary', ym, q, sort);
  if (!append) {
    document.getElementById('diary-list').innerHTML = '<div class="loading">日記を読み込んでいます...</div>';
  }
  const data = await apiGet(params);
  if (Array.isArray(data.locationPresets) && data.locationPresets.length > 0) {
    serverLocationPresets = data.locationPresets;
    saveCachedLocationPresets(serverLocationPresets);
    if (document.getElementById('modal-diary')?.classList.contains('open')) {
      showLocationHistory();
    }
  }
  if (Array.isArray(data.locationHistory) && data.locationHistory.length > 0) {
    serverLocationHistory = data.locationHistory;
  }
  diaryTotalCount = Number(data.totalCount || (data.entries || []).length);
  diaryFilteredCount = Number(data.filteredCount !== undefined ? data.filteredCount : (data.entries || []).length);
  diaryHasMore = Boolean(data.hasMore);

  if (append) {
    const existingRows = new Set(diaryData.map(x => Number(x.row)));
    (data.entries || []).forEach(e => {
      if (!existingRows.has(Number(e.row))) diaryData.push(e);
    });
  } else {
    diaryDisplayLimit = 80;
    diaryData = data.entries || [];
  }
  renderDiary();
  if (forceRenderNut || document.getElementById('view-nutrition').style.display !== 'none') {
    renderNutritionView();
  }
}

function runDiaryServerQuery() {
  return loadDiaryData(false, { offset: 0, append: false });
}

function stepDiaryYear(delta) {
  diaryPeriodFilter = shiftYearStr(diaryPeriodFilter, delta);
  runDiaryServerQuery();
}

function stepDiaryMonth(delta) {
  diaryPeriodFilter = shiftMonthStr(diaryPeriodFilter, delta);
  runDiaryServerQuery();
}

function onDiaryYmChange() {
  diaryPeriodFilter = document.getElementById('diary-ym').value || '';
  runDiaryServerQuery();
}

function resetDiaryQuery() {
  document.getElementById('diary-search').value = '';
  document.getElementById('diary-sort').value = 'desc';
  diaryPeriodFilter = '';
  runDiaryServerQuery();
}


function hasUnsavedInlineChanges() {
  if (!activeInlineEdit) return false;
  const { type, row } = activeInlineEdit;
  if (type === 'diary') {
    const entry = diaryData.find(d => Number(d.row) === Number(row));
    if (!entry) return false;
    const titleEl = document.getElementById(`inline-title-diary-${row}`);
    const bodyEl = document.getElementById(`inline-ta-diary-${row}`);
    if (!bodyEl) return false;
    const curTitle = titleEl ? titleEl.value.trim() : String(entry.title || '').trim();
    const curBody = bodyEl.value;
    if (curTitle !== String(entry.title || '').trim()) return true;
    if (curBody !== String(entry.body || '')) return true;
    const origLocNames = normalizeDiaryLocations(entry).map(l => l.name);
    const curLocNames = inlineDiaryLocations.map(l => l.name);
    if (origLocNames.length !== curLocNames.length) return true;
    for (let i = 0; i < origLocNames.length; i++) {
      if (origLocNames[i] !== curLocNames[i]) return true;
    }
    return false;
  }
  if (type === 'watch') {
    const item = watchData.find(w => Number(w.row) === Number(row));
    if (!item) return false;
    const ta = document.getElementById(`inline-ta-watch-${row}`);
    if (!ta) return false;
    if (ta.value !== String(item.memo || '')) return true;
    const cleanTags = (s) => String(s || '').split(/[,、]/).map(x => x.trim()).filter(Boolean).join(', ');
    const castEl = document.getElementById(`inline-cast-watch-${row}`);
    const staffEl = document.getElementById(`inline-staff-watch-${row}`);
    if (castEl && cleanTags(castEl.value) !== cleanTags(item.cast || '')) return true;
    if (staffEl && cleanTags(staffEl.value) !== cleanTags(item.staff || '')) return true;
    return false;
  }
  return false;
}


async function startInlineEdit(type, row, event) {
  if (event && event.target && event.target.closest('a, button, select, input, textarea')) return;
  const targetRow = Number(row);
  if (activeInlineEdit && activeInlineEdit.type === type && Number(activeInlineEdit.row) === targetRow) return;
  if (activeInlineEdit && hasUnsavedInlineChanges()) {
    const shouldSave = confirm('編集中の未保存内容があります。保存してから切り替えますか？\n（OK：保存して切替 / キャンセル：現在の編集を続ける）');
    if (!shouldSave) return;
    const saved = activeInlineEdit.type === 'diary'
      ? await saveInlineDiary(activeInlineEdit.row, { waitForCommit: true })
      : await saveInlineWatch(activeInlineEdit.row, { waitForCommit: true });
    if (!saved) return;
  }
  activeInlineEdit = { type, row: targetRow };
  inlineDiaryLocations = [];
  inlineDiaryOrigCoords = new Map();
  if (type === 'diary') {
    const entry = diaryData.find(d => Number(d.row) === targetRow);
    if (entry) {
      const locs = normalizeDiaryLocations(entry);
      inlineDiaryLocations = locs.map(l => ({ name: l.name, lat: l.lat, lng: l.lng }));
      locs.forEach(l => {
        if (l.lat !== null && l.lng !== null) inlineDiaryOrigCoords.set(l.name, { lat: l.lat, lng: l.lng });
      });
    }
  }
  renderDiary();
  renderWatch();
  setTimeout(() => {
    const ta = document.getElementById(`inline-ta-${type}-${targetRow}`);
    if (ta) {
      autoResizeTextarea(ta, 180);
      ta.focus();
      const len = ta.value.length;
      ta.setSelectionRange(len, len);
    }
  }, 0);
}

function cancelInlineEdit() {
  if (hasUnsavedInlineChanges()) {
    if (!confirm('未保存の変更を破棄して元の表示に戻しますか？')) return;
  }
  activeInlineEdit = null;
  inlineDiaryLocations = [];
  inlineDiaryOrigCoords = new Map();
  renderDiary();
  renderWatch();
}

async function openDetailFromInline(type, row, id) {
  if (hasUnsavedInlineChanges()) {
    const ok = type === 'diary'
      ? await saveInlineDiary(row, { waitForCommit: true })
      : await saveInlineWatch(row, { waitForCommit: true });
    if (!ok) return;
  } else {
    activeInlineEdit = null;
    inlineDiaryLocations = [];
    inlineDiaryOrigCoords = new Map();
    renderDiary();
    renderWatch();
  }
  if (type === 'diary') openEditDiaryModal(row, id);
  else openEditWatchModal(row, id);
}


async function saveInlineDiary(row, opts = {}) {
  const rowNum = Number(row);
  const ta = document.getElementById(`inline-ta-diary-${rowNum}`);
  if (!ta) return false;
  const titleEl = document.getElementById(`inline-title-diary-${rowNum}`);
  // 入力欄に残っている未追加の場所テキストがあれば自動追加
  const pendingLocInput = document.getElementById(`inline-loc-input-diary-${rowNum}`);
  if (pendingLocInput && pendingLocInput.value.trim()) {
    addInlineDiaryLocation(rowNum, pendingLocInput.value.trim(), null, null);
  }
  const newBody = ta.value;
  const idx = diaryData.findIndex(d => Number(d.row) === rowNum);
  if (idx < 0) return false;
  const prevEntry = { ...diaryData[idx] };
  const newTitle = titleEl ? titleEl.value.trim() : String(prevEntry.title || '').trim();
  const resolvedLocs = inlineDiaryLocations.map(l => {
    const coords = resolveInlineLocationCoords(l.name, l.lat, l.lng);
    return { name: l.name, lat: coords.lat, lng: coords.lng };
  });
  const newLocStr = resolvedLocs.map(l => l.name).join('\n');

  const payload = {
    row: prevEntry.row,
    id: prevEntry.id,
    title: newTitle,
    body: newBody,
    location: newLocStr,
    locations: resolvedLocs,
    clientRequestId: generateClientRequestId(),
  };

  // 成功確認まで端末内（localStorage）に下書きを永続保持し、失敗しても入力を絶対に失わない
  savePendingDiaryDraft({ action: 'updateDiary', payload, savedAt: Date.now() });
  showToast('日記を保存中...', 'info', null, 0);

  try {
    const res = await apiPost('updateDiary', payload);
    if (!res || !res.ok) {
      throw new Error((res && res.error) || '通信エラー');
    }
    clearPendingDiaryDraft();
    saveLocationToHistory(resolvedLocs);
    if (res.entry) {
      diaryData[idx] = res.entry;
    } else {
      diaryData[idx] = { ...prevEntry, title: newTitle, body: newBody, location: newLocStr, locations: resolvedLocs };
    }
    activeInlineEdit = null;
    inlineDiaryLocations = [];
    inlineDiaryOrigCoords = new Map();
    renderDiary();
    showToast('保存しました', 'success', null, 2000);
    if (res.needsDocSync && res.docSyncPayload) {
      triggerDiaryDocSyncWithRetry(res.docSyncPayload);
    }
    return true;
  } catch (err) {
    const errMsg = (err && err.message) ? err.message : String(err);
    // 入力内容とインライン編集状態をそのまま保持し、明示的な赤エラー＋再送導線を出す
    showUnsentDiaryBar(errMsg);
    showToast(`⚠️ 保存できませんでした: ${errMsg}`, 'error', () => saveInlineDiary(rowNum, opts), 0);
    return false;
  }
}


const thumbMemCache = {};
let thumbObserver = null;

function ensureThumbObserver() {
  if (thumbObserver) thumbObserver.disconnect();
  thumbObserver = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      obs.unobserve(img);
      const fid = img.dataset.fileId;
      if (fid) loadThumbIntoImg(img, fid);
    });
  }, { rootMargin: '200px' });
}

async function loadThumbIntoImg(img, fid) {
  const cached = thumbMemCache[fid] || safeSessionGet(`thumb_${fid}`);
  if (cached) {
    thumbMemCache[fid] = cached;
    img.src = cached;
    return;
  }
  try {
    const res = await apiGet({ api: 'thumb', id: fid });
    if (res && res.ok && res.dataUrl) {
      thumbMemCache[fid] = res.dataUrl;
      safeSessionSet(`thumb_${fid}`, res.dataUrl);
      img.src = res.dataUrl;
    }
  } catch (e) { /* ignore */ }
}


function formatDiaryDateLabel(dateStr, weekday) {
  const m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const base = m ? `${Number(m[1])}年${Number(m[2])}月${Number(m[3])}日` : String(dateStr || '');
  return weekday ? `${base} (${weekday})` : base;
}

function buildDiaryCardHtml(d) {
  const placeholder = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const ids = d.imageIds || [];
  const urls = d.imageUrls || [];
  const locs = normalizeDiaryLocations(d);
  const coordLocs = locs.filter(l => l.lat !== null && l.lng !== null);
  let mapLinkHtml = '';
  if (coordLocs.length === 1) {
    mapLinkHtml = `<a class="loc-badge" style="background:#ecfdf5;color:#047857;border-color:#a7f3d0;" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${coordLocs[0].lat},${coordLocs[0].lng}">🗺️ Googleマップで開く</a>`;
  } else if (coordLocs.length >= 2) {
    const dirPath = coordLocs.map(l => `${l.lat},${l.lng}`).join('/');
    mapLinkHtml = `<a class="loc-badge" style="background:#ecfdf5;color:#047857;border-color:#a7f3d0;" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/${dirPath}">🗺️ Googleマップで経路を開く (${coordLocs.length}地点)</a>`;
  }
  const locHtml = locs.length > 0
    ? `<div class="meta-row">${locs.map(l => {
        const hasCoord = l.lat !== null && l.lng !== null;
        const href = hasCoord
          ? `https://www.google.com/maps/search/?api=1&query=${l.lat},${l.lng}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.name)}`;
        return `<a class="loc-badge" target="_blank" rel="noopener" title="${hasCoord ? `${l.lat},${l.lng}` : '名称検索'}" href="${href}">📍 ${esc(l.name)}</a>`;
      }).join('')}${mapLinkHtml}</div>`
    : '';
  const mediaHtml = ids.length > 0
    ? `<div class="thumb-strip">${ids.map((fid, i) => `<img class="thumb-img" data-file-id="${esc(fid)}" src="${placeholder}" alt="写真${i + 1}" onclick="openImagePreview('${esc(fid)}','${esc(urls[i] || '')}')">`).join('')}</div>`
    : (urls.length > 0 ? `<div class="meta-row" style="margin-top:8px;">${urls.map((u, i) => `<a class="q-link" target="_blank" href="${esc(u)}">📷 写真${i + 1}</a>`).join('')}</div>` : '');

  const dayMeals = mealData.filter(m => m.date === d.date).sort((a, b) => (MEAL_ORDER[a.mealType] || 9) - (MEAL_ORDER[b.mealType] || 9));
  let mealHtml = '';
  if (dayMeals.length > 0) {
    const sumK = dayMeals.reduce((s, m) => s + Number(m.calories || 0), 0);
    const mealPills = dayMeals.map(m => `<span class="meal-badge" style="margin-top:4px;cursor:pointer;" onclick="goToMealDate('${esc(d.date)}')">${esc(m.mealType)}: ${esc(m.dishName)}${m.calories ? ` (${esc(m.calories)}kcal)` : ''}</span>`).join(' ');
    mealHtml = `<div style="margin-top:6px;"><span style="font-size:11px;font-weight:700;color:#047857;cursor:pointer;" onclick="goToMealDate('${esc(d.date)}')">🍽️ 食事記録へ (${dayMeals.length}食${sumK ? ` / 計${sumK}kcal` : ''}) ›</span><div>${mealPills}</div></div>`;
  } else {
    const hasMeal = d.calories !== '' && d.calories !== undefined && d.calories !== null;
    const pfcParts = [
      d.protein !== '' && d.protein !== undefined ? `P:${d.protein}g` : '',
      d.fat !== '' && d.fat !== undefined ? `F:${d.fat}g` : '',
      d.carbs !== '' && d.carbs !== undefined ? `C:${d.carbs}g` : '',
    ].filter(Boolean).join(' ');
    if (d.mealType || hasMeal || d.nutritionAdvice) {
      mealHtml = `<div class="meal-badge">🍽️ ${esc(d.mealType || '食事')}${hasMeal ? ` ・ ${esc(d.calories)} kcal` : ''}${pfcParts ? `（${esc(pfcParts)}）` : ''}</div>${d.nutritionAdvice ? `<div class="card-cast">💡 ${esc(d.nutritionAdvice)}</div>` : ''}`;
    }
  }

  const cleanTitle = String(d.title || '').trim();
  const titleHtml = cleanTitle ? `<h3 class="card-title">${esc(cleanTitle)}</h3>` : '';
  const rowNum = Number(d.row || 0);
  const isEditing = activeInlineEdit && activeInlineEdit.type === 'diary' && Number(activeInlineEdit.row) === rowNum;
  const inlineLocChipsHtml = isEditing ? buildInlineLocChipsHtml(rowNum) : '';
  const bodyHtml = isEditing
    ? `<div class="inline-edit-wrap">
        <input id="inline-title-diary-${rowNum}" class="inline-title-input" value="${esc(d.title || '')}" placeholder="タイトル（任意）">
        <div class="inline-loc-wrap">
          <div id="inline-loc-chips-diary-${rowNum}" class="loc-chips">${inlineLocChipsHtml}</div>
          <div class="inline-loc-row">
            <input id="inline-loc-input-diary-${rowNum}" placeholder="場所名を入力して ＋ / 📍 / 🔍" onfocus="showInlineDiaryLocSuggestions(${rowNum})" oninput="showInlineDiaryLocSuggestions(${rowNum})" onblur="hideInlineDiaryLocSuggestions(${rowNum})" onkeydown="if(event.key==='Enter'){event.preventDefault();addInlineDiaryLocationFromInput(${rowNum});}">
            <button type="button" class="btn-sm" onclick="addInlineDiaryLocationFromInput(${rowNum})" title="入力した場所を追加">＋</button>
            <button type="button" class="btn-sm" id="btn-inline-loc-gps-${rowNum}" onclick="fetchInlineNearbyLocations(${rowNum})" title="現在地から近傍スポットを取得">📍</button>
            <button type="button" class="btn-sm" id="btn-inline-loc-search-${rowNum}" onclick="searchInlineLocationByKeyword(${rowNum})" title="キーワードで場所を検索">🔍</button>
          </div>
          <div id="inline-loc-status-diary-${rowNum}" class="inline-loc-status"></div>
          <div id="inline-loc-suggest-diary-${rowNum}" class="tag-suggest-box"></div>
        </div>
        <textarea id="inline-ta-diary-${rowNum}" class="inline-edit-ta" oninput="autoResizeTextarea(this, 180)" placeholder="出来事やメモ...">${esc(d.body || '')}</textarea>
        <div class="inline-edit-actions">
          <button class="btn-sm primary" onclick="saveInlineDiary(${rowNum})">💾 保存</button>
          <button class="btn-sm" onclick="cancelInlineEdit()">キャンセル</button>
          <button class="btn-sm" onclick="openDetailFromInline('diary', ${rowNum}, '${esc(d.id)}')">⚙️ 日付・写真などの詳細</button>
        </div>
      </div>`
    : `<div class="card-summary editable-text-area" style="white-space:pre-wrap;word-break:break-word;" onclick="startInlineEdit('diary', ${rowNum}, event)">${d.body ? renderRichText(d.body) : '<span style="color:#9ca3af;">タップして本文を追記...</span>'}</div>`;
  return `
    <div class="card diary-card" id="dcard-${rowNum}">
      <div class="card-header">
        <div class="card-date">${esc(formatDiaryDateLabel(d.date, d.weekday))}</div>
        ${isEditing ? '' : titleHtml}
      </div>
      ${isEditing ? '' : locHtml}
      ${mediaHtml}
      ${bodyHtml}
      ${mealHtml}
      ${isEditing ? '' : `<div class="card-actions">
        <button class="btn-sm primary" onclick="startInlineEdit('diary', ${rowNum})">✏️ 編集</button>
        <button class="btn-sm success" onclick="quickAnalyzeMeal(${rowNum}, '${esc(d.id)}')">🍽️ 栄養分析</button>
        <button class="btn-sm" onclick="openMealModal('${esc(d.date)}')">＋ 食事追加</button>
      </div>`}
    </div>`;
}

async function showMoreDiary() {
  if (diaryDisplayLimit < diaryData.length) {
    diaryDisplayLimit += 80;
    renderDiary();
    return;
  }
  if (diaryHasMore) {
    await loadDiaryData(false, { offset: diaryData.length, append: true });
    diaryDisplayLimit += 80;
    renderDiary();
  }
}

function renderDiary() {
  const sortMode = document.getElementById('diary-sort')?.value || 'desc';
  const list = [...diaryData].sort((a, b) => {
    if (sortMode === 'asc') {
      return String(a.date || '').localeCompare(String(b.date || '')) || (Number(a.row || 0) - Number(b.row || 0));
    }
    return String(b.date || '').localeCompare(String(a.date || '')) || (Number(b.row || 0) - Number(a.row || 0));
  });
  const sliced = list.slice(0, diaryDisplayLimit);
  const totalLabel = diaryTotalCount > 0 ? diaryTotalCount : list.length;
  const filtLabel = diaryFilteredCount > 0 ? diaryFilteredCount : list.length;
  const scopeNote = (!diaryPeriodFilter && !document.getElementById('diary-search').value.trim() && sortMode === 'desc') ? '（直近3か月・DB全' + totalLabel + '件）' : `（DB全${totalLabel}件）`;
  document.getElementById('diary-count').textContent = `表示中: ${sliced.length}件 / 該当${filtLabel}件${scopeNote}`;
  document.getElementById('diary-more-wrap').style.display = (list.length > diaryDisplayLimit || diaryHasMore) ? 'block' : 'none';

  const container = document.getElementById('diary-list');
  if (sliced.length === 0) { container.innerHTML = '<div class="loading">該当する日記がありません</div>'; return; }
  container.innerHTML = sliced.map(buildDiaryCardHtml).join('');

  ensureThumbObserver();
  container.querySelectorAll('img.thumb-img[data-file-id]').forEach(img => thumbObserver.observe(img));
}


function renderEditExistingPhotos(entry) {
  const wrap = document.getElementById('d-existing-photos');
  const urls = (entry && entry.imageUrls) || [];
  const ids = (entry && entry.imageIds) || [];
  if (urls.length === 0) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = urls.map((u, idx) => {
    const fid = ids[idx] || '';
    const isRemoved = removedPhotoUrls.has(u);
    const src = (fid && thumbMemCache[fid]) ? thumbMemCache[fid] : 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    return `
      <div class="edit-photo-item ${isRemoved ? 'removed' : ''}">
        <img class="thumb-img" style="width:76px;height:76px;" data-file-id="${esc(fid)}" src="${src}" alt="既存写真${idx + 1}">
        <button type="button" class="edit-photo-del" onclick="toggleRemoveExistingPhoto('${esc(u)}')" title="削除/復元">${isRemoved ? '↺' : '✕'}</button>
      </div>`;
  }).join('');
  ensureThumbObserver();
  wrap.querySelectorAll('img.thumb-img[data-file-id]').forEach(img => thumbObserver.observe(img));
}

function toggleRemoveExistingPhoto(url) {
  if (removedPhotoUrls.has(url)) removedPhotoUrls.delete(url);
  else removedPhotoUrls.add(url);
  renderEditExistingPhotos(editingDiary);
}


function openDiaryModal() {
  if (diaryData.length === 0) loadDiaryData(false).catch(() => {});
  editingDiary = null;
  diaryLocations = [];
  removedPhotoUrls = new Set();
  document.getElementById('diary-modal-title').textContent = '📓 日記を書く';
  document.getElementById('btn-save-diary').textContent = '日記を保存する';
  document.getElementById('btn-delete-diary').style.display = 'none';
  document.getElementById('d-photos-label').textContent = '写真（自動で1200px以下にリサイズしてDrive保存）';
  document.getElementById('d-date').value = getLocalTodayIso();
  document.getElementById('d-title').value = '';
  document.getElementById('d-loc').value = '';
  document.getElementById('d-body').value = '';
  document.getElementById('d-meal-type').value = '';
  document.getElementById('d-cal').value = '';
  document.getElementById('d-p').value = '';
  document.getElementById('d-f').value = '';
  document.getElementById('d-c').value = '';
  document.getElementById('d-nut-advice').value = '';
  document.getElementById('d-photos').value = '';
  renderLocationChips();
  renderEditExistingPhotos(null);
  resetLocationPicker();
  showLocationHistory();
  document.getElementById('modal-diary').classList.add('open');
}

function openEditDiaryModal(row, id) {
  const entry = diaryData.find(x => (row && x.row === row) || String(x.id) === String(id));
  if (!entry) return;
  editingDiary = entry;
  diaryLocations = normalizeDiaryLocations(entry).map(x => ({ ...x }));
  removedPhotoUrls = new Set();
  document.getElementById('diary-modal-title').textContent = '✏️ 日記を編集';
  document.getElementById('btn-save-diary').textContent = '変更を保存する';
  document.getElementById('btn-delete-diary').style.display = 'block';
  document.getElementById('d-photos-label').textContent = '写真（既存写真の削除 / 新規写真の追加）';
  document.getElementById('d-date').value = entry.date || '';
  document.getElementById('d-title').value = entry.title || '';
  document.getElementById('d-loc').value = '';
  document.getElementById('d-body').value = entry.body || '';
  document.getElementById('d-meal-type').value = entry.mealType || '';
  document.getElementById('d-cal').value = entry.calories !== '' && entry.calories !== undefined ? entry.calories : '';
  document.getElementById('d-p').value = entry.protein !== '' && entry.protein !== undefined ? entry.protein : '';
  document.getElementById('d-f').value = entry.fat !== '' && entry.fat !== undefined ? entry.fat : '';
  document.getElementById('d-c').value = entry.carbs !== '' && entry.carbs !== undefined ? entry.carbs : '';
  document.getElementById('d-nut-advice').value = entry.nutritionAdvice || '';
  document.getElementById('d-photos').value = '';
  renderLocationChips();
  renderEditExistingPhotos(entry);
  resetLocationPicker();
  showLocationHistory();
  document.getElementById('modal-diary').classList.add('open');
}

async function goToMealDate(date) {
  switchTab('nutrition');
  if (mealData.length === 0) await loadMealsData(true);
  setTimeout(() => highlightElement(document.getElementById(`meal-day-${date}`)), 80);
}

async function goToDiaryDate(date) {
  document.getElementById('diary-search').value = '';
  document.getElementById('diary-ym').value = '';
  switchTab('diary');
  if (diaryData.length === 0) await loadDiaryData(false);

  let idx = diaryData.findIndex(d => d.date === date);
  if (idx < 0) {
    // 未作成の日は日記の受け皿を自動作成して遷移
    try {
      const res = await apiPost('addDiary', {
        date,
        title: `${date}の日記`,
        body: '（食事記録から作成）',
        location: '',
      });
      if (res && res.ok) {
        await loadDiaryData(false);
        idx = diaryData.findIndex(d => d.date === date);
      }
    } catch (e) { /* fallback to modal */ }
  }
  if (idx >= 0) {
    if (idx >= diaryDisplayLimit) diaryDisplayLimit = idx + 20;
    renderDiary();
    const target = diaryData[idx];
    setTimeout(() => highlightElement(document.getElementById(`dcard-${Number(target.row || 0)}`)), 80);
  } else {
    openDiaryModal();
    document.getElementById('d-date').value = date;
  }
}


async function submitDiary() {
  const body = document.getElementById('d-body').value.trim();
  if (!body) { alert('本文を入力してください'); return; }
  // 入力欄に残っている未追加の場所テキストも自動追加
  const pendingLoc = document.getElementById('d-loc').value.trim();
  if (pendingLoc) {
    pendingLoc.split(/\r?\n/).forEach(v => addDiaryLocation(v));
    document.getElementById('d-loc').value = '';
  }

  const btn = document.getElementById('btn-save-diary');
  const isEdit = Boolean(editingDiary);
  const targetDiary = editingDiary;
  const origLabel = isEdit ? '変更を保存する' : '日記を保存する';
  btn.disabled = true; btn.textContent = '準備中...';

  let photos = [];
  try {
    const files = Array.from(document.getElementById('d-photos').files || []);
    const skippedFiles = [];
    for (const f of files) {
      try {
        btn.textContent = `写真変換中 (${photos.length + skippedFiles.length + 1}/${files.length})...`;
        photos.push(await resizeImageToJpgBase64(f, 1200, 0.8));
      } catch {
        skippedFiles.push(f.name);
      }
    }
    if (skippedFiles.length > 0) {
      const okToProceed = confirm(`以下の写真はブラウザで変換できなかったためスキップされます（HEIC非対応環境など）:\n${skippedFiles.join(', ')}\n\nこのまま本文・位置情報を保存しますか？`);
      if (!okToProceed) return;
    }
    photos.sort((a, b) => (b.ts || 0) - (a.ts || 0));
  } finally {
    btn.disabled = false;
    btn.textContent = origLabel;
  }

  const dateVal = document.getElementById('d-date').value;
  const titleVal = document.getElementById('d-title').value;
  const locsCopy = diaryLocations.map(l => ({ ...l }));
  const payload = {
    date: dateVal,
    title: titleVal,
    location: locsCopy.map(l => l.name).join('\n'),
    locations: locsCopy,
    body,
    photos,
    mealType: document.getElementById('d-meal-type').value,
    calories: document.getElementById('d-cal').value,
    protein: document.getElementById('d-p').value,
    fat: document.getElementById('d-f').value,
    carbs: document.getElementById('d-c').value,
    nutritionAdvice: document.getElementById('d-nut-advice').value,
    clientRequestId: generateClientRequestId(),
  };
  saveLocationToHistory(locsCopy);
  if (isEdit) {
    payload.row = targetDiary.row;
    payload.id = targetDiary.id;
    payload.removeUrls = Array.from(removedPhotoUrls);
  }
  const actionName = isEdit ? 'updateDiary' : 'addDiary';
  // 成功が確認できるまで端末内（localStorage）に下書きを永続保持
  savePendingDiaryDraft({ action: actionName, payload, savedAt: Date.now() });

  // 楽観的更新：即座にモーダルを閉じてタイムラインへ仮反映
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  const wd = weekdays[new Date(`${dateVal}T00:00:00+09:00`).getDay()] || '';
  const snapshot = diaryData.map(x => ({ ...x }));
  const tempKey = isEdit ? targetDiary.id : `temp-${Date.now()}`;
  const optimisticItem = {
    row: isEdit ? targetDiary.row : 0,
    id: tempKey,
    date: dateVal,
    weekday: wd,
    title: titleVal,
    body,
    location: payload.location,
    locations: locsCopy,
    imageCount: isEdit ? (targetDiary.imageCount || 0) + photos.length : photos.length,
    imageUrls: isEdit ? (targetDiary.imageUrls || []) : [],
    imageIds: isEdit ? (targetDiary.imageIds || []) : [],
    mealType: payload.mealType,
    calories: payload.calories !== '' ? Number(payload.calories) : '',
    protein: payload.protein !== '' ? Number(payload.protein) : '',
    fat: payload.fat !== '' ? Number(payload.fat) : '',
    carbs: payload.carbs !== '' ? Number(payload.carbs) : '',
    nutritionAdvice: payload.nutritionAdvice,
  };

  if (isEdit) {
    const idx = diaryData.findIndex(x => (targetDiary.row && x.row === targetDiary.row) || String(x.id) === String(targetDiary.id));
    if (idx >= 0) diaryData[idx] = optimisticItem;
  } else {
    diaryData.unshift(optimisticItem);
    switchTab('diary');
  }
  editingDiary = null;
  closeModals();
  renderDiary();
  if (document.getElementById('view-nutrition').style.display !== 'none') renderNutritionView();
  showToast('日記を保存中...', 'info', null, 0);

  const sendDiary = async () => {
    try {
      const res = await apiPost(actionName, payload);
      if (!res || !res.ok) throw new Error((res && res.error) || '保存に失敗しました');
      clearPendingDiaryDraft();
      if (res.failedPhotos && res.failedPhotos.length > 0) {
        alert(`日記は保存されましたが、以下の写真アップロードに失敗しました:\n${res.failedPhotos.join(', ')}`);
      }
      if (res.entry) {
        const idx = diaryData.findIndex(x => String(x.id) === String(tempKey) || (res.entry.row && x.row === res.entry.row));
        if (idx >= 0) diaryData[idx] = res.entry;
        else diaryData.unshift(res.entry);
        renderDiary();
        if (document.getElementById('view-nutrition').style.display !== 'none') renderNutritionView();
      }
      if (res.needsDocSync && res.docSyncPayload) {
        triggerDiaryDocSyncWithRetry(res.docSyncPayload);
      }
      showToast('保存しました', 'success', null, 2000);
    } catch (err) {
      const errMsg = (err && err.message) ? err.message : String(err);
      diaryData = snapshot;
      renderDiary();
      if (document.getElementById('view-nutrition').style.display !== 'none') renderNutritionView();
      showUnsentDiaryBar(errMsg);
      showToast(`⚠️ 保存できませんでした（入力内容は保持しています）: ${errMsg}`, 'error', () => {
        diaryData = isEdit
          ? snapshot.map(x => ((targetDiary.row && x.row === targetDiary.row) || String(x.id) === String(targetDiary.id)) ? optimisticItem : x)
          : [optimisticItem, ...snapshot];
        renderDiary();
        showToast('日記を再送中...', 'info', null, 0);
        sendDiary();
      }, 0);
    }
  };
  sendDiary();
}

async function deleteCurrentDiary() {
  if (!editingDiary) return;
  if (!confirm(`「${editingDiary.date} ${editingDiary.title || '(無題)'}」を削除しますか？（元に戻せません）`)) return;
  const target = editingDiary;
  const snapshot = diaryData.map(x => ({ ...x }));
  diaryData = diaryData.filter(x => !(target.row && x.row === target.row) && String(x.id) !== String(target.id));
  editingDiary = null;
  closeModals();
  renderDiary();
  if (document.getElementById('view-nutrition').style.display !== 'none') renderNutritionView();
  showToast('日記を削除中...', 'info', null, 0);

  try {
    const res = await apiPost('deleteDiary', { row: target.row, id: target.id });
    if (!res || !res.ok) throw new Error((res && res.error) || '削除に失敗しました');
    showToast('日記を削除しました', 'success', null, 2200);
  } catch (err) {
    diaryData = snapshot;
    renderDiary();
    if (document.getElementById('view-nutrition').style.display !== 'none') renderNutritionView();
    showToast(`削除失敗（元に戻しました）: ${err.message || err}`, 'error', null, 5000);
  }
}

