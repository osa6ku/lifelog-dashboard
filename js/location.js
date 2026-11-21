function resolveInlineLocationCoords(name, explicitLat, explicitLng) {
  const cleanName = String(name || '').trim();
  // 1. 対象日記の既存スポット座標を最優先
  if (inlineDiaryOrigCoords.has(cleanName)) {
    const orig = inlineDiaryOrigCoords.get(cleanName);
    if (orig && orig.lat !== null && orig.lng !== null) return { lat: orig.lat, lng: orig.lng };
  }
  // 候補から明示座標が渡された場合
  if (explicitLat !== null && explicitLat !== undefined && explicitLat !== '' &&
      explicitLng !== null && explicitLng !== undefined && explicitLng !== '' &&
      !isNaN(Number(explicitLat)) && !isNaN(Number(explicitLng))) {
    return { lat: Number(explicitLat), lng: Number(explicitLng) };
  }
  // 2. 場所プリセット（自宅・会社）
  const preset = resolveLocationPresetCoords(cleanName);
  if (preset && preset.lat !== null && preset.lng !== null) {
    return { lat: Number(preset.lat), lng: Number(preset.lng) };
  }
  // 3. 過去の場所履歴キャッシュ
  const hist = getDiaryLocationHistory('');
  const found = hist.find(h => h.name === cleanName && h.lat !== null && h.lng !== null);
  if (found) return { lat: Number(found.lat), lng: Number(found.lng) };
  return { lat: null, lng: null };
}

function buildInlineLocChipsHtml(rowNum) {
  const r = Number(rowNum);
  const len = inlineDiaryLocations.length;
  return inlineDiaryLocations.map((l, idx) => {
    const coordTag = (l.lat !== null && l.lng !== null) ? ' title="座標あり"' : '';
    const leftBtn = (len > 1 && idx > 0) ? `<button type="button" class="inline-loc-move-btn" onclick="moveInlineDiaryLocation(${r}, ${idx}, -1)" title="前へ">◀</button>` : '';
    const rightBtn = (len > 1 && idx < len - 1) ? `<button type="button" class="inline-loc-move-btn" onclick="moveInlineDiaryLocation(${r}, ${idx}, 1)" title="後ろへ">▶</button>` : '';
    return `<span class="loc-chip"${coordTag}>📍 ${esc(l.name)}${leftBtn}${rightBtn}<button type="button" onclick="removeInlineDiaryLocation(${r}, ${idx})" title="削除">×</button></span>`;
  }).join('');
}

function renderInlineDiaryLocChips(rowNum) {
  const box = document.getElementById(`inline-loc-chips-diary-${Number(rowNum)}`);
  if (!box) return;
  box.innerHTML = buildInlineLocChipsHtml(rowNum);
}

function moveInlineDiaryLocation(rowNum, idx, delta) {
  const next = idx + delta;
  if (next < 0 || next >= inlineDiaryLocations.length) return;
  const tmp = inlineDiaryLocations[idx];
  inlineDiaryLocations[idx] = inlineDiaryLocations[next];
  inlineDiaryLocations[next] = tmp;
  renderInlineDiaryLocChips(rowNum);
}

function addInlineDiaryLocation(rowNum, rawName, explicitLat, explicitLng) {
  const name = String(rawName || '').trim();
  if (!name) return;
  const r = Number(rowNum);
  const input = document.getElementById(`inline-loc-input-diary-${r}`);
  const box = document.getElementById(`inline-loc-suggest-diary-${r}`);
  const statusEl = document.getElementById(`inline-loc-status-diary-${r}`);
  if (inlineDiaryLocations.some(l => l.name === name)) {
    if (statusEl) statusEl.textContent = `「${name}」は既に追加されています`;
    if (input) input.value = '';
    if (box) { box.classList.remove('open'); box.innerHTML = ''; }
    return;
  }
  const coords = resolveInlineLocationCoords(name, explicitLat, explicitLng);
  inlineDiaryLocations.push({ name, lat: coords.lat, lng: coords.lng });
  renderInlineDiaryLocChips(r);
  if (input) input.value = '';
  if (box) { box.classList.remove('open'); box.innerHTML = ''; }
  if (statusEl) {
    const coordNote = (coords.lat !== null && coords.lng !== null) ? ' (座標取得済)' : '';
    statusEl.textContent = `追加済み: ${name}${coordNote}（計${inlineDiaryLocations.length}件）`;
  }
}

