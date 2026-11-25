function renderReleaseNotes(history) {
  const list = Array.isArray(history) && history.length ? history : DEFAULT_RELEASE_NOTES;
  const el = document.getElementById('changelog-body');
  if (!el) return;
  el.innerHTML = list.map(item => `
    <div class="changelog-item">
      <div class="changelog-head">
        <span class="changelog-ver">${esc(item.version)}</span>
        <span class="changelog-date">${esc(item.date || '')}</span>
        <span class="changelog-title">${esc(item.title || '')}</span>
      </div>
      <ul class="changelog-ul">
        ${(item.items || []).map(li => `<li>${esc(li)}</li>`).join('')}
      </ul>
    </div>
  `).join('');
}

async function openReleaseNotesModal() {
  renderReleaseNotes(DEFAULT_RELEASE_NOTES);
  document.getElementById('modal-changelog').classList.add('open');
  try {
    const res = await fetch(`./version.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.history) && data.history.length > 0) {
        renderReleaseNotes(data.history);
      }
    }
  } catch (_) {}
}

const SWIPE_EDGE_GUARD_PX = 28;

function isSwipeGuardExcludedTarget(target) {
  if (!target || typeof target.closest !== 'function') return false;
  return Boolean(target.closest('input, textarea, select, [contenteditable="true"], .allow-x-scroll, .bottom-nav'));
}

function isSwipeEdgeStart(clientX, innerWidth, isExcluded) {
  if (isExcluded) return false;
  const w = Number(innerWidth || 0);
  return clientX < SWIPE_EDGE_GUARD_PX || (w > 0 && clientX > w - SWIPE_EDGE_GUARD_PX);
}

function shouldPreventSwipeGesture({ type, clientX, startX, startY, clientY, isExcluded, isEdge }) {
  // touchstart では絶対に preventDefault しない（タップ・縦スクロール開始を阻害しないため）
  if (type === 'touchstart') return false;
  if (isExcluded || !isEdge) return false;
  if (type === 'touchmove') {
    const dx = Math.abs(clientX - startX);
    const dy = Math.abs(clientY - startY);
    return dx > 24 && dx > dy * 2;
  }
  return false;
}

let swipeGuardInstalled = false;
function installNavigationSwipeGuard() {
  if (swipeGuardInstalled || typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  swipeGuardInstalled = true;
  let startX = 0;
  let startY = 0;
  let isEdge = false;
  let isExcluded = false;

  document.addEventListener('touchstart', (e) => {
    if (!e.touches || e.touches.length !== 1) {
      isEdge = false;
      isExcluded = true;
      return;
    }
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    isExcluded = isSwipeGuardExcludedTarget(e.target);
    isEdge = isSwipeEdgeStart(
      t.clientX,
      typeof window !== 'undefined' ? window.innerWidth : 0,
      isExcluded
    );
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!e.touches || e.touches.length !== 1) return;
    const t = e.touches[0];
    const shouldBlock = shouldPreventSwipeGesture({
      type: 'touchmove',
      clientX: t.clientX,
      clientY: t.clientY,
      startX,
      startY,
      isExcluded,
      isEdge,
    });
    if (shouldBlock && e.cancelable) {
      e.preventDefault();
    }
  }, { passive: false });
}

window.onload = () => {
  installNavigationSwipeGuard();
  const today = getLocalTodayIso();
  document.getElementById('w-date').value = today;
  document.getElementById('d-date').value = today;
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register(`./sw.js?v=${encodeURIComponent(APP_VERSION)}`).catch(() => {});
  }
  checkForUpdate();
  switchTab('diary');
};

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForUpdate();
});

async function checkForUpdate() {
  try {
    const res = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const info = await res.json();
    if (info && info.version && info.version !== APP_VERSION) {
      document.getElementById('new-ver-label').textContent = info.version;
      document.getElementById('update-banner').classList.add('show');
    }
    return info;
  } catch (e) {
    return null;
  }
}

async function manualCheckUpdate() {
  const btn = document.getElementById('btn-check-update');
  btn.disabled = true;
  btn.textContent = '確認中...';
  await checkForUpdate();
  await forceAppUpdate();
}

async function forceAppUpdate() {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    sessionStorage.clear();
  } catch (e) { /* ignore */ }
  location.replace(`${location.pathname}?v=${Date.now()}`);
}

function switchTab(tab) {
  if (activeDetailView && activeDetailView.type !== tab) {
    if (activeDetailView.type === 'diary') closeDiaryDetailView(false);
    else if (activeDetailView.type === 'watch') closeWatchDetailView(false);
  }
  document.getElementById('view-watch').style.display = tab === 'watch' ? 'block' : 'none';
  document.getElementById('view-diary').style.display = tab === 'diary' ? 'block' : 'none';
  document.getElementById('view-nutrition').style.display = tab === 'nutrition' ? 'block' : 'none';
  document.getElementById('nav-watch').classList.toggle('active', tab === 'watch');
  document.getElementById('nav-diary').classList.toggle('active', tab === 'diary');
  document.getElementById('nav-nutrition').classList.toggle('active', tab === 'nutrition');
  if (tab === 'watch' && watchData.length === 0) {
    loadWatchData();
  }
  if (tab === 'diary') {
    if (mealData.length === 0) loadMealsData(false);
    if (diaryData.length === 0) loadDiaryData();
    else renderDiary();
  }
  if (tab === 'nutrition') {
    Promise.all([
      mealData.length === 0 ? loadMealsData(false) : Promise.resolve(),
      diaryData.length === 0 ? loadDiaryData(false) : Promise.resolve(),
    ]).then(() => renderNutritionView());
  }
}


async function openImagePreview(fid, driveUrl) {
  const preview = document.getElementById('preview-img');
  preview.src = thumbMemCache[fid] || '';
  document.getElementById('preview-drive-link').href = driveUrl || `https://drive.google.com/file/d/${fid}/view`;
  document.getElementById('modal-image').classList.add('open');
  try {
    const res = await apiGet({ api: 'thumb', id: fid, full: '1' });
    if (res && res.ok && res.dataUrl) preview.src = res.dataUrl;
  } catch (e) { /* keep thumb */ }
}


function closeModals(force = false) {
  if (!force) {
    const watchModal = document.getElementById('modal-watch');
    if (watchModal && watchModal.classList.contains('open') && typeof hasUnsavedWatchModalChanges === 'function' && hasUnsavedWatchModalChanges()) {
      if (!confirm('編集中の未保存内容があります。破棄して閉じますか？')) return;
    }
    const diaryModal = document.getElementById('modal-diary');
    if (diaryModal && diaryModal.classList.contains('open') && typeof hasUnsavedDiaryModalChanges === 'function' && hasUnsavedDiaryModalChanges()) {
      if (!confirm('編集中の未保存内容があります。破棄して閉じますか？')) return;
    }
  }
  watchEditSnapshot = null;
  diaryEditSnapshot = null;
  document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
}

