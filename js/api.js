let toastTimer = null;
function showToast(msg, type = 'info', retryFn = null, durationMs = 3500) {
  if (type === true) {
    type = 'error';
    if (durationMs === 3500) durationMs = 0;
  } else if (type === false || !type) {
    type = 'info';
  }
  const box = document.getElementById('toast-box');
  const msgEl = document.getElementById('toast-msg');
  const retryBtn = document.getElementById('toast-retry');
  if (toastTimer) { clearTimeout(toastTimer); toastTimer = null; }
  box.className = `toast-box show ${type}`;
  msgEl.textContent = msg;
  if (retryFn) {
    retryBtn.style.display = 'inline-block';
    retryBtn.onclick = () => { box.classList.remove('show'); retryFn(); };
  } else {
    retryBtn.style.display = 'none';
    retryBtn.onclick = null;
  }
  if (durationMs > 0) {
    toastTimer = setTimeout(() => box.classList.remove('show'), durationMs);
  }
}

async function parseGasResponse(res) {
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 160)}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`応答のJSON解析に失敗しました (${text.slice(0, 120)})`);
  }
}

async function apiGet(params) {
  const res = await fetch(`${GAS_API_URL}?${new URLSearchParams(params)}`, { redirect: 'follow' });
  return parseGasResponse(res);
}

async function apiPost(action, payload, timeoutMs) {
  const hasPhotos = Boolean(payload && Array.isArray(payload.photos) && payload.photos.length > 0);
  const limitMs = typeof timeoutMs === 'number' && timeoutMs > 0 ? timeoutMs : (hasPhotos ? 45000 : 25000);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timerId = controller ? setTimeout(() => controller.abort(), limitMs) : null;
  try {
    const res = await fetch(GAS_API_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, payload }),
      signal: controller ? controller.signal : undefined,
    });
    return await parseGasResponse(res);
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`通信がタイムアウトしました（${Math.round(limitMs / 1000)}秒・電波状況を確認して再試行してください）`);
    }
    throw err;
  } finally {
    if (timerId) clearTimeout(timerId);
  }
}

const PENDING_DIARY_KEY = 'lifelog_pending_diary_v1';
let pendingDiaryDraftInMemory = null;

function generateClientRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function savePendingDiaryDraft(draftObj) {
  pendingDiaryDraftInMemory = draftObj;
  try {
    localStorage.setItem(PENDING_DIARY_KEY, JSON.stringify(draftObj));
  } catch (_) {
    // 写真Base64で容量超過した場合は本文・位置情報だけでも確実に退避
    try {
      const slim = { ...draftObj, payload: { ...(draftObj.payload || {}), photos: [] }, photosOmitted: true };
      localStorage.setItem(PENDING_DIARY_KEY, JSON.stringify(slim));
    } catch (__) {}
  }
}

function loadPendingDiaryDraft() {
  if (pendingDiaryDraftInMemory) return pendingDiaryDraftInMemory;
  try {
    const raw = localStorage.getItem(PENDING_DIARY_KEY);
    if (!raw) return null;
    pendingDiaryDraftInMemory = JSON.parse(raw);
    return pendingDiaryDraftInMemory;
  } catch (_) {
    return null;
  }
}

function clearPendingDiaryDraft() {
  pendingDiaryDraftInMemory = null;
  try { localStorage.removeItem(PENDING_DIARY_KEY); } catch (_) {}
  const bar = document.getElementById('unsent-diary-bar');
  if (bar) bar.classList.remove('show');
}

function showUnsentDiaryBar(reasonMsg) {
  const draft = loadPendingDiaryDraft();
  const bar = document.getElementById('unsent-diary-bar');
  const msgEl = document.getElementById('unsent-diary-msg');
  if (!bar || !msgEl) return;
  if (!draft) {
    bar.classList.remove('show');
    return;
  }
  const titleHint = (draft.payload && (draft.payload.title || String(draft.payload.body || '').slice(0, 18))) || '下書き';
  msgEl.textContent = reasonMsg
    ? `⚠️ 保存できませんでした（${reasonMsg}）: 「${titleHint}」を保持中`
    : `⚠️ 未送信の日記下書き「${titleHint}」が端末に保持されています`;
  bar.classList.add('show');
}

