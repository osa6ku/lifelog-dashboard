import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadFrontendContext } from './helpers/load-scripts.mjs';

test('dedupeLocationCandidates merges duplicates by name and 3-decimal coordinates', () => {
  const { ctx } = loadFrontendContext();
  const res = ctx.dedupeLocationCandidates([
    { name: '新宿駅', lat: 35.68961, lng: 139.70057 },
    { name: '新宿駅', lat: 35.68964, lng: 139.70058 },
    { name: '新宿駅', lat: 35.69100, lng: 139.70057 },
    { name: '自宅', lat: null, lng: null },
    { name: '自宅', lat: null, lng: null },
  ]);
  assert.equal(res.length, 3);
  assert.equal(res[0].name, '新宿駅');
  assert.equal(res[2].name, '自宅');
});

test('searchLocationCandidatesByKeyword uses countrycodes=jp without addressdetails=1 and dedupes', async () => {
  const requestedUrls = [];
  const mockFetch = async (url) => {
    requestedUrls.push(String(url));
    return {
      ok: true,
      async json() {
        return [
          { name: '新宿駅', display_name: '新宿駅, 新宿区, 東京都, 日本', lat: '35.6896', lon: '139.7006' },
          { name: '新宿駅', display_name: '新宿駅, 新宿区, 東京都, 日本', lat: '35.68961', lon: '139.70061' },
        ];
      },
    };
  };
  const { ctx } = loadFrontendContext({ fetch: mockFetch });
  const { items, sourceName } = await ctx.searchLocationCandidatesByKeyword('新宿駅');
  assert.equal(sourceName, 'OpenStreetMap');
  assert.equal(requestedUrls.length, 1);
  assert.ok(requestedUrls[0].includes('countrycodes=jp'), 'missing countrycodes=jp');
  assert.ok(!requestedUrls[0].includes('addressdetails=1'), 'must not include addressdetails=1');
  assert.equal(items.length, 1);
  assert.equal(items[0].name, '新宿駅');
});

test('searchLocationCandidatesByKeyword falls back to GSI when Nominatim returns empty', async () => {
  const requestedUrls = [];
  const mockFetch = async (url) => {
    const s = String(url);
    requestedUrls.push(s);
    if (s.includes('nominatim.openstreetmap.org')) {
      return { ok: true, async json() { return []; } };
    }
    return {
      ok: true,
      async json() {
        return [
          { properties: { title: '浅草橋駅' }, geometry: { coordinates: [139.7866, 35.6974] } },
        ];
      },
    };
  };
  const { ctx } = loadFrontendContext({ fetch: mockFetch });
  const { items, sourceName } = await ctx.searchLocationCandidatesByKeyword('浅草橋駅');
  assert.equal(sourceName, '国土地理院');
  assert.equal(requestedUrls.length, 2);
  assert.ok(requestedUrls[1].includes('msearch.gsi.go.jp'));
  assert.equal(items.length, 1);
  assert.equal(items[0].name, '浅草橋駅');
  assert.equal(items[0].lat, 35.6974);
  assert.equal(items[0].lng, 139.7866);
});

test('resolveInlineLocationCoords follows priority and moveInlineDiaryLocation preserves coords', () => {
  const { ctx } = loadFrontendContext();
  vm.runInContext(`
    inlineDiaryOrigCoords = new Map([['既存店', { lat: 35.1, lng: 139.1 }]]);
    serverLocationPresets = [{ name: '自宅', lat: 35.2, lng: 139.2 }];
    inlineDiaryLocations = [
      { name: 'A地点', lat: 35.68, lng: 139.76 },
      { name: 'B地点', lat: 35.69, lng: 139.70 },
    ];
  `, ctx);

  const fromOrig = ctx.resolveInlineLocationCoords('既存店', 35.9, 139.9);
  assert.deepEqual({ lat: fromOrig.lat, lng: fromOrig.lng }, { lat: 35.1, lng: 139.1 });

  const explicit = ctx.resolveInlineLocationCoords('新規スポット', 35.9, 139.9);
  assert.deepEqual({ lat: explicit.lat, lng: explicit.lng }, { lat: 35.9, lng: 139.9 });

  const fromPreset = ctx.resolveInlineLocationCoords('自宅', null, null);
  assert.deepEqual({ lat: fromPreset.lat, lng: fromPreset.lng }, { lat: 35.2, lng: 139.2 });

  const none = ctx.resolveInlineLocationCoords('未知の場所', null, null);
  assert.deepEqual({ lat: none.lat, lng: none.lng }, { lat: null, lng: null });

  ctx.moveInlineDiaryLocation(10, 0, 1);
  const moved = vm.runInContext('inlineDiaryLocations', ctx);
  assert.equal(moved[0].name, 'B地点');
  assert.equal(moved[0].lat, 35.69);
  assert.equal(moved[1].name, 'A地点');
  assert.equal(moved[1].lat, 35.68);
});

