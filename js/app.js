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

window.onload = () => {
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


function closeModals() {
  document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
}