function addInlineDiaryLocationFromInput(rowNum) {
  const input = document.getElementById(`inline-loc-input-diary-${Number(rowNum)}`);
  if (!input) return;
  addInlineDiaryLocation(rowNum, input.value, null, null);
}

function removeInlineDiaryLocation(rowNum, idx) {
  inlineDiaryLocations.splice(idx, 1);
  renderInlineDiaryLocChips(rowNum);
}

function renderInlineLocationCandidates(rowNum, cands) {
  const r = Number(rowNum);
  const box = document.getElementById(`inline-loc-suggest-diary-${r}`);
  if (!box) return;
  const existingNames = new Set(inlineDiaryLocations.map(l => l.name));
  const filtered = (cands || []).filter(c => c && c.name && !existingNames.has(c.name)).slice(0, 15);
  if (filtered.length === 0) {
    box.classList.remove('open');
    box.innerHTML = '';
    return;
  }
  box.innerHTML = filtered.map(c => {
    const latAttr = (c.lat !== null && c.lat !== undefined) ? String(c.lat) : '';
    const lngAttr = (c.lng !== null && c.lng !== undefined) ? String(c.lng) : '';
    const icon = c.name === '自宅' ? '🏠 ' : (c.name === '会社' ? '🏢 ' : '📍 ');
    const distNote = (typeof c.dist === 'number' && c.dist < 9000) ? ` (${Math.round(c.dist)}m)` : '';
    return `<button type="button" class="tag-suggest-item" data-loc-name="${esc(c.name)}" data-loc-lat="${esc(latAttr)}" data-loc-lng="${esc(lngAttr)}" title="${esc(c.sub || '')}" onmousedown="event.preventDefault(); addInlineDiaryLocation(${r}, this.dataset.locName, this.dataset.locLat, this.dataset.locLng)">${icon}${esc(c.name)}${esc(distNote)}</button>`;
  }).join('');
  box.classList.add('open');
}

function showInlineDiaryLocSuggestions(rowNum) {
  const r = Number(rowNum);
  const input = document.getElementById(`inline-loc-input-diary-${r}`);
  const statusEl = document.getElementById(`inline-loc-status-diary-${r}`);
  if (!input) return;
  const q = input.value;
  const cands = getDiaryLocationHistory(q);
  renderInlineLocationCandidates(r, cands);
  if (statusEl && cands.length > 0 && !q.trim()) {
    statusEl.textContent = '定番・履歴から選択 / 📍で現在地近傍 / 🔍でキーワード検索';
  }
}

function hideInlineDiaryLocSuggestions(rowNum) {
  setTimeout(() => {
    const box = document.getElementById(`inline-loc-suggest-diary-${Number(rowNum)}`);
    if (box) box.classList.remove('open');
  }, 150);
}