async function retryPendingDiaryDraft() {
  const draft = loadPendingDiaryDraft();
  if (!draft || !draft.action || !draft.payload) { clearPendingDiaryDraft(); return; }
  showToast('未送信の日記を再送中...', 'info', null, 0);
  try {
    const res = await apiPost(draft.action, draft.payload);
    if (!res || !res.ok) throw new Error((res && res.error) || '保存に失敗しました');
    clearPendingDiaryDraft();
    if (res.entry) {
      const idx = diaryData.findIndex(d => Number(d.row) === Number(res.entry.row) || String(d.id) === String(res.entry.id));
      if (idx >= 0) diaryData[idx] = res.entry;
      else diaryData.unshift(res.entry);
      if (activeInlineEdit && activeInlineEdit.type === 'diary' && Number(activeInlineEdit.row) === Number(res.entry.row)) {
        activeInlineEdit = null;
        inlineDiaryLocations = [];
        inlineDiaryOrigCoords = new Map();
      }
      renderDiary();
    }
    showToast('再送して保存しました', 'success', null, 2500);
  } catch (err) {
    showUnsentDiaryBar(err.message || '通信エラー');
    showToast(`⚠️ 保存できませんでした: ${err.message || err}`, 'error', () => retryPendingDiaryDraft(), 0);
  }
}

function editPendingDiaryDraft() {
  const draft = loadPendingDiaryDraft();
  if (!draft || !draft.payload) return;
  const p = draft.payload;
  if (draft.action === 'updateDiary' && p.row) {
    const existing = diaryData.find(d => Number(d.row) === Number(p.row));
    if (existing) {
      openEditDiaryModal(p.row, p.id);
    } else {
      openDiaryModal();
    }
  } else {
    openDiaryModal();
  }
  if (p.date) document.getElementById('d-date').value = p.date;
  document.getElementById('d-title').value = p.title || '';
  document.getElementById('d-body').value = p.body || '';
  diaryLocations = Array.isArray(p.locations) ? p.locations.map(l => ({ ...l })) : [];
  renderLocationChips();
  autoResizeTextarea(document.getElementById('d-body'), 220);
}

function discardPendingDiaryDraft() {
  if (!confirm('未送信の日記下書きを破棄しますか？')) return;
  clearPendingDiaryDraft();
  showToast('未送信の下書きを破棄しました', 'info', null, 2000);
}


function autoResizeTextarea(el, minH = 180) {
  if (!el) return;
  el.style.height = 'auto';
  el.style.height = Math.max(el.scrollHeight + 4, minH) + 'px';
}


function safeSessionGet(k) {
  try { return sessionStorage.getItem(k); } catch (e) { return null; }
}
function safeSessionSet(k, v) {
  try { sessionStorage.setItem(k, v); } catch (e) {}
}


function getLocalTodayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}


function highlightElement(el) {
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.style.transition = 'box-shadow 0.3s';
  el.style.boxShadow = '0 0 0 3px #1a73e8';
  setTimeout(() => { el.style.boxShadow = ''; }, 1800);
}


function resizeImageToJpgBase64(file, maxDim, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (Math.max(w, h) > maxDim) {
          if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve({ name: file.name, ts: file.lastModified || Date.now(), base64: canvas.toDataURL('image/jpeg', quality).split(',')[1] });
      };
      img.onerror = reject; img.src = e.target.result;
    };
    reader.onerror = reject; reader.readAsDataURL(file);
  });
}

const NOTION_HTML_TAG_RE = /<\/?(?:p|br|div|span|strong|em|b|i|u|s|a|ul|ol|li|h[1-6]|blockquote|pre|code|hr|table|thead|tbody|tr|th|td|font|small|sub|sup)(?:\s[^<>]*?)?\/?>/gi;