test('3-44 inline location search displays clickable candidate list and resists blur hide race', async () => {
  const mockFetch = async () => ({
    ok: true,
    async json() {
      return [
        { name: '中山白山神社', display_name: '中山白山神社, 市川市, 千葉県, 日本', lat: '35.7212', lon: '139.9478' },
      ];
    },
  });
  const { ctx, elements } = loadFrontendContext({ fetch: mockFetch });
  const input = ctx.document.getElementById('inline-loc-input-diary-42');
  input.value = '中山白山神社';

  // Simulate blur right before search click (iPad/mobile race)
  ctx.hideInlineDiaryLocSuggestions(42);
  await ctx.searchInlineLocationByKeyword(42);

  // Wait past the 200ms blur timeout to verify pinned search results stay visible
  await new Promise(r => setTimeout(r, 230));

  const box = elements.get('inline-loc-suggest-diary-42');
  const status = elements.get('inline-loc-status-diary-42');
  assert.equal(box.style.display, 'block');
  assert.equal(box.classList.contains('open'), true);
  assert.equal(box.dataset.pinned, '1');
  assert.ok(box.innerHTML.includes('中山白山神社'));
  assert.ok(box.innerHTML.includes('class="loc-item"'));
  assert.ok(box.innerHTML.includes('onclick="addInlineDiaryLocation(42,'));
  assert.ok(status.textContent.includes('候補 1件'));

  // Tap candidate and verify coordinates are saved and list closes
  ctx.addInlineDiaryLocation(42, '中山白山神社', '35.7212', '139.9478');
  const locs = vm.runInContext('inlineDiaryLocations', ctx);
  assert.equal(locs.length, 1);
  assert.equal(locs[0].name, '中山白山神社');
  assert.equal(locs[0].lat, 35.7212);
  assert.equal(locs[0].lng, 139.9478);
  assert.equal(box.style.display, 'none');
  assert.equal(box.classList.contains('open'), false);
});

test('3-44 modal location search renders button items and selects with coordinates', async () => {
  const mockFetch = async () => ({
    ok: true,
    async json() {
      return [
        { name: '中山白山神社', display_name: '中山白山神社, 市川市, 千葉県, 日本', lat: '35.7212', lon: '139.9478' },
      ];
    },
  });
  const { ctx, elements } = loadFrontendContext({ fetch: mockFetch });
  ctx.document.getElementById('d-loc').value = '中山白山神社';

  await ctx.searchLocationByKeyword();

  const box = elements.get('loc-suggestions');
  const status = elements.get('loc-status');
  assert.equal(box.style.display, 'block');
  assert.equal(box.classList.contains('open'), true);
  assert.ok(box.innerHTML.includes('<button type="button" class="loc-item" onclick="selectLocationCandidate(0)">'));
  assert.ok(box.innerHTML.includes('中山白山神社'));
  assert.ok(status.textContent.includes('候補 1件'));

  ctx.selectLocationCandidate(0);
  const locs = vm.runInContext('diaryLocations', ctx);
  assert.equal(locs.length, 1);
  assert.equal(locs[0].name, '中山白山神社');
  assert.equal(locs[0].lat, 35.7212);
  assert.equal(locs[0].lng, 139.9478);
  assert.equal(box.style.display, 'none');
  assert.equal(box.classList.contains('open'), false);
});