async function fetchNearbyLocationCandidates(lat, lon) {
  const nomUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&accept-language=ja&addressdetails=1`;
  const overpassQuery = `[out:json][timeout:8];(node(around:450,${lat},${lon})[name];way(around:450,${lat},${lon})[name];);out center 25;`;
  const ovUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

  const [nomRes, ovRes] = await Promise.allSettled([
    fetch(nomUrl).then(res => res.ok ? res.json() : null),
    fetch(ovUrl).then(res => res.ok ? res.json() : null),
  ]);

  const items = [];
  const seen = new Set();
  const addCand = (name, sub, dist, cLat, cLng) => {
    const clean = String(name || '').trim();
    if (!clean || seen.has(clean)) return;
    seen.add(clean);
    items.push({ name: clean, sub: sub || '', dist, lat: cLat, lng: cLng });
  };

  if (nomRes.status === 'fulfilled' && nomRes.value) {
    const nom = nomRes.value;
    const addr = nom.address || {};
    const shortAddr = [addr.city || addr.ward || addr.town || addr.village || '', addr.suburb || addr.quarter || addr.neighbourhood || ''].filter(Boolean).join('');
    const fullAddr = formatAddrSummary(addr);
    if (nom.name) addCand(nom.name, fullAddr || '現在地スポット', undefined, lat, lon);
    if (shortAddr) addCand(shortAddr, '現在地の市区町村・町名', undefined, lat, lon);
    if (fullAddr && fullAddr !== shortAddr) addCand(fullAddr, '現在地の住所', undefined, lat, lon);
  }

  if (ovRes.status === 'fulfilled' && ovRes.value && Array.isArray(ovRes.value.elements)) {
    const pois = ovRes.value.elements.map(el => {
      const elLat = el.lat || (el.center && el.center.lat);
      const elLon = el.lon || (el.center && el.center.lon);
      const tags = el.tags || {};
      const cat = tags.railway || tags.amenity || tags.shop || tags.leisure || tags.tourism || '';
      const dist = (elLat && elLon) ? calcDistanceMeters(lat, lon, elLat, elLon) : 9999;
      return { name: tags.name, sub: cat ? `周辺スポット (${cat})` : '周辺スポット', dist, lat: elLat || lat, lng: elLon || lon };
    }).filter(p => p.name).sort((a, b) => a.dist - b.dist);
    pois.slice(0, 15).forEach(p => addCand(p.name, p.sub, p.dist, p.lat, p.lng));
  }

  return items;
}

function dedupeLocationCandidates(items) {
  const seenKeys = new Set();
  const out = [];
  (items || []).forEach(it => {
    if (!it || !it.name) return;
    const hasCoords = it.lat !== null && it.lat !== undefined && !isNaN(Number(it.lat)) &&
      it.lng !== null && it.lng !== undefined && !isNaN(Number(it.lng));
    const key = hasCoords
      ? `${it.name}|${Number(it.lat).toFixed(3)}|${Number(it.lng).toFixed(3)}`
      : `${it.name}|none`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    out.push(it);
  });
  return out;
}

async function searchLocationCandidatesByKeyword(q) {
  let items = [];
  let sourceName = 'OpenStreetMap';

  // 1. OpenStreetMap Nominatim 検索（日本国内限定・addressdetails=1除去）
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&q=${encodeURIComponent(q)}&countrycodes=jp&accept-language=ja&limit=8`;
    const res = await fetch(url);
    if (res.ok) {
      const list = await res.json();
      items = (list || []).map(it => {
        const primary = it.name || String(it.display_name || '').split(',')[0].trim();
        const addrSub = String(it.display_name || '');
        const lat = it.lat !== undefined ? Number(it.lat) : null;
        const lng = it.lon !== undefined ? Number(it.lon) : null;
        return { name: primary, sub: addrSub, lat, lng };
      }).filter(it => it.name);
    }
  } catch { /* fallback to GSI */ }

  // 2. Nominatim がエラーまたは0件の場合、国土地理院 住所検索APIへ自動フォールバック
  if (items.length === 0) {
    sourceName = '国土地理院';
    const gsiUrl = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(q)}`;
    const gRes = await fetch(gsiUrl);
    if (gRes.ok) {
      const gList = await gRes.json();
      items = (gList || []).slice(0, 10).map(it => {
        const title = String((it.properties && it.properties.title) || '').trim();
        const coords = (it.geometry && it.geometry.coordinates) || [];
        const lng = coords.length >= 2 ? Number(coords[0]) : null;
        const lat = coords.length >= 2 ? Number(coords[1]) : null;
        return { name: title, sub: '国土地理院 住所・施設検索', lat, lng };
      }).filter(it => it.name);
    }
  }

  // 3. キーワードに一致する過去履歴も先頭へ統合（name＋座標小数3桁丸めで重複除去）
  const histMatches = getDiaryLocationHistory(q);
  const seenNames = new Set(histMatches.map(h => h.name));
  const merged = dedupeLocationCandidates([...histMatches, ...items.filter(it => !seenNames.has(it.name))]);
  return { items: merged, sourceName };
}

async function fetchInlineNearbyLocations(rowNum) {
  const r = Number(rowNum);
  const statusEl = document.getElementById(`inline-loc-status-diary-${r}`);
  if (!('geolocation' in navigator)) {
    if (statusEl) statusEl.textContent = '⚠️ このブラウザは位置情報取得に対応していません';
    return;
  }
  const btn = document.getElementById(`btn-inline-loc-gps-${r}`);
  if (btn) btn.disabled = true;
  if (statusEl) statusEl.textContent = '📡 現在地（GPS）を取得中...';
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, timeout: 10000, maximumAge: 60000,
      });
    });
    const { latitude: lat, longitude: lon } = pos.coords;
    if (statusEl) statusEl.textContent = '🔍 周辺の住所・スポットを検索中...';

    const items = await fetchNearbyLocationCandidates(lat, lon);
    if (items.length === 0) {
      if (statusEl) statusEl.textContent = '⚠️ 周辺スポットが見つかりませんでした（手入力も可能です）';
      renderInlineLocationCandidates(r, []);
    } else {
      if (statusEl) statusEl.textContent = `近傍候補 ${items.length}件（タップで座標付き追加）`;
      renderInlineLocationCandidates(r, items);
    }
  } catch {
    if (statusEl) statusEl.textContent = '⚠️ 位置情報の取得に失敗しました（許可設定をご確認ください・入力内容は保持されています）';
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function searchInlineLocationByKeyword(rowNum) {
  const r = Number(rowNum);
  const input = document.getElementById(`inline-loc-input-diary-${r}`);
  const statusEl = document.getElementById(`inline-loc-status-diary-${r}`);
  const q = input ? input.value.trim() : '';
  if (!q) {
    await fetchInlineNearbyLocations(r);
    return;
  }
  const btn = document.getElementById(`btn-inline-loc-search-${r}`);
  if (btn) btn.disabled = true;
  if (statusEl) statusEl.textContent = `🔍 「${q}」を検索中...`;
  try {
    const { items: merged, sourceName } = await searchLocationCandidatesByKeyword(q);
    if (merged.length === 0) {
      if (statusEl) statusEl.textContent = '該当する場所が見つかりませんでした（＋で自由入力追加できます）';
      renderInlineLocationCandidates(r, []);
    } else {
      if (statusEl) statusEl.textContent = `候補 ${merged.length}件（履歴＋${sourceName}・タップで追加）`;
      renderInlineLocationCandidates(r, merged);
    }
  } catch {
    const histMatches = getDiaryLocationHistory(q);
    if (histMatches.length > 0) {
      if (statusEl) statusEl.textContent = `過去履歴から ${histMatches.length}件を表示中`;
      renderInlineLocationCandidates(r, histMatches);
    } else {
      if (statusEl) statusEl.textContent = '⚠️ 場所検索に失敗しました（通信状況をご確認ください・入力内容は保持されています）';
    }
  } finally {
    if (btn) btn.disabled = false;
  }
}


function parseLocations(locStr) {
  return String(locStr || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}


function normalizeDiaryLocations(d) {
  const attachPreset = (loc) => {
    if (loc.lat === null || loc.lng === null) {
      const preset = resolveLocationPresetCoords(loc.name);
      if (preset) return { name: loc.name, lat: preset.lat, lng: preset.lng };
    }
    return loc;
  };
  if (d && Array.isArray(d.locations) && d.locations.length > 0) {
    return d.locations.map(x => {
      if (typeof x === 'string') return attachPreset({ name: x.trim(), lat: null, lng: null });
      const lat = (x && x.lat !== null && x.lat !== undefined && x.lat !== '' && !isNaN(Number(x.lat))) ? Number(x.lat) : null;
      const lng = (x && x.lng !== null && x.lng !== undefined && x.lng !== '' && !isNaN(Number(x.lng))) ? Number(x.lng) : null;
      return attachPreset({ name: String((x && x.name) || '').trim(), lat, lng });
    }).filter(x => x.name);
  }
  return parseLocations(d && d.location).map(name => attachPreset({ name, lat: null, lng: null }));
}


function renderLocationChips() {
  const wrap = document.getElementById('d-loc-chips');
  if (!diaryLocations.length) { wrap.innerHTML = ''; return; }
  wrap.innerHTML = diaryLocations.map((loc, idx) => {
    const hasCoord = loc.lat !== null && loc.lng !== null;
    const coordTag = hasCoord
      ? `<span style="font-size:10px;opacity:0.75;">(${loc.lat.toFixed(4)},${loc.lng.toFixed(4)})</span>`
      : `<button type="button" onclick="searchCoordsForChip(${idx})" title="この場所の座標を検索して設定">🔍</button>`;
    return `
    <span class="loc-chip">
      <span>📍 ${esc(loc.name)}</span>
      ${coordTag}
      ${idx > 0 ? `<button type="button" onclick="moveDiaryLocation(${idx}, -1)" title="前へ">↑</button>` : ''}
      ${idx < diaryLocations.length - 1 ? `<button type="button" onclick="moveDiaryLocation(${idx}, 1)" title="後ろへ">↓</button>` : ''}
      <button type="button" onclick="removeDiaryLocation(${idx})" title="削除">✕</button>
    </span>`;
  }).join('');
}

function searchCoordsForChip(idx) {
  const loc = diaryLocations[idx];
  if (!loc) return;
  document.getElementById('d-loc').value = loc.name;
  searchLocationByKeyword();
}

function addDiaryLocation(item) {
  const obj = typeof item === 'string'
    ? { name: item.trim(), lat: null, lng: null }
    : {
        name: String((item && item.name) || '').trim(),
        lat: (item && item.lat !== null && item.lat !== undefined && item.lat !== '' && !isNaN(Number(item.lat))) ? Number(item.lat) : null,
        lng: (item && item.lng !== null && item.lng !== undefined && item.lng !== '' && !isNaN(Number(item.lng))) ? Number(item.lng) : null,
      };
  if (!obj.name) return;
  if (obj.lat === null || obj.lng === null) {
    const preset = resolveLocationPresetCoords(obj.name);
    if (preset) {
      obj.lat = preset.lat;
      obj.lng = preset.lng;
    }
  }
  const existingIdx = diaryLocations.findIndex(x => x.name === obj.name);
  if (existingIdx >= 0) {
    if (obj.lat !== null && obj.lng !== null) {
      diaryLocations[existingIdx].lat = obj.lat;
      diaryLocations[existingIdx].lng = obj.lng;
    }
  } else {
    diaryLocations.push(obj);
  }
  renderLocationChips();
}

function addLocationFromInput() {
  const inp = document.getElementById('d-loc');
  const val = inp.value.trim();
  if (!val) return;
  val.split(/\r?\n/).forEach(v => addDiaryLocation(v));
  inp.value = '';
  document.getElementById('loc-status').textContent = `場所を追加しました（計${diaryLocations.length}件）`;
}

function moveDiaryLocation(idx, delta) {
  const ni = idx + delta;
  if (ni < 0 || ni >= diaryLocations.length) return;
  const tmp = diaryLocations[idx];
  diaryLocations[idx] = diaryLocations[ni];
  diaryLocations[ni] = tmp;
  renderLocationChips();
}

function removeDiaryLocation(idx) {
  diaryLocations.splice(idx, 1);
  renderLocationChips();
}


function resetLocationPicker() {
  document.getElementById('loc-status').textContent = '';
  const box = document.getElementById('loc-suggestions');
  box.style.display = 'none';
  box.innerHTML = '';
}


function calcDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function formatAddrSummary(addr) {
  if (!addr) return '';
  const pref = addr.province || addr.state || '';
  const city = addr.city || addr.town || addr.village || addr.ward || addr.suburb || '';
  const area = addr.quarter || addr.neighbourhood || addr.suburb || '';
  return [pref, city, area !== city ? area : ''].filter(Boolean).join('');
}

let lastLocationCandidates = [];
function renderLocationSuggestions(items) {
  lastLocationCandidates = items;
  const box = document.getElementById('loc-suggestions');
  if (!items || items.length === 0) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  box.innerHTML = items.map((it, idx) => `
    <div class="loc-item" onclick="selectLocationCandidate(${idx})">
      <div>
        <div class="loc-item-main">${esc(it.name)}</div>
        ${it.sub ? `<div class="loc-item-sub">${esc(it.sub)}</div>` : ''}
      </div>
      ${it.dist !== undefined ? `<div class="loc-item-dist">約${it.dist}m</div>` : ''}
    </div>`).join('');
  box.style.display = 'block';
}

const LOC_HISTORY_KEY = 'lifelog_loc_history_v1';

function getSavedLocHistory() {
  try {
    const raw = localStorage.getItem(LOC_HISTORY_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function saveLocationToHistory(locs) {
  if (!Array.isArray(locs) || locs.length === 0) return;
  try {
    const cur = getSavedLocHistory();
    const map = new Map();
    locs.concat(cur).forEach(l => {
      const name = String((l && l.name) || '').trim();
      if (!name) return;
      const lat = (l.lat !== null && l.lat !== undefined && !isNaN(Number(l.lat))) ? Number(l.lat) : null;
      const lng = (l.lng !== null && l.lng !== undefined && !isNaN(Number(l.lng))) ? Number(l.lng) : null;
      if (!map.has(name)) {
        map.set(name, { name, lat, lng });
      } else if (lat !== null && lng !== null && map.get(name).lat === null) {
        map.set(name, { name, lat, lng });
      }
    });
    localStorage.setItem(LOC_HISTORY_KEY, JSON.stringify(Array.from(map.values()).slice(0, 50)));
  } catch (e) { /* ignore */ }
}

const LOC_PRESETS_KEY = 'lifelog_loc_presets_v1';
const QUICK_LOCATION_PRESETS = [
  { name: '自宅', icon: '🏠' },
  { name: '会社', icon: '🏢' },
];

function loadCachedLocationPresets() {
  try {
    const raw = localStorage.getItem(LOC_PRESETS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function saveCachedLocationPresets(presets) {
  try {
    if (Array.isArray(presets) && presets.length > 0) {
      localStorage.setItem(LOC_PRESETS_KEY, JSON.stringify(presets));
    }
  } catch (e) { /* ignore */ }
}

let serverLocationPresets = loadCachedLocationPresets();

function getEffectiveLocationPresets() {
  const byName = new Map();
  QUICK_LOCATION_PRESETS.forEach(p => {
    byName.set(p.name, { name: p.name, icon: p.icon || '📍', lat: null, lng: null });
  });
  (serverLocationPresets || []).forEach(p => {
    const name = String((p && p.name) || '').trim();
    if (!name) return;
    const lat = (p.lat !== null && p.lat !== undefined && p.lat !== '' && !isNaN(Number(p.lat))) ? Number(p.lat) : null;
    const lng = (p.lng !== null && p.lng !== undefined && p.lng !== '' && !isNaN(Number(p.lng))) ? Number(p.lng) : null;
    const existing = byName.get(name);
    byName.set(name, {
      name,
      icon: (p.icon && String(p.icon).trim()) || (existing && existing.icon) || '📍',
      lat: lat !== null ? lat : (existing ? existing.lat : null),
      lng: lng !== null ? lng : (existing ? existing.lng : null),
    });
  });
  return Array.from(byName.values());
}

function resolveLocationPresetCoords(name) {
  const target = String(name || '').trim();
  if (!target) return null;
  const hit = getEffectiveLocationPresets().find(p => p.name === target && p.lat !== null && p.lng !== null);
  return hit ? { lat: hit.lat, lng: hit.lng } : null;
}

function getDiaryLocationHistory(query) {
  const q = String(query || '').trim().toLowerCase();
  const allCoords = new Map();
  const recordCoord = (l) => {
    const name = String((l && l.name) || '').trim();
    if (!name) return;
    const lat = (l.lat !== null && l.lat !== undefined && !isNaN(Number(l.lat))) ? Number(l.lat) : null;
    const lng = (l.lng !== null && l.lng !== undefined && !isNaN(Number(l.lng))) ? Number(l.lng) : null;
    if (lat !== null && lng !== null && !allCoords.has(name)) {
      allCoords.set(name, { lat, lng });
    }
  };
  getSavedLocHistory().forEach(recordCoord);
  diaryData.forEach(d => normalizeDiaryLocations(d).forEach(recordCoord));

  const map = new Map();
  // 先頭に定番スポット（自宅・会社）を配置（非公開シート設定値または過去座標を自動反映）
  getEffectiveLocationPresets().forEach(p => {
    if (q && !p.name.toLowerCase().includes(q)) return;
    const hasPresetCoord = p.lat !== null && p.lng !== null;
    const coord = hasPresetCoord ? { lat: p.lat, lng: p.lng } : (allCoords.get(p.name) || { lat: null, lng: null });
    map.set(p.name, {
      name: p.name,
      lat: coord.lat,
      lng: coord.lng,
      sub: coord.lat !== null
        ? `${p.icon} 定番スポット (座標あり: ${coord.lat.toFixed(4)}, ${coord.lng.toFixed(4)})`
        : `${p.icon} 定番スポット`,
    });
  });

  const pushLoc = (l, sourceLabel) => {
    const name = String((l && l.name) || '').trim();
    if (!name) return;
    if (q && !name.toLowerCase().includes(q)) return;
    const lat = (l.lat !== null && l.lat !== undefined && !isNaN(Number(l.lat))) ? Number(l.lat) : null;
    const lng = (l.lng !== null && l.lng !== undefined && !isNaN(Number(l.lng))) ? Number(l.lng) : null;
    if (!map.has(name)) {
      map.set(name, {
        name,
        lat,
        lng,
        sub: lat !== null ? `${sourceLabel} (座標あり)` : sourceLabel,
      });
    } else if (lat !== null && lng !== null && map.get(name).lat === null) {
      map.set(name, { name, lat, lng, sub: `${sourceLabel} (座標あり)` });
    }
  };

  getSavedLocHistory().forEach(l => pushLoc(l, '🕒 最近の履歴'));
  diaryData.forEach(d => {
    normalizeDiaryLocations(d).forEach(l => pushLoc(l, `🕒 ${d.date} の履歴`));
  });
  serverLocationHistory.forEach(l => pushLoc(l, l.date ? `🕒 ${l.date} の履歴` : '🕒 過去の履歴'));
  return Array.from(map.values()).slice(0, q ? 12 : 17);
}

function showLocationHistory() {
  const q = document.getElementById('d-loc').value;
  const hist = getDiaryLocationHistory(q);
  const statusEl = document.getElementById('loc-status');
  if (hist.length > 0) {
    statusEl.textContent = q.trim()
      ? `候補 ${hist.length}件（タップで追加 / 🔍で新規検索）`
      : `定番・履歴 ${hist.length}件（タップで追加 / 📍で現在地近傍を検索）`;
    renderLocationSuggestions(hist);
  } else {
    renderLocationSuggestions([]);
  }
}

function selectLocationCandidate(idx) {
  const it = lastLocationCandidates[idx];
  if (!it) return;
  const locObj = { name: it.name, lat: it.lat !== undefined ? it.lat : null, lng: it.lng !== undefined ? it.lng : null };
  addDiaryLocation(locObj);
  saveLocationToHistory([locObj]);
  document.getElementById('d-loc').value = '';
  const coordNote = (locObj.lat !== null && locObj.lat !== undefined) ? ' (座標取得済)' : '';
  document.getElementById('loc-status').textContent = `追加済み: ${it.name}${coordNote}（計${diaryLocations.length}件・さらに追加可）`;
  document.getElementById('loc-suggestions').style.display = 'none';
}

async function fetchNearbyLocations() {
  if (!('geolocation' in navigator)) {
    document.getElementById('loc-status').textContent = '⚠️ このブラウザは位置情報取得に対応していません';
    return;
  }
  const btn = document.getElementById('btn-loc-gps');
  const statusEl = document.getElementById('loc-status');
  btn.disabled = true;
  statusEl.textContent = '📡 現在地（GPS）を取得中...';
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true, timeout: 10000, maximumAge: 60000,
      });
    });
    const { latitude: lat, longitude: lon } = pos.coords;
    statusEl.textContent = '🔍 周辺の住所・スポットを検索中...';

    const items = await fetchNearbyLocationCandidates(lat, lon);
    if (items.length === 0) {
      statusEl.textContent = '⚠️ 周辺スポットが見つかりませんでした（手入力も可能です）';
      renderLocationSuggestions([]);
    } else {
      statusEl.textContent = `候補 ${items.length}件（タップで選択）`;
      renderLocationSuggestions(items);
    }
  } catch {
    statusEl.textContent = '⚠️ 位置情報の取得に失敗しました（許可設定をご確認ください）';
  } finally {
    btn.disabled = false;
  }
}

async function searchLocationByKeyword() {
  const q = document.getElementById('d-loc').value.trim();
  const statusEl = document.getElementById('loc-status');
  if (!q) {
    await fetchNearbyLocations();
    return;
  }
  const btn = document.getElementById('btn-loc-search');
  btn.disabled = true;
  statusEl.textContent = `🔍 「${q}」を検索中...`;
  try {
    const { items: merged, sourceName } = await searchLocationCandidatesByKeyword(q);
    if (merged.length === 0) {
      statusEl.textContent = '該当する場所が見つかりませんでした（そのまま自由入力で保存できます）';
      renderLocationSuggestions([]);
    } else {
      statusEl.textContent = `候補 ${merged.length}件（履歴＋${sourceName}・タップで選択）`;
      renderLocationSuggestions(merged);
    }
  } catch {
    const histMatches = getDiaryLocationHistory(q);
    if (histMatches.length > 0) {
      statusEl.textContent = `過去履歴から ${histMatches.length}件を表示中`;
      renderLocationSuggestions(histMatches);
    } else {
      statusEl.textContent = '⚠️ 場所検索に失敗しました（ネットワーク状況をご確認ください）';
    }
  } finally {
    btn.disabled = false;
  }
}