function sanitizeDisplayText(raw) {
  if (raw === null || raw === undefined) return '';
  let s = String(raw);
  if (!s) return '';
  if (!NOTION_HTML_TAG_RE.test(s) && !/&(?:nbsp|amp|lt|gt|quot|#39|apos);/i.test(s)) return s;
  NOTION_HTML_TAG_RE.lastIndex = 0;
  s = s.replace(/\r\n?/g, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/p>\s*<p(?:\s[^<>]*?)?>/gi, '\n\n');
  s = s.replace(/<\/div>\s*<div(?:\s[^<>]*?)?>/gi, '\n');
  s = s.replace(/<\/(?:p|div|li|h[1-6]|tr|blockquote)>/gi, '\n');
  s = s.replace(NOTION_HTML_TAG_RE, '');
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

function esc(str) {
  return String(str || '').replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

function consumeBalancedUrl(s, start, isMarkdown, isAngle) {
  let i = start;
  let depth = 0;
  while (i < s.length) {
    const ch = s[i];
    if (isAngle) {
      if (ch === '>' || /[\s<]/.test(ch)) break;
      if (ch === '(') depth++;
      else if (ch === ')') {
        if (depth === 0) break;
        depth--;
      }
    } else {
      if (/[\s<>]/.test(ch)) break;
      if (ch === '(') {
        depth++;
      } else if (ch === ')') {
        if (depth === 0) break;
        depth--;
      }
    }
    i++;
  }
  let url = s.slice(start, i);
  let trail = '';
  if (!isMarkdown) {
    const punctM = url.match(/([.,、。!?:;」』】\]]+)$/);
    if (punctM) {
      trail = punctM[1];
      url = url.slice(0, -trail.length);
    }
  }
  let closed = true;
  let nextIdx = i;
  if (isMarkdown) {
    if (isAngle) {
      if (s[i] === '>' && s[i + 1] === ')') {
        closed = true;
        nextIdx = i + 2;
      } else if (s[i] === ')') {
        closed = true;
        nextIdx = i + 1;
      } else {
        closed = false;
        nextIdx = i;
      }
    } else {
      closed = s[i] === ')';
      nextIdx = closed ? i + 1 : i;
    }
  }
  return { url, nextIdx, trail, closed };
}

function renderRichText(str) {
  const s = sanitizeDisplayText(str);
  if (!s) return '';
  const startRe = /\[([^\]]+)\]\((<?https?:\/\/)|https?:\/\//g;
  let out = '';
  let lastIdx = 0;
  let m;
  while ((m = startRe.exec(s)) !== null) {
    if (m.index < lastIdx) continue;
    if (m.index > lastIdx) {
      out += esc(s.slice(lastIdx, m.index));
    }
    if (m[1] !== undefined) {
      const label = m[1];
      const isAngle = m[2].startsWith('<');
      const urlStart = m.index + label.length + 3 + (isAngle ? 1 : 0);
      const res = consumeBalancedUrl(s, urlStart, true, isAngle);
      if (res.closed && res.url) {
        const cleanUrl = res.url.replace(/\\_/g, '_').trim();
        out += `<a class="rich-link" href="${esc(cleanUrl)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
        lastIdx = res.nextIdx;
        startRe.lastIndex = lastIdx;
      } else {
        out += esc(m[0]);
        lastIdx = startRe.lastIndex;
      }
    } else {
      const res = consumeBalancedUrl(s, m.index, false, false);
      if (res.url) {
        const cleanUrl = res.url.replace(/\\_/g, '_');
        out += `<a class="rich-link" href="${esc(cleanUrl)}" target="_blank" rel="noopener noreferrer">${esc(res.url)}</a>${esc(res.trail)}`;
        lastIdx = res.nextIdx;
        startRe.lastIndex = lastIdx;
      } else {
        out += esc(m[0]);
        lastIdx = startRe.lastIndex;
      }
    }
  }
  if (lastIdx < s.length) {
    out += esc(s.slice(lastIdx));
  }
  return out;
}
