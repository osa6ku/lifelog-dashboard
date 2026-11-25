function getAvailableYearsAsc(yearCounts) {
  return (Array.isArray(yearCounts) ? yearCounts : [])
    .filter(x => x && Number(x.year) > 0 && Number(x.count) > 0)
    .map(x => Number(x.year))
    .sort((a, b) => a - b);
}

/**
 * エントリが存在する年のみを対象に前年(delta=-1)／次年(delta=+1)を解決する（3-53）。
 * 範囲外（最古年より前・最新年より後・直近モードでの次年）の場合は null を返す。
 */
function stepAvailableYear(curPeriod, delta, yearCounts) {
  const years = getAvailableYearsAsc(yearCounts);
  if (years.length === 0) return null;
  const dir = delta < 0 ? -1 : 1;
  const m = String(curPeriod || '').match(/^(\d{4})/);
  if (!m) {
    // 「直近」表示中: 次年へは進めず（null）、前年なら最新年の1つ前（1年しかなければその年）へ移動
    if (dir > 0) return null;
    if (years.length >= 2) return String(years[years.length - 2]);
    return String(years[0]);
  }
  const curY = Number(m[1]);
  const idx = years.indexOf(curY);
  if (idx >= 0) {
    const nextIdx = idx + dir;
    if (nextIdx < 0 || nextIdx >= years.length) return null;
    return String(years[nextIdx]);
  }
  if (dir < 0) {
    const older = years.filter(y => y < curY);
    return older.length > 0 ? String(older[older.length - 1]) : null;
  }
  const newer = years.filter(y => y > curY);
  return newer.length > 0 ? String(newer[0]) : null;
}

function renderYearPicker(prefix, yearCounts, curPeriod) {
  const sel = document.getElementById(`${prefix}-year-select`);
  if (!sel) return;
  const list = (Array.isArray(yearCounts) ? yearCounts : [])
    .filter(x => x && Number(x.year) > 0 && Number(x.count) > 0)
    .sort((a, b) => Number(b.year) - Number(a.year));
  const curYear = /^\d{4}/.test(String(curPeriod || '')) ? String(curPeriod).slice(0, 4) : '';
  const defaultLabel = prefix === 'diary' ? '直近' : '直近';
  const options = [`<option value="">${defaultLabel}</option>`];
  list.forEach(item => {
    const y = String(item.year);
    options.push(`<option value="${y}">${y}年 (${item.count})</option>`);
  });
  sel.innerHTML = options.join('');
  sel.value = list.some(x => String(x.year) === curYear) ? curYear : '';
  updateYearNavButtons(prefix, curPeriod, list);
}

function updateYearNavButtons(prefix, curPeriod, yearCounts) {
  const prevBtn = document.getElementById(`${prefix}-year-prev`);
  const nextBtn = document.getElementById(`${prefix}-year-next`);
  if (prevBtn) prevBtn.disabled = stepAvailableYear(curPeriod, -1, yearCounts) === null;
  if (nextBtn) nextBtn.disabled = stepAvailableYear(curPeriod, 1, yearCounts) === null;
}

function toggleListToolsDrawer(prefix) {
  const drawer = document.getElementById(`${prefix}-tools-drawer`);
  const btn = document.getElementById(`btn-${prefix}-tools`);
  if (!drawer) return;
  const isOpen = drawer.classList.toggle('open');
  if (btn) btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  if (isOpen) {
    const searchEl = document.getElementById(`${prefix}-search`);
    if (searchEl && typeof searchEl.focus === 'function') searchEl.focus();
  }
}

function updatePeriodUi(prefix, periodVal, q, sortVal) {
  const labelEl = document.getElementById(`${prefix}-period-label`);
  const resetBtn = document.getElementById(`btn-${prefix}-reset`);
  const ymInput = document.getElementById(`${prefix}-ym`);
  const yearSel = document.getElementById(`${prefix}-year-select`);
  const toolsBtn = document.getElementById(`btn-${prefix}-tools`);
  const yearCounts = prefix === 'diary' ? diaryYearCounts : watchYearCounts;

  if (ymInput) {
    ymInput.value = /^\d{4}-\d{2}$/.test(periodVal) ? periodVal : '';
  }
  if (yearSel) {
    const y = /^\d{4}/.test(String(periodVal || '')) ? String(periodVal).slice(0, 4) : '';
    yearSel.value = y;
  }
  updateYearNavButtons(prefix, periodVal, yearCounts);

  if (labelEl) {
    if (periodVal) {
      labelEl.textContent = /^\d{4}$/.test(periodVal) ? `${periodVal}年` : periodVal;
      labelEl.style.display = 'inline-block';
    } else {
      labelEl.style.display = 'none';
    }
  }
  const hasDrawerFilter = Boolean(q || /^\d{4}-\d{2}$/.test(periodVal || ''));
  if (toolsBtn) toolsBtn.classList.toggle('active-filter', hasDrawerFilter);
  const isCustom = Boolean(periodVal || q || (sortVal && sortVal !== 'desc'));
  if (resetBtn) resetBtn.style.display = isCustom ? 'inline-block' : 'none';
}

