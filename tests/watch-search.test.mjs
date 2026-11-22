import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { loadFrontendContext } from './helpers/load-scripts.mjs';

function makeChip(val, active = false) {
  const cls = new Set(active ? ['chip', 'active'] : ['chip']);
  return {
    dataset: { val },
    classList: {
      add(c) { cls.add(c); },
      remove(c) { cls.delete(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (cls.has(c)) cls.delete(c); else cls.add(c);
        } else if (force) cls.add(c); else cls.delete(c);
      },
      contains(c) { return cls.has(c); },
    },
  };
}

test('3-45 watch keyword search queries all statuses, supports explicit re-filter, and restores status on clear', async () => {
  const chips = [
    makeChip('進行中', true),
    makeChip('完了', false),
    makeChip('未着手', false),
    makeChip('ALL', false),
  ];
  const requestedParams = [];
  const sampleEntries = [
    { row: 1, id: '1', title: '進行中ドラマ', status: '進行中', category: 'ドラマ', platform: 'TBS', cast: '吉田羊', staff: '', memo: '', summary: '', watchDate: '2026-11-20' },
    { row: 2, id: '2', title: '完了映画A', status: '完了', category: '映画', platform: '映画館', cast: '吉田羊', staff: '', memo: '', summary: '', watchDate: '2026-10-15' },
    { row: 3, id: '3', title: '完了ドラマB', status: '完了', category: 'ドラマ', platform: 'Netflix', cast: '内田有紀', staff: '', memo: '', summary: '', watchDate: '2026-09-10' },
  ];

  const mockFetch = async (url) => {
    const u = new URL(String(url));
    const params = Object.fromEntries(u.searchParams.entries());
    requestedParams.push(params);
    let filtered = sampleEntries;
    if (params.q) {
      const ql = params.q.toLowerCase();
      filtered = filtered.filter(e => `${e.title} ${e.cast} ${e.staff} ${e.memo}`.toLowerCase().includes(ql));
    }
    if (params.status) {
      filtered = filtered.filter(e => e.status === params.status);
    }
    if (params.includeInProgress === '1') {
      filtered = sampleEntries;
    }
    return {
      ok: true,
      async text() {
        return JSON.stringify({
          entries: filtered,
          totalCount: 921,
          filteredCount: filtered.length,
          hasMore: false,
        });
      },
    };
  };

  const elements = new Map();
  const makeEl = (id) => ({
    id,
    value: '',
    textContent: '',
    innerHTML: '',
    disabled: false,
    style: {},
    dataset: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c, force) {
        if (force === undefined) {
          if (this._set.has(c)) this._set.delete(c); else this._set.add(c);
        } else if (force) this._set.add(c); else this._set.delete(c);
      },
      contains(c) { return this._set.has(c); },
    },
  });

  const { ctx } = loadFrontendContext({
    fetch: mockFetch,
    elements,
    document: {
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, makeEl(id));
        return elements.get(id);
      },
      querySelector() { return null; },
      querySelectorAll(sel) {
        if (sel === '#status-chips .chip') return chips;
        return [];
      },
      addEventListener() {},
      visibilityState: 'visible',
    },
  });

  // 1. Initial state is 進行中 -> search "吉田羊" should auto-switch to ALL
  assert.equal(vm.runInContext('statusFilter', ctx), '進行中');
  ctx.document.getElementById('watch-search').value = '吉田羊';
  await ctx.runWatchServerQuery();

  assert.equal(vm.runInContext('statusFilter', ctx), 'ALL');
  assert.equal(chips.find(c => c.dataset.val === 'ALL').classList.contains('active'), true);
  assert.equal(chips.find(c => c.dataset.val === '進行中').classList.contains('active'), false);
  assert.equal(requestedParams[0].q, '吉田羊');
  assert.equal(requestedParams[0].status, undefined);
  assert.ok(elements.get('watch-list').innerHTML.includes('進行中ドラマ'));
  assert.ok(elements.get('watch-list').innerHTML.includes('完了映画A'));
  assert.ok(elements.get('watch-count').textContent.includes('表示中: 2件 / 該当2件'));

  // 2. Manual status chip tap during search filters within keyword results
  await ctx.setStatusFilter('完了', chips.find(c => c.dataset.val === '完了'));
  assert.equal(vm.runInContext('statusFilter', ctx), '完了');
  assert.equal(requestedParams[1].q, '吉田羊');
  assert.equal(requestedParams[1].status, '完了');
  assert.ok(!elements.get('watch-list').innerHTML.includes('進行中ドラマ'));
  assert.ok(elements.get('watch-list').innerHTML.includes('完了映画A'));

  // 3. New keyword search ("内田有紀") resets status back to ALL so completed works are found
  ctx.document.getElementById('watch-search').value = '内田有紀';
  await ctx.runWatchServerQuery();
  assert.equal(vm.runInContext('statusFilter', ctx), 'ALL');
  assert.equal(requestedParams[2].q, '内田有紀');
  assert.equal(requestedParams[2].status, undefined);
  assert.ok(elements.get('watch-list').innerHTML.includes('完了ドラマB'));

  // 4. Clearing search input restores original status ('進行中')
  ctx.document.getElementById('watch-search').value = '';
  await ctx.onWatchSearchInput();
  // wait a tick for async runWatchServerQuery triggered by onWatchSearchInput
  await new Promise(r => setTimeout(r, 10));
  assert.equal(vm.runInContext('statusFilter', ctx), '進行中');
  assert.equal(chips.find(c => c.dataset.val === '進行中').classList.contains('active'), true);
  assert.equal(requestedParams[3].includeInProgress, '1');
});