function shiftYearStr(curPeriod, delta) {
  const today = getLocalTodayIso();
  const baseYear = /^\d{4}/.test(curPeriod) ? Number(curPeriod.slice(0, 4)) : Number(today.slice(0, 4));
  return String(baseYear + delta);
}

function shiftMonthStr(curPeriod, delta) {
  const today = getLocalTodayIso();
  let y = Number(today.slice(0, 4));
  let m = Number(today.slice(5, 7));
  if (/^\d{4}-\d{2}$/.test(curPeriod)) {
    y = Number(curPeriod.slice(0, 4));
    m = Number(curPeriod.slice(5, 7));
  } else if (/^\d{4}$/.test(curPeriod)) {
    y = Number(curPeriod);
    m = delta < 0 ? 12 : 1;
    return `${y}-${String(m).padStart(2, '0')}`;
  }
  const dt = new Date(y, m - 1 + delta, 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}


function updateCrossSearchReturnBar() {
  const bar = document.getElementById('cross-search-return-bar');
  const btn = document.getElementById('cross-search-return-btn');
  if (!bar || !btn) return;
  if (crossSearchState.active && crossSearchState.query) {
    btn.textContent = `← 検索結果に戻る「${crossSearchState.query}」（日記${crossSearchState.diaryCount} / 鑑賞${crossSearchState.watchCount}）`;
    bar.classList.add('show');
  } else {
    bar.classList.remove('show');
  }
}

function dismissCrossSearchReturnBar() {
  crossSearchState.active = false;
  updateCrossSearchReturnBar();
}

function openCrossSearch(initialQ) {
  const input = document.getElementById('cross-search-input');
  const q = String(initialQ || '').trim();
  input.value = q;
  // 新規に横断検索を開く場合のみ表示をクリア
  document.getElementById('cross-search-results').innerHTML = '';
  document.getElementById('modal-cross-search').classList.add('open');
  input.focus();
  if (q) execCrossSearch();
}

function renderCrossSearchResults() {
  const out = document.getElementById('cross-search-results');
  if (!out) return;
  const q = crossSearchState.query;
  const dList = crossSearchState.diary || [];
  const wList = crossSearchState.watch || [];
  let html = `<div class="count-bar">検索「${esc(q)}」: 日記 ${crossSearchState.diaryCount || 0}件 / 鑑賞記録 ${crossSearchState.watchCount || 0}件（タップで記事本体へ移動）</div>`;
  if (dList.length === 0 && wList.length === 0) {
    html += '<div class="loading">該当する記録がありません</div>';
  } else {
    if (dList.length > 0) {
      html += `<h4 style="margin:10px 0 6px;font-size:13px;color:var(--primary);">📓 日記（${dList.length}件表示）</h4>`;
      html += dList.map((d, idx) => {
        const key = `diary:${idx}`;
        const isLast = crossSearchState.lastVisitedKey === key;
        const isVisited = crossSearchState.visitedKeys.has(key);
        const cardStyle = isLast
          ? 'padding:10px;margin-bottom:8px;cursor:pointer;border:2px solid var(--primary);background:#eff6ff;'
          : 'padding:10px;margin-bottom:8px;cursor:pointer;';
        const badge = isLast
          ? '<span class="cross-visited-badge">👁️ 直前閲覧</span>'
          : (isVisited ? '<span class="cross-visited-badge done">✓ 閲覧済</span>' : '');
        return `<div class="card" role="button" tabindex="0" style="${cardStyle}" onclick="openCrossSearchResult('diary', ${idx})">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <span style="font-size:12px;color:var(--muted);font-weight:700;">${esc(d.date)} ${esc(d.title || '')}</span>
            <span style="display:inline-flex;align-items:center;gap:4px;">${badge}<span style="font-size:11px;color:var(--primary);font-weight:700;white-space:nowrap;">開く ›</span></span>
          </div>
          <div style="font-size:13px;margin-top:4px;white-space:pre-wrap;">${esc(String(d.body || '').slice(0, 140))}</div>
        </div>`;
      }).join('');
    }
    if (wList.length > 0) {
      html += `<h4 style="margin:10px 0 6px;font-size:13px;color:#047857;">🎬 鑑賞記録（${wList.length}件表示）</h4>`;
      html += wList.map((w, idx) => {
        const key = `watch:${idx}`;
        const isLast = crossSearchState.lastVisitedKey === key;
        const isVisited = crossSearchState.visitedKeys.has(key);
        const cardStyle = isLast
          ? 'padding:10px;margin-bottom:8px;cursor:pointer;border:2px solid #047857;background:#ecfdf5;'
          : 'padding:10px;margin-bottom:8px;cursor:pointer;';
        const badge = isLast
          ? '<span class="cross-visited-badge" style="background:#d1fae5;color:#047857;">👁️ 直前閲覧</span>'
          : (isVisited ? '<span class="cross-visited-badge done">✓ 閲覧済</span>' : '');
        return `<div class="card" role="button" tabindex="0" style="${cardStyle}" onclick="openCrossSearchResult('watch', ${idx})">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
            <span style="font-size:13px;font-weight:700;">${esc(w.title)} <span class="tag-pill">${esc(w.status || '')}</span></span>
            <span style="display:inline-flex;align-items:center;gap:4px;">${badge}<span style="font-size:11px;color:#047857;font-weight:700;white-space:nowrap;">開く ›</span></span>
          </div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">${esc(w.watchDate || '')} ${w.cast ? '👥 ' + esc(w.cast.slice(0, 60)) : ''}</div>
          ${w.memo ? `<div style="font-size:12px;margin-top:4px;white-space:pre-wrap;">${esc(String(w.memo).slice(0, 120))}</div>` : ''}
        </div>`;
      }).join('');
    }
  }
  out.innerHTML = html;
}

async function execCrossSearch() {
  const q = document.getElementById('cross-search-input').value.trim();
  const out = document.getElementById('cross-search-results');
  if (!q) { out.innerHTML = '<div class="loading">検索キーワードを入力してください</div>'; return; }
  out.innerHTML = '<div class="loading">全期間から横断検索中...</div>';
  try {
    const res = await apiGet({ api: 'search', q, scope: 'all', limit: '50' });
    crossSearchState = {
      active: false,
      query: q,
      diaryCount: Number(res.diaryCount || 0),
      watchCount: Number(res.watchCount || 0),
      diary: res.diaryEntries || [],
      watch: res.watchEntries || [],
      scrollTop: 0,
      visitedKeys: new Set(),
      lastVisitedKey: '',
    };
    updateCrossSearchReturnBar();
    renderCrossSearchResults();
    out.scrollTop = 0;
  } catch (err) {
    out.innerHTML = `<div class="loading" style="color:#b91c1c;">検索エラー: ${esc(err.message)}</div>`;
  }
}

async function returnToCrossSearchResults() {
  if (!crossSearchState.query) return;
  // 3-36 未保存保護：インライン編集中に戻るを押した場合
  if (activeInlineEdit && hasUnsavedInlineChanges()) {
    const shouldSave = confirm('編集中の未保存内容があります。保存してから検索結果に戻りますか？\n（OK：保存して戻る / キャンセル：現在の編集を続ける）');
    if (!shouldSave) return;
    const saved = activeInlineEdit.type === 'diary'
      ? await saveInlineDiary(activeInlineEdit.row, { waitForCommit: true })
      : await saveInlineWatch(activeInlineEdit.row, { waitForCommit: true });
    if (!saved) return;
  }
  const input = document.getElementById('cross-search-input');
  const out = document.getElementById('cross-search-results');
  if (input) input.value = crossSearchState.query;
  // 再検索の通信は一切発生させず、保持済みデータからそのまま復元
  renderCrossSearchResults();
  document.getElementById('modal-cross-search').classList.add('open');
  const savedScroll = Number(crossSearchState.scrollTop || 0);
  setTimeout(() => {
    if (out) out.scrollTop = savedScroll;
  }, 0);
}

async function openCrossSearchResult(type, idx) {
  const entry = type === 'diary' ? crossSearchState.diary[idx] : crossSearchState.watch[idx];
  if (!entry) return;

  // 3-36 未保存保護：別カードをインライン編集中の場合は保存確認してから移動
  if (activeInlineEdit && hasUnsavedInlineChanges()) {
    const shouldSave = confirm('編集中の未保存内容があります。保存してから移動しますか？\n（OK：保存して移動 / キャンセル：現在の編集を続ける）');
    if (!shouldSave) return;
    const saved = activeInlineEdit.type === 'diary'
      ? await saveInlineDiary(activeInlineEdit.row, { waitForCommit: true })
      : await saveInlineWatch(activeInlineEdit.row, { waitForCommit: true });
    if (!saved) return;
  } else if (activeInlineEdit) {
    activeInlineEdit = null;
    inlineDiaryLocations = [];
    inlineDiaryOrigCoords = new Map();
  }

  // スクロール位置と閲覧済み状態を保存し、戻る導線を有効化
  const outEl = document.getElementById('cross-search-results');
  crossSearchState.scrollTop = outEl ? outEl.scrollTop : 0;
  const vKey = `${type}:${idx}`;
  crossSearchState.visitedKeys.add(vKey);
  crossSearchState.lastVisitedKey = vKey;
  crossSearchState.active = true;
  updateCrossSearchReturnBar();

  closeModals();
  const targetRow = Number(entry.row || 0);

  if (type === 'diary') {
    switchTab('diary');
    document.getElementById('diary-search').value = '';
    const ym = /^\d{4}-\d{2}/.test(String(entry.date || '')) ? String(entry.date).slice(0, 7) : '';
    diaryPeriodFilter = ym;
    try {
      await loadDiaryData(false, { offset: 0, append: false });
    } catch (err) {
      showToast('該当期間の読み込みに失敗しました: ' + err.message, true);
    }
    if (!diaryData.some(d => Number(d.row) === targetRow)) {
      diaryData = [entry, ...diaryData];
    }
    const sortMode = document.getElementById('diary-sort')?.value || 'desc';
    const sorted = [...diaryData].sort((a, b) => sortMode === 'asc'
      ? String(a.date || '').localeCompare(String(b.date || '')) || (Number(a.row || 0) - Number(b.row || 0))
      : String(b.date || '').localeCompare(String(a.date || '')) || (Number(b.row || 0) - Number(a.row || 0)));
    const pos = sorted.findIndex(d => Number(d.row) === targetRow);
    if (pos >= diaryDisplayLimit) diaryDisplayLimit = pos + 10;
    renderDiary();
    setTimeout(() => {
      const cardEl = document.getElementById(`dcard-${targetRow}`);
      if (cardEl) highlightElement(cardEl);
    }, 60);
  } else {
    switchTab('watch');
    document.getElementById('watch-search').value = '';
    watchSearchActive = false;
    watchStatusBeforeSearch = null;
    watchLastSearchQuery = '';
    // ステータス・区分・PFフィルタを対象記事が見えるよう自動調整
    if (statusFilter !== 'ALL' && statusFilter !== entry.status) {
      statusFilter = 'ALL';
      document.querySelectorAll('#status-chips .chip').forEach(c => {
        c.classList.toggle('active', c.dataset.val === 'ALL');
      });
    }
    catFilter = 'ALL';
    platFilter = 'ALL';
    document.querySelectorAll('#cat-chips .chip').forEach(c => {
      c.classList.toggle('active-green', c.dataset.val === 'ALL');
    });
    const ym = /^\d{4}-\d{2}/.test(String(entry.watchDate || '')) ? String(entry.watchDate).slice(0, 7) : '';
    watchPeriodFilter = ym;
    try {
      await loadWatchData({ offset: 0, append: false });
    } catch (err) {
      showToast('該当期間の読み込みに失敗しました: ' + err.message, true);
    }
    if (!watchData.some(w => Number(w.row) === targetRow)) {
      watchData = [entry, ...watchData];
    }
    const sortMode = document.getElementById('watch-sort')?.value || 'desc';
    const sorted = [...watchData].sort((a, b) => {
      if (sortMode === 'asc') return (a.watchDate || '9999-99-99').localeCompare(b.watchDate || '9999-99-99') || Number(a.id || 0) - Number(b.id || 0);
      if (sortMode === 'rating_desc') return (Number(b.rating) || 0) - (Number(a.rating) || 0) || String(b.watchDate || '').localeCompare(String(a.watchDate || ''));
      return String(b.watchDate || '').localeCompare(String(a.watchDate || '')) || Number(b.id || 0) - Number(a.id || 0);
    });
    const pos = sorted.findIndex(w => Number(w.row) === targetRow);
    if (pos >= watchDisplayLimit) watchDisplayLimit = pos + 10;
    renderWatch();
    setTimeout(() => {
      const cardEl = document.getElementById(`wcard-${targetRow}`);
      if (cardEl) highlightElement(cardEl);
    }, 60);
  }
}

